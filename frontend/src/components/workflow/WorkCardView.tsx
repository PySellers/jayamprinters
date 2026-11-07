import { useNavigate } from 'react-router-dom';
import { Box, Chip, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import type { WorkCard } from '../../types/workflow';
import { PRIORITY_COLOR, StatusChip, StepActionBar, fmtMinutes } from './workflowUi';

/** One piece of work (a step of a job card) as a card: who, what, for whom, by when, and its buttons. */
export default function WorkCardView({ card, showActions = true, compact = false }: { card: WorkCard; showActions?: boolean; compact?: boolean }) {
  const navigate = useNavigate();
  return (
    <Paper
      variant="outlined"
      data-testid="work-card"
      sx={{
        p: compact ? 1.25 : 2, borderRadius: 2, borderLeft: `5px solid ${card.work_center_color || '#9e9e9e'}`,
        bgcolor: card.overdue ? '#fff8f6' : 'background.paper',
      }}
    >
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant={compact ? 'body2' : 'subtitle1'}
            sx={{ fontWeight: 700, cursor: 'pointer', color: '#1a237e', '&:hover': { textDecoration: 'underline' } }}
            onClick={() => navigate(`/job-cards/${card.job_card_id}/track`)}
          >
            {card.job_number} · {card.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {card.customer_name ?? '-'} · {card.product_name ?? '-'}{card.quantity ? ` × ${card.quantity}` : ''}
          </Typography>
        </Box>
        <StatusChip status={card.status} />
      </Stack>

      <Stack direction="row" spacing={0.75} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 0.75, alignItems: 'center' }}>
        {(card.priority === 'urgent' || card.priority === 'high') && <Chip size="small" label={card.priority} color={PRIORITY_COLOR[card.priority]} />}
        {card.delivery_date && (
          <Chip
            size="small"
            icon={card.overdue ? <WarningAmberIcon /> : undefined}
            color={card.overdue ? 'error' : 'default'}
            variant={card.overdue ? 'filled' : 'outlined'}
            label={`${card.overdue ? 'Overdue · ' : 'Due '}${card.delivery_date}`}
          />
        )}
        {card.assigned_to_name && <Chip size="small" variant="outlined" label={card.assigned_to_name} />}
        {card.kind === 'outsource' && <Chip size="small" color="info" variant="outlined" label={card.outsource_vendor ? `At ${card.outsource_vendor}` : 'Outside company'} />}
        {card.status === 'ready' && card.minutes_waiting ? <Chip size="small" variant="outlined" label={`waiting ${fmtMinutes(card.minutes_waiting)}`} /> : null}
      </Stack>

      {card.hold_reason && (
        <Typography variant="body2" sx={{ mt: 1, color: 'warning.dark' }}>On hold: {card.hold_reason}</Typography>
      )}
      {!compact && card.job_notes && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, whiteSpace: 'pre-wrap' }} noWrap>{card.job_notes}</Typography>
      )}

      <Box sx={{ mt: 1.25 }}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
          <LinearProgress variant="determinate" value={card.steps_total ? (card.steps_done / card.steps_total) * 100 : 0} sx={{ flexGrow: 1, height: 6, borderRadius: 3 }} />
          <Typography variant="caption" color="text.secondary">{card.steps_done}/{card.steps_total}</Typography>
        </Stack>
      </Box>

      {showActions && (
        <Box sx={{ mt: 1.25 }}>
          <StepActionBar step={card} compact={compact} />
        </Box>
      )}
    </Paper>
  );
}
