import { Box, Button, MenuItem, TextField, Typography } from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import type { PaymentMethod } from '../types/common';

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'card', label: 'Card' },
  { value: 'credit', label: 'Credit' },
];

/** How a payment was made, and the proof of it: UPI id / reference number / bank details and a photo of the receipt. */
export interface PaymentDetails {
  method: PaymentMethod;
  reference_number: string;
  upi_id: string;
  bank_details: string;
  file: File | null;
}

export const emptyPaymentDetails = (method: PaymentMethod = 'cash'): PaymentDetails => ({
  method, reference_number: '', upi_id: '', bank_details: '', file: null,
});

/** The fields of the details that go to the server (the file is uploaded separately, after the payment exists). */
export function detailsPayload(d: PaymentDetails) {
  return {
    method: d.method,
    reference_number: d.reference_number.trim() || null,
    upi_id: d.method === 'upi' ? d.upi_id.trim() || null : null,
    bank_details: d.method === 'bank_transfer' ? d.bank_details.trim() || null : null,
  };
}

interface Props {
  value: PaymentDetails;
  onChange: (next: PaymentDetails) => void;
  /** Purchases may leave the method blank. */
  allowBlankMethod?: boolean;
  idPrefix?: string;
}

export default function PaymentDetailsFields({ value, onChange, allowBlankMethod, idPrefix = 'pay' }: Props) {
  const set = (patch: Partial<PaymentDetails>) => onChange({ ...value, ...patch });
  const showProof = value.method !== 'cash' && value.method !== 'credit';
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }} data-testid={`${idPrefix}-details`}>
      <TextField
        select size="small" fullWidth label="Paid by" value={value.method}
        onChange={(e) => set({ method: e.target.value as PaymentMethod })}
        slotProps={{ htmlInput: { 'data-testid': `${idPrefix}-method` } }}
      >
        {allowBlankMethod && <MenuItem value={'' as PaymentMethod}>-</MenuItem>}
        {PAYMENT_METHODS.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
      </TextField>
      {value.method === 'upi' && (
        <TextField size="small" fullWidth label="UPI id / number" placeholder="name@bank or 98xxxxxx" value={value.upi_id}
          onChange={(e) => set({ upi_id: e.target.value })} slotProps={{ htmlInput: { 'data-testid': `${idPrefix}-upi` } }} />
      )}
      {value.method === 'bank_transfer' && (
        <TextField size="small" fullWidth label="Bank / account details" placeholder="Bank, branch, last digits of the account" value={value.bank_details}
          onChange={(e) => set({ bank_details: e.target.value })} slotProps={{ htmlInput: { 'data-testid': `${idPrefix}-bank` } }} />
      )}
      {value.method !== 'cash' && value.method !== ('' as PaymentMethod) && (
        <TextField size="small" fullWidth label={value.method === 'upi' ? 'Transaction id (UTR)' : value.method === 'bank_transfer' ? 'Transfer reference / UTR' : 'Reference number'}
          value={value.reference_number} onChange={(e) => set({ reference_number: e.target.value })} slotProps={{ htmlInput: { 'data-testid': `${idPrefix}-ref` } }} />
      )}
      {showProof && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Button component="label" size="small" variant="outlined" startIcon={<AttachFileIcon />}>
            {value.file ? 'Change receipt' : 'Upload receipt (photo / PDF)'}
            <input
              hidden type="file" accept="image/*,application/pdf" data-testid={`${idPrefix}-file`}
              onChange={(e) => set({ file: e.target.files?.[0] ?? null })}
            />
          </Button>
          {value.file && <Typography variant="caption" color="text.secondary">{value.file.name}</Typography>}
        </Box>
      )}
    </Box>
  );
}
