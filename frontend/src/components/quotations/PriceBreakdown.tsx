import { useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Link, Table, TableBody, TableCell,
  TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useAuth } from '../../context/AuthContext';
import type { BreakdownRow } from '../../types/quotations';

const AREA_LABEL: Record<string, string> = {
  matrix: 'Price Matrix', products: 'Products', attributes: 'Attributes', charges: 'Extra Charges',
  printing: 'Printing charge', minimum: 'Minimum charge', none: 'Typed in by hand',
};

/** Where in the app the figure of one price row can be checked or changed. */
export function pricingLinkFor(row: Pick<BreakdownRow, 'area' | 'category_id' | 'product_id'>): string | null {
  const cat = row.category_id;
  switch (row.area) {
    case 'matrix': return row.product_id ? `/products/${row.product_id}/price-matrix` : null;
    case 'products': return '/products';
    case 'charges': return cat ? `/pricing-setup?category=${cat}&tab=charges` : null;
    case 'printing': return cat ? `/pricing-setup?category=${cat}&tab=printing` : null;
    case 'attributes': return cat ? `/pricing-setup?category=${cat}&tab=attributes` : null;
    case 'minimum': return cat ? `/pricing-setup?category=${cat}` : null;
    default: return null;
  }
}

const money = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The parts of one price, each with how it was worked out and a link to the setting it came from. */
export function PriceBreakdownTable({ rows, total }: { rows: BreakdownRow[]; total?: number }) {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin';
  return (
    <Table size="small" data-testid="price-breakdown">
      <TableHead>
        <TableRow>
          <TableCell>Part</TableCell>
          <TableCell>How it is worked out</TableCell>
          <TableCell align="right">Amount (₹)</TableCell>
          <TableCell>Where the rate is set</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row, i) => {
          const link = pricingLinkFor(row);
          return (
            <TableRow key={i}>
              <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{row.label}</TableCell>
              <TableCell sx={{ color: 'text.secondary' }}>{row.detail}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>{money(row.amount)}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                {link && canEdit ? (
                  <Link href={link} target="_blank" rel="noopener" underline="hover" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }} data-testid="pricing-link">
                    {AREA_LABEL[row.area] ?? 'Pricing Setup'} <OpenInNewIcon sx={{ fontSize: 14 }} />
                  </Link>
                ) : (
                  <Typography variant="body2" color="text.secondary">{AREA_LABEL[row.area] ?? ''}{link && !canEdit ? ' (owner changes it)' : ''}</Typography>
                )}
              </TableCell>
            </TableRow>
          );
        })}
        {total != null && (
          <TableRow>
            <TableCell colSpan={2} align="right" sx={{ fontWeight: 800 }}>Total for this line</TableCell>
            <TableCell align="right" sx={{ fontWeight: 800 }}>{money(total)}</TableCell>
            <TableCell />
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

/** A small "Why this rate?" button that opens the price breakdown of one line. */
export function RateInfo({
  rows, title, rate, amount, size = 'small', label,
}: { rows?: BreakdownRow[] | null; title: string; rate?: number; amount?: number; size?: 'small' | 'medium'; label?: string }) {
  const [open, setOpen] = useState(false);
  if (!rows || rows.length === 0) return null;
  return (
    <>
      {label ? (
        <Button size="small" startIcon={<InfoOutlinedIcon />} onClick={() => setOpen(true)} data-testid="rate-info">{label}</Button>
      ) : (
        <Tooltip title="Why this rate? See how the price is worked out">
          <IconButton size={size} onClick={() => setOpen(true)} aria-label="Why this rate" data-testid="rate-info">
            <InfoOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>
          Why this rate?
          <Typography variant="body2" color="text.secondary">{title}</Typography>
        </DialogTitle>
        <DialogContent>
          {rate != null && (
            <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
              <Chip label={`Rate ₹${money(rate)} per piece`} />
              {amount != null && <Chip color="primary" label={`Amount ₹${money(amount)}`} />}
            </Box>
          )}
          <Box sx={{ overflowX: 'auto' }}>
            <PriceBreakdownTable rows={rows} total={amount} />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            Every figure above comes from the pricing the owner keeps up to date; use the links to check or change it.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
