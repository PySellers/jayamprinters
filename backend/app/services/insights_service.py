"""AI Insights for the owner: what the shop's own data says about services, jobs, timing, prices, customers, money and
the team - with forecasts and plain-language recommendations.

Everything here is worked out from the ERP's own records (invoices, job cards, workflow steps, outsourcing, purchases);
nothing is sent to an outside service. The 'AI' is statistics: trend lines for the forecasts, averages per step to
predict which open jobs will miss their delivery date, and rules that turn the numbers into advice. Every
recommendation quotes the figures it is based on, and says so when there is too little data to be sure.

Admin only (the route is gated in main.py / the reports router)."""
from collections import defaultdict
from datetime import date, datetime, timedelta
from statistics import mean, pstdev
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session, joinedload

from app.models.customer import Customer
from app.models.invoice import Invoice
from app.models.job_card import JobCard, JobCardStatus
from app.models.outsource import OutsourceJob, OutsourceStatus
from app.models.product import Product, ProductCategory
from app.models.purchase import Purchase
from app.models.user import User
from app.models.workflow import JobEvent, JobStep, WorkCenter
from app.services.time_utils import today_ist, utc_naive_to_ist

OPEN_STEP = ("ready", "in_progress", "on_hold")
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _r(value: Optional[float], digits: int = 2) -> float:
    return round(float(value or 0), digits)


def _pct(part: float, whole: float) -> Optional[float]:
    return round(part / whole * 100, 1) if whole else None


def _ist_date(value: Optional[datetime]) -> Optional[date]:
    return utc_naive_to_ist(value).date() if value else None


def _month_start(d: date) -> date:
    return d.replace(day=1)


def _add_months(d: date, n: int) -> date:
    index = d.year * 12 + (d.month - 1) + n
    return date(index // 12, index % 12 + 1, 1)


def _label(d: date) -> str:
    return d.strftime("%b %Y")


def _linear(points: List[float]) -> tuple:
    """Least-squares line through (0, y0), (1, y1) ...: returns (slope, intercept, residual spread)."""
    n = len(points)
    if n < 2:
        return 0.0, (points[0] if points else 0.0), 0.0
    xs = list(range(n))
    mx, my = mean(xs), mean(points)
    den = sum((x - mx) ** 2 for x in xs)
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, points)) / den if den else 0.0
    intercept = my - slope * mx
    residuals = [y - (intercept + slope * x) for x, y in zip(xs, points)]
    return slope, intercept, (pstdev(residuals) if n > 2 else abs(my) * 0.2)


def _confidence(n_months: int) -> str:
    return "high" if n_months >= 9 else "medium" if n_months >= 5 else "low"


def generate_insights(db: Session, days: int = 180) -> Dict[str, Any]:
    days = max(30, min(int(days or 180), 730))
    today = today_ist()
    start = today - timedelta(days=days - 1)
    prev_start = start - timedelta(days=days)

    # -------------------------------------------------------------------------------- load the records
    categories = {c.id: c.name for c in db.query(ProductCategory).all()}
    products = {p.id: p for p in db.query(Product).all()}
    customers = {c.id: c for c in db.query(Customer).all()}
    users = {u.id: u for u in db.query(User).all()}
    centers = {c.id: c for c in db.query(WorkCenter).all()}

    def service_of(product_id: Optional[int]) -> str:
        product = products.get(product_id)
        return categories.get(product.category_id, "Other") if product is not None else "Other"

    invoices = db.query(Invoice).options(joinedload(Invoice.items)).all()
    jobs = db.query(JobCard).options(joinedload(JobCard.steps)).all()
    reopened_steps = {e.step_id for e in db.query(JobEvent).filter(JobEvent.action == "reopened").all() if e.step_id}

    def net(inv: Invoice) -> float:
        return (inv.subtotal or 0) - (inv.discount_amount or 0)

    # -------------------------------------------------------------------------------- headline money figures
    period_invoices = [i for i in invoices if i.invoice_date and start <= i.invoice_date <= today]
    prev_invoices = [i for i in invoices if i.invoice_date and prev_start <= i.invoice_date < start]
    revenue = sum(net(i) for i in period_invoices)
    prev_revenue = sum(net(i) for i in prev_invoices)
    gross = sum(i.subtotal or 0 for i in period_invoices)
    discounts = sum(i.discount_amount or 0 for i in period_invoices)

    # monthly series (last 12 months, current month included)
    this_month = _month_start(today)
    first_month = _add_months(this_month, -11)
    months: Dict[date, Dict[str, Any]] = {}
    for i in range(12):
        m = _add_months(first_month, i)
        months[m] = {"month": m.isoformat(), "label": _label(m), "revenue": 0.0, "orders": 0, "delivered": 0, "partial": m == this_month}
    for inv in invoices:
        if inv.invoice_date and _month_start(inv.invoice_date) in months:
            row = months[_month_start(inv.invoice_date)]
            row["revenue"] += net(inv)
            row["orders"] += 1
    for job in jobs:
        d = _ist_date(job.delivered_at)
        if d and _month_start(d) in months:
            months[_month_start(d)]["delivered"] += 1
    monthly = list(months.values())
    for row in monthly:
        row["revenue"] = _r(row["revenue"])

    # -------------------------------------------------------------------------------- forecast
    complete = [m for m in monthly if not m["partial"]]
    first_active = next((i for i, m in enumerate(complete) if m["revenue"] > 0), None)
    history = [m["revenue"] for m in complete[first_active:]] if first_active is not None else []
    history = history[-6:]
    cur = monthly[-1]
    days_in_month = (_add_months(this_month, 1) - this_month).days
    elapsed = max(today.day, 1)
    projected_now = cur["revenue"] / elapsed * days_in_month if elapsed else cur["revenue"]
    slope, intercept, spread = _linear(history)
    forecast_rows = []
    for k in range(1, 4):
        if history:
            point = max(intercept + slope * (len(history) - 1 + k + 1), 0.0)
        else:
            point = projected_now
        point = max(point, 0.0)
        margin = max(spread, point * 0.15) * (1 + 0.15 * k)
        forecast_rows.append({"month": _add_months(this_month, k).isoformat(), "label": _label(_add_months(this_month, k)),
                              "revenue": _r(point), "low": _r(max(point - margin, 0)), "high": _r(point + margin)})
    base = mean(history) if history else 0
    growth = _pct(slope * len(history), base) if base else None
    trend = "flat" if growth is None or abs(growth) < 5 else ("up" if growth > 0 else "down")

    # weekly rhythm: which weekday brings the orders
    weekday_orders = [0] * 7
    weekday_revenue = [0.0] * 7
    for inv in period_invoices:
        weekday_orders[inv.invoice_date.weekday()] += 1
        weekday_revenue[inv.invoice_date.weekday()] += net(inv)
    weekdays = [{"day": WEEKDAYS[i], "orders": weekday_orders[i], "revenue": _r(weekday_revenue[i])} for i in range(7)]

    # -------------------------------------------------------------------------------- per service
    svc: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"revenue": 0.0, "prev_revenue": 0.0, "lines": 0, "quantity": 0, "discount": 0.0, "gross": 0.0,
                                                           "jobs": 0, "delivered": 0, "on_time": 0, "due_known": 0, "turn": [], "urgent": 0})
    for inv in period_invoices:
        for line in inv.items:
            row = svc[service_of(line.product_id)]
            row["revenue"] += (line.total_price or 0) - (line.discount_amount or 0)
            row["gross"] += line.total_price or 0
            row["discount"] += line.discount_amount or 0
            row["lines"] += 1
            row["quantity"] += line.quantity or 0
    for inv in prev_invoices:
        for line in inv.items:
            svc[service_of(line.product_id)]["prev_revenue"] += (line.total_price or 0) - (line.discount_amount or 0)

    turnarounds: List[float] = []
    on_time = due_known = 0
    for job in jobs:
        created = _ist_date(job.created_at)
        if not created or created < start:
            continue
        row = svc[service_of(job.product_id)]
        row["jobs"] += 1
        if job.priority is not None and getattr(job.priority, "value", job.priority) == "urgent":
            row["urgent"] += 1
        if job.status == JobCardStatus.delivered and job.delivered_at:
            delivered = _ist_date(job.delivered_at)
            days_taken = max((job.delivered_at - job.created_at).total_seconds() / 86400, 0)
            row["delivered"] += 1
            row["turn"].append(days_taken)
            turnarounds.append(days_taken)
            if job.delivery_date:
                row["due_known"] += 1
                due_known += 1
                if delivered <= job.delivery_date:
                    row["on_time"] += 1
                    on_time += 1
    services = []
    for name, r in svc.items():
        if r["lines"] == 0 and r["jobs"] == 0:
            continue
        services.append({
            "name": name, "revenue": _r(r["revenue"]), "share": _pct(r["revenue"], revenue), "orders": r["lines"], "quantity": r["quantity"],
            "avg_order_value": _r(r["revenue"] / r["lines"]) if r["lines"] else 0.0,
            "trend_percent": _pct(r["revenue"] - r["prev_revenue"], r["prev_revenue"]) if r["prev_revenue"] else None,
            "discount_percent": _pct(r["discount"], r["gross"]), "jobs": r["jobs"], "delivered": r["delivered"],
            "on_time_percent": _pct(r["on_time"], r["due_known"]),
            "avg_turnaround_days": _r(mean(r["turn"]), 1) if r["turn"] else None,
            "urgent_percent": _pct(r["urgent"], r["jobs"]),
        })
    services.sort(key=lambda s: -s["revenue"])
    svc_turn = {s["name"]: s["avg_turnaround_days"] for s in services if s["avg_turnaround_days"] is not None}
    overall_turn = _r(mean(turnarounds), 1) if turnarounds else None

    # -------------------------------------------------------------------------------- customers
    by_customer: Dict[int, Dict[str, Any]] = defaultdict(lambda: {"revenue": 0.0, "orders": 0, "last": None})
    lifetime: Dict[int, Dict[str, Any]] = defaultdict(lambda: {"revenue": 0.0, "orders": 0, "last": None, "first": None})
    for inv in invoices:
        life = lifetime[inv.customer_id]
        life["revenue"] += net(inv)
        life["orders"] += 1
        if inv.invoice_date:
            life["last"] = max(life["last"], inv.invoice_date) if life["last"] else inv.invoice_date
            life["first"] = min(life["first"], inv.invoice_date) if life["first"] else inv.invoice_date
    for inv in period_invoices:
        row = by_customer[inv.customer_id]
        row["revenue"] += net(inv)
        row["orders"] += 1
    top_customers = []
    for cid, r in sorted(by_customer.items(), key=lambda kv: -kv[1]["revenue"])[:8]:
        top_customers.append({"name": customers[cid].name if cid in customers else f"#{cid}", "revenue": _r(r["revenue"]), "orders": r["orders"],
                              "share": _pct(r["revenue"], revenue), "last_order": lifetime[cid]["last"].isoformat() if lifetime[cid]["last"] else None})
    top3_share = _pct(sum(c["revenue"] for c in top_customers[:3]), revenue)
    active_ids = set(by_customer)
    repeat = [cid for cid in active_ids if lifetime[cid]["orders"] > 1]
    new_ids = [cid for cid in active_ids if lifetime[cid]["first"] and lifetime[cid]["first"] >= start]
    dormant = []
    for cid, life in lifetime.items():
        if life["last"] and (today - life["last"]).days >= 60 and life["orders"] >= 2:
            dormant.append({"name": customers[cid].name if cid in customers else f"#{cid}", "phone": customers[cid].phone if cid in customers else None,
                            "last_order": life["last"].isoformat(), "days_since": (today - life["last"]).days,
                            "lifetime_revenue": _r(life["revenue"]), "orders": life["orders"]})
    dormant.sort(key=lambda d: -d["lifetime_revenue"])

    # -------------------------------------------------------------------------------- money still to come
    aging = {"0-30 days": 0.0, "31-60 days": 0.0, "61+ days": 0.0}
    debtors: Dict[int, float] = defaultdict(float)
    receivable = 0.0
    for inv in invoices:
        due = (inv.grand_total or 0) - (inv.amount_paid or 0)
        if due > 0.5:
            receivable += due
            age = (today - inv.invoice_date).days if inv.invoice_date else 0
            aging["0-30 days" if age <= 30 else "31-60 days" if age <= 60 else "61+ days"] += due
            debtors[inv.customer_id] += due
    top_debtors = [{"name": customers[c].name if c in customers else f"#{c}", "amount": _r(a)} for c, a in sorted(debtors.items(), key=lambda kv: -kv[1])[:5]]
    outsource_cost = sum(o.cost_amount or 0 for o in db.query(OutsourceJob).all() if o.status != OutsourceStatus.cancelled and o.sent_date and start <= o.sent_date <= today)
    purchases = sum(p.total_amount or 0 for p in db.query(Purchase).all() if p.purchase_date and start <= p.purchase_date <= today)

    # -------------------------------------------------------------------------------- steps: work centers and employees
    all_steps: List[JobStep] = [s for j in jobs for s in j.steps]
    done_steps = [s for s in all_steps if s.status == "done" and s.completed_at and s.started_at and _ist_date(s.completed_at) >= start]
    real_done = [s for s in done_steps if s.completed_by]  # steps back-filled for old jobs have nobody recorded
    step_minutes = lambda s: max((s.completed_at - s.started_at).total_seconds() / 60, 0)  # noqa: E731
    by_step_name: Dict[str, List[float]] = defaultdict(list)
    for s in real_done:
        by_step_name[s.name.lower()].append(step_minutes(s))
    name_avg = {k: mean(v) for k, v in by_step_name.items()}

    open_job_ids = {j.id for j in jobs if j.status != JobCardStatus.delivered}
    wc_rows = []
    for cid, c in centers.items():
        mine = [s for s in real_done if s.work_center_id == cid]
        waits = [max((s.started_at - s.ready_at).total_seconds() / 60, 0) for s in mine if s.ready_at and s.started_at]
        open_now = [s for s in all_steps if s.work_center_id == cid and s.status in OPEN_STEP and s.job_card_id in open_job_ids]
        avg_min = mean(step_minutes(s) for s in mine) if mine else None
        wc_rows.append({
            "name": c.name, "color": c.color, "steps_done": len(mine), "avg_minutes": _r(avg_min, 0) if avg_min is not None else None,
            "avg_wait_minutes": _r(mean(waits), 0) if waits else None, "open_now": len(open_now),
            "backlog_hours": _r(len(open_now) * (avg_min or 45) / 60, 1),
        })
    wc_rows.sort(key=lambda r: -(r["avg_wait_minutes"] or 0))

    emp: Dict[int, Dict[str, Any]] = {}
    for u in users.values():
        if u.is_active:
            emp[u.id] = {"user_id": u.id, "name": u.name, "role": u.role.value, "steps_done": 0, "minutes": [], "relative": [], "reopened": 0,
                         "holds": 0, "in_progress": 0, "assigned_open": 0, "jobs": set()}
    for s in real_done:
        if s.completed_by in emp:
            e = emp[s.completed_by]
            e["steps_done"] += 1
            minutes = step_minutes(s)
            e["minutes"].append(minutes)
            ref = name_avg.get(s.name.lower())
            if ref and ref > 0 and len(by_step_name[s.name.lower()]) >= 2:
                e["relative"].append(minutes / ref)
            if s.id in reopened_steps:
                e["reopened"] += 1
            e["jobs"].add(s.job_card_id)
    for s in all_steps:
        if s.assigned_to in emp and s.status in OPEN_STEP:
            emp[s.assigned_to]["assigned_open"] += 1
            if s.status == "in_progress":
                emp[s.assigned_to]["in_progress"] += 1
            if s.status == "on_hold":
                emp[s.assigned_to]["holds"] += 1
    max_done = max([e["steps_done"] for e in emp.values()] or [0])
    employees = []
    for e in emp.values():
        done = e["steps_done"]
        speed = mean(e["relative"]) if e["relative"] else None  # < 1 = faster than the team on the same kind of step
        speed_score = None if speed is None else max(0.0, min(100.0, 100 - (speed - 1) * 100)) if speed >= 1 else min(100.0, 100 + (1 - speed) * 40)
        volume_score = (done / max_done * 100) if max_done else 0
        quality_score = 100 - (e["reopened"] / done * 100) if done else None
        parts = [(speed_score, 0.4), (volume_score, 0.35), (quality_score, 0.25)]
        usable = [(v, w) for v, w in parts if v is not None]
        score = round(sum(v * w for v, w in usable) / sum(w for _, w in usable)) if usable and done else None
        employees.append({
            "user_id": e["user_id"], "name": e["name"], "role": e["role"], "steps_done": done, "jobs_touched": len(e["jobs"]),
            "avg_minutes": _r(mean(e["minutes"]), 0) if e["minutes"] else None,
            "speed_vs_team": _r((1 - speed) * 100, 0) if speed is not None else None,  # +20 = 20 % faster than the team's average
            "rework": e["reopened"], "rework_percent": _pct(e["reopened"], done), "working_now": e["in_progress"],
            "waiting_on_them": e["assigned_open"] - e["in_progress"] - e["holds"], "on_hold": e["holds"], "score": score,
        })
    employees.sort(key=lambda r: (-(r["score"] if r["score"] is not None else -1), -r["steps_done"], r["name"]))
    for i, row in enumerate([r for r in employees if r["score"] is not None], start=1):
        row["rank"] = i
    recorded_share = _pct(len(real_done), len(done_steps)) if done_steps else None

    # -------------------------------------------------------------------------------- open jobs at risk of being late
    risk: List[Dict[str, Any]] = []
    now = datetime.utcnow()
    open_jobs = [j for j in jobs if j.status != JobCardStatus.delivered]
    for job in open_jobs:
        if not job.delivery_date:
            continue
        remaining = [s for s in job.steps if s.status not in ("done", "skipped")]
        service = service_of(job.product_id)
        typical = svc_turn.get(service) or overall_turn or 2.0
        age_days = max((now - job.created_at).total_seconds() / 86400, 0) if job.created_at else 0
        step_minutes_left = sum(name_avg.get(s.name.lower(), 45) for s in remaining)
        # finish = the longer of "what is left at normal speed (8-hour days)" and "typical total time for this service"
        days_left = max(step_minutes_left / 480.0, typical - age_days, 0.25)
        predicted = today + timedelta(days=int(round(days_left + 0.49)))
        late_by = (predicted - job.delivery_date).days
        if job.delivery_date < today or late_by > 0:
            current = next((s for s in sorted(job.steps, key=lambda s: s.position) if s.status in OPEN_STEP), None)
            risk.append({
                "job_card_id": job.id, "job_number": job.job_number, "customer": customers[job.customer_id].name if job.customer_id in customers else "",
                "service": service, "due_date": job.delivery_date.isoformat(), "predicted_finish": predicted.isoformat(),
                "days_late": max(late_by, (today - job.delivery_date).days if job.delivery_date < today else 0),
                "already_late": job.delivery_date < today, "steps_left": len(remaining),
                "stuck_at": (current.name + (" (on hold)" if current is not None and current.status == "on_hold" else "")) if current is not None else None,
                "urgent": getattr(job.priority, "value", job.priority) == "urgent",
            })
    risk.sort(key=lambda r: (-int(r["urgent"]), -r["days_late"]))

    # -------------------------------------------------------------------------------- the headline block
    delivered_jobs = [j for j in jobs if j.status == JobCardStatus.delivered and j.delivered_at and _ist_date(j.delivered_at) >= start]
    headline = {
        "revenue": _r(revenue), "revenue_change_percent": _pct(revenue - prev_revenue, prev_revenue) if prev_revenue else None,
        "orders": len(period_invoices), "avg_order_value": _r(revenue / len(period_invoices)) if period_invoices else 0.0,
        "on_time_percent": _pct(on_time, due_known), "avg_turnaround_days": overall_turn,
        "open_jobs": len(open_jobs), "overdue_jobs": len([j for j in open_jobs if j.delivery_date and j.delivery_date < today]),
        "delivered_jobs": len(delivered_jobs), "receivable": _r(receivable),
        "repeat_customer_percent": _pct(len(repeat), len(active_ids)), "active_customers": len(active_ids), "new_customers": len(new_ids),
        "discount_given": _r(discounts), "discount_percent": _pct(discounts, gross),
        "outsource_cost": _r(outsource_cost), "purchases": _r(purchases),
    }

    # -------------------------------------------------------------------------------- advice
    tips: List[Dict[str, Any]] = []

    def tip(kind: str, area: str, title: str, detail: str, metric: Optional[str] = None):
        tips.append({"kind": kind, "area": area, "title": title, "detail": detail, "metric": metric})

    if len(period_invoices) < 10:
        tip("info", "Data", "Not much history yet", f"Only {len(period_invoices)} invoices fall in the last {days} days, so the forecasts below are rough. They sharpen with every month of use.")
    if headline["revenue_change_percent"] is not None:
        ch = headline["revenue_change_percent"]
        if ch <= -10:
            tip("risk", "Sales", "Sales are lower than the period before", f"Sales (without GST) are {abs(ch):.0f}% below the previous {days} days (Rs.{revenue:,.0f} against Rs.{prev_revenue:,.0f}). Call your top customers and look at which service dropped (see the service table).", f"{ch:+.0f}%")
        elif ch >= 10:
            tip("good", "Sales", "Sales are growing", f"Sales are up {ch:.0f}% on the previous {days} days (Rs.{revenue:,.0f} against Rs.{prev_revenue:,.0f}). Make sure design and printing have the capacity for it.", f"{ch:+.0f}%")
    if trend != "flat" and len(history) >= 3:
        tip("good" if trend == "up" else "risk", "Forecast", f"Monthly sales are trending {trend}", f"The last {len(history)} full months follow a {trend}ward line; the next month is expected around Rs.{forecast_rows[0]['revenue']:,.0f} (range Rs.{forecast_rows[0]['low']:,.0f} to Rs.{forecast_rows[0]['high']:,.0f}).", f"{growth:+.0f}%" if growth is not None else None)
    if services:
        top = services[0]
        if top["share"] and top["share"] >= 40 and len(services) > 1:
            tip("risk", "Services", f"{top['name']} brings {top['share']:.0f}% of sales", "One service carries a large part of the business. Promote the next best services to customers of this one, and keep spare capacity for it.", f"{top['share']:.0f}%")
        growing = [s for s in services if s["trend_percent"] is not None and s["trend_percent"] >= 25 and s["revenue"] > 0]
        falling = [s for s in services if s["trend_percent"] is not None and s["trend_percent"] <= -25]
        if growing:
            g = max(growing, key=lambda s: s["trend_percent"])
            tip("good", "Services", f"{g['name']} is growing fastest", f"Up {g['trend_percent']:.0f}% on the previous period (now Rs.{g['revenue']:,.0f}). Worth an offer or a ready-made price list for repeat buyers.", f"{g['trend_percent']:+.0f}%")
        if falling:
            f = min(falling, key=lambda s: s["trend_percent"])
            tip("risk", "Services", f"{f['name']} is falling", f"Down {abs(f['trend_percent']):.0f}% on the previous period. Check whether prices, speed or a lost customer is the reason.", f"{f['trend_percent']:+.0f}%")
        slow = [s for s in services if s["avg_turnaround_days"] and overall_turn and s["delivered"] >= 3 and s["avg_turnaround_days"] >= overall_turn * 1.5]
        if slow:
            s = max(slow, key=lambda s: s["avg_turnaround_days"])
            tip("risk", "Speed", f"{s['name']} takes the longest", f"Average {s['avg_turnaround_days']:.1f} days from order to delivery, against {overall_turn:.1f} days for all jobs. Look at its steps on the Production board for the step that waits.", f"{s['avg_turnaround_days']:.1f} d")
        discounty = [s for s in services if s["discount_percent"] and s["discount_percent"] >= 8 and s["orders"] >= 3]
        if discounty:
            s = max(discounty, key=lambda s: s["discount_percent"])
            tip("opportunity", "Pricing", f"Discounts are heavy on {s['name']}", f"{s['discount_percent']:.1f}% of its billing is given away as discount. Check whether the base rate in Pricing Setup is too high or the discount is habit.", f"{s['discount_percent']:.1f}%")
        urgent_total = sum(s["jobs"] * (s["urgent_percent"] or 0) / 100 for s in services)
        total_jobs = sum(s["jobs"] for s in services)
        if total_jobs and urgent_total / total_jobs >= 0.2:
            tip("opportunity", "Pricing", "Many jobs are rushed", f"About {urgent_total / total_jobs * 100:.0f}% of jobs are marked urgent. Consider a rush surcharge (a custom charge on the order) - customers who need it fast usually accept it.", f"{urgent_total / total_jobs * 100:.0f}%")
        small = [s for s in services if s["orders"] >= 10 and s["avg_order_value"] < (revenue / max(len(period_invoices), 1)) * 0.3]
        if small:
            s = small[0]
            tip("opportunity", "Pricing", f"{s['name']} is many small bills", f"{s['orders']} lines at Rs.{s['avg_order_value']:,.0f} on average. Bundle it with larger services or set a minimum charge so handling time is covered.", f"Rs.{s['avg_order_value']:,.0f}")
    if headline["on_time_percent"] is not None:
        ot = headline["on_time_percent"]
        if ot < 80:
            tip("risk", "Speed", "Too many jobs are delivered late", f"Only {ot:.0f}% of delivered jobs met their delivery date. Quote longer dates for busy periods or add capacity where jobs wait (see work centers).", f"{ot:.0f}%")
        elif ot >= 95:
            tip("good", "Speed", "Deliveries are on time", f"{ot:.0f}% of delivered jobs met their promised date - a good point to tell customers.", f"{ot:.0f}%")
    if risk:
        late_now = len([r for r in risk if r["already_late"]])
        tip("risk", "Speed", f"{len(risk)} open jobs look likely to miss their date", f"{late_now} are already past their date. The Risk list below shows each job, where it is stuck and when it will probably finish at the normal pace.", str(len(risk)))
    waiting = [w for w in wc_rows if w["avg_wait_minutes"] and w["steps_done"] >= 3]
    if waiting:
        w = waiting[0]
        if w["avg_wait_minutes"] >= 120:
            tip("risk", "Team", f"{w['name']} is the bottleneck", f"Jobs wait about {w['avg_wait_minutes'] / 60:.1f} hours before work starts there, and {w['open_now']} steps are open now (about {w['backlog_hours']:.0f} hours of work). Move a person across or take outside help at peak times.", f"{w['avg_wait_minutes'] / 60:.1f} h wait")
    active_staff = [e for e in employees if e["steps_done"] > 0]
    if len(active_staff) >= 2:
        total_done = sum(e["steps_done"] for e in active_staff)
        busiest = max(active_staff, key=lambda e: e["steps_done"])
        if total_done >= 10 and busiest["steps_done"] / total_done >= 0.5:
            tip("risk", "Team", f"{busiest['name']} does half of all the work", f"{busiest['steps_done']} of {total_done} finished steps. If they are away the shop slows; train a second person on the same steps.", f"{busiest['steps_done'] / total_done * 100:.0f}%")
        fast = [e for e in active_staff if e["speed_vs_team"] is not None and e["steps_done"] >= 5]
        if fast:
            best = max(fast, key=lambda e: e["speed_vs_team"])
            worst = min(fast, key=lambda e: e["speed_vs_team"])
            if best["speed_vs_team"] >= 15:
                tip("good", "Team", f"{best['name']} is the quickest", f"About {best['speed_vs_team']:.0f}% faster than the team average on the same kind of step ({best['steps_done']} steps). Ask them to share how they work.", f"{best['speed_vs_team']:+.0f}%")
            if worst["speed_vs_team"] <= -25 and worst is not best:
                tip("insight", "Team", f"{worst['name']} may need support", f"About {abs(worst['speed_vs_team']):.0f}% slower than the team average on the same steps. Check whether they get the harder jobs or need training before drawing conclusions.", f"{worst['speed_vs_team']:+.0f}%")
        rework = [e for e in active_staff if e["rework"] >= 2 and (e["rework_percent"] or 0) >= 15]
        if rework:
            e = max(rework, key=lambda e: e["rework_percent"])
            tip("risk", "Team", f"Rework on {e['name']}'s steps", f"{e['rework']} of their {e['steps_done']} finished steps had to be re-opened. A short checklist before 'Done' usually fixes this.", f"{e['rework_percent']:.0f}%")
    idle = [e for e in employees if e["role"] != "admin" and e["steps_done"] == 0 and e["role"] in ("production", "counter")]
    if idle and done_steps:
        tip("insight", "Team", f"{len(idle)} employee(s) have no recorded work", "Nothing finished under " + ", ".join(e["name"] for e in idle[:4]) + ". Ask them to press 'Take it' on their tasks so their work is counted - the performance table is only as good as this.", str(len(idle)))
    if recorded_share is not None and recorded_share < 70 and len(done_steps) >= 10:
        tip("insight", "Data", "Many finished steps have nobody recorded", f"Only {recorded_share:.0f}% of finished steps say who did them. Staff need to Take / Start / Done their own steps for the employee report to be fair.", f"{recorded_share:.0f}%")
    if receivable > 0:
        old = aging["31-60 days"] + aging["61+ days"]
        if _pct(old, receivable) and _pct(old, receivable) >= 40 and old > 1000:
            who = ", ".join(f"{d['name']} (Rs.{d['amount']:,.0f})" for d in top_debtors[:3])
            tip("risk", "Money", f"Rs.{old:,.0f} is more than 30 days old", f"{_pct(old, receivable):.0f}% of the Rs.{receivable:,.0f} customers owe is older than a month. Start with: {who}.", f"Rs.{old:,.0f}")
    if top3_share is not None and top3_share >= 50 and len(top_customers) >= 3:
        tip("risk", "Customers", "A few customers carry most of the sales", f"The top 3 customers are {top3_share:.0f}% of sales. Losing one would hurt - keep them happy and add new customers.", f"{top3_share:.0f}%")
    if dormant:
        d = dormant[0]
        tip("opportunity", "Customers", f"{len(dormant)} regular customers have gone quiet", f"{d['name']} has not ordered for {d['days_since']} days (they spent Rs.{d['lifetime_revenue']:,.0f} with you). A phone call or WhatsApp offer is the cheapest way to win them back.", str(len(dormant)))
    if headline["repeat_customer_percent"] is not None and headline["repeat_customer_percent"] < 40 and len(active_ids) >= 8:
        tip("opportunity", "Customers", "Few customers come back", f"Only {headline['repeat_customer_percent']:.0f}% of this period's customers had ordered before. Ask for a review/reference and offer a repeat discount on the next order.", f"{headline['repeat_customer_percent']:.0f}%")
    if revenue and outsource_cost / revenue >= 0.2:
        tip("opportunity", "Cost", "Outside work is a large cost", f"Outsourcing cost Rs.{outsource_cost:,.0f} = {outsource_cost / revenue * 100:.0f}% of sales. If one kind of work is sent out often, buying the equipment or training a person may pay back.", f"{outsource_cost / revenue * 100:.0f}%")
    if sum(weekday_orders) >= 15:
        busy = max(range(7), key=lambda i: weekday_orders[i])
        quiet = min(range(7), key=lambda i: weekday_orders[i] if i != 6 else 10 ** 9)
        tip("insight", "Planning", f"{WEEKDAYS[busy]} is the busiest order day", f"{weekday_orders[busy]} orders came on {WEEKDAYS[busy]}s and the fewest on {WEEKDAYS[quiet]}s ({weekday_orders[quiet]}). Plan staff and paper stock for the busy day; use the quiet day for maintenance and follow-up calls.", WEEKDAYS[busy])
    order = {"risk": 0, "opportunity": 1, "insight": 2, "good": 3, "info": 4}
    tips.sort(key=lambda t: order.get(t["kind"], 5))

    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "period": {"start": start.isoformat(), "end": today.isoformat(), "days": days},
        "headline": headline,
        "monthly": monthly,
        "forecast": {
            "method": f"Straight-line trend through the last {len(history)} full months, widened by how much those months varied" if history else "Not enough full months yet - based on this month's pace",
            "confidence": _confidence(len(history)), "trend": trend, "growth_percent": growth,
            "this_month_projection": _r(projected_now), "this_month_so_far": _r(cur["revenue"]), "months": forecast_rows,
        },
        "weekdays": weekdays,
        "services": services,
        "customers": {"top": top_customers, "top3_share": top3_share, "dormant": dormant[:8]},
        "work_centers": wc_rows,
        "employees": employees,
        "employee_data_share": recorded_share,
        "delivery_risk": risk[:15],
        "receivables": {"total": _r(receivable), "aging": [{"bucket": k, "amount": _r(v)} for k, v in aging.items()], "top": top_debtors},
        "recommendations": tips,
    }
