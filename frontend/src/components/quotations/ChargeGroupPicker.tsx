import { Checkbox, FormControlLabel, FormGroup, Typography, Box, MenuItem, TextField, InputAdornment } from '@mui/material';
import type { ExtraCharge } from '../../types/extraCharges';
import type { CustomCharge } from '../../types/quotations';
import SearchSelect from './SearchSelect';

/** "Binding Set - 50 Set (1+3)" -> "50 Set"; "Bill Type - Two Bill (NCR)" -> "Two Bill (NCR)". */
export function chargeLabel(charge: ExtraCharge): string {
  const stripped = charge.name
    .replace(/^(Bill Type|Binding Type|Binding Model|Binding Set|Binding|Coloured Layers|Paper GSM) - /, '')
    .replace(/ \(1\+\d\)$/, '');
  if (charge.amount <= 0) return stripped;
  const price = charge.charge_type === 'percentage' ? `+${charge.amount}%` : `+₹${charge.amount.toFixed(2)}${charge.charge_type === 'per_unit' ? '/nos' : charge.charge_type === 'per_set' ? '/set' : ''}`;
  return `${stripped} (${price})`;
}

/** Charges that apply right now: active, and (if dependent) their required option is selected. */
export function applicableCharges(charges: ExtraCharge[], selectedOptionIds: number[]): ExtraCharge[] {
  return charges.filter(
    (c) => c.is_active && (!c.requires_option_id || selectedOptionIds.includes(c.requires_option_id)),
  );
}

/** Removes selected charge ids that are no longer valid for the current option selection. */
export function pruneCharges(chargeIds: number[], charges: ExtraCharge[], selectedOptionIds: number[]): number[] {
  const valid = new Set(applicableCharges(charges, selectedOptionIds).map((c) => c.id));
  return chargeIds.filter((id) => valid.has(id));
}

/** Picks `id` in its group, replacing any other charge of the same group; `null` clears the group. */
export function setChargeInGroup(
  chargeIds: number[],
  charges: ExtraCharge[],
  group: string,
  id: number | null,
): number[] {
  const inGroup = new Set(charges.filter((c) => c.group_name === group).map((c) => c.id));
  const rest = chargeIds.filter((cid) => !inGroup.has(cid));
  return id == null ? rest : [...rest, id];
}

/** The sections of a "required extras" service: each grouped charge section, and each ungrouped charge on its own. */
export function extraSections(charges: ExtraCharge[]): { name: string; charges: ExtraCharge[] }[] {
  const sections: { name: string; charges: ExtraCharge[] }[] = [];
  for (const c of charges) {
    const name = c.group_name || c.name;
    const found = sections.find((s) => s.name === name);
    if (found) found.charges.push(c);
    else sections.push({ name, charges: [c] });
  }
  return sections;
}

/** Sections that still have no answer ("None" counts as an answer). */
export function unansweredSections(charges: ExtraCharge[], selectedOptionIds: number[], choices: Record<string, string> | undefined): string[] {
  return extraSections(applicableCharges(charges, selectedOptionIds))
    .filter((s) => !(choices ?? {})[s.name])
    .map((s) => s.name);
}

interface ChargeGroupPickerProps {
  charges: ExtraCharge[];
  value: number[];
  onChange: (ids: number[]) => void;
  selectedOptionIds: number[];
  /** Required mode (e.g. visiting cards): every section is a dropdown that must be answered - None, an option, or Custom. */
  required?: boolean;
  customCharges?: CustomCharge[];
  onCustomChange?: (list: CustomCharge[]) => void;
  choices?: Record<string, string>;
  onChoicesChange?: (choices: Record<string, string>) => void;
  showErrors?: boolean;
}

/**
 * Extra charges for the generic order form. Normal mode: grouped charges are single-choice dropdowns, ungrouped ones
 * simple checkboxes. Required mode: every section is a dropdown that must be answered (None / an option / Custom).
 */
export default function ChargeGroupPicker({
  charges, value, onChange, selectedOptionIds, required, customCharges = [], onCustomChange, choices = {}, onChoicesChange, showErrors,
}: ChargeGroupPickerProps) {
  const visible = applicableCharges(charges, selectedOptionIds);

  if (required) {
    const sections = extraSections(visible);

    const choose = (section: { name: string; charges: ExtraCharge[] }, code: string) => {
      const ids = new Set(section.charges.map((c) => c.id));
      let nextIds = value.filter((id) => !ids.has(id));
      let nextCustom = customCharges.filter((c) => (c.group ?? '') !== section.name);
      if (code === 'custom') nextCustom = [...nextCustom, { label: '', amount: 0, group: section.name }];
      else if (code !== 'none') nextIds = [...nextIds, Number(code)];
      onChange(nextIds);
      onCustomChange?.(nextCustom);
      onChoicesChange?.({ ...choices, [section.name]: code });
    };
    const editCustom = (section: string, patch: Partial<CustomCharge>) =>
      onCustomChange?.(customCharges.map((c) => ((c.group ?? '') === section ? { ...c, ...patch } : c)));

    return (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 1 }} data-testid="required-extras">
        {sections.map((section) => {
          const code = choices[section.name] ?? '';
          const custom = customCharges.find((c) => (c.group ?? '') === section.name);
          const missing = showErrors && !code;
          const single = section.charges.length === 1 && !section.charges[0].group_name;
          return (
            <Box key={section.name} sx={{ minWidth: 260, flex: '1 1 300px', maxWidth: 460 }}>
              <TextField
                select
                size="small"
                fullWidth
                label={`${section.name} *`}
                value={code}
                error={missing}
                helperText={missing ? 'Choose an option - or None' : undefined}
                onChange={(e) => choose(section, e.target.value)}
                slotProps={{ htmlInput: { 'data-testid': `extras-${section.name}` } }}
              >
                <MenuItem value="none">None</MenuItem>
                {section.charges.map((c) => (
                  <MenuItem key={c.id} value={String(c.id)}>{single ? `Yes - ${chargeLabel(c)}` : chargeLabel(c)}</MenuItem>
                ))}
                <MenuItem value="custom">Custom...</MenuItem>
              </TextField>
              {code === 'custom' && custom && (
                <Box sx={{ display: 'flex', gap: 1, mt: 0.75 }}>
                  <TextField size="small" label="What is it?" value={custom.label} onChange={(e) => editCustom(section.name, { label: e.target.value })} sx={{ flexGrow: 1 }} />
                  <TextField
                    size="small" type="number" label="Amount" value={custom.amount || ''} sx={{ width: 120 }}
                    onChange={(e) => editCustom(section.name, { amount: Math.max(0, Number(e.target.value) || 0) })}
                    slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { min: 0, step: 'any' } }}
                  />
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    );
  }

  const groupNames = Array.from(new Set(visible.map((c) => c.group_name).filter((g): g is string => Boolean(g))));
  const ungrouped = visible.filter((c) => !c.group_name);

  return (
    <>
      {groupNames.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 1.5 }}>
          {groupNames.map((group) => {
            const options = visible.filter((c) => c.group_name === group);
            const current = options.find((c) => value.includes(c.id))?.id ?? null;
            return (
              <Box key={group} sx={{ minWidth: 240, flex: '1 1 280px', maxWidth: 440 }}>
                <SearchSelect
                  label={group}
                  options={options.map((c) => ({ id: c.id, label: chargeLabel(c) }))}
                  value={current}
                  onChange={(id) => onChange(setChargeInGroup(value, charges, group, id))}
                />
              </Box>
            );
          })}
        </Box>
      )}
      {ungrouped.length > 0 && (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Extra Charges</Typography>
          <FormGroup row>
            {ungrouped.map((charge) => (
              <FormControlLabel
                key={charge.id}
                control={
                  <Checkbox
                    checked={value.includes(charge.id)}
                    onChange={(e) =>
                      onChange(e.target.checked ? [...value, charge.id] : value.filter((id) => id !== charge.id))
                    }
                  />
                }
                label={`${charge.name} (+₹${charge.amount.toFixed(2)} ${charge.charge_type.replace('_', ' ')})`}
              />
            ))}
          </FormGroup>
        </>
      )}
    </>
  );
}
