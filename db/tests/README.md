# DP Suite — Database tests

Reproducible SQL scripts that exercise database-level behavior (RLS,
triggers, immutability). **Not migrations.** Every script wraps its work
in a transaction that ends in `ROLLBACK`, so no data persists even when
all assertions pass.

> ⚠️ Run in **Development or Staging only**. Never run against Production.

## How to run

### Supabase SQL Editor (Development / Staging)

1. Open the target project (`dp-suite-dev` for Development).
2. Open the SQL Editor and paste the contents of the test file.
3. Click **Run**.
4. On success you should see a `NOTICE` line like
   `TT-004.3 organization isolation tests: ALL ASSERTIONS PASSED`
   followed by the automatic `ROLLBACK`. On failure the script raises an
   exception; the transaction is rolled back either way.

### psql

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
  -f db/tests/tt004_organization_isolation.sql
```

`ON_ERROR_STOP=1` ensures psql exits non-zero if any assertion fails,
which is useful for CI-style runs.

## Requirements

The scripts must be executed by a privileged role (`postgres` /
`service_role`) so they can seed `auth.users` and `public.*` fixture
rows. They then use `SET LOCAL ROLE authenticated` plus a synthetic
`request.jwt.claims` JSON to simulate a real authenticated Supabase
session for `auth.uid()` / `public.current_organization_id()`.

## Catalog

| Test file                              | Task     | Covers                                                                 |
| -------------------------------------- | -------- | ---------------------------------------------------------------------- |
| `tt004_organization_isolation.sql`     | TT-004.3 | SELECT/INSERT/UPDATE isolation, cross-org integrity on `actions`, no DELETE for `authenticated`, `audit_events` immutability |
| `tt005_auth_profile_status.sql`        | TT-005   | `record_profile_login()` returns status; `last_login_at` set only for active profiles; soft-deleted → inactive; unauthenticated call raises |
