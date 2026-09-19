# DP Suite repository guidance

- GitHub is the source of truth for application code and versioned database migrations.
- Supabase is the source of truth for runtime data, authentication, storage, and the applied migration state.
- Do not rewrite shared Git history. Use feature branches and reviewed pull requests.
- Never commit secrets or a Supabase `service_role` key. Browser code may use only the publishable key.
- Preserve tenant isolation: database changes must include explicit RLS and cross-organization tests.
