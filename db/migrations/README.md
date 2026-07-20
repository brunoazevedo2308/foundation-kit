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

| Migration                                        | Task     | Summary                                |
| ------------------------------------------------ | -------- | -------------------------------------- |
| `20260720073636_init_organizations_profiles.sql` | TT-003.1 | `organizations`, `profiles` (RLS on, no policies yet) |
