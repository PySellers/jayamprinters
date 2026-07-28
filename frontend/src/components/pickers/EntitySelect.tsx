import { useEffect, useState } from 'react';
import { Autocomplete, TextField, CircularProgress } from '@mui/material';
import { useQuery } from '@tanstack/react-query';

interface EntityWithId {
  id: number;
}

interface EntitySelectProps<T extends EntityWithId> {
  label: string;
  value: number | null | undefined;
  onChange: (id: number | null) => void;
  getOptionLabel: (option: T) => string;
  queryKey: string;
  mode?: 'list' | 'search';
  fetchOptions?: () => Promise<T[]>;
  searchOptions?: (query: string) => Promise<T[]>;
  required?: boolean;
  disabled?: boolean;
  size?: 'small' | 'medium';
}

export default function EntitySelect<T extends EntityWithId>({
  label,
  value,
  onChange,
  getOptionLabel,
  queryKey,
  mode = 'list',
  fetchOptions,
  searchOptions,
  required,
  disabled,
  size = 'small',
}: EntitySelectProps<T>) {
  const [inputValue, setInputValue] = useState('');
  const [debounced, setDebounced] = useState('');
  // Tracks the actually-selected option object directly, independent of whatever the
  // live options list currently contains — search results narrow to the typed text, and
  // once a value is picked the input is reset to its label, which is then searched for
  // next and normally matches nothing. Deriving "selected" from that list would make the
  // field visually clear itself right after a selection.
  const [selectedOption, setSelectedOption] = useState<T | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(inputValue), 300);
    return () => clearTimeout(handle);
  }, [inputValue]);

  const listQuery = useQuery({
    queryKey: [queryKey, 'list'],
    queryFn: () => fetchOptions!(),
    enabled: mode === 'list' && Boolean(fetchOptions),
  });

  const searchQuery = useQuery({
    queryKey: [queryKey, 'search', debounced],
    queryFn: () => searchOptions!(debounced),
    enabled: mode === 'search' && Boolean(searchOptions) && debounced.length > 0,
  });

  const options = (mode === 'list' ? listQuery.data : searchQuery.data) ?? [];
  const loading = mode === 'list' ? listQuery.isLoading : searchQuery.isFetching;

  useEffect(() => {
    if (value == null) {
      setSelectedOption(null);
    } else if (selectedOption?.id !== value) {
      const found = options.find((o) => o.id === value);
      if (found) setSelectedOption(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options]);

  return (
    <Autocomplete
      size={size}
      options={options}
      loading={loading}
      value={selectedOption}
      onChange={(_, newValue) => {
        setSelectedOption(newValue);
        onChange(newValue ? newValue.id : null);
      }}
      inputValue={inputValue}
      onInputChange={(_, newInputValue) => setInputValue(newInputValue)}
      getOptionLabel={(option) => getOptionLabel(option as T)}
      isOptionEqualToValue={(option, val) => option.id === val.id}
      disabled={disabled}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          required={required}
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              endAdornment: (
                <>
                  {loading ? <CircularProgress color="inherit" size={16} /> : null}
                  {params.slotProps.input.endAdornment}
                </>
              ),
            },
          }}
        />
      )}
    />
  );
}
