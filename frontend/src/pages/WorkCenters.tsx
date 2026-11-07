import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  IconButton, Paper, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import GroupIcon from '@mui/icons-material/Group';
import { workflowApi } from '../api/workflowApi';
import { usersApi } from '../api/usersApi';
import { getErrorMessage } from '../utils/api';
import ConfirmDialog from '../components/ConfirmDialog';
import type { WorkCenter } from '../types/workflow';

const COLORS = ['#1565c0', '#6a1b9a', '#00695c', '#ef6c00', '#455a64', '#757575', '#c62828', '#2e7d32'];

/** Departments / stations of the shop and the employees who work in each. */
export default function WorkCenters() {
  const queryClient = useQueryClient();
  const centers = useQuery({ queryKey: ['work-centers'], queryFn: workflowApi.workCenters });
  const users = useQuery({ queryKey: ['users'], queryFn: usersApi.list });
  const [editing, setEditing] = useState<WorkCenter | 'new' | null>(null);
  const [team, setTeam] = useState<WorkCenter | null>(null);
  const [deleting, setDeleting] = useState<WorkCenter | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [active, setActive] = useState(true);
  const [memberIds, setMemberIds] = useState<number[]>([]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['work-centers'] });
    queryClient.invalidateQueries({ queryKey: ['work-staff'] });
    queryClient.invalidateQueries({ queryKey: ['my-work'] });
  };
  const save = useMutation({
    mutationFn: () => {
      const body = { name, description: description || null, color, is_active: active };
      return editing === 'new' ? workflowApi.createWorkCenter({ ...body, display_order: (centers.data?.length ?? 0) + 1 }) : workflowApi.updateWorkCenter((editing as WorkCenter).id, body);
    },
    onSuccess: () => { setEditing(null); refresh(); },
  });
  const saveTeam = useMutation({
    mutationFn: () => workflowApi.setMembers(team!.id, memberIds),
    onSuccess: () => { setTeam(null); refresh(); },
  });
  const remove = useMutation({
    mutationFn: (id: number) => workflowApi.removeWorkCenter(id),
    onSuccess: () => { setDeleting(null); refresh(); },
  });

  const openNew = () => { setName(''); setDescription(''); setColor(COLORS[0]); setActive(true); save.reset(); setEditing('new'); };
  const openEdit = (c: WorkCenter) => { setName(c.name); setDescription(c.description ?? ''); setColor(c.color ?? COLORS[0]); setActive(c.is_active); save.reset(); setEditing(c); };
  const openTeam = (c: WorkCenter) => { setMemberIds(c.members.map((m) => m.id)); saveTeam.reset(); setTeam(c); };
  const activeUsers = (users.data ?? []).filter((u) => u.is_active);

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>Work Centers</Typography>
        <Button variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: '#1a237e' }} onClick={openNew}>Add Work Center</Button>
      </Stack>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        A work center is a department or station - Design, Printing, Binding, Front Desk... Put each employee in the work centers they work in;
        they then see that team's jobs under My Work, and can take the next one.
      </Typography>
      <Paper sx={{ borderRadius: 2, overflowX: 'auto' }}>
        {centers.isLoading ? <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box> : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Work center</TableCell>
                <TableCell>Team</TableCell>
                <TableCell align="right">Open jobs</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(centers.data ?? []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Box component="span" sx={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', bgcolor: c.color || '#9e9e9e', mr: 1 }} />
                    <strong>{c.name}</strong>
                    {c.description && <Typography variant="body2" color="text.secondary">{c.description}</Typography>}
                  </TableCell>
                  <TableCell>
                    {c.members.length ? c.members.map((m) => <Chip key={m.id} size="small" label={m.name} sx={{ mr: 0.5, mb: 0.5 }} />) : <Typography variant="body2" color="text.secondary">No one yet</Typography>}
                  </TableCell>
                  <TableCell align="right">{c.open_steps}</TableCell>
                  <TableCell><Chip size="small" label={c.is_active ? 'Active' : 'Inactive'} color={c.is_active ? 'success' : 'default'} /></TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Button size="small" startIcon={<GroupIcon />} onClick={() => openTeam(c)}>Team</Button>
                    <IconButton size="small" aria-label="Edit" onClick={() => openEdit(c)}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" aria-label="Delete" onClick={() => { remove.reset(); setDeleting(c); }}><DeleteIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{editing === 'new' ? 'Add Work Center' : 'Edit Work Center'}</DialogTitle>
        <DialogContent>
          {save.isError && <Alert severity="error" sx={{ mb: 1.5 }}>{getErrorMessage(save.error, 'Could not save')}</Alert>}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} fullWidth />
            <TextField label="What happens here" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth />
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">Colour</Typography>
              {COLORS.map((c) => (
                <Box key={c} role="button" aria-label={`Colour ${c}`} onClick={() => setColor(c)}
                  sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: c, cursor: 'pointer', outline: color === c ? '3px solid #1a237e' : 'none', outlineOffset: 2 }} />
              ))}
            </Stack>
            <FormControlLabel control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />} label="Active" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="contained" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={team !== null} onClose={() => setTeam(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Team - {team?.name}</DialogTitle>
        <DialogContent>
          {saveTeam.isError && <Alert severity="error" sx={{ mb: 1.5 }}>{getErrorMessage(saveTeam.error, 'Could not save the team')}</Alert>}
          <Autocomplete
            multiple
            sx={{ mt: 1 }}
            options={activeUsers}
            getOptionLabel={(u) => `${u.name} (${u.role})`}
            value={activeUsers.filter((u) => memberIds.includes(u.id))}
            onChange={(_, value) => setMemberIds(value.map((u) => u.id))}
            renderInput={(params) => <TextField {...params} label="Employees in this work center" />}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            An employee can be in several work centers. Create employee logins under Users first.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTeam(null)}>Cancel</Button>
          <Button variant="contained" disabled={saveTeam.isPending} onClick={() => saveTeam.mutate()}>Save team</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete work center"
        message={remove.isError ? getErrorMessage(remove.error, 'Could not delete') : `Delete "${deleting?.name}"? A work center that workflows or jobs already use cannot be deleted - switch it off instead.`}
        confirmLabel="Delete"
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </Box>
  );
}
