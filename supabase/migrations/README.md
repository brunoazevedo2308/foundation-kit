# Canonical migration chain

This directory is the executable Supabase CLI migration chain for DP Suite.

- Filenames match the 26 versions recorded in the `dp-suite-dev` remote migration history.
- SQL was reconciled from the historical mirrors in `db/migrations`.
- `20260721064853_harden_create_organization_rpc_grants.sql` restores the one remote step that had been consolidated into the local Organizations mirror.
- New migrations must be created here with `supabase migration new <name>` and must not be added to `db/migrations`.

Do not run `db push` against a shared environment until this chain has replayed successfully in an empty Development/Staging database and the SQL tests in `db/tests` have passed.
