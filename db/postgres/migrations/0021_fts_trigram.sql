-- 0021: Trigram indexes for Explore / directory search.
--
-- The handlers filter with `ILIKE '%q%'` (byte-parity with the legacy LIKE).
-- Without an index every Explore keystroke scans. `pg_trgm` is already
-- installed (0001); these GIN indexes make the existing predicates use it.
-- No handler change: same rows, same order, just indexed.
--
-- Safe if the column is missing (legacy drift): each index is created only
-- when its column exists.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='house' AND column_name='name') THEN
    CREATE INDEX IF NOT EXISTS house_name_trgm ON house USING gin (name gin_trgm_ops);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='house' AND column_name='house_desc') THEN
    CREATE INDEX IF NOT EXISTS house_desc_trgm ON house USING gin (house_desc gin_trgm_ops);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='house' AND column_name='kecamatan') THEN
    CREATE INDEX IF NOT EXISTS house_kecamatan_trgm ON house USING gin (kecamatan gin_trgm_ops);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='house' AND column_name='kelurahan') THEN
    CREATE INDEX IF NOT EXISTS house_kelurahan_trgm ON house USING gin (kelurahan gin_trgm_ops);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='house' AND column_name='kab_kota') THEN
    CREATE INDEX IF NOT EXISTS house_kab_kota_trgm ON house USING gin (kab_kota gin_trgm_ops);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='house' AND column_name='street_name') THEN
    CREATE INDEX IF NOT EXISTS house_street_trgm ON house USING gin (street_name gin_trgm_ops);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='materials' AND column_name='name') THEN
    CREATE INDEX IF NOT EXISTS materials_name_trgm ON materials USING gin (name gin_trgm_ops);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='materials' AND column_name='category') THEN
    CREATE INDEX IF NOT EXISTS materials_category_trgm ON materials USING gin (category gin_trgm_ops);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='suppliers' AND column_name='store_name') THEN
    CREATE INDEX IF NOT EXISTS suppliers_store_trgm ON suppliers USING gin (store_name gin_trgm_ops);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='firm_members' AND column_name='name') THEN
    CREATE INDEX IF NOT EXISTS firm_members_name_trgm ON firm_members USING gin (name gin_trgm_ops);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='firm_members' AND column_name='unique_code') THEN
    CREATE INDEX IF NOT EXISTS firm_members_code_trgm ON firm_members USING gin (unique_code gin_trgm_ops);
  END IF;
END $$;
