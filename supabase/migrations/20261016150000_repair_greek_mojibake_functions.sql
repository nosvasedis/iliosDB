-- Repairs server functions whose Greek literals were stored as mojibake
-- (UTF-8 bytes decoded as Windows-1253 and re-encoded as UTF-8). The logic of
-- every function is untouched: each definition is decoded back to the
-- original UTF-8 text and recreated in place, preserving owner and grants.
--
-- Affected user-visible effects before this repair:
--   * reverse_inventory_event_v1 raised unreadable errors and stored an
--     unreadable «Ακύρωση κίνησης:» prefix in the immutable movement history.
--   * save_order_with_inventory_core stored unreadable reservation reasons.
--   * Legal-document numbering and submission errors were unreadable.
--
-- Already-written immutable inventory_events rows are not modified; the client
-- repairs their display.

CREATE OR REPLACE FUNCTION private.tmp_repair_win1253_mojibake(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_bytes bytea := ''::bytea;
  v_char text;
  v_code integer;
BEGIN
  FOREACH v_char IN ARRAY regexp_split_to_array(p_value, '') LOOP
    v_code := ascii(v_char);
    IF v_code < 128 THEN
      v_bytes := v_bytes || convert_to(v_char, 'UTF8');
    ELSE
      BEGIN
        v_bytes := v_bytes || convert_to(v_char, 'WIN1253');
      EXCEPTION WHEN untranslatable_character THEN
        -- Bytes undefined in Windows-1253 were carried through as the C1/Latin-1
        -- code point with the same value.
        IF v_code <= 255 THEN
          v_bytes := v_bytes || decode(lpad(to_hex(v_code), 2, '0'), 'hex');
        ELSE
          RAISE;
        END IF;
      END;
    END IF;
  END LOOP;
  -- Fails loudly if the input was not mojibake, so correct text is never altered.
  RETURN convert_from(v_bytes, 'UTF8');
END;
$$;

DO $$
DECLARE
  v_function record;
  v_definition text;
BEGIN
  FOR v_function IN
    SELECT p.oid, n.nspname, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
      AND p.proname <> 'tmp_repair_win1253_mojibake'
      AND (p.prosrc LIKE '%Ξ±%' OR p.prosrc LIKE '%Ξµ%' OR p.prosrc LIKE '%ΞΏ%' OR p.prosrc LIKE '%Ο„%')
  LOOP
    v_definition := private.tmp_repair_win1253_mojibake(pg_get_functiondef(v_function.oid));
    EXECUTE v_definition;
    RAISE NOTICE 'Repaired Greek literals in %.%', v_function.nspname, v_function.proname;
  END LOOP;
END;
$$;

DROP FUNCTION private.tmp_repair_win1253_mojibake(text);
