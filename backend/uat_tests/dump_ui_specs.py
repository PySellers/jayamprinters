"""Writes ui_specs.json: one representative selection per service with the independently computed price,
which the browser tests type into the order form and compare with what the screen shows."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import seed_uat_demo_data as demo  # noqa: E402

seen, out = set(), []
for key, cust, sp, gst, *_ in demo.ORDERS:
    if sp["service"] in seen:
        continue
    seen.add(sp["service"])
    cat = demo.cat(sp["service"])
    prod = demo.prod(cat, sp["product"])
    expected = demo.expected_line(cat, prod, sp["qty"], sp["opts"], [], sp.get("sets", 1), sp.get("area"))
    out.append(dict(key=key, category_id=cat.id, service=sp["service"], product=sp["product"], opts=sp["opts"], qty=sp["qty"],
                    sets=sp.get("sets", 1), area=sp.get("area"), guided=cat.guided_flow, expected=expected, tax_rate=demo.expected_tax_rate(cat, prod)))
json.dump(out, open(os.path.join(os.path.dirname(__file__), "ui_specs.json"), "w"), indent=1)
print(len(out), "services")
