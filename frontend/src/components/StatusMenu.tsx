import { useState } from 'react';
import type { MouseEvent } from 'react';
import { Chip, Menu, MenuItem } from '@mui/material';
import type { ChipProps } from '@mui/material';

interface StatusMenuProps {
  status: string;
  allowedStatuses: string[];
  onChange: (status: string) => void;
  disabled?: boolean;
  colorMap?: Record<string, ChipProps['color']>;
}

function formatLabel(status: string): string {
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default function StatusMenu({ status, allowedStatuses, onChange, disabled, colorMap }: StatusMenuProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleOpen = (e: MouseEvent<HTMLElement>) => {
    if (disabled) return;
    setAnchorEl(e.currentTarget);
  };
  const handleClose = () => setAnchorEl(null);

  const handleSelect = (next: string) => {
    handleClose();
    if (next !== status) onChange(next);
  };

  return (
    <>
      <Chip
        label={formatLabel(status)}
        color={colorMap?.[status] ?? 'default'}
        onClick={handleOpen}
        size="small"
        sx={{ cursor: disabled ? 'default' : 'pointer' }}
      />
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose}>
        {allowedStatuses.map((s) => (
          <MenuItem key={s} selected={s === status} onClick={() => handleSelect(s)}>
            {formatLabel(s)}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
