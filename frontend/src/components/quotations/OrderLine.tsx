import { useEffect, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { Box, IconButton, Paper, Stack, Tooltip, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { productsApi, productCategoriesApi } from '../../api/productsApi';
import type { QuotationCreateInput, QuotationPreviewItem } from '../../types/quotations';
import EntitySelect from '../pickers/EntitySelect';
import BillBookWizard from './BillBookWizard';
import ServiceItemPicker from './ServiceItemPicker';
import QuotationLineItem from './QuotationLineItem';

interface Props {
  index: number;
  /** The service chosen on the Dashboard (the first line); added lines start with the same service and can switch to another. */
  defaultServiceId: number | null;
  onRemove: () => void;
  canRemove: boolean;
  previewItem?: QuotationPreviewItem;
  showErrors?: boolean;
  /** The first line of Start New Order keeps the service chosen on the Dashboard (no switch). */
  serviceFixed?: boolean;
}

/**
 * One item of the order, built exactly like the first one: its service decides the form - the guided Bill Book form (document type,
 * copies, paper, ...), the item picker with sub-categories, or the plain item form with its options, extras and price. An added
 * line starts with the order's service and can be switched to any other service, so one order (one invoice) can carry the
 * different jobs of the same customer and each job still gets its own job card.
 */
export default function OrderLine({ index, defaultServiceId, onRemove, canRemove, previewItem, showErrors, serviceFixed }: Props) {
  const { control, setValue } = useFormContext<QuotationCreateInput>();
  const productId = useWatch({ control, name: `items.${index}.product_id` });
  const categoriesQuery = useQuery({ queryKey: ['product-categories'], queryFn: productCategoriesApi.list });
  const productsQuery = useQuery({ queryKey: ['product-picker', 'list'], queryFn: productsApi.list });
  const product = (productsQuery.data ?? []).find((p) => p.id === productId);

  const [serviceId, setServiceId] = useState<number | null>(product?.category_id ?? defaultServiceId);
  useEffect(() => {
    if (product?.category_id && product.category_id !== serviceId) setServiceId(product.category_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.category_id]);

  const category = (categoriesQuery.data ?? []).find((c) => c.id === serviceId);
  const isBillBook = category?.guided_flow === 'bill_book';
  const itemsOfService = (productsQuery.data ?? []).filter((p) => p.is_active && p.category_id === serviceId);
  // a service with a single item has nothing to choose between
  useEffect(() => {
    if (!isBillBook && itemsOfService.length === 1 && !productId) setValue(`items.${index}.product_id`, itemsOfService[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBillBook, itemsOfService.length, productId]);

  const changeService = (id: number | null) => {
    setServiceId(id);
    setValue(`items.${index}`, { product_id: 0, quantity: 1, selected_options: [], extra_charge_ids: [] }, { shouldDirty: true });
  };

  const showHeader = !serviceFixed;
  return (
    <Box data-testid={`order-line-${index}`} data-service={category?.name ?? ''}>
      {(showHeader || canRemove) && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 1, borderRadius: 2, bgcolor: '#f7f8ff' }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Typography sx={{ fontWeight: 800, color: '#1a237e', whiteSpace: 'nowrap' }}>Item {index + 1}</Typography>
            {showHeader && (
              <Box sx={{ flexGrow: 1, maxWidth: 360 }} data-testid={`line-service-${index}`}>
                <EntitySelect
                  label="Service for this item"
                  mode="list"
                  queryKey={`line-service-${index}`}
                  fetchOptions={async () => (await productCategoriesApi.list()).filter((c) => c.is_active)}
                  getOptionLabel={(c) => c.name}
                  value={serviceId}
                  onChange={changeService}
                />
              </Box>
            )}
            <Box sx={{ flexGrow: 1 }} />
            {canRemove && (
              <Tooltip title="Remove this item">
                <IconButton aria-label="Remove line" data-testid={`line-remove-${index}`} onClick={onRemove}><DeleteIcon /></IconButton>
              </Tooltip>
            )}
          </Stack>
        </Paper>
      )}

      {serviceId == null && (
        <Paper sx={{ p: 2, borderRadius: 2, mb: 2 }}>
          <Typography color="text.secondary">Choose the service for this item.</Typography>
        </Paper>
      )}
      {serviceId != null && category && productsQuery.isSuccess && (
        isBillBook ? (
          <BillBookWizard key={`${index}-${serviceId}`} index={index} categoryId={serviceId} />
        ) : !productId && itemsOfService.length > 1 ? (
          <ServiceItemPicker
            key={`${index}-${serviceId}`}
            serviceName={category.name}
            products={itemsOfService}
            onPick={(id) => setValue(`items.${index}.product_id`, id, { shouldDirty: true })}
          />
        ) : (
          <QuotationLineItem
            key={`${index}-${serviceId}`}
            index={index}
            onRemove={onRemove}
            canRemove={canRemove}
            hideRemove
            previewItem={previewItem}
            lockedServiceId={serviceId}
            showErrors={showErrors}
          />
        )
      )}
    </Box>
  );
}
