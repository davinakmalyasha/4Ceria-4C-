-- 0023: RLS beyond projects (bids, termins, ledger, addendums, orders).
--
-- Same pattern as 0022: handler SQL stays primary; RLS re-checks when
-- `app.user_id` is set, allows when unset (legacy path). Tables are small
-- and policies are permissive-when-unset so no existing query breaks.
-- The gateway still connects as the table owner (bypasses RLS); the policies
-- bind the moment traffic moves to `app_rw` + `setAppUser()`.

DO $$
BEGIN
  -- bids: bidder owns their rows; project owner sees all via unset fallback
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='bids') THEN
    ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS bids_owner_or_unset ON bids;
    CREATE POLICY bids_owner_or_unset ON bids FOR ALL TO PUBLIC USING (
      current_setting('app.user_id', true) IS NULL
      OR current_setting('app.user_id', true) = ''
      OR bidder_user_id::text = current_setting('app.user_id', true)
      OR EXISTS (SELECT 1 FROM projects p WHERE p.id = bids.project_id AND p.user_id::text = current_setting('app.user_id', true))
      OR EXISTS (SELECT 1 FROM users u WHERE u.id::text = current_setting('app.user_id', true) AND u.role_type = 'admin')
    );
  END IF;

  -- payment termins: project membership
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='project_payment_termins') THEN
    ALTER TABLE project_payment_termins ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS termins_member_or_unset ON project_payment_termins;
    CREATE POLICY termins_member_or_unset ON project_payment_termins FOR ALL TO PUBLIC USING (
      current_setting('app.user_id', true) IS NULL
      OR current_setting('app.user_id', true) = ''
      OR EXISTS (SELECT 1 FROM projects p WHERE p.id = project_payment_termins.project_id AND (p.user_id::text = current_setting('app.user_id', true) OR EXISTS (SELECT 1 FROM users u WHERE u.id::text = current_setting('app.user_id', true) AND u.role_type='admin')))
    );
  END IF;

  -- ledger: project membership (read-heavy; writes go via SECURITY DEFINER fn)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='project_budget_transactions') THEN
    ALTER TABLE project_budget_transactions ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS ledger_member_or_unset ON project_budget_transactions;
    CREATE POLICY ledger_member_or_unset ON project_budget_transactions FOR ALL TO PUBLIC USING (
      current_setting('app.user_id', true) IS NULL
      OR current_setting('app.user_id', true) = ''
      OR EXISTS (SELECT 1 FROM projects p WHERE p.id = project_budget_transactions.project_id AND (p.user_id::text = current_setting('app.user_id', true) OR EXISTS (SELECT 1 FROM users u WHERE u.id::text = current_setting('app.user_id', true) AND u.role_type='admin')))
    );
  END IF;

  -- addendums + material orders: same project-membership shape
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='project_addendums') THEN
    ALTER TABLE project_addendums ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS addendums_member_or_unset ON project_addendums;
    CREATE POLICY addendums_member_or_unset ON project_addendums FOR ALL TO PUBLIC USING (
      current_setting('app.user_id', true) IS NULL
      OR current_setting('app.user_id', true) = ''
      OR EXISTS (SELECT 1 FROM projects p WHERE p.id = project_addendums.project_id AND (p.user_id::text = current_setting('app.user_id', true) OR EXISTS (SELECT 1 FROM users u WHERE u.id::text = current_setting('app.user_id', true) AND u.role_type='admin')))
    );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='material_orders') THEN
    ALTER TABLE material_orders ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS orders_member_or_unset ON material_orders;
    CREATE POLICY orders_member_or_unset ON material_orders FOR ALL TO PUBLIC USING (
      current_setting('app.user_id', true) IS NULL
      OR current_setting('app.user_id', true) = ''
      OR user_id::text = current_setting('app.user_id', true)
      OR EXISTS (SELECT 1 FROM projects p WHERE p.id = material_orders.project_id AND p.user_id::text = current_setting('app.user_id', true))
      OR EXISTS (SELECT 1 FROM users u WHERE u.id::text = current_setting('app.user_id', true) AND u.role_type='admin')
    );
  END IF;
END $$;
