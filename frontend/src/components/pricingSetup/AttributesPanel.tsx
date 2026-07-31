import { useState, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Button, IconButton, Chip, CircularProgress, Collapse,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { attributesApi } from '../../api/attributesApi';
import type { Attribute, AttributeInput, AttributeOption, AttributeOptionInput } from '../../types/attributes';
import AttributeFormDialog from './AttributeFormDialog';
import AttributeOptionFormDialog from './AttributeOptionFormDialog';
import ConfirmDialog from '../ConfirmDialog';

interface AttributesPanelProps {
  categoryId: number;
}

export default function AttributesPanel({ categoryId }: AttributesPanelProps) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [attrDialogOpen, setAttrDialogOpen] = useState(false);
  const [editingAttr, setEditingAttr] = useState<Attribute | null>(null);
  const [deletingAttr, setDeletingAttr] = useState<Attribute | null>(null);

  const [optionDialogFor, setOptionDialogFor] = useState<Attribute | null>(null);
  const [editingOption, setEditingOption] = useState<AttributeOption | null>(null);
  const [deletingOption, setDeletingOption] = useState<AttributeOption | null>(null);

  const attributesQuery = useQuery({ queryKey: ['attributes', categoryId], queryFn: () => attributesApi.list(categoryId) });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['attributes', categoryId] });

  const saveAttrMutation = useMutation({
    mutationFn: (values: Omit<AttributeInput, 'category_id'>) =>
      editingAttr
        ? attributesApi.update(editingAttr.id, values)
        : attributesApi.create({ ...values, category_id: categoryId }),
    onSuccess: () => {
      invalidate();
      setAttrDialogOpen(false);
      setEditingAttr(null);
    },
  });

  const deleteAttrMutation = useMutation({
    mutationFn: (id: number) => attributesApi.remove(id),
    onSuccess: () => {
      invalidate();
      setDeletingAttr(null);
    },
  });

  const saveOptionMutation = useMutation({
    mutationFn: (values: AttributeOptionInput) =>
      editingOption
        ? attributesApi.updateOption(editingOption.id, values)
        : attributesApi.createOption(optionDialogFor!.id, values),
    onSuccess: () => {
      invalidate();
      setOptionDialogFor(null);
      setEditingOption(null);
    },
  });

  const deleteOptionMutation = useMutation({
    mutationFn: (id: number) => attributesApi.removeOption(id),
    onSuccess: () => {
      invalidate();
      setDeletingOption(null);
    },
  });

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          sx={{ bgcolor: '#1a237e' }}
          onClick={() => {
            setEditingAttr(null);
            setAttrDialogOpen(true);
          }}
        >
          Add Attribute
        </Button>
      </Box>

      <Paper sx={{ borderRadius: 2, overflowX: 'auto' }}>
        {attributesQuery.isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell />
                <TableCell>Name</TableCell>
                <TableCell>Required</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(attributesQuery.data ?? []).map((attr) => (
                <Fragment key={attr.id}>
                  <TableRow>
                    <TableCell>
                      <IconButton size="small" onClick={() => toggleExpand(attr.id)}>
                        {expanded.has(attr.id) ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    </TableCell>
                    <TableCell>{attr.name}</TableCell>
                    <TableCell>{attr.is_required && <Chip label="Required" size="small" color="warning" />}</TableCell>
                    <TableCell>
                      <Chip label={attr.is_active ? 'Active' : 'Inactive'} color={attr.is_active ? 'success' : 'default'} size="small" />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => { setEditingAttr(attr); setAttrDialogOpen(true); }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => setDeletingAttr(attr)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={5} sx={{ py: 0, borderBottom: expanded.has(attr.id) ? undefined : 'none' }}>
                      <Collapse in={expanded.has(attr.id)} timeout="auto" unmountOnExit>
                        <Box sx={{ p: 2, bgcolor: '#fafafa' }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                            <Typography variant="subtitle2">Options</Typography>
                            <Button
                              size="small"
                              startIcon={<AddIcon />}
                              onClick={() => { setOptionDialogFor(attr); setEditingOption(null); }}
                            >
                              Add Option
                            </Button>
                          </Box>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>Value</TableCell>
                                <TableCell>Extra Price</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell align="right">Actions</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {attr.options.map((opt) => (
                                <TableRow key={opt.id}>
                                  <TableCell>{opt.value}</TableCell>
                                  <TableCell>{opt.extra_price ? `+₹${opt.extra_price.toFixed(2)}` : '-'}</TableCell>
                                  <TableCell>
                                    <Chip label={opt.is_active ? 'Active' : 'Inactive'} color={opt.is_active ? 'success' : 'default'} size="small" />
                                  </TableCell>
                                  <TableCell align="right">
                                    <IconButton size="small" onClick={() => { setOptionDialogFor(attr); setEditingOption(opt); }}>
                                      <EditIcon fontSize="small" />
                                    </IconButton>
                                    <IconButton size="small" onClick={() => setDeletingOption(opt)}>
                                      <DeleteIcon fontSize="small" />
                                    </IconButton>
                                  </TableCell>
                                </TableRow>
                              ))}
                              {attr.options.length === 0 && (
                                <TableRow>
                                  <TableCell colSpan={4} align="center" sx={{ color: 'text.secondary' }}>
                                    No options yet.
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </Fragment>
              ))}
              {(attributesQuery.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                    No attributes yet for this category.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Paper>

      <AttributeFormDialog
        open={attrDialogOpen}
        title={editingAttr ? 'Edit Attribute' : 'Add Attribute'}
        initialValues={editingAttr}
        loading={saveAttrMutation.isPending}
        onSave={(values) => saveAttrMutation.mutate(values)}
        onCancel={() => { setAttrDialogOpen(false); setEditingAttr(null); }}
      />
      <ConfirmDialog
        open={Boolean(deletingAttr)}
        title="Delete Attribute"
        message={`Are you sure you want to delete "${deletingAttr?.name}" and all its options?`}
        loading={deleteAttrMutation.isPending}
        onConfirm={() => deletingAttr && deleteAttrMutation.mutate(deletingAttr.id)}
        onCancel={() => setDeletingAttr(null)}
      />

      <AttributeOptionFormDialog
        open={Boolean(optionDialogFor)}
        title={editingOption ? 'Edit Option' : 'Add Option'}
        initialValues={editingOption}
        loading={saveOptionMutation.isPending}
        onSave={(values) => saveOptionMutation.mutate(values)}
        onCancel={() => { setOptionDialogFor(null); setEditingOption(null); }}
      />
      <ConfirmDialog
        open={Boolean(deletingOption)}
        title="Delete Option"
        message={`Are you sure you want to delete "${deletingOption?.value}"?`}
        loading={deleteOptionMutation.isPending}
        onConfirm={() => deletingOption && deleteOptionMutation.mutate(deletingOption.id)}
        onCancel={() => setDeletingOption(null)}
      />
    </Box>
  );
}
