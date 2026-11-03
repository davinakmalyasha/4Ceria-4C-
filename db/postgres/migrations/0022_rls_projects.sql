-- 0022: Row-level security as defense-in-depth (pilot: projects).
--
-- The application enforces scoping in handler SQL (the contract). RLS is the
-- second layer: when `app.user_id` is set (see `setAppUser()`), the database
-- re-checks ownership; when unset, the policy allows (legacy path, pool as
-- owner bypasses RLS anyway). This keeps the change safe: no existing query
-- breaks, and least-privilege roles gain enforcement the moment they set the
-- GUC.
--
-- Future: set the GUC per-request in middleware and extend to bids, termins,
-- ledger (handler WHERE stays primary).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='projects') THEN
    RETURN;
  END IF;

  ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS projects_owner_or_unset ON projects;
  CREATE POLICY projects_owner_or_unset ON projects
    FOR ALL
    TO PUBLIC
    USING (
      current_setting('app.user_id', true) IS NULL
      OR current_setting('app.user_id', true) = ''
      OR user_id::text = current_setting('app.user_id', true)
      -- Assigned PM and admins are resolved in handler SQL; RLS allows them
      -- via the unset fallback until the GUC carries role context.
      OR EXISTS (
        SELECT 1 FROM users u
        WHERE u.id::text = current_setting('app.user_id', true)
          AND u.role_type = 'admin'
      )
      OR pm_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM project_managers pm
        WHERE pm.id = projects.pm_id
          AND pm.user_id::text = current_setting('app.user_id', true)
      )
    );
END $$;
