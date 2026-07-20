# DP Suite — Database migrations

Versioned SQL migrations for the `dp-suite-dev` Supabase project (and future
Staging/Production). Numbered by UTC timestamp; **apply in order, never edit
a migration after it has been applied** — add a new one instead.

## Apply with Supabase CLI

```bash
# One-time link to the Development project
supabase link --project-ref lyxonmqsldtsixdhcaww

# Push all pending migrations
supabase db push
```

Alternatively, open each `.sql` file and run it in the Supabase Dashboard
SQL Editor (Development only).

## Conventions

- UTC timestamped filenames: `YYYYMMDDHHMMSS_<slug>.sql`.
- UUID primary keys via `pgcrypto` (`gen_random_uuid()`).
- Every table has `created_at`, `updated_at`, and (where applicable) `deleted_at`.
- `updated_at` is maintained by the shared trigger `public.set_updated_at()`.
- Every `public.*` table enables RLS and declares `GRANT`s in the same
  migration. Policies are introduced in later, dedicated migrations.
- `service_role` is used **only** on the backend (never in the frontend bundle).

## Index

Migrations are applied in filename (timestamp) order. Always run them
sequentially; never skip or reorder.

| #   | Migration                                              | Task       | Summary                                                                                                           |
| --- | ------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | `20260720073636_init_organizations_profiles.sql`       | TT-003.1   | `organizations`, `profiles` (RLS on, no policies yet)                                                             |
| 2   | `20260720074347_add_clients_vessels.sql`               | TT-003.2   | `clients`, `vessels` (RLS on, no policies yet)                                                                    |
| 3   | `20260720075000_add_actions.sql`                       | TT-003.3   | `actions` (RLS on, no policies yet)                                                                               |
| 4   | `20260720075500_add_deliverables.sql`                  | TT-003.4   | `deliverables` (RLS on, no policies yet)                                                                          |
| 5   | `20260720080000_add_collab_and_audit.sql`              | TT-003.5   | `user_vessels`, `evidences`, `comments`, `attachments`, `notifications`, `audit_events` (RLS on, no policies yet) |
| 6   | `20260720080500_harden_function_search_paths.sql`      | TT-003.6   | Harden `search_path` on `set_updated_at()` and `prevent_audit_event_mutation()`                                   |
| 7   | `20260720081000_rls_read_isolation.sql`                | TT-004.1   | `current_organization_id()` + SELECT policies scoping reads to caller's org                                       |
| 8   | `20260720081500_rls_write_isolation.sql`               | TT-004.2   | INSERT/UPDATE policies + cross-org integrity triggers (no DELETE)                                                 |
| 9   | `20260720082000_move_rls_helper_private.sql`           | TT-004.2.1 | Move `current_organization_id()` to `private` schema (out of PostgREST API)                                       |
| 10  | `20260720082500_fix_cross_org_trigger_bypass.sql`      | TT-004.2.2 | Cross-org triggers as SECURITY DEFINER; `assert_same_org` rejects NULL; EXECUTE restricted to `service_role`      |
| 11  | `20260720083000_add_profile_status_and_last_login.sql` | TT-005     | `profile_status` enum + `profiles.status` / `profiles.last_login_at` + `public.record_profile_login()` RPC        |

## Tests

Reproducible RLS/tenancy tests live in [`../tests/`](../tests/). They are
**not** migrations and must not be added to this folder — each test wraps
its work in a transaction that ends in `ROLLBACK`, so nothing persists.
See `../tests/README.md` for how to run them against Development or
Staging.
