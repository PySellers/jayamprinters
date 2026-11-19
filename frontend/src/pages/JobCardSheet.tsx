import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, IconButton, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import PrintIcon from '@mui/icons-material/Print';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { jobCardsApi } from '../api/jobCardsApi';
import { getErrorMessage } from '../utils/api';
import type { JobCardSheetData, PriceLine, SheetPaymentKey } from '../types/jobCards';
import JobDetailPanel from '../components/jobcards/JobDetailPanel';
import { useAuth } from '../context/AuthContext';

const INK = '#1a237e';
const border = `1px solid ${INK}`;

const COLOUR_OPTIONS = ['Royal Blue', 'Peacock Blue', 'Green', 'Red', 'Mejentha', 'Merun', 'Brown', 'Black'];
const MARGIN_OPTIONS = ['Centre', 'Top', 'Left', 'Right'];
const PAYMENT_LABELS: Partial<Record<SheetPaymentKey, string>> = { first: 'Bill total', rate: 'Rate', advance: 'Advance paid', balance1: 'Balance' };
type PaperCol = 'range' | 'kgs' | 'colour' | 'qty' | 'cutting' | 'printing';
const COL_WEIGHT: Record<PaperCol, string> = { range: '1.5fr', kgs: '0.8fr', colour: '1fr', qty: '1fr', cutting: '1fr', printing: '1.4fr' };
const COPY_LABELS = ['1st Copy', '2nd Copy', '3rd Copy', '4th Copy'];

const fmtDate = (iso?: string | null) => (iso ? iso.split('-').reverse().join('/') : '');

// ---- small building blocks ----------------------------------------------------
function Plain({
  value, onChange, type, placeholder,
}: { value?: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <TextField
      variant="standard"
      fullWidth
      type={type}
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      slotProps={{ input: { disableUnderline: true, sx: { fontSize: 13 } } }}
    />
  );
}

function LabeledLine({
  label, value, onChange,
}: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', py: 0.5 }}>
      <Typography sx={{ fontWeight: 600, whiteSpace: 'nowrap', minWidth: 92 }}>{label} :</Typography>
      <TextField variant="standard" size="small" fullWidth value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </Stack>
  );
}

function CheckList({
  options, value, onChange, row, columns,
}: { options: string[]; value: string[]; onChange: (v: string[]) => void; row?: boolean; columns?: number }) {
  const toggle = (opt: string) => onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  return (
    <Box
      sx={{
        display: row ? 'flex' : 'grid',
        flexWrap: 'wrap',
        gridTemplateColumns: columns ? `repeat(${columns}, 1fr)` : '1fr',
        columnGap: 2,
      }}
    >
      {options.map((opt) => (
        <FormControlLabel
          key={opt}
          sx={{ m: 0, mr: row ? 2.5 : 0 }}
          control={<Checkbox size="small" sx={{ p: 0.5 }} checked={value.includes(opt)} onChange={() => toggle(opt)} />}
          label={<Typography sx={{ fontSize: 13 }}>{opt}</Typography>}
        />
      ))}
    </Box>
  );
}

const Heading = ({ children }: { children: string }) => (
  <Typography sx={{ fontWeight: 700, textAlign: 'center', borderBottom: border, py: 0.5, bgcolor: '#eef0fa' }}>
    {children}
  </Typography>
);

// ---- page ---------------------------------------------------------------------
export default function JobCardSheet() {
  const { id } = useParams();
  const jobCardId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Which job card is being edited: the shop-floor copy (without price) or the office copy (with price: payment column + price list)
  const [searchParams, setSearchParams] = useSearchParams();
  const withPrice = searchParams.get('view') === 'price';

  const sheetQuery = useQuery({
    queryKey: ['job-card-sheet', jobCardId],
    queryFn: () => jobCardsApi.getSheet(jobCardId),
    enabled: Number.isFinite(jobCardId),
    refetchOnWindowFocus: false,
  });

  const [sheet, setSheet] = useState<JobCardSheetData | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  // the price list of the job card (with-price copy): starts as the order's list, can be edited by hand
  const [priceLines, setPriceLines] = useState<PriceLine[] | null>(null);

  // Load once; later refetches must not wipe what is being typed.
  useEffect(() => {
    if (sheetQuery.data && sheet === null) {
      setSheet(sheetQuery.data.sheet);
      setPriceLines(sheetQuery.data.price_lines.map((l) => ({ ...l })));
    }
  }, [sheetQuery.data, sheet]);

  const saveMutation = useMutation({
    mutationFn: (data: JobCardSheetData) => jobCardsApi.saveSheet(jobCardId, data, priceLines),
    onSuccess: (result) => {
      setSheet(result.sheet);
      setPriceLines(result.price_lines.map((l) => ({ ...l })));
      queryClient.setQueryData(['job-card-sheet', jobCardId], result);
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
      setSaveNote('Job card saved.');
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => jobCardsApi.resetSheet(jobCardId),
    onSuccess: (result) => {
      setSheet(result.sheet);
      setPriceLines(result.price_lines.map((l) => ({ ...l })));
      queryClient.setQueryData(['job-card-sheet', jobCardId], result);
      setSaveNote('The form is filled from the order again.');
    },
  });

  const set = <K extends keyof JobCardSheetData>(key: K, value: JobCardSheetData[K]) => {
    setSaveNote(null);
    setSheet((s) => (s ? { ...s, [key]: value } : s));
  };
  const setPaper = (index: number, field: keyof JobCardSheetData['paper'][number], value: string) => {
    setSaveNote(null);
    setSheet((s) => s && { ...s, paper: s.paper.map((row, i) => (i === index ? { ...row, [field]: value } : row)) });
  };
  const setLine = (index: number, patch: Partial<PriceLine>) => {
    setSaveNote(null);
    setPriceLines((ls) => (ls ?? []).map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };
  const setPayment = (key: SheetPaymentKey, value: string) => {
    setSaveNote(null);
    setSheet((s) => s && { ...s, payment: { ...s.payment, [key]: value } });
  };

  if (sheetQuery.isLoading || !sheet || !sheetQuery.data) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        {sheetQuery.isError ? (
          <Alert severity="error">{getErrorMessage(sheetQuery.error, 'Could not load the job card')}</Alert>
        ) : (
          <CircularProgress />
        )}
      </Box>
    );
  }

  const meta = sheetQuery.data;
  const profile = meta.profile;
  const labels = profile.paper_labels;
  const cols: PaperCol[] = (['range', 'kgs', 'colour', 'qty', 'cutting', 'printing'] as PaperCol[]).filter((c) => {
    if (c === 'cutting') return profile.show_cutting;
    return Boolean(labels[c]);
  });
  const copyColumn = profile.copy_rows > 1;
  const colLabel = (c: PaperCol) => (c === 'cutting' ? 'Cutting Size' : labels[c]);
  const moreProofs = sheet.more_proofs ?? [];
  const cell = { borderRight: border, borderBottom: border, p: 0.5, display: 'flex', alignItems: 'center' } as const;
  const headCell = { ...cell, justifyContent: 'center', fontWeight: 700, fontSize: 13, bgcolor: '#eef0fa' } as const;

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', rowGap: 1.5 }} spacing={2}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/job-cards')}>
          Back to Job Cards
        </Button>
        <Typography variant="h5" sx={{ fontWeight: 'bold' }} data-testid="sheet-title">
          Edit job card — {meta.job_number}
        </Typography>
        <ToggleButtonGroup
          exclusive size="small" color="primary" value={withPrice ? 'price' : 'plain'} data-testid="edit-mode"
          onChange={(_, v: 'plain' | 'price' | null) => { if (v) setSearchParams({ view: v }, { replace: true }); }}
        >
          <ToggleButton value="plain" data-testid="edit-mode-plain" sx={{ textTransform: 'none', px: 2 }}>Job card without price</ToggleButton>
          <ToggleButton value="price" data-testid="edit-mode-price" sx={{ textTransform: 'none', px: 2 }}>Job card with price</ToggleButton>
        </ToggleButtonGroup>
        <Button variant="outlined" onClick={() => navigate(`/job-cards/${id}/track`)}>
          Track progress
        </Button>
        <Button variant={withPrice ? 'outlined' : 'contained'} startIcon={<PrintIcon />} onClick={() => jobCardsApi.printSheet(jobCardId, false)} data-testid="sheet-print">
          Print without price (A5)
        </Button>
        <Button variant={withPrice ? 'contained' : 'outlined'} startIcon={<PrintIcon />} onClick={() => jobCardsApi.printSheet(jobCardId, true)} data-testid="sheet-print-price">
          Print with price (A5)
        </Button>
        <Button
          variant="contained"
          sx={{ bgcolor: INK }}
          startIcon={saveMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate(sheet)}
        >
          Save
        </Button>
      </Stack>

      {saveNote && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSaveNote(null)}>{saveNote}</Alert>}
      {saveMutation.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {getErrorMessage(saveMutation.error, 'Could not save the job card')}
        </Alert>
      )}

      <Alert severity="info" sx={{ mb: 2 }} data-testid="edit-mode-note">
        {withPrice
          ? 'You are editing the job card WITH price (the office copy): the form, the payment column and the price list. Press Save, then Print with price (A5).'
          : 'You are editing the job card WITHOUT price (the shop-floor copy): prices are not shown or printed. Press Save, then Print without price (A5).'}
        {' '}Tasks, materials and progress of this job are below the form.
      </Alert>

      <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 1 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, color: INK }}>Printing job card {withPrice ? '- with price' : '- without price'}</Typography>
          <Typography variant="caption" color="text.secondary">
            Filled in from the order. Edit anything here (party, job, size, proofs, delivery, paper, colours, remarks
            {priceLines !== null ? ' and, for the copy with price, the price list' : ''}) and press Save. The printed job card — with or
            without price (A5) — shows what you saved.
          </Typography>
        </Box>
        <Button
          size="small" variant="outlined" startIcon={<RestartAltIcon />} disabled={resetMutation.isPending}
          onClick={() => { if (window.confirm('Throw away what was typed on this form and fill it from the order again?')) resetMutation.mutate(); }}
          data-testid="sheet-reset"
        >
          Fill again from the order
        </Button>
      </Stack>
      <Box sx={{ overflowX: 'auto' }}>
        <Paper square sx={{ minWidth: 1020, border: `2px solid ${INK}` }}>
          {/* ---- header ---- */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', p: 1.5, borderBottom: border }}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800, color: INK }}>Sri Jayam Printers</Typography>
              <Typography>Navalur -600 130.</Typography>
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 800, color: INK, textDecoration: 'underline', px: 2 }}>
              JOB CARD
            </Typography>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>
                No: {meta.invoice_number ?? <span style={{ color: '#999', fontWeight: 400 }}>— (no invoice yet)</span>}
              </Typography>
              <Typography sx={{ mt: 0.5 }}>
                Date: <b>{fmtDate(meta.invoice_date) || '—'}</b> &nbsp;&nbsp; Time: <b>{meta.invoice_time ?? '—'}</b>
              </Typography>
            </Box>
          </Box>

          {/* ---- party / job ---- */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 4, px: 1.5, py: 1, borderBottom: border }}>
            <Box>
              <LabeledLine label="Party Name" value={sheet.party_name} onChange={(v) => set('party_name', v)} />
              <LabeledLine label="Mobile" value={sheet.mobile} onChange={(v) => set('mobile', v)} />
            </Box>
            <Box>
              <LabeledLine label="Job Name" value={sheet.job_name} onChange={(v) => set('job_name', v)} />
              <LabeledLine label="Size" value={sheet.size} onChange={(v) => set('size', v)} />
            </Box>
          </Box>

          {/* ---- type of printing ---- */}
          {profile.type_options.length > 0 && (
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center', px: 1.5, py: 0.75, borderBottom: border }} data-testid="sheet-types">
              <Typography sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Type of Printing :</Typography>
              <CheckList row options={profile.type_options} value={sheet.type_of_printing} onChange={(v) => set('type_of_printing', v)} />
            </Stack>
          )}

          {/* ---- main body: left stack + payment column ---- */}
          <Box sx={{ display: 'grid', gridTemplateColumns: withPrice ? '1fr 290px' : '1fr' }}>
            <Box sx={{ borderRight: withPrice ? border : 'none' }}>
              {/* proof / delivery + paper details */}
              <Box sx={{ display: 'grid', gridTemplateColumns: '170px 1fr', borderBottom: border }}>
                <Box sx={{ borderRight: border, p: 1 }}>
                  {profile.show_proofs && (
                    <Box data-testid="sheet-proofs">
                      <Typography sx={{ fontWeight: 700, fontSize: 13 }}>Proof Date-Time</Typography>
                      <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Proof 1</Typography>
                      <Plain type="date" value={sheet.proof1_date} onChange={(v) => set('proof1_date', v)} />
                      <Plain type="time" value={sheet.proof1_time} onChange={(v) => set('proof1_time', v)} />
                      <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.5 }}>Proof 2 (optional)</Typography>
                      <Plain type="date" value={sheet.proof2_date} onChange={(v) => set('proof2_date', v)} />
                      <Plain type="time" value={sheet.proof2_time} onChange={(v) => set('proof2_time', v)} />
                      {moreProofs.map((pr, i) => (
                        <Box key={i}>
                          <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.5 }}>Proof {i + 3}</Typography>
                          <Plain type="date" value={pr.date} onChange={(v) => set('more_proofs', moreProofs.map((x, k) => (k === i ? { ...x, date: v } : x)))} />
                          <Plain type="time" value={pr.time} onChange={(v) => set('more_proofs', moreProofs.map((x, k) => (k === i ? { ...x, time: v } : x)))} />
                        </Box>
                      ))}
                      <Button size="small" startIcon={<AddIcon />} sx={{ mt: 0.5 }} data-testid="sheet-add-proof" onClick={() => set('more_proofs', [...moreProofs, { date: '', time: '' }])}>
                        Add proof line
                      </Button>
                    </Box>
                  )}
                  <Typography sx={{ fontWeight: 700, fontSize: 13, mt: profile.show_proofs ? 1.5 : 0 }}>Delivery Date-Time</Typography>
                  <Plain type="date" value={sheet.delivery_date} onChange={(v) => set('delivery_date', v)} />
                  <Plain type="time" value={sheet.delivery_time} onChange={(v) => set('delivery_time', v)} />
                </Box>

                <Box>
                  <Heading>Paper Details</Heading>
                  <Box
                    data-testid="sheet-paper"
                    sx={{ display: 'grid', gridTemplateColumns: `${copyColumn ? '78px ' : ''}${cols.map((c) => COL_WEIGHT[c]).join(' ')}`, borderTop: border, mt: '-1px' }}
                  >
                    {copyColumn && <Box sx={headCell} />}
                    {cols.map((c) => <Box key={c} sx={headCell}>{colLabel(c)}</Box>)}
                    {sheet.paper.map((row, r) => (
                      <Box key={r} sx={{ display: 'contents' }}>
                        {copyColumn && <Box sx={{ ...cell, fontSize: 12, color: 'text.secondary' }}>{COPY_LABELS[r]}</Box>}
                        {cols.map((c) => (
                          c === 'cutting' ? (
                            r === 0 ? (
                              <Box key={c} sx={{ ...cell, gridRow: `span ${sheet.paper.length}` }}>
                                <Plain value={sheet.cutting_size} onChange={(v) => set('cutting_size', v)} />
                              </Box>
                            ) : null
                          ) : (
                            <Box key={c} sx={cell}><Plain value={row[c]} onChange={(v) => setPaper(r, c, v)} /></Box>
                          )
                        ))}
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Box>

              {/* printing colour / margin / no details: only for the services that have them */}
              {(profile.show_colours || profile.show_margin || profile.show_numbering) && (
                <Box sx={{ display: 'grid', gridTemplateColumns: [profile.show_colours && '1.3fr', profile.show_margin && '0.8fr', profile.show_numbering && '1.2fr'].filter(Boolean).join(' '), borderBottom: border }} data-testid="sheet-extras">
                  {profile.show_colours && (
                    <Box sx={{ borderRight: border }}>
                      <Heading>Printing Colour</Heading>
                      <Box sx={{ p: 1 }}>
                        <CheckList options={COLOUR_OPTIONS} columns={2} value={sheet.printing_colours} onChange={(v) => set('printing_colours', v)} />
                      </Box>
                    </Box>
                  )}
                  {profile.show_margin && (
                    <Box sx={{ borderRight: border }}>
                      <Heading>Margin</Heading>
                      <Box sx={{ p: 1 }}>
                        <CheckList options={MARGIN_OPTIONS} value={sheet.margins} onChange={(v) => set('margins', v)} />
                      </Box>
                    </Box>
                  )}
                  {profile.show_numbering && (
                    <Box>
                      <Heading>No Details</Heading>
                      <Box sx={{ p: 1 }}>
                        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Serial No. From - To</Typography>
                        <TextField variant="standard" size="small" fullWidth value={sheet.serial_from_to} onChange={(e) => set('serial_from_to', e.target.value)} />
                        <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1.5 }}>Book No. From - To</Typography>
                        <TextField variant="standard" size="small" fullWidth value={sheet.book_from_to} onChange={(e) => set('book_from_to', e.target.value)} />
                      </Box>
                    </Box>
                  )}
                </Box>
              )}

              {/* remarks */}
              <Box sx={{ p: 1.5 }}>
                <Typography sx={{ fontWeight: 700 }}>Remarks :</Typography>
                <TextField
                  variant="standard"
                  multiline
                  minRows={5}
                  fullWidth
                  value={sheet.remarks}
                  onChange={(e) => set('remarks', e.target.value)}
                />
              </Box>
            </Box>

            {/* payment details: only on the copy with price */}
            {withPrice && (
            <Box data-testid="sheet-payment">
              <Heading>Payment Details</Heading>
              {profile.payment_keys.map((key) => (
                <Box key={key} sx={{ display: 'grid', gridTemplateColumns: '105px 1fr', borderBottom: border }}>
                  <Box sx={{ ...cell, borderBottom: 'none', fontSize: 13, fontWeight: 600 }}>{PAYMENT_LABELS[key] ?? key}</Box>
                  <Box sx={{ px: 0.5, py: 0.75 }}>
                    <Plain value={sheet.payment[key]} onChange={(v) => setPayment(key, v)} />
                  </Box>
                </Box>
              ))}
              {priceLines !== null && (
                <Box sx={{ p: 1 }} data-testid="sheet-price-list">
                  <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 12 }}>
                      Price list (printed on the copy with price){meta.price_edited ? ' - edited' : ''}
                    </Typography>
                  </Stack>
                  {priceLines.map((l, i) => (
                    <Box key={i} sx={{ display: 'grid', gridTemplateColumns: '1fr 86px 24px', gap: 0.5, alignItems: 'center', mt: 0.5 }} data-testid={`price-line-${i}`}>
                      <TextField variant="standard" size="small" value={l.label} placeholder="Item" onChange={(e) => setLine(i, { label: e.target.value })}
                        slotProps={{ htmlInput: { maxLength: 120, 'data-testid': `price-label-${i}`, style: { fontSize: 12 } } }} />
                      <TextField variant="standard" size="small" type="number" value={Number.isFinite(l.amount) ? l.amount : ''} onChange={(e) => setLine(i, { amount: e.target.value === '' ? 0 : Number(e.target.value) })}
                        slotProps={{ htmlInput: { step: 'any', 'data-testid': `price-amount-${i}`, style: { fontSize: 12, textAlign: 'right' } } }} />
                      <IconButton size="small" aria-label="Remove price line" data-testid={`price-remove-${i}`} onClick={() => { setSaveNote(null); setPriceLines((ls) => (ls ?? []).filter((_, k) => k !== i)); }}>
                        <DeleteIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Box>
                  ))}
                  <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mt: 0.75 }}>
                    <Button size="small" startIcon={<AddIcon />} data-testid="price-add" onClick={() => { setSaveNote(null); setPriceLines((ls) => [...(ls ?? []), { label: '', detail: '', amount: 0 }]); }}>
                      Add a line
                    </Button>
                    <Typography sx={{ fontSize: 12 }} data-testid="price-lines-total">
                      Total <b>₹{priceLines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', rowGap: 0.5 }}>
                    <Button size="small" variant="outlined" data-testid="price-use-total"
                      onClick={() => setPayment('first', String(Math.round(priceLines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0) * 100) / 100))}>
                      Use total as Bill total
                    </Button>
                    {meta.price_edited && (
                      <Button size="small" data-testid="price-back" onClick={() => {
                        if (window.confirm("Go back to the order's own price list? Your edited price lines will be dropped.")) {
                          jobCardsApi.saveSheet(jobCardId, sheet, null).then((result) => {
                            queryClient.setQueryData(['job-card-sheet', jobCardId], result);
                            setPriceLines(result.price_lines.map((l) => ({ ...l })));
                            setSaveNote("The price list follows the order again.");
                          });
                        }
                      }}>
                        Back to the order's list
                      </Button>
                    )}
                  </Stack>
                </Box>
              )}
            </Box>
            )}
          </Box>

          {/* ---- job position + DC / bill numbers ---- */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 230px', borderTop: border }}>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center', p: 1.5, borderRight: border }}>
              <Typography sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Job Position :</Typography>
              <CheckList row options={profile.position_options} value={sheet.job_position} onChange={(v) => set('job_position', v)} />
            </Stack>
            <Box sx={{ p: 1.5 }}>
              <Typography sx={{ fontSize: 14 }}>
                DC No. : <b>{meta.dc_number ?? '—'}</b>
              </Typography>
              <Typography sx={{ fontSize: 14, mt: 0.5 }}>
                Bill No. : <b>{meta.invoice_number ?? '—'}</b>
              </Typography>
            </Box>
          </Box>
        </Paper>
      </Box>

      <Typography variant="h6" sx={{ fontWeight: 800, color: INK, mt: 3, mb: 1 }}>Tasks, materials and progress</Typography>
      <JobDetailPanel jobCardId={jobCardId} canEdit={user?.role !== 'accounts'} />
    </Box>
  );
}