import { Box, Chip, Typography } from '@mui/material';

export interface ChoiceOption {
  id: number;
  label: string;
}

interface ChoiceChipsProps {
  options: ChoiceOption[];
  value: number | null | undefined;
  onChange: (id: number | null) => void;
  /** Clicking the selected chip again clears it (for optional choices). */
  allowClear?: boolean;
  emptyText?: string;
}

/**
 * Single-choice picker rendered as big tap-friendly chips -- quicker at a
 * billing counter than opening a dropdown for every option.
 */
export default function ChoiceChips({ options, value, onChange, allowClear = false, emptyText }: ChoiceChipsProps) {
  if (options.length === 0) {
    return emptyText ? <Typography variant="body2" color="text.secondary">{emptyText}</Typography> : null;
  }
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {options.map((o) => {
        const selected = o.id === value;
        return (
          <Chip
            key={o.id}
            label={o.label}
            clickable
            color={selected ? 'primary' : 'default'}
            variant={selected ? 'filled' : 'outlined'}
            onClick={() => onChange(selected && allowClear ? null : o.id)}
            sx={{
              fontWeight: selected ? 700 : 500,
              ...(selected ? { bgcolor: '#1a237e', '&:hover, &:focus': { bgcolor: '#0d145e' } } : {}),
            }}
          />
        );
      })}
    </Box>
  );
}
