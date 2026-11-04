-- Security definer functions must not be reachable by anonymous REST callers.
-- sync_order_batches has no permission check and the app never calls it directly.
revoke all on function public.sync_order_batches(text) from public, anon, authenticated;
grant execute on function public.sync_order_batches(text) to service_role;

-- Trigger functions: PostgreSQL checks EXECUTE when a trigger is created, not when it fires.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.sync_delivery_state_from_order() from public, anon, authenticated;

-- Inspection PIN calls are for signed-in users only; the admin checks inside them stay.
revoke all on function public.has_inspection_exit_pin() from public, anon;
revoke all on function public.set_inspection_exit_pin(text) from public, anon;
revoke all on function public.verify_inspection_exit_pin(text) from public, anon;
grant execute on function public.has_inspection_exit_pin() to authenticated, service_role;
grant execute on function public.set_inspection_exit_pin(text) to authenticated, service_role;
grant execute on function public.verify_inspection_exit_pin(text) to authenticated, service_role;
