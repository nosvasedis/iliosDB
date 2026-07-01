DO $$
DECLARE
  realtime_publication_oid oid;
  realtime_publication_all_tables boolean;
  realtime_table_name text;
  realtime_table_oid oid;
  realtime_table_names text[] := ARRAY[
    'products',
    'product_variants',
    'product_stock',
    'recipes',
    'product_molds',
    'product_collections',
    'collections',
    'materials',
    'molds',
    'warehouses',
    'global_settings',
    'orders',
    'order_shipments',
    'order_shipment_items',
    'order_delivery_plans',
    'order_delivery_reminders',
    'production_batches',
    'batch_stage_history',
    'tag_color_overrides',
    'customers',
    'suppliers',
    'profiles',
    'supplier_orders',
    'offers',
    'legal_settings',
    'legal_numbering_sequences',
    'legal_carriers',
    'legal_documents',
    'legal_document_lines',
    'legal_transmissions',
    'legal_delivery_events',
    'legal_sync_runs',
    'proforma_documents',
    'proforma_document_lines',
    'price_snapshots',
    'price_snapshot_items',
    'stock_movements'
  ];
BEGIN
  SELECT oid, puballtables
    INTO realtime_publication_oid, realtime_publication_all_tables
    FROM pg_publication
   WHERE pubname = 'supabase_realtime';

  IF realtime_publication_oid IS NULL THEN
    EXECUTE 'CREATE PUBLICATION supabase_realtime';

    SELECT oid, puballtables
      INTO realtime_publication_oid, realtime_publication_all_tables
      FROM pg_publication
     WHERE pubname = 'supabase_realtime';
  END IF;

  IF realtime_publication_all_tables THEN
    RETURN;
  END IF;

  FOREACH realtime_table_name IN ARRAY realtime_table_names LOOP
    realtime_table_oid := to_regclass(format('public.%I', realtime_table_name));

    IF realtime_table_oid IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM pg_publication_rel
          WHERE prpubid = realtime_publication_oid
            AND prrelid = realtime_table_oid
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', realtime_table_name);
    END IF;
  END LOOP;
END $$;
