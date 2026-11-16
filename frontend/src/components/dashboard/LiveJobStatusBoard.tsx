import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Box, Typography, Paper, Chip, Stack, CircularProgress, Button, LinearProgress, TextField } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import PersonIcon from '@mui/icons-material/Person';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { jobCardsApi } from '../../api/jobCardsApi';
import { customersApi } from '../../api/customersApi';
import { productCategoriesApi, productsApi } from '../../api/productsApi';
import type { JobCard } from '../../types/jobCards';
import type { JobCardStatus } from '../../types/common';

/** Every status a job can be in, with the colour used for it everywhere on this board. */
const STATUS: { key: JobCardStatus; label: string; color: string }[] = [
  { key: 'pending', label: 'Waiting to start', color: '#757575' },
  { key: 'design', label: 'Design', color: '#6a1b9a' },
  { key: 'approval', label: 'Proof approval', color: '#ef6c00' },
  { key: 'printing', label: 'Printing', color: '#1565c0' },
  { key: 'binding', label: 'Binding / finishing', color: '#00838f' },
  { key: 'packing', label: 'Packing & handover', color: '#2e7d32' },
  { key: 'delivered', label: 'Delivered', color: '#1b5e20' },
];
const STATUS_BY_KEY = Object.fromEntries(STATUS.map((s) => [s.key, s])) as Record<JobCardStatus, (typeof STATUS)[number]>;
const FLOW: JobCardStatus[] = ['design', 'approval', 'printing', 'binding', 'packing'];
const SHORT: Record<string, string> = { design: 'Design', approval: 'Proof', printing: 'Print', binding: 'Bind', packing: 'Pack' };
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

type Filter = 'active' | 'urgent' | 'overdue' | 'delivered' | 'all' | JobCardStatus;

const shortDate = (d?: string | null) =>
  d ? new Date(`${d}T00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '';

function Stepper({ status }: { status: JobCardStatus }) {
  const at = FLOW.indexOf(status);
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }} aria-label={`Stage: ${STATUS_BY_KEY[status].label}`}>
      {FLOW.map((stage, i) => {
        const done = status === 'delivered' || (at >= 0 && i < at);
        const current = i === at;
        const color = STATUS_BY_KEY[stage].color;
        return (
          <Box
            key={stage}
            sx={{
              display: 'flex', alignItems: 'center', gap: 0.25, px: 0.75, py: 0.15, borderRadius: 10, fontSize: 11.5,
              fontWeight: current ? 800 : 600, border: `1px solid ${current || done ? color : '#d0d4e4'}`,
              bgcolor: current ? color : done ? `${color}18` : 'transparent', color: current ? '#fff' : done ? color : '#9aa0b8',
            }}
          >
            {done && <CheckIcon sx={{ fontSize: 12 }} />}
            {SHORT[stage]}
          </Box>
        );
      })}
    </Stack>
  );
}

function JobRow({ job, customer, product }: { job: JobCard; customer: string; product: string }) {
  const navigate = useNavigate();
  const status = STATUS_BY_KEY[job.status];
  const urgent = job.priority === 'urgent';
  const delivered = job.status === 'delivered';
  const accent = urgent ? '#c62828' : job.overdue ? '#ef6c00' : status.color;
  return (
    <Paper
      variant="outlined"
      role="button"
      tabIndex={0}
      data-testid="live-job"
      data-job={job.job_number}
      data-urgent={urgent ? 'true' : 'false'}
      onClick={() => navigate(`/job-cards/${job.id}/track`)}
      onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/job-cards/${job.id}/track`); }}
      sx={{
        p: 1.25, pl: 1.5, borderRadius: 2, cursor: 'pointer', borderLeft: `${urgent ? 7 : 4}px solid ${accent}`,
        bgcolor: urgent && !delivered ? '#fff4f4' : '#fff', borderColor: urgent && !delivered ? '#ef9a9a' : '#e3e6f2',
        transition: 'box-shadow .15s, transform .15s', '&:hover': { boxShadow: '0 4px 16px rgba(26,35,126,0.14)', transform: 'translateY(-1px)' },
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontWeight: urgent ? 900 : 800, color: urgent ? '#b71c1c' : '#1a237e' }}>{job.job_number}</Typography>
        {urgent && !delivered && (
          <Chip size="small" color="error" icon={<PriorityHighIcon />} label="URGENT" sx={{ fontWeight: 900, letterSpacing: 0.8, height: 22 }} data-testid="urgent-badge" />
        )}
        <Typography sx={{ fontWeight: urgent ? 800 : 600, flexGrow: 1, minWidth: 140 }} noWrap title={`${customer} - ${product}`}>
          {customer} <Typography component="span" color="text.secondary" sx={{ fontWeight: 400 }}>· {product}{job.quantity ? ` × ${job.quantity.toLocaleString('en-IN')}` : ''}</Typography>
        </Typography>
        <Chip
          size="small"
          label={status.label}
          sx={{ bgcolor: status.color, color: '#fff', fontWeight: 800, height: 24 }}
          data-testid="status-chip"
        />
      </Stack>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1.25, mt: 0.75, flexWrap: 'wrap' }}>
        {!delivered && job.status !== 'pending' ? <Stepper status={job.status} /> : (
          <Typography variant="caption" color={delivered ? 'success.main' : 'text.secondary'} sx={{ fontWeight: 700 }}>
            {delivered ? 'Delivered' : 'Not started yet'}
          </Typography>
        )}
        {job.steps_total > 0 && (
          <Box sx={{ width: 70 }} title={`${job.steps_done} of ${job.steps_total} steps done`}>
            <LinearProgress variant="determinate" value={(job.steps_done / job.steps_total) * 100} sx={{ height: 5, borderRadius: 3 }} />
          </Box>
        )}
        {!delivered && job.current_step && (
          <Typography variant="caption" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontWeight: 600 }} data-testid="live-who">
            <PersonIcon sx={{ fontSize: 14 }} />
            {job.current_work_center ? <Box component="span" sx={{ color: '#455a64' }}>{job.current_work_center}:</Box> : null}
            {job.current_assignee ? (
              <Box component="span" sx={{ color: '#1a237e', fontWeight: 800 }}>{job.current_assignee}</Box>
            ) : (
              <Box component="span" sx={{ color: '#ef6c00' }}>not taken yet</Box>
            )}
            <Box component="span" sx={{ color: 'text.secondary', fontWeight: 500 }}>· {job.current_step}</Box>
          </Typography>
        )}
        {job.proof_text && !delivered && (
          <Chip size="small" variant="outlined" color={job.proof_overdue ? 'error' : job.proof_status === 'approved' ? 'success' : 'default'} label={job.proof_text} sx={{ height: 22 }} data-testid="proof-chip" />
        )}
        {job.delivery_date && !delivered && (
          <Typography variant="caption" sx={{ ml: 'auto', fontWeight: job.overdue ? 800 : 600, color: job.overdue ? '#c62828' : 'text.secondary' }}>
            {job.overdue ? 'OVERDUE · ' : 'Due '}{shortDate(job.delivery_date)}
          </Typography>
        )}
      </Stack>
    </Paper>
  );
}

export default function LiveJobStatusBoard() {
  const navigate = useNavigate();
  // refreshed every 20 seconds so the board is live
  const jobCardsQuery = useQuery({ queryKey: ['job-cards'], queryFn: jobCardsApi.list, refetchInterval: 20000 });
  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: customersApi.list });
  const productsQuery = useQuery({ queryKey: ['products'], queryFn: productsApi.list });
  const categoriesQuery = useQuery({ queryKey: ['product-categories'], queryFn: productCategoriesApi.list });
  const [filter, setFilter] = useState<Filter>('active');
  // sections the counter has folded away, and how many jobs of a section are opened beyond the first page
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [more, setMore] = useState<Record<string, boolean>>({});
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [search, setSearch] = useState('');

  const customerName = (id: number) => customersQuery.data?.find((c) => c.id === id)?.name ?? `#${id}`;
  const productName = (id: number) => productsQuery.data?.find((p) => p.id === id)?.name ?? `#${id}`;

  const jobs = jobCardsQuery.data ?? [];
  const counts = useMemo(() => {
    const byStatus: Record<string, number> = {};
    jobs.forEach((j) => { byStatus[j.status] = (byStatus[j.status] ?? 0) + 1; });
    const open = jobs.filter((j) => j.status !== 'delivered');
    return {
      byStatus,
      active: open.length,
      urgent: open.filter((j) => j.priority === 'urgent').length,
      overdue: open.filter((j) => j.overdue).length,
      delivered: byStatus.delivered ?? 0,
    };
  }, [jobs]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const pick = jobs.filter((j) => {
      if (needle && !`${j.job_number} ${customerName(j.customer_id)} ${productName(j.product_id)}`.toLowerCase().includes(needle)) return false;
      if (filter === 'all') return true;
      if (filter === 'active') return j.status !== 'delivered';
      if (filter === 'urgent') return j.status !== 'delivered' && j.priority === 'urgent';
      if (filter === 'overdue') return j.status !== 'delivered' && j.overdue;
      return j.status === filter;
    });
    const rank = (j: JobCard) => [
      j.status === 'delivered' ? 1 : 0,
      j.priority === 'urgent' ? 0 : 1,
      j.overdue ? 0 : 1,
      j.status === 'pending' ? 1 : 0, // running jobs before the ones waiting to start
      PRIORITY_RANK[j.priority] ?? 2,
    ];
    return [...pick].sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
      if (a.delivery_date !== b.delivery_date) return (a.delivery_date ?? '9999') < (b.delivery_date ?? '9999') ? -1 : 1;
      return b.id - a.id;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, filter, search, customersQuery.data, productsQuery.data]);

  /**
   * The jobs grouped by SERVICE (Bill Books, Xerox, Binding ...): one titled section per service that has jobs - a service with no
   * job is not shown at all. Inside a section the jobs keep the priority order (urgent, overdue, running, due date). The sections
   * with the most pressing work (urgent, then overdue, then the most jobs) come first.
   */
  const sections = useMemo(() => {
    const serviceOf = (j: JobCard) => {
      const product = productsQuery.data?.find((p) => p.id === j.product_id);
      const cat = categoriesQuery.data?.find((c) => c.id === product?.category_id);
      return { id: cat?.id ?? 0, name: cat?.name ?? 'Other jobs' };
    };
    const map = new Map<number, { id: number; name: string; jobs: JobCard[] }>();
    for (const j of shown) {
      const svc = serviceOf(j);
      if (!map.has(svc.id)) map.set(svc.id, { ...svc, jobs: [] });
      map.get(svc.id)!.jobs.push(j);
    }
    const open = (list: JobCard[]) => list.filter((j) => j.status !== 'delivered');
    return Array.from(map.values())
      .map((g) => ({
        ...g,
        urgent: open(g.jobs).filter((j) => j.priority === 'urgent').length,
        overdue: open(g.jobs).filter((j) => j.overdue).length,
        running: open(g.jobs).length,
      }))
      .sort((a, b) => (b.urgent > 0 ? 1 : 0) - (a.urgent > 0 ? 1 : 0) || (b.overdue > 0 ? 1 : 0) - (a.overdue > 0 ? 1 : 0) || b.running - a.running || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, productsQuery.data, categoriesQuery.data]);

  const PAGE = 25;
  const jump = (id: number) => {
    setFolded((f) => ({ ...f, [id]: false }));
    window.setTimeout(() => sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const chip = (key: Filter, label: string, count: number, color?: 'error' | 'warning') => (
    <Chip
      key={key}
      clickable
      size="small"
      data-testid={`filter-${key}`}
      color={filter === key ? (color ?? 'primary') : 'default'}
      variant={filter === key ? 'filled' : 'outlined'}
      label={`${label} ${count}`}
      onClick={() => setFilter(key)}
      sx={{ fontWeight: 700, ...(color && filter !== key && count > 0 ? { borderColor: color === 'error' ? '#c62828' : '#ef6c00', color: color === 'error' ? '#c62828' : '#ef6c00' } : {}) }}
    />
  );

  return (
    <Paper sx={{ p: 2, borderRadius: 2.5, border: '1px solid #dfe4f1', boxShadow: '0 4px 20px rgba(15,23,42,0.05)' }} data-testid="live-board">
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800, color: '#1a237e', lineHeight: 1.2 }}>Live Jobs</Typography>
          <Typography variant="caption" color="text.secondary">Grouped by service, urgent and running jobs first · click a job to open it · refreshes every 20 seconds</Typography>
        </Box>
        <Button size="small" onClick={() => navigate('/job-cards')}>All job cards</Button>
      </Stack>

      <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', mb: 1 }}>
        {chip('active', 'Running', counts.active)}
        {chip('urgent', 'Urgent', counts.urgent, 'error')}
        {chip('overdue', 'Overdue', counts.overdue, 'warning')}
        {chip('delivered', 'Delivered', counts.delivered)}
        {chip('all', 'All', jobs.length)}
      </Stack>

      {/* every status, with how many jobs are in it: click to see just those */}
      <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap', mb: 1.25 }} data-testid="status-legend">
        {STATUS.map((s) => (
          <Chip
            key={s.key}
            clickable
            size="small"
            label={`${s.label} ${counts.byStatus[s.key] ?? 0}`}
            onClick={() => setFilter(s.key)}
            data-testid={`stage-${s.key}`}
            sx={{
              height: 22, fontSize: 11.5, fontWeight: 700,
              bgcolor: filter === s.key ? s.color : `${s.color}14`, color: filter === s.key ? '#fff' : s.color,
              border: `1px solid ${s.color}55`, '&:hover': { bgcolor: filter === s.key ? s.color : `${s.color}26` },
            }}
          />
        ))}
      </Stack>

      <TextField
        size="small" fullWidth placeholder="Find a job: number, customer or product..." value={search}
        onChange={(e) => setSearch(e.target.value)} sx={{ mb: 1.25 }}
        slotProps={{ htmlInput: { 'data-testid': 'live-search' } }}
      />

      {jobCardsQuery.isLoading ? (
        <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>
      ) : shown.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>No jobs here.</Typography>
      ) : (
        <>
          {/* one button per service that has jobs: jump straight to its section */}
          {sections.length > 1 && (
            <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap', mb: 1 }} data-testid="service-jump">
              {sections.map((g) => (
                <Chip
                  key={g.id} clickable size="small" variant="outlined" onClick={() => jump(g.id)} data-testid="jump-chip"
                  label={`${g.name} ${g.jobs.length}`}
                  sx={{ fontWeight: 700, borderColor: g.urgent ? '#c62828' : g.overdue ? '#ef6c00' : '#c5cae9', color: g.urgent ? '#c62828' : g.overdue ? '#ef6c00' : '#1a237e' }}
                />
              ))}
              <Button size="small" sx={{ ml: 'auto', minWidth: 0, py: 0 }} data-testid="fold-all"
                onClick={() => setFolded(Object.fromEntries(sections.map((g) => [g.id, !sections.every((x) => folded[x.id])])))}>
                {sections.every((g) => folded[g.id]) ? 'Open all' : 'Fold all'}
              </Button>
            </Stack>
          )}
          <Stack spacing={1.5} sx={{ maxHeight: { xs: 'none', lg: 'calc(100vh - 340px)' }, minHeight: 200, overflowY: 'auto', pr: 0.5 }} data-testid="live-job-list">
            {sections.map((g) => {
              const isFolded = Boolean(folded[g.id]);
              const list = more[g.id] ? g.jobs : g.jobs.slice(0, PAGE);
              return (
                <Box key={g.id} ref={(el: HTMLDivElement | null) => { sectionRefs.current[g.id] = el; }} data-testid="live-section" data-service={g.name}>
                  <Box
                    role="button" tabIndex={0} aria-expanded={!isFolded} data-testid="section-toggle"
                    onClick={() => setFolded((f) => ({ ...f, [g.id]: !isFolded }))}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFolded((f) => ({ ...f, [g.id]: !isFolded })); } }}
                    sx={{
                      position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', cursor: 'pointer', mb: 0.75,
                      px: 1.25, py: 0.6, borderRadius: 1.5, bgcolor: '#e8eaf6', borderLeft: `5px solid ${g.urgent ? '#c62828' : g.overdue ? '#ef6c00' : '#1a237e'}`,
                      '&:hover': { bgcolor: '#dfe3f5' },
                    }}
                  >
                    {isFolded ? <ChevronRightIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                    <Typography sx={{ fontWeight: 900, color: '#1a237e', fontSize: 15.5 }} data-testid="section-title">{g.name}</Typography>
                    <Chip size="small" label={`${g.jobs.length} job${g.jobs.length === 1 ? '' : 's'}`} sx={{ height: 22, fontWeight: 700 }} data-testid="section-count" />
                    {g.urgent > 0 && <Chip size="small" color="error" label={`${g.urgent} urgent`} sx={{ height: 22, fontWeight: 800 }} data-testid="section-urgent" />}
                    {g.overdue > 0 && <Chip size="small" color="warning" label={`${g.overdue} overdue`} sx={{ height: 22, fontWeight: 800 }} data-testid="section-overdue" />}
                  </Box>
                  {!isFolded && (
                    <Stack spacing={0.9}>
                      {list.map((job) => (
                        <JobRow key={job.id} job={job} customer={customerName(job.customer_id)} product={productName(job.product_id)} />
                      ))}
                      {g.jobs.length > PAGE && !more[g.id] && (
                        <Button size="small" onClick={() => setMore((m) => ({ ...m, [g.id]: true }))} data-testid="section-more">Show all {g.jobs.length} {g.name} jobs ({g.jobs.length - PAGE} more)</Button>
                      )}
                    </Stack>
                  )}
                </Box>
              );
            })}
          </Stack>
        </>
      )}
    </Paper>
  );
}
