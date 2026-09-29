import { useCallback, useMemo, useState } from 'react';
import * as ReactQuery from '@tanstack/react-query';
import { Order, OrderStatus } from '../types';
import { canBulkCancel, mergeOrderTags } from '../features/orders/bulkSelection';
import { ordersRepository } from '../features/orders';
import { auditRepository } from '../features/audit';
import { invalidateAndRefetchAfterOrderMutation } from '../lib/queryInvalidation';
import { useAuth } from '../components/AuthContext';
import { useUI } from '../components/UIProvider';
import { useSellers } from './api/useSellers';
import { withResolvedOrderSeller } from '../utils/orderSeller';

export function useOrderBulkActions({
    selectedIds,
    setSelectedIds,
    selectedOrders,
    archive,
    onPrintOrders,
}: {
    selectedIds: Set<string>;
    setSelectedIds: (next: Set<string>) => void;
    selectedOrders: Order[];
    archive: boolean;
    onPrintOrders?: (orders: Order[]) => void;
}) {
    const queryClient = ReactQuery.useQueryClient();
    const { showToast, confirm } = useUI();
    const { profile } = useAuth();
    const { data: sellers } = useSellers();
    const [isProcessing, setIsProcessing] = useState(false);
    const [completedCount, setCompletedCount] = useState(0);
    const [tagModalOpen, setTagModalOpen] = useState(false);
    const [sellerModalOpen, setSellerModalOpen] = useState(false);

    const canCancel = useMemo(() => canBulkCancel(selectedOrders), [selectedOrders]);
    const progressPercent = selectedOrders.length === 0
        ? 0
        : Math.round((completedCount / selectedOrders.length) * 100);

    const actor = profile?.full_name || 'Σύστημα';

    const finishSettled = useCallback((
        orders: Order[],
        results: PromiseSettledResult<unknown>[],
        successMessage: string,
        clearOnFullSuccess: boolean,
    ) => {
        const failed = orders.filter((_, index) => results[index]?.status === 'rejected');
        if (failed.length === 0) {
            showToast(successMessage, 'success');
            if (clearOnFullSuccess) setSelectedIds(new Set());
            return;
        }
        setSelectedIds(new Set(failed.map((order) => order.id)));
        showToast(`Ολοκληρώθηκαν ${orders.length - failed.length} από ${orders.length}. Οι αποτυχημένες έμειναν επιλεγμένες.`, 'error');
    }, [setSelectedIds, showToast]);

    const handleArchive = useCallback(async () => {
        if (selectedOrders.length === 0 || isProcessing) return;
        setIsProcessing(true);
        setCompletedCount(0);
        try {
            const results = await Promise.allSettled(selectedOrders.map(async (order, index) => {
                await ordersRepository.archiveOrder(order.id, archive);
                setCompletedCount(index + 1);
            }));
            await auditRepository.logAction(
                actor,
                archive ? 'Μαζική Αρχειοθέτηση Παραγγελιών' : 'Μαζική Ανάκτηση Παραγγελιών',
                { order_ids: selectedOrders.map((order) => order.id), count: selectedOrders.length },
            );
            await invalidateAndRefetchAfterOrderMutation(queryClient);
            finishSettled(
                selectedOrders,
                results,
                archive
                    ? `Αρχειοθετήθηκαν ${selectedOrders.length} παραγγελίες.`
                    : `Ανακτήθηκαν ${selectedOrders.length} παραγγελίες.`,
                true,
            );
        } catch {
            showToast('Σφάλμα αρχειοθέτησης.', 'error');
        } finally {
            setIsProcessing(false);
            setCompletedCount(0);
        }
    }, [actor, archive, finishSettled, isProcessing, queryClient, selectedOrders, showToast]);

    const handlePrint = useCallback(() => {
        if (selectedOrders.length === 0) return;
        onPrintOrders?.(selectedOrders);
    }, [onPrintOrders, selectedOrders]);

    const handleAddTag = useCallback(async (rawTag: string) => {
        const tag = rawTag.trim();
        if (!tag || selectedOrders.length === 0 || isProcessing) return;
        setIsProcessing(true);
        setCompletedCount(0);
        try {
            const results = await Promise.allSettled(selectedOrders.map(async (order, index) => {
                if (order.tags?.includes(tag)) {
                    setCompletedCount(index + 1);
                    return;
                }
                await ordersRepository.updateOrder({ ...order, tags: mergeOrderTags(order.tags, tag) });
                setCompletedCount(index + 1);
            }));
            await invalidateAndRefetchAfterOrderMutation(queryClient);
            finishSettled(selectedOrders, results, `Η ετικέτα προστέθηκε σε ${selectedOrders.length} παραγγελίες.`, false);
            setTagModalOpen(false);
        } catch {
            showToast('Σφάλμα ετικέτας.', 'error');
        } finally {
            setIsProcessing(false);
            setCompletedCount(0);
        }
    }, [finishSettled, isProcessing, queryClient, selectedOrders, showToast]);

    const handleAssignSeller = useCallback(async (seller: {
        sellerId: string | undefined;
        sellerName: string | undefined;
        commission: number | undefined;
    }) => {
        if (selectedOrders.length === 0 || isProcessing) return;
        setIsProcessing(true);
        setCompletedCount(0);
        try {
            const results = await Promise.allSettled(selectedOrders.map(async (order, index) => {
                const updated = withResolvedOrderSeller({
                    ...order,
                    seller_id: seller.sellerId,
                    seller_name: seller.sellerName,
                    seller_commission_percent: seller.sellerId ? seller.commission : undefined,
                }, sellers);
                await ordersRepository.updateOrder(updated);
                setCompletedCount(index + 1);
            }));
            await invalidateAndRefetchAfterOrderMutation(queryClient);
            finishSettled(selectedOrders, results, `Ο πλασιέ ενημερώθηκε σε ${selectedOrders.length} παραγγελίες.`, false);
            setSellerModalOpen(false);
        } catch {
            showToast('Σφάλμα ανάθεσης πλασιέ.', 'error');
        } finally {
            setIsProcessing(false);
            setCompletedCount(0);
        }
    }, [finishSettled, isProcessing, queryClient, selectedOrders, sellers, showToast]);

    const handleCancel = useCallback(async () => {
        if (!canCancel || selectedOrders.length === 0 || isProcessing) return;
        const yes = await confirm({
            title: 'Μαζική Ακύρωση Παραγγελιών',
            message: `Είστε σίγουροι ότι θέλετε να ακυρώσετε ${selectedOrders.length} παραγγελίες; Η ενέργεια θα αφαιρέσει τυχόν παρτίδες παραγωγής, αλλά θα διατηρήσει το ιστορικό.`,
            isDestructive: true,
            confirmText: 'Ακύρωση',
        });
        if (!yes) return;

        setIsProcessing(true);
        setCompletedCount(0);
        const failed: Order[] = [];
        try {
            for (let index = 0; index < selectedOrders.length; index += 1) {
                const order = selectedOrders[index];
                try {
                    await ordersRepository.updateOrderStatus(order.id, OrderStatus.Cancelled);
                    setCompletedCount(index + 1);
                } catch {
                    failed.push(order);
                    setCompletedCount(index + 1);
                }
            }
            await auditRepository.logAction(actor, 'Μαζική Ακύρωση Παραγγελιών', {
                order_ids: selectedOrders.map((order) => order.id),
                count: selectedOrders.length,
            });
            await invalidateAndRefetchAfterOrderMutation(queryClient);
            if (failed.length === 0) {
                showToast(`Ακυρώθηκαν ${selectedOrders.length} παραγγελίες.`, 'info');
                setSelectedIds(new Set());
            } else {
                setSelectedIds(new Set(failed.map((order) => order.id)));
                showToast(`Ολοκληρώθηκαν ${selectedOrders.length - failed.length} από ${selectedOrders.length}. Οι αποτυχημένες έμειναν επιλεγμένες.`, 'error');
            }
        } finally {
            setIsProcessing(false);
            setCompletedCount(0);
        }
    }, [actor, canCancel, confirm, isProcessing, queryClient, selectedOrders, setSelectedIds, showToast]);

    const handleClear = useCallback(() => {
        if (isProcessing) return;
        setSelectedIds(new Set());
    }, [isProcessing, setSelectedIds]);

    return {
        isProcessing,
        progressPercent,
        canCancel,
        tagModalOpen,
        setTagModalOpen,
        sellerModalOpen,
        setSellerModalOpen,
        handleArchive,
        handlePrint,
        handleAddTag,
        handleAssignSeller,
        handleCancel,
        handleClear,
        selectedCount: selectedIds.size,
    };
}
