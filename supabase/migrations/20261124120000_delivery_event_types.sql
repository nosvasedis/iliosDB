-- Ψηφιακό Δελτίο Αποστολής: movement events now sent from iliosERP on the myDATA ERP
-- channel (RegisterTransfer, ConfirmDeliveryOutcome FULL/PARTIAL/NONE, ConfirmDeliveryReturn).
alter table public.legal_delivery_events
  drop constraint if exists legal_delivery_events_event_type_check;
alter table public.legal_delivery_events
  add constraint legal_delivery_events_event_type_check check (event_type = any (array[
    'register_transfer', 'confirm_delivery', 'partial_delivery', 'failed_delivery',
    'confirm_return', 'confirm_receipt', 'reject_delivery', 'status_poll'
  ]));
