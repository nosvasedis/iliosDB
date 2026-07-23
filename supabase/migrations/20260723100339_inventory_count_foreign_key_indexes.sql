-- Cover the composite and warehouse foreign keys used by inventory-count
-- session cleanup, validation and audit queries. These tables are empty at
-- rollout, so regular transactional index creation is intentional.

create index if not exists inventory_count_targets_batch_session_idx
  on public.inventory_count_targets (batch_id, session_id);

create index if not exists inventory_count_entries_batch_session_idx
  on public.inventory_count_entries (batch_id, session_id);

create index if not exists inventory_count_entries_target_session_idx
  on public.inventory_count_entries (target_id, session_id);

create index if not exists inventory_count_entries_warehouse_idx
  on public.inventory_count_entries (warehouse_id);
