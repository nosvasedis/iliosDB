-- The public RPC is the only supported order-reservation entry point.
-- Keep the internal core unavailable to direct Data API callers.

REVOKE ALL ON FUNCTION private.save_order_with_inventory_core(jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.save_order_with_inventory_core(jsonb, text)
  TO service_role;
