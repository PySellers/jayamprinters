import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Button, IconButton, Chip, CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { getMasterConfig } from '../../api/mastersApi';
import { getErrorMessage } from '../../utils/api';
import { useNotify } from '../../context/NotificationContext';
import type { MasterEntity, PricedMasterEntity } from '../../types/common';
import MasterFormDialog from './MasterFormDialog';
import ConfirmDialog from '../ConfirmDialog';
import EmptyState from '../EmptyState';

export default function MasterTable() {
  const { slug } = useParams<{ slug: string }>();
  const config = getMasterConfig(slug ?? '');
  const queryClient = useQueryClient();
  const notify = useNotify();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MasterEntity | PricedMasterEntity | null>(null);
  const [deleting, setDeleting] = useState<MasterEntity | null>(null);

  const query = useQuery({
    queryKey: ['masters', slug],
    queryFn: () => config!.api.list(),
    enabled: Boolean(config),
  });

  const saveMutation = useMutation({
    mutationFn: (values: Partial<MasterEntity | PricedMasterEntity>) =>
      editing ? config!.api.update(editing.id, values) : config!.api.create(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', slug] });
      notify(editing ? `${config!.label} updated` : `${config!.label} added`);
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (error) => notify(getErrorMessage(error, `Failed to save ${config!.label.toLowerCase()}`), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => config!.api.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', slug] });
      notify(`${config!.label} deleted`);
      setDeleting(null);
    },
    onError: (error) => {
      notify(getErrorMessage(error, `Failed to delete ${config!.label.toLowerCase()}`), 'error');
      setDeleting(null);
    },
  });

  if (!config) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error">Unknown master type.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          {config.label}
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          sx={{ bgcolor: '#1a237e' }}
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          Add New
        </Button>
      </Box>

      <Paper sx={{ borderRadius: 2 }}>
        {query.isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                {config.hasExtraPrice && <TableCell>Extra Price</TableCell>}
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(query.data ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.name}</TableCell>
                  {config.hasExtraPrice && (
                    <TableCell>{(row as PricedMasterEntity).extra_price?.toFixed(2)}</TableCell>
                  )}
                  <TableCell>
                    <Chip
                      label={row.is_active ? 'Active' : 'Inactive'}
                      color={row.is_active ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={() => {
                        setEditing(row);
                        setDialogOpen(true);
                      }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => setDeleting(row)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {(query.data ?? []).length === 0 && (
                <EmptyState colSpan={config.hasExtraPrice ? 4 : 3} message="No records yet." />
              )}
            </TableBody>
          </Table>
        )}
      </Paper>

      <MasterFormDialog
        open={dialogOpen}
        title={editing ? `Edit ${config.label}` : `Add ${config.label}`}
        hasExtraPrice={config.hasExtraPrice}
        initialValues={editing}
        loading={saveMutation.isPending}
        onSave={(values) => saveMutation.mutate(values)}
        onCancel={() => {
          setDialogOpen(false);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete ${config.label.replace(/s$/, '')}`}
        message={`Are you sure you want to delete "${deleting?.name}"? This cannot be undone.`}
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </Box>
  );
}
