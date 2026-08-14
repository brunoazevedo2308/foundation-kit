# DP Suite

Plataforma SaaS de governança e conformidade para operações de Dynamic Positioning.

> Estado atual: fundação técnica (TT-001), ambientes Development e Staging (TT-002), schema versionado com RLS e integridade cross-organization (TT-003 e TT-004), autenticação e sessão via Supabase (TT-005), casca do aplicativo com navegação lateral, cabeçalho, rota dinâmica de Ações e páginas base dos módulos (TT-006), estrutura operacional com Clientes, Embarcações e Ações — criação, edição e exclusão lógica (US-004).

## Estrutura operacional (US-004)

- **Módulos reais**: Clientes (`/clients`), Embarcações (`/vessels`) e Ações (`/actions`), todos tenant-scoped por RLS e sem `service_role` no frontend.
- **CRUD com exclusão lógica**: criação, edição (`/clients/$clientId/edit`, `/vessels/$vesselId/edit`, `/actions/$actionId/edit`) e soft-delete via `UPDATE deleted_at` — o `DELETE` físico continua bloqueado pela RLS. Toda exclusão passa por diálogo de confirmação (`src/components/soft-delete-dialog.tsx`).
- **Formulários compartilhados**: `src/components/client-form.tsx`, `vessel-form.tsx` e `action-form.tsx` são usados tanto na criação quanto na edição, garantindo validação Zod e rótulos idênticos.
- **Guards de admin**: `canManageOperationalData` esconde ações na UI e `beforeLoad` bloqueia rotas de escrita; a fonte da verdade continua no banco (`private.can_manage_operational_data()` nas policies de INSERT/UPDATE — migrations `20260807125500` e `20260809094500`). `member` permanece somente leitura.
- **Entregáveis e Evidências**: cada Ação lista seus Entregáveis (`src/components/deliverables-section.tsx`) e cada Entregável expõe suas Evidências (`src/components/evidences-section.tsx`). O upload usa apenas a chave publishable + sessão (`src/lib/evidences.ts` → `src/lib/evidence-storage.ts`): metadata-first em `public.evidences`, envio ao bucket privado `evidences-private` e rollback compensatório (soft-delete do metadata) se o objeto falhar. `storage_path` é canônico e imutável; nova versão = nova row + novo path (`docs/evidences-versioning.md`); download por signed URL de 120s; exclusão é lógica e preserva o objeto. Validação de MIME/tamanho no cliente espelha o bucket (50 MB; PDF, JPEG, PNG, WEBP, TXT, CSV, DOCX, XLSX). Escrita gated por `private.can_manage_operational_data()` (migration `20260809113000`); `member` permanece somente leitura.
- **Comentários**: Ações expõem `src/components/comments-section.tsx` (lógica em `src/lib/comments.ts`) sobre `public.comments`, com criação e exclusão lógica. As policies atuais (`comments_select/insert/update_same_org`) liberam leitura e escrita a qualquer perfil ativo da organização — diferente dos módulos operacionais, `member` **pode** comentar. A exclusão é oferecida na UI ao autor ou a administradores (`canDeleteComment`); a RLS segue sendo a fonte da verdade e o `DELETE` físico permanece bloqueado. O componente aceita contexto de Ação ou Entregável (`{ actionId }` / `{ deliverableId }`), respeitando a constraint `comments_exactly_one_context`.
- **Auditoria**: `UPDATE` e soft-delete de Ações geram `action.updated` / `action.soft_deleted` em `public.audit_events` pelo trigger `trg_actions_audit_change` (migration `20260809100000`). Clientes e Embarcações têm cobertura equivalente na migration versionada `20260809101500_audit_client_vessel_updates_and_soft_deletes.sql` (`trg_clients_audit_change` / `trg_vessels_audit_change`, eventos `client.updated`, `client.soft_deleted`, `vessel.updated`, `vessel.soft_deleted`, payload `{before, after}` idêntico ao de Ações). **Aplicar no Supabase** — a migration está versionada mas ainda não foi executada no ambiente remoto.
- **Attachments**: upload continua bloqueado por falta de bucket/policies de Storage (`docs/attachments-storage-gap.md`); nenhum fluxo de upload é exposto na UI.

## Casca do aplicativo (TT-006)

- **Layout responsivo**: `SidebarProvider` + `AppShell` (`src/components/app-shell.tsx`) envolvem toda rota sob `/_authenticated/`. Em telas pequenas a barra lateral colapsa para _offcanvas_; em telas grandes é fixa e minimizável ao modo ícone.
- **Navegação lateral** (`src/components/app-sidebar.tsx`): agrupada em Operações (Dashboard, Ações, Notificações, Busca), Cadastros (Clientes, Embarcações, Usuários) e Conta (Configurações). A rota ativa é destacada via `useRouterState` e prefixos (por exemplo `/actions/$actionId` mantém Ações destacado).
- **Cabeçalho** (`src/components/app-header.tsx`): `SidebarTrigger`, breadcrumb derivado do pathname (rótulos PT-BR) e menu do usuário exibindo nome, e-mail, organização e ação Sair.
- **Rotas privadas** (todas em `src/routes/_authenticated/`): `dashboard`, `actions` (índice), `actions.$actionId` (rota dinâmica com placeholder de detalhe), `clients`, `vessels`, `users`, `notifications`, `settings`, `search`. Cada arquivo declara seu `head()` (título/descrição). Módulos sem UI real usam `ModulePlaceholder`.
- **`/app` legado**: preservada como redirecionamento permanente para `/dashboard`, que é a landing autenticada.
- **Proteção e estados globais**: o layout `_authenticated/route.tsx` é o único gate.
  - Sem sessão → redireciona para `/login` **preservando um return path same-origin** via `?redirect=<path>` (sanitizado por `src/lib/return-path.ts` — nunca aceita URLs absolutas, `//` ou rotas públicas de auth).
  - Sessão válida mas perfil `inactive`/`blocked`/ausente/soft-deletado → `signOut()` e redireciona para `/access-blocked?status=…` (tela pública controlada, `noindex`), em vez de um `/login` cru sem contexto.
  - Sessão + perfil `active` → renderiza a casca. `pendingComponent` mostra `LoadingPage`; `errorComponent` mostra um erro genérico em português; `notFoundComponent` reutiliza a `NotFoundPage`.
- **Páginas de status consistentes** (`src/components/status-pages.tsx`): `LoadingPage`, `ForbiddenPage` e `NotFoundPage` — reutilizadas pelos boundaries do `_authenticated` e do `__root.tsx`.
- **Visibilidade de menu é UX**: nenhuma decisão de autorização depende do frontend — a fonte da verdade é RLS no banco. Nenhum RBAC novo foi introduzido nesta task.
- **Sem alterações de banco**: TT-006 é 100% frontend; as migrações versionadas de TT-005 seguem intactas.

## Bootstrap do primeiro admin (Development / Staging)

Template documentado em [`db/bootstrap/`](./db/bootstrap/). Explica passo a passo como um operador cria a primeira `public.organizations`, o primeiro usuário `auth.users` (via Auth Admin API / Studio — **nunca** por `INSERT` manual em `auth.users`) e obtém o `public.profiles` `active` correspondente através do trigger `on_auth_user_created_create_profile`. É idempotente onde possível, é somente Dev/Staging, não é executado automaticamente pela aplicação e **não contém credenciais reais** — todos os campos são placeholders que o operador preenche localmente e descarta após uso.

## Provisionamento automático de perfil (TT-005 follow-up)

Duas migrações compõem este ajuste (ambas já aplicadas externamente no Development):

- `db/migrations/20260720084000_auto_create_profile_on_signup.sql` — instala `private.handle_new_auth_user()` (SECURITY DEFINER, `search_path` fixado em `pg_catalog, public`) e o trigger `on_auth_user_created_create_profile` em `auth.users` (AFTER INSERT).
- `db/migrations/20260720084500_reconcile_handle_new_auth_user_metadata_keys.sql` — reconcilia a função com o estado atual do banco: passa a ler `profile_status` como chave preferencial no metadata e aceita `status` como fallback legado.

Regras aplicadas:

- **Só cria perfil quando** o metadata de signup traz `organization_id` presente, parseável como UUID e referenciando uma `public.organizations` **não** soft-deletada. Sem organização válida, o trigger é no-op — o usuário fica sem perfil e o app o reporta como `blocked`.
- **Chave do status**: `metadata.profile_status` (preferencial). Se ausente, cai para `metadata.status` (compatibilidade). Quando ambas estão presentes, `profile_status` vence.
- **Status padrão `inactive`.** `active` só é atribuído quando a chave escolhida vale literalmente `'active'` (fluxo controlado de convite/ativação). Qualquer outro valor (inclusive `'blocked'` injetado no metadata) faz fallback para `inactive` — o metadata não pode forçar bloqueio.
- **`full_name`** vem de `metadata.full_name`; se ausente, é derivado do prefixo do e-mail (parte antes de `@`).
- **Nunca sobrescreve** um perfil pré-existente: se já há linha em `public.profiles` para o `NEW.id`, o trigger retorna sem mudanças.

Teste transacional reproduzível: `db/tests/tt005_auto_profile_on_signup.sql` (cobre organização válida/ausente/malformada/desconhecida/soft-deletada, precedência `profile_status`→`status`, fallback de valores inseguros, derivação de `full_name` e no-op sobre perfil pré-existente; encerra em `ROLLBACK`).

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
