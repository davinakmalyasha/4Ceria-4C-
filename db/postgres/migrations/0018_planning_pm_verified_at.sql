-- 0018_planning_pm_verified_at.sql
--
-- The planning machine writes `planning_pm_verified_at` on both
-- `verify-planning-pm` and `reject-planning`, but the column never
-- existed on either engine and was not in `Project::$fillable` — so the
-- PM half of the planning flow raised a MassAssignmentException (500)
-- for every project. Additive and nullable; existing rows untouched.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS planning_pm_verified_at timestamp with time zone;
