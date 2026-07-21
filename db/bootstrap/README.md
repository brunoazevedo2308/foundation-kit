# DP Suite — Bootstrap templates (Development / Staging only)

Reusable, redacted templates for bringing up a fresh DP Suite environment.

> **Never run these against Production.** They are intended for the
> Development project (`dp-suite-dev`) and future Staging project — the two
> environments where the operator is expected to seed the first
> Organization and first admin Profile by hand.

## Files

- [`first_admin.sql.template`](./first_admin.sql.template) — three-step
  procedure to create:
  1. the first `public.organizations` row (idempotent via `ON CONFLICT`);
  2. the first Supabase Auth user through the **Auth Admin API / Studio**
     (never a hand-crafted `INSERT` into `auth.users`);
  3. the matching `public.profiles` row, created automatically by the
     `on_auth_user_created_create_profile` trigger when the operator passes
     `user_metadata.profile_status = "active"` and a valid
     `user_metadata.organization_id`.
     Includes a read-only verification query and a commented-out one-shot
     promotion `UPDATE` for the case where the operator forgot the
     `profile_status` metadata.

## Rules

- **No real values are ever committed.** All fields use `<PLACEHOLDER>`
  tokens. The operator fills them in locally and discards the filled copy.
- **No `service_role` key or password appears in the repo.** Step 2 assumes
  the operator has the service_role key in their environment (`$SUPABASE_SERVICE_ROLE_KEY`)
  or is signed in to Studio.
- **Never execute automatically.** The application does not import or run
  this SQL — it is a manual admin-only procedure.
- **Idempotent where practical.** Re-running Step 1 or Step 3a is safe;
  Step 2 is a one-shot API call whose retry naturally errors (safe to
  ignore) if the user already exists.

## How to use

1. Copy `first_admin.sql.template` to a file OUTSIDE the repository
   (e.g. `~/dp-suite-bootstrap-dev.sql`) — never save the filled copy in
   the working tree.
2. Replace every `<...>` placeholder with the real value.
3. Run Step 1 in the Supabase SQL Editor (Development project).
4. Run Step 2 as an Admin API call or through Studio → Authentication.
5. Run Step 3a to verify; if needed, uncomment and run Step 3b.
6. Delete the filled copy once the environment is bootstrapped.
