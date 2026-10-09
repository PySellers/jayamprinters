import { Checkbox, FormControlLabel, FormGroup, Typography, Box } from '@mui/material';
import type { ExtraCharge } from '../../types/extraCharges';
import ChoiceChips from './ChoiceChips';

/** "Binding Set - 50 Set (1+3)" -> "50 Set"; "Bill Type - Two Bill (NCR)" -> "Two Bill (NCR)". */
export function chargeLabel(charge: ExtraCharge): string {
  const stripped = charge.name
    .replace(/^(Bill Type|Binding Type|Binding Model|Binding Set|Binding) - /, '')
    .replace(/ \(1\+\d\)$/, '');
  return charge.amount > 0 ? `${stripped} (+₹${charge.amount.toFixed(2)})` : stripped;
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

interface ChargeGroupPickerProps {
  charges: ExtraCharge[];
  value: number[];
  onChange: (ids: number[]) => void;
  selectedOptionIds: number[];
}

/**
 * Extra charges for the generic order form: grouped charges are single-choice
 * (one Bill Type, one Binding Type...), ungrouped ones stay simple checkboxes.
 */
export default function ChargeGroupPicker({ charges, value, onChange, selectedOptionIds }: ChargeGroupPickerProps) {
  const visible = applicableCharges(charges, selectedOptionIds);
  const groupNames = Array.from(new Set(visible.map((c) => c.group_name).filter((g): g is string => Boolean(g))));
  const ungrouped = visible.filter((c) => !c.group_name);

  return (
    <>
      {groupNames.map((group) => {
        const options = visible.filter((c) => c.group_name === group);
        const current = options.find((c) => value.includes(c.id))?.id ?? null;
        return (
          <Box key={group} sx={{ mb: 1.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>{group}</Typography>
            <ChoiceChips
              allowClear
              options={options.map((c) => ({ id: c.id, label: chargeLabel(c) }))}
              value={current}
              onChange={(id) => onChange(setChargeInGroup(value, charges, group, id))}
            />
          </Box>
        );
      })}
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
