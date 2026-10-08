import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, Paper, Stack, TextField, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import { jobCardsApi } from '../api/jobCardsApi';
import { getErrorMessage } from '../utils/api';
import type { JobCardSheetData, SheetPaymentKey } from '../types/jobCards';

const INK = '#1a237e';
const border = `1px solid ${INK}`;

const TYPE_OPTIONS = ['Offset', 'Screen', 'Multi Colour', 'Xerox', 'B/W Printout', 'Colour Printout'];
const COLOUR_OPTIONS = ['Royal Blue', 'Peacock Blue', 'Green', 'Red', 'Mejentha', 'Merun', 'Brown', 'Black'];
const MARGIN_OPTIONS = ['Centre', 'Top', 'Left', 'Right'];
// The paper card's job position ticks, plus Delivery / Half Payment / Full Payment.
const POSITION_OPTIONS = [
  '1st Proof', '2nd Proof', 'Proof OK', 'Tracing', 'Master', 'Screen', 'Printing', 'Binding', 'Ready',
  'Delivery', 'Half Payment', 'Full Payment',
];
const PAYMENT_ROWS: [SheetPaymentKey, string][] = [
  ['first', '1st'], ['rate', 'Rate'], ['advance', 'Advance'], ['balance1', 'Balance'],
  ['ap_advance', 'A.P.Advance'], ['balance2', 'Balance'], ['dtp', 'D.T.P'], ['proof', 'PROOF'],
  ['printing', 'PRINTING'], ['binding', 'BINDING'], ['packing', 'PACKING'], ['delivery', 'DELIVERY'],
];
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

  const sheetQuery = useQuery({
    queryKey: ['job-card-sheet', jobCardId],
    queryFn: () => jobCardsApi.getSheet(jobCardId),
    enabled: Number.isFinite(jobCardId),
    refetchOnWindowFocus: false,
  });

  const [sheet, setSheet] = useState<JobCardSheetData | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  // Load once; later refetches must not wipe what is being typed.
  useEffect(() => {
    if (sheetQuery.data && sheet === null) setSheet(sheetQuery.data.sheet);
  }, [sheetQuery.data, sheet]);

  const saveMutation = useMutation({
    mutationFn: (data: JobCardSheetData) => jobCardsApi.saveSheet(jobCardId, data),
    onSuccess: (result) => {
      setSheet(result.sheet);
      queryClient.setQueryData(['job-card-sheet', jobCardId], result);
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
      setSaveNote('Job card saved.');
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
  const cell = { borderRight: border, borderBottom: border, p: 0.5, display: 'flex', alignItems: 'center' } as const;
  const headCell = { ...cell, justifyContent: 'center', fontWeight: 700, fontSize: 13, bgcolor: '#eef0fa' } as const;

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 2 }} spacing={2}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/job-cards')}>
          Back to Job Cards
        </Button>
        <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
          Job Card — {meta.job_number}
        </Typography>
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
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center', px: 1.5, py: 0.75, borderBottom: border }}>
            <Typography sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Type of Printing :</Typography>
            <CheckList row options={TYPE_OPTIONS} value={sheet.type_of_printing} onChange={(v) => set('type_of_printing', v)} />
          </Stack>

          {/* ---- main body: left stack + payment column ---- */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 290px' }}>
            <Box sx={{ borderRight: border }}>
              {/* proof / delivery + paper details */}
              <Box sx={{ display: 'grid', gridTemplateColumns: '170px 1fr', borderBottom: border }}>
                <Box sx={{ borderRight: border, p: 1 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 13 }}>Proof Date-Time</Typography>
                  <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Proof 1</Typography>
                  <Plain type="date" value={sheet.proof1_date} onChange={(v) => set('proof1_date', v)} />
                  <Plain type="time" value={sheet.proof1_time} onChange={(v) => set('proof1_time', v)} />
                  <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.5 }}>Proof 2 (optional)</Typography>
                  <Plain type="date" value={sheet.proof2_date} onChange={(v) => set('proof2_date', v)} />
                  <Plain type="time" value={sheet.proof2_time} onChange={(v) => set('proof2_time', v)} />
                  <Typography sx={{ fontWeight: 700, fontSize: 13, mt: 1.5 }}>Delivery Date-Time</Typography>
                  <Plain type="date" value={sheet.delivery_date} onChange={(v) => set('delivery_date', v)} />
                  <Plain type="time" value={sheet.delivery_time} onChange={(v) => set('delivery_time', v)} />
                </Box>

                <Box>
                  <Heading>Paper Details</Heading>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '78px 1.1fr 0.7fr 1fr 0.8fr 1fr 1.1fr',
                      borderTop: border,
                      mt: '-1px',
                    }}
                  >
                    {['Range', 'K.gs', 'Colour', 'Qty', 'Cutting Size', 'Printing'].map((h, i) => (
                      <Box key={h} sx={{ ...headCell, gridRow: 1, gridColumn: i + 2 }}>{h}</Box>
                    ))}
                    <Box sx={{ ...headCell, gridRow: 1, gridColumn: 1 }} />
                    {sheet.paper.map((row, r) => (
                      <Box key={r} sx={{ display: 'contents' }}>
                        <Box sx={{ ...cell, gridRow: r + 2, gridColumn: 1, fontSize: 12, color: 'text.secondary' }}>{COPY_LABELS[r]}</Box>
                        <Box sx={{ ...cell, gridRow: r + 2, gridColumn: 2 }}><Plain value={row.range} onChange={(v) => setPaper(r, 'range', v)} /></Box>
                        <Box sx={{ ...cell, gridRow: r + 2, gridColumn: 3 }}><Plain value={row.kgs} onChange={(v) => setPaper(r, 'kgs', v)} /></Box>
                        <Box sx={{ ...cell, gridRow: r + 2, gridColumn: 4 }}><Plain value={row.colour} onChange={(v) => setPaper(r, 'colour', v)} /></Box>
                        <Box sx={{ ...cell, gridRow: r + 2, gridColumn: 5 }}><Plain value={row.qty} onChange={(v) => setPaper(r, 'qty', v)} /></Box>
                        <Box sx={{ ...cell, gridRow: r + 2, gridColumn: 7 }}>
                          <Plain value={row.printing} placeholder={COPY_LABELS[r]} onChange={(v) => setPaper(r, 'printing', v)} />
                        </Box>
                      </Box>
                    ))}
                    <Box sx={{ ...cell, gridRow: '2 / span 4', gridColumn: 6 }}>
                      <Plain value={sheet.cutting_size} onChange={(v) => set('cutting_size', v)} />
                    </Box>
                  </Box>
                </Box>
              </Box>

              {/* printing colour / margin / no details */}
              <Box sx={{ display: 'grid', gridTemplateColumns: '1.3fr 0.8fr 1.2fr', borderBottom: border }}>
                <Box sx={{ borderRight: border }}>
                  <Heading>Printing Colour</Heading>
                  <Box sx={{ p: 1 }}>
                    <CheckList options={COLOUR_OPTIONS} columns={2} value={sheet.printing_colours} onChange={(v) => set('printing_colours', v)} />
                  </Box>
                </Box>
                <Box sx={{ borderRight: border }}>
                  <Heading>Margin</Heading>
                  <Box sx={{ p: 1 }}>
                    <CheckList options={MARGIN_OPTIONS} value={sheet.margins} onChange={(v) => set('margins', v)} />
                  </Box>
                </Box>
                <Box>
                  <Heading>No Details</Heading>
                  <Box sx={{ p: 1 }}>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Serial No. From - To</Typography>
                    <TextField variant="standard" size="small" fullWidth value={sheet.serial_from_to} onChange={(e) => set('serial_from_to', e.target.value)} />
                    <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1.5 }}>Book No. From - To</Typography>
                    <TextField variant="standard" size="small" fullWidth value={sheet.book_from_to} onChange={(e) => set('book_from_to', e.target.value)} />
                  </Box>
                </Box>
              </Box>

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

            {/* payment details */}
            <Box>
              <Heading>Payment Details</Heading>
              {PAYMENT_ROWS.map(([key, label], index) => (
                <Box key={`${key}-${index}`} sx={{ display: 'grid', gridTemplateColumns: '105px 1fr', borderBottom: border }}>
                  <Box sx={{ ...cell, borderBottom: 'none', fontSize: 13, fontWeight: 600 }}>{label}</Box>
                  <Box sx={{ px: 0.5, py: 0.75 }}>
                    <Plain value={sheet.payment[key]} onChange={(v) => setPayment(key, v)} />
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>

          {/* ---- job position + DC / bill numbers ---- */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 230px', borderTop: border }}>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center', p: 1.5, borderRight: border }}>
              <Typography sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Job Position :</Typography>
              <CheckList row options={POSITION_OPTIONS} value={sheet.job_position} onChange={(v) => set('job_position', v)} />
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
    </Box>
  );
}