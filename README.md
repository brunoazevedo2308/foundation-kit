# DP Suite

Plataforma SaaS de governança e conformidade para operações de Dynamic Positioning.

> Estado atual: fundação técnica (TT-001), ambientes Development e Staging (TT-002), schema versionado com RLS e integridade cross-organization (TT-003 e TT-004), autenticação e sessão via Supabase (TT-005).

## Autenticação e sessão (TT-005)

- **Provedor**: Supabase Auth com e-mail + senha (chave publishable no cliente).
- **Rotas públicas**: `/login` (autenticação), `/forgot-password` (envio do link
  de recuperação) e `/reset-password` (definição da nova senha a partir do
  link recebido por e-mail). `/auth` foi removida como página funcional — é
  mantida apenas como redirecionamento permanente para `/login`.
- **Rotas protegidas**: qualquer arquivo em `src/routes/_authenticated/` — o
  layout `_authenticated/route.tsx` roda `ssr: false`, valida a sessão via
  `supabase.auth.getUser()` e **revalida** `profiles.status` antes de qualquer
  child renderizar. Uma sessão restaurada de um perfil rebaixado para
  `inactive` ou `blocked` após o último login é desconectada e redirecionada
  para `/login` antes de qualquer conteúdo protegido ser exibido.
- **Ciclo de vida do perfil**: enum `profile_status` = `active | inactive |
blocked`. Perfis ausentes ou soft-deleted são reportados como `blocked` (não
  visíveis sob a RLS existente), sem introduzir um quarto valor no enum.
- **RPC `public.record_profile_login()`**: `SECURITY INVOKER`, `search_path`
  fixo, `EXECUTE` restrito a `authenticated`. Roda sob os privilégios do
  chamador e é totalmente limitada pelas policies `profiles_select_same_org`
  e `profiles_update_self` — não consegue ler ou atualizar nenhuma linha
  além do próprio perfil.
- **`last_login_at`**: carimbado por `record_profile_login()` apenas quando o
  perfil está `active` e não está soft-deleted.
- **Área autenticada (`/app`)**: exibe `profiles.full_name` e
  `organizations.name` sob RLS, além do e-mail da sessão.
- **Mensagens de erro**: sempre em português e genéricas — nenhuma mensagem
  bruta do Supabase é exibida ao usuário (evita enumeração de contas).
- **Sincronização de sessão**: um único `supabase.auth.onAuthStateChange` em
  `src/routes/__root.tsx` invalida o router e a cache do React Query em
  `SIGNED_IN` / `SIGNED_OUT` / `USER_UPDATED`.
- **Testes**: `db/tests/tt005_auth_profile_status.sql` valida a RPC
  transacionalmente (roll-back garantido), incluindo isolamento
  cross-user via `SECURITY INVOKER`.

## Stack

TypeScript · React 19 · TanStack Start · Tailwind CSS v4 · shadcn/ui · Supabase JS (publishable key).

## Requisitos

- [Bun](https://bun.sh) ≥ 1.1 (ou Node 20+ com npm/pnpm equivalentes)
- Acesso ao projeto Supabase **dp-suite-dev** (Development)

## Variáveis de ambiente

Todas as variáveis são carregadas via `import.meta.env` e validadas em `src/lib/env.ts`.

| Variável                        | Obrigatória             | Descrição                                                    |
| ------------------------------- | ----------------------- | ------------------------------------------------------------ |
| `VITE_APP_ENV`                  | sim                     | `development` \| `staging` \| `production`                   |
| `VITE_SUPABASE_URL`             | quando o backend existe | URL do projeto Supabase do ambiente                          |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | quando o backend existe | Chave **publishable** (anon). Nunca use `service_role` aqui. |

Um template está em [`.env.example`](./.env.example). Copie para `.env.local`
(git-ignored) para desenvolvimento local. **Valores reais nunca são
versionados** — são fornecidos por configuração segura de ambiente.

## Execução local

```bash
bun install
cp .env.example .env.local   # preencha com os valores do dp-suite-dev
bun run dev                  # http://localhost:8080
```

## Ambientes

### Development (`dp-suite-dev`)

`VITE_APP_ENV=development`. URL e publishable key do projeto Supabase
`dp-suite-dev` são injetadas via variáveis de ambiente seguras (arquivo local
`.env.local` fora do Git, ou o cofre de segredos da plataforma de hosting).

### Staging

`VITE_APP_ENV=staging`. O projeto Supabase de Staging **ainda não existe**.
A aplicação está preparada por **contrato de configuração**: quando o
ambiente for provisionado, basta injetar `VITE_SUPABASE_URL` e
`VITE_SUPABASE_PUBLISHABLE_KEY` do novo projeto — nenhum código precisa mudar.
Enquanto os valores não são fornecidos, a página inicial indica que o backend
não está configurado.

### Production

Reservado. Mesma superfície de configuração dos ambientes anteriores.

## Segurança

- **Nunca** use `service_role` (ou qualquer chave de backend) no frontend.
  Apenas a **publishable (anon) key** entra no bundle.
- Credenciais reais nunca são commitadas. `.env`, `.env.local`, `.env.*.local`
  e derivados estão em `.gitignore`.
- Operações privilegiadas, RLS e regras de negócio ficam no backend — fora do
  escopo desta task.

## Scripts

```bash
bun run dev        # servidor de desenvolvimento
bun run build      # build de produção
bun run lint       # ESLint
bun run typecheck  # TypeScript (tsgo --noEmit)
bun run format     # Prettier
```
