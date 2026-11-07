import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Chip, CircularProgress, Grid, Stack, Typography } from '@mui/material';
import { workflowApi } from '../api/workflowApi';
import WorkCardView from '../components/workflow/WorkCardView';
import { useAuth } from '../context/AuthContext';

/** Each employee's own screen: the jobs on them now, and the jobs waiting for their team. */
export default function MyWork() {
  const { user } = useAuth();
  const query = useQuery({ queryKey: ['my-work'], queryFn: workflowApi.myWork, refetchInterval: 20000 });
  const data = query.data;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 0.5 }}>My Work</Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 3, alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        <Typography color="text.secondary">Hello {user?.name}.</Typography>
        {(data?.work_centers ?? []).length > 0 ? (
          <>
            <Typography color="text.secondary">You are in:</Typography>
            {data!.work_centers.map((n) => <Chip key={n} size="small" label={n} />)}
          </>
        ) : (
          <Typography color="text.secondary">You are not in a work center yet - the admin can add you under Masters &gt; Work Centers.</Typography>
        )}
      </Stack>

      {query.isLoading && <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>}
      {query.isError && <Alert severity="error">Could not load your work.</Alert>}

      {data && (
        <>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>On me ({data.mine.length})</Typography>
          {data.mine.length === 0 ? (
            <Alert severity="success" sx={{ mb: 3 }}>Nothing is assigned to you right now.</Alert>
          ) : (
            <Grid container spacing={2} sx={{ mb: 3 }}>
              {data.mine.map((c) => (
                <Grid key={c.id} size={{ xs: 12, md: 6, xl: 4 }}><WorkCardView card={c} /></Grid>
              ))}
            </Grid>
          )}

          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Waiting for my team ({data.queue.length})</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Anyone in the work center can take these. Urgent and earliest-due jobs come first.</Typography>
          {data.queue.length === 0 ? (
            <Alert severity="info">Nothing is waiting for your work center.</Alert>
          ) : (
            <Grid container spacing={2}>
              {data.queue.map((c) => (
                <Grid key={c.id} size={{ xs: 12, md: 6, xl: 4 }}><WorkCardView card={c} /></Grid>
              ))}
            </Grid>
          )}
        </>
      )}
    </Box>
  );
}
