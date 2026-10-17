import { Autocomplete, TextField } from '@mui/material';

export interface ChoiceOption {
  id: number;
  label: string;
}

interface SearchSelectProps {
  label: string;
  options: ChoiceOption[];
  value: number | null | undefined;
  onChange: (id: number | null) => void;
  /** Adds a * to the label (not the native `required` attribute, which would
   * trigger the browser's own validation bubble when the form submits). */
  required?: boolean;
  disabled?: boolean;
  helperText?: string;
  error?: boolean;
  noOptionsText?: string;
}

/**
 * Searchable single-choice dropdown: click to see everything, or start typing
 * to filter. Used for every option picker in the order flow so long lists
 * (sizes, papers, services) stay compact and quick to search.
 */
export default function SearchSelect({
  label, options, value, onChange, required, disabled, helperText, error, noOptionsText,
}: SearchSelectProps) {
  return (
    <Autocomplete
      size="small"
      fullWidth
      autoHighlight
      openOnFocus
      disabled={disabled}
      options={options}
      value={options.find((o) => o.id === value) ?? null}
      onChange={(_, option) => onChange(option ? option.id : null)}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      getOptionLabel={(o) => o.label}
      noOptionsText={noOptionsText ?? 'No matches'}
      renderInput={(params) => (
        <TextField
          {...params}
          label={required ? `${label} *` : label}
          helperText={helperText}
          error={error}
        />
      )}
    />
  );
}
