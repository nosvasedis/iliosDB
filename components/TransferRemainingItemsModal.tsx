/**
 * TransferRemainingItemsModal.tsx
 *
 * A 5-step, safety-first wizard for transferring the remaining (unshipped) items
 * of a PartiallyDelivered order (Order A) to another order of the same client (Order B).
 *
 * Steps:
 *   1. Select Target Order — pick Order B from same customer's orders
 *   2. Review Plan — see items, batches, financial impact; blocks if any batch is non-Ready
 *   3. Double Confirmation — type "ΜΕΤΑΦΟΡΑ" to unlock; red irreversible warning
 *   4. Executing — live per-step progress
 *   5. Result — success / partial failure / rollback feedback
 *
 * Zero DB touches until Step 4.  All analysis is pure (buildTransferPlan).
 */

import React, { useState, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  X,
  ArrowRightLeft,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  Package,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { Order, OrderStatus, ProductionStage } from '../types';
import { useOrders, useOrderShipmentsForOrder } from '../hooks/api/useOrders';
import { useProductionBatches } from '../hooks/api/useProductionBatches';
import { useAuth } from './AuthContext';
import { buildTransferPlan, TransferPlan } from '../features/orders/transferHelpers';
import { api } from '../lib/supabase';
import { orderKeys } from '../features/orders/keys';
import { productionKeys } from '../features/production/keys';
import { deliveryKeys } from '../features/deliveries/keys';
import { invalidateOrdersAndBatches } from '../lib/queryInvalidation';
import { formatCurrency } from '../utils/pricingEngine';
import { formatOrderId } from '../utils/orderUtils';
import { getOrderStatusLabel } from '../features/orders/statusPresentation';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  orderA: Order;
  onClose: () => void;
  /** Called with the updated Order B object so the caller can optionally trigger a print. */
  onSuccess: (updatedOrderB: Order) => void;
}

type Step = 'select' | 'review' | 'confirm' | 'executing' | 'result';

interface ExecutionStepState {
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
}

interface TransferResult {
  success: boolean;
  rolledBack: boolean;
  partialFailureStep?: 'close_order_a' | 'cancel_plans';
  error?: string;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function stageLabel(stage: ProductionStage): string {
  return stage;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TransferRemainingItemsModal({ orderA, onClose, onSuccess }: Props) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const userName = profile?.full_name ?? 'Χρήστης';

  // ── Data Hooks ────────────────────────────────────────────────────────────
  // staleTime: 0 ensures we always read fresh data for safety-critical operations.
  const { data: allOrders = [] } = useOrders();
  const { data: batchesData } = useProductionBatches();
  const allBatches = batchesData ?? [];

  const shipmentsQuery = useOrderShipmentsForOrder(orderA.id);
  const snapshotA = shipmentsQuery.data ?? { shipments: [], items: [] };

  // ── Local State ───────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('select');
  const [selectedOrderB, setSelectedOrderB] = useState<Order | null>(null);
  const [plan, setPlan] = useState<TransferPlan | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [executionSteps, setExecutionSteps] = useState<ExecutionStepState[]>([]);
  const [result, setResult] = useState<TransferResult | null>(null);
  const [updatedOrderB, setUpdatedOrderB] = useState<Order | null>(null);
  const confirmInputRef = useRef<HTMLInputElement>(null);

  // ── Candidate orders ──────────────────────────────────────────────────────
  // Show orders for the same customer, excluding Order A itself and orders already fully closed.
  const candidateOrders = useMemo(() => {
    const customerId = orderA.customer_id;
    const customerName = orderA.customer_name;
    return allOrders.filter((o) => {
      if (o.id === orderA.id) return false;
      if (o.status === OrderStatus.Delivered || o.status === OrderStatus.Cancelled) return false;
      if (customerId) return o.customer_id === customerId;
      return o.customer_name === customerName;
    });
  }, [allOrders, orderA]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSelectOrder(orderB: Order) {
    setSelectedOrderB(orderB);
    const computed = buildTransferPlan(orderA, orderB, snapshotA, allBatches);
    setPlan(computed);
    setStep('review');
  }

  function handleBackToSelect() {
    setSelectedOrderB(null);
    setPlan(null);
    setStep('select');
  }

  function handleProceedToConfirm() {
    setConfirmText('');
    setStep('confirm');
    // Focus input after render
    setTimeout(() => confirmInputRef.current?.focus(), 50);
  }

  async function handleExecute() {
    if (!selectedOrderB || !plan) return;

    // Build execution steps display.
    const steps: ExecutionStepState[] = [
      { label: `Επανεκχώρηση ${plan.batchesToRepoint.length} παρτίδων → Παρ. B`, status: 'pending' },
      { label: 'Ενημέρωση Παρ. B (προσθήκη τεμαχίων + σύνολο)', status: 'pending' },
      { label: 'Κλείσιμο Παρ. A (κατάσταση → Παραδόθηκε)', status: 'pending' },
      { label: 'Ακύρωση ενεργών πλάνων παράδοσης Παρ. A', status: 'pending' },
    ];
    setExecutionSteps(steps);
    setStep('executing');

    const updateStep = (index: number, status: ExecutionStepState['status']) => {
      setExecutionSteps((prev) =>
        prev.map((s, i) => (i === index ? { ...s, status } : s)),
      );
    };

    // Fetch active delivery plan IDs for Order A fresh, right before execution.
    let activeDeliveryPlanIds: string[] = [];
    try {
      const allPlans = await api.getOrderDeliveryPlans();
      activeDeliveryPlanIds = allPlans
        .filter((p) => p.order_id === orderA.id && p.plan_status === 'active')
        .map((p) => p.id);
    } catch {
      // Non-critical — worst case we just won't cancel plans, handled by partialFailureStep.
    }

    // Mark step 1 running (batch re-point happens inside the API call first).
    updateStep(0, 'running');

    const transferResult = await api.transferRemainingItemsToOrder({
      orderA,
      orderB: selectedOrderB,
      batchesToRepoint: plan.batchesToRepoint,
      newOrderBItems: plan.newOrderBItems,
      newOrderBTotal: plan.newOrderBTotal,
      recalculatedOrderATotal: plan.recalculatedOrderATotal,
      shippedOnlyOrderAItems: plan.shippedOnlyOrderAItems,
      activeDeliveryPlanIdsA: activeDeliveryPlanIds,
      userName,
    });

    // Update step indicators based on result.
    if (!transferResult.success) {
      // Full rollback — steps 1 and 2 failed.
      updateStep(0, 'error');
      updateStep(1, 'error');
    } else {
      updateStep(0, 'done');
      updateStep(1, 'done');

      if (transferResult.partialFailureStep === 'close_order_a') {
        updateStep(2, 'error');
        updateStep(3, 'error');
      } else {
        updateStep(2, 'done');
        if (transferResult.partialFailureStep === 'cancel_plans') {
          updateStep(3, 'error');
        } else {
          updateStep(3, 'done');
        }
      }

      // Invalidate React Query caches so all views refresh.
      await invalidateOrdersAndBatches(queryClient);
      queryClient.invalidateQueries({ queryKey: deliveryKeys.plans() });

      // Build updated Order B for the print callback.
      const freshOrders: Order[] = queryClient.getQueryData<Order[]>(orderKeys.all) ?? [];
      const freshOrderB = freshOrders.find((o) => o.id === selectedOrderB.id);
      setUpdatedOrderB(
        freshOrderB ?? { ...selectedOrderB, items: plan.newOrderBItems, total_price: plan.newOrderBTotal },
      );
    }

    setResult(transferResult);
    setStep('result');
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isLoading = !shipmentsQuery.data;
  const isConfirmValid = confirmText.trim() === 'ΜΕΤΑΦΟΡΑ';

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="p-5 border-b border-violet-100 bg-violet-50/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <ArrowRightLeft size={20} className="text-violet-600" />
            <div>
              <h2 className="text-lg font-bold text-slate-800">Μεταφορά Υπολοίπου σε Άλλη Παραγγελία</h2>
              <p className="text-xs text-slate-500 font-mono mt-0.5">Παρ. A: #{formatOrderId(orderA.id)} · {orderA.customer_name}</p>
            </div>
          </div>
          {step !== 'executing' && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-violet-100 rounded-full text-slate-400 transition-colors"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* ── Step Breadcrumb ─────────────────────────────────────────────── */}
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 flex gap-1 items-center text-xs font-medium shrink-0">
          {(['select', 'review', 'confirm', 'executing', 'result'] as Step[]).map((s, i) => {
            const labels: Record<Step, string> = {
              select: '1. Επιλογή',
              review: '2. Ανασκόπηση',
              confirm: '3. Επιβεβαίωση',
              executing: '4. Εκτέλεση',
              result: '5. Αποτέλεσμα',
            };
            const isActive = step === s;
            const isDone =
              ['select', 'review', 'confirm', 'executing', 'result'].indexOf(step) >
              ['select', 'review', 'confirm', 'executing', 'result'].indexOf(s);
            return (
              <React.Fragment key={s}>
                <span
                  className={
                    isActive
                      ? 'text-violet-700 font-bold'
                      : isDone
                      ? 'text-emerald-600'
                      : 'text-slate-400'
                  }
                >
                  {labels[s]}
                </span>
                {i < 4 && <ChevronRight size={12} className="text-slate-300" />}
              </React.Fragment>
            );
          })}
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="overflow-y-auto flex-1 p-5">

          {/* STEP 1: SELECT TARGET ORDER */}
          {step === 'select' && (
            <div className="space-y-4">
              {isLoading && (
                <div className="flex items-center gap-2 text-slate-500 text-sm">
                  <Loader2 size={16} className="animate-spin" /> Φόρτωση δεδομένων αποστολής…
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm text-blue-800 flex gap-2">
                <Info size={16} className="shrink-0 mt-0.5" />
                <p>
                  Επιλέξτε την παραγγελία στην οποία θα μεταφερθούν τα υπόλοιπα τεμάχια της Παρ. A.
                  Η Παρ. A θα κλείσει αυτόματα ως <strong>Παραδόθηκε</strong>.
                </p>
              </div>

              {candidateOrders.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800 flex gap-2">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <p>
                    Δεν βρέθηκαν άλλες ενεργές παραγγελίες για τον πελάτη{' '}
                    <strong>{orderA.customer_name}</strong>.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Διαθέσιμες παραγγελίες ίδιου πελάτη
                  </p>
                  {candidateOrders.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => handleSelectOrder(o)}
                      disabled={isLoading}
                      className="w-full text-left p-4 rounded-2xl border border-slate-200 hover:border-violet-300 hover:bg-violet-50 transition-colors flex items-center justify-between gap-3 disabled:opacity-50"
                    >
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-slate-500">#{formatOrderId(o.id)}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {getOrderStatusLabel(o.status)}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-slate-800 mt-1">
                          {o.items.length} είδη · {formatCurrency(o.total_price)}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {new Date(o.created_at).toLocaleDateString('el-GR')}
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-slate-400 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: REVIEW PLAN */}
          {step === 'review' && plan && selectedOrderB && (
            <div className="space-y-4">

              {/* BLOCK: non-Ready batches */}
              {!plan.isValid && (
                <div className="bg-red-50 border border-red-300 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-red-700 font-bold text-sm">
                    <XCircle size={16} />
                    Η μεταφορά δεν μπορεί να εκτελεστεί
                  </div>
                  <p className="text-xs text-red-600">
                    Οι παρακάτω παρτίδες ΔΕΝ είναι ακόμα σε στάδιο <strong>Έτοιμα</strong> (Ready).
                    Ολοκληρώστε την παραγωγή τους πρώτα.
                  </p>
                  <div className="space-y-1 mt-2">
                    {plan.blockedBatches.map((b) => (
                      <div
                        key={b.batchId}
                        className="flex items-center gap-3 text-xs bg-red-100 rounded-xl px-3 py-2 font-mono"
                      >
                        <span className="font-bold text-red-700">{b.sku}</span>
                        {b.variant_suffix && <span className="text-red-600">{b.variant_suffix}</span>}
                        {b.size_info && <span className="text-red-500">{b.size_info}</span>}
                        <span className="ml-auto text-red-600">{b.quantity} τεμ. · {stageLabel(b.current_stage)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {plan.isValid && plan.transferItems.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
                  Δεν βρέθηκαν υπόλοιπα τεμάχια για μεταφορά στην Παρ. A.
                </div>
              )}

              {/* VAT / discount mismatch warnings */}
              {plan.vatMismatch && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex gap-2 text-xs text-amber-800">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                  <span>
                    <strong>Διαφορετικός ΦΠΑ:</strong> Παρ. A {((orderA.vat_rate ?? 0.24) * 100).toFixed(0)}% ·
                    Παρ. B {((selectedOrderB.vat_rate ?? 0.24) * 100).toFixed(0)}%.
                    Τα μεταφερόμενα τεμάχια θα υπολογιστούν με τον ΦΠΑ της <strong>Παρ. B</strong>.
                  </span>
                </div>
              )}
              {plan.discountMismatch && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex gap-2 text-xs text-amber-800">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                  <span>
                    <strong>Διαφορετική έκπτωση:</strong> Παρ. A {(orderA.discount_percent ?? 0)}% ·
                    Παρ. B {(selectedOrderB.discount_percent ?? 0)}%.
                    Τα μεταφερόμενα τεμάχια θα υπολογιστούν με την έκπτωση της <strong>Παρ. B</strong>.
                  </span>
                </div>
              )}

              {/* Items being transferred */}
              {plan.transferItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Τεμάχια που μεταφέρονται ({plan.transferItems.reduce((s, i) => s + i.quantity, 0)} τεμ.)
                  </p>
                  <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
                    {plan.transferItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                        <Package size={14} className="text-slate-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="font-mono font-bold text-slate-800">{item.sku}</span>
                          {item.variant_suffix && (
                            <span className="ml-1 text-slate-500">{item.variant_suffix}</span>
                          )}
                          {item.size_info && (
                            <span className="ml-2 text-xs bg-slate-100 rounded px-1 text-slate-600">
                              {item.size_info}
                            </span>
                          )}
                          {item.cord_color && (
                            <span className="ml-1 text-xs text-slate-400">κορδ.: {item.cord_color}</span>
                          )}
                          {item.enamel_color && (
                            <span className="ml-1 text-xs text-slate-400">σμάλτ.: {item.enamel_color}</span>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-semibold text-slate-800">{item.quantity} τεμ.</span>
                          <span className="text-xs text-slate-400 ml-2">
                            {formatCurrency(item.price_at_order)} / τεμ.
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5">
                    {plan.batchesToRepoint.length} παρτίδες παραγωγής θα επανεκχωρηθούν στην Παρ. B.
                  </p>
                </div>
              )}

              {/* Financial impact */}
              {plan.transferItems.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm">
                    <div className="font-bold text-red-700 mb-2">Παρ. A (κλείνει)</div>
                    <div className="text-xs text-slate-500">Παλιό σύνολο</div>
                    <div className="font-mono text-slate-600 line-through">{formatCurrency(orderA.total_price)}</div>
                    <div className="text-xs text-slate-500 mt-1">Νέο σύνολο (μόνο αποστολές)</div>
                    <div className="font-mono font-bold text-red-700">{formatCurrency(plan.recalculatedOrderATotal)}</div>
                    <div className="text-xs text-emerald-600 mt-1.5 font-medium">→ Κατάσταση: Παραδόθηκε</div>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-sm">
                    <div className="font-bold text-emerald-700 mb-2">Παρ. B (λαμβάνει)</div>
                    <div className="text-xs text-slate-500">Παλιό σύνολο</div>
                    <div className="font-mono text-slate-600 line-through">{formatCurrency(selectedOrderB.total_price)}</div>
                    <div className="text-xs text-slate-500 mt-1">Νέο σύνολο (μετά μεταφοράς)</div>
                    <div className="font-mono font-bold text-emerald-700">{formatCurrency(plan.newOrderBTotal)}</div>
                    <div className="text-xs text-slate-500 mt-1.5">
                      +{plan.transferItems.length} είδη · #{formatOrderId(selectedOrderB.id)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: DOUBLE CONFIRMATION */}
          {step === 'confirm' && plan && selectedOrderB && (
            <div className="space-y-5">
              <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-red-700 font-bold text-base">
                  <ShieldAlert size={20} />
                  ΑΜΕΤΑΚΛΗΤΗ ΕΝΕΡΓΕΙΑ
                </div>
                <ul className="text-sm text-red-700 space-y-1.5 list-disc list-inside">
                  <li>
                    <strong>{plan.batchesToRepoint.length} παρτίδες παραγωγής</strong> θα επανεκχωρηθούν
                    από Παρ. A στην Παρ. B.
                  </li>
                  <li>
                    <strong>{plan.transferItems.reduce((s, i) => s + i.quantity, 0)} τεμάχια</strong> θα
                    προστεθούν στην Παρ. B ({formatOrderId(selectedOrderB.id)}).
                  </li>
                  <li>
                    Η Παρ. A ({formatOrderId(orderA.id)}) θα κλείσει ως{' '}
                    <strong>Παραδόθηκε</strong> με αναπροσαρμοσμένο σύνολο{' '}
                    <strong>{formatCurrency(plan.recalculatedOrderATotal)}</strong>.
                  </li>
                  <li>
                    Τα ενεργά πλάνα παράδοσης της Παρ. A θα ακυρωθούν.
                  </li>
                  <li className="font-bold">Η ενέργεια αυτή δεν αναιρείται αυτόματα.</li>
                </ul>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Για επιβεβαίωση, πληκτρολογήστε{' '}
                  <code className="bg-slate-100 px-2 py-0.5 rounded font-mono text-red-700">ΜΕΤΑΦΟΡΑ</code>
                  :
                </label>
                <input
                  ref={confirmInputRef}
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="ΜΕΤΑΦΟΡΑ"
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-lg font-mono focus:outline-none focus:border-red-400 transition-colors"
                />
                {confirmText.length > 0 && !isConfirmValid && (
                  <p className="text-xs text-red-500 mt-1">
                    Πληκτρολογήστε ακριβώς: ΜΕΤΑΦΟΡΑ (με ελληνικά κεφαλαία)
                  </p>
                )}
              </div>
            </div>
          )}

          {/* STEP 4: EXECUTING */}
          {step === 'executing' && (
            <div className="space-y-3 py-2">
              <p className="text-sm text-slate-600 font-medium mb-4">Η μεταφορά εκτελείται…</p>
              {executionSteps.map((s, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                  {s.status === 'pending' && <div className="w-5 h-5 rounded-full border-2 border-slate-200 shrink-0" />}
                  {s.status === 'running' && <Loader2 size={20} className="animate-spin text-violet-600 shrink-0" />}
                  {s.status === 'done' && <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />}
                  {s.status === 'error' && <XCircle size={20} className="text-red-500 shrink-0" />}
                  <span
                    className={`text-sm ${
                      s.status === 'done'
                        ? 'text-emerald-700 font-medium'
                        : s.status === 'error'
                        ? 'text-red-600'
                        : s.status === 'running'
                        ? 'text-violet-700 font-medium'
                        : 'text-slate-400'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* STEP 5: RESULT */}
          {step === 'result' && result && (
            <div className="space-y-4">
              {result.success && !result.partialFailureStep && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-700 font-bold text-base">
                    <CheckCircle2 size={20} />
                    Η μεταφορά ολοκληρώθηκε επιτυχώς
                  </div>
                  <ul className="text-sm text-emerald-700 space-y-1 list-disc list-inside">
                    <li>
                      {plan!.batchesToRepoint.length} παρτίδες επανεκχωρήθηκαν στην Παρ. B.
                    </li>
                    <li>
                      {plan!.transferItems.reduce((s, i) => s + i.quantity, 0)} τεμάχια προστέθηκαν
                      στην Παρ. B ({formatOrderId(selectedOrderB!.id)}).
                    </li>
                    <li>Παρ. A κλείστηκε ως Παραδόθηκε.</li>
                    <li>Τα ενεργά πλάνα παράδοσης της Παρ. A ακυρώθηκαν.</li>
                  </ul>
                </div>
              )}

              {result.success && result.partialFailureStep === 'close_order_a' && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-2">
                  <div className="flex items-center gap-2 text-amber-700 font-bold text-base">
                    <AlertTriangle size={20} />
                    Μεταφορά επιτυχής — Απαιτείται χειροκίνητη ενέργεια
                  </div>
                  <p className="text-sm text-amber-700">
                    Τα τεμάχια και οι παρτίδες μεταφέρθηκαν στην Παρ. B, αλλά{' '}
                    <strong>η Παρ. A δεν κλείστηκε αυτόματα</strong> λόγω σφάλματος.
                    Ενημερώστε χειροκίνητα την κατάσταση της Παρ. A σε "Παραδόθηκε".
                  </p>
                </div>
              )}

              {result.success && result.partialFailureStep === 'cancel_plans' && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-2">
                  <div className="flex items-center gap-2 text-amber-700 font-bold text-base">
                    <AlertTriangle size={20} />
                    Μεταφορά επιτυχής — Πλάνα δεν ακυρώθηκαν
                  </div>
                  <p className="text-sm text-amber-700">
                    Η μεταφορά ολοκληρώθηκε, αλλά ορισμένα πλάνα παράδοσης της Παρ. A δεν
                    ακυρώθηκαν αυτόματα. Ακυρώστε τα χειροκίνητα από το tab Παραδόσεις.
                  </p>
                </div>
              )}

              {!result.success && result.rolledBack && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-5 space-y-2">
                  <div className="flex items-center gap-2 text-red-700 font-bold text-base">
                    <XCircle size={20} />
                    Η μεταφορά απέτυχε — Δεν έγιναν αλλαγές
                  </div>
                  <p className="text-sm text-red-600">
                    Οι αλλαγές αναιρέθηκαν πλήρως. Δεδομένα αμετάβλητα.
                  </p>
                  {result.error && (
                    <p className="text-xs font-mono text-red-400 bg-red-100 rounded-lg p-2 mt-2">
                      {result.error}
                    </p>
                  )}
                </div>
              )}

              {/* Execution step summary */}
              {executionSteps.length > 0 && (
                <div className="space-y-1.5">
                  {executionSteps.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {s.status === 'done' && <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />}
                      {s.status === 'error' && <XCircle size={13} className="text-red-400 shrink-0" />}
                      {s.status === 'pending' && <div className="w-3 h-3 rounded-full border border-slate-300 shrink-0" />}
                      <span className={s.status === 'done' ? 'text-slate-600' : s.status === 'error' ? 'text-red-500' : 'text-slate-400'}>
                        {s.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* ── Footer Actions ──────────────────────────────────────────────── */}
        <div className="p-5 border-t border-slate-100 shrink-0 flex gap-3 justify-end">
          {step === 'select' && (
            <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium text-sm transition-colors">
              Ακύρωση
            </button>
          )}

          {step === 'review' && (
            <>
              <button onClick={handleBackToSelect} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium text-sm transition-colors">
                ← Πίσω
              </button>
              <button
                onClick={handleProceedToConfirm}
                disabled={!plan?.isValid || plan?.transferItems.length === 0}
                className="px-5 py-2.5 rounded-xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Συνέχεια →
              </button>
            </>
          )}

          {step === 'confirm' && (
            <>
              <button onClick={() => setStep('review')} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium text-sm transition-colors">
                ← Πίσω
              </button>
              <button
                onClick={handleExecute}
                disabled={!isConfirmValid}
                className="px-5 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Εκτέλεση Μεταφοράς
              </button>
            </>
          )}

          {step === 'executing' && (
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <Loader2 size={16} className="animate-spin" />
              Εκτέλεση…
            </div>
          )}

          {step === 'result' && (
            <>
              {result?.success && updatedOrderB && (
                <button
                  onClick={() => onSuccess(updatedOrderB)}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition-colors"
                >
                  Εκτύπωση Παρ. B →
                </button>
              )}
              <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium text-sm transition-colors">
                Κλείσιμο
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
