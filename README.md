# DP Suite

Plataforma SaaS de governança e conformidade para operações de Dynamic Positioning.

> Estado atual: fundação técnica (TT-001), ambientes Development e Staging (TT-002), schema versionado com RLS e integridade cross-organization (TT-003 e TT-004), autenticação e sessão via Supabase (TT-005), casca do aplicativo com navegação lateral, cabeçalho, rota dinâmica de Ações e páginas base dos módulos (TT-006), estrutura operacional com Clientes, Embarcações e Ações — criação, edição e exclusão lógica (US-004).

## Estrutura operacional (US-004)

- **Módulos reais**: Clientes (`/clients`), Embarcações (`/vessels`) e Ações (`/actions`), todos tenant-scoped por RLS e sem `service_role` no frontend.
- **CRUD com exclusão lógica**: criação, edição (`/clients/$clientId/edit`, `/vessels/$vesselId/edit`, `/actions/$actionId/edit`) e soft-delete via `UPDATE deleted_at` — o `DELETE` físico continua bloqueado pela RLS. Toda exclusão passa por diálogo de confirmação (`src/components/soft-delete-dialog.tsx`).
- **Formulários compartilhados**: `src/components/client-form.tsx`, `vessel-form.tsx` e `action-form.tsx` são usados tanto na criação quanto na edição, garantindo validação Zod e rótulos idênticos.
- **Guards de admin**: `canManageOperationalData` esconde ações na UI e `beforeLoad` bloqueia rotas de escrita; a fonte da verdade continua no banco (`private.can_manage_operational_data()` nas policies de INSERT/UPDATE — migrations `20260807125500` e `20260809094500`). `member` permanece somente leitura.
- **Entregáveis e Evidências**: cada Ação lista seus Entregáveis (`src/components/deliverables-section.tsx`) e cada Entregável expõe suas Evidências (`src/components/evidences-section.tsx`). O upload usa apenas a chave publishable + sessão (`src/lib/evidences.ts` → `src/lib/evidence-storage.ts`): metadata-first em `public.evidences`, envio ao bucket privado `evidences-private` e rollback compensatório (soft-delete do metadata) se o objeto falhar. `storage_path` é canônico e imutável; nova versão = nova row + novo path (`docs/evidences-versioning.md`); download por signed URL de 120s; exclusão é lógica e preserva o objeto. Validação de MIME/tamanho no cliente espelha o bucket (50 MB; PDF, JPEG, PNG, WEBP, TXT, CSV, DOCX, XLSX). Escrita gated por `private.can_manage_operational_data()` (migration `20260809113000`); `member` permanece somente leitura.
- **Comentários**: Ações expõem `src/components/comments-section.tsx` (lógica em `src/lib/comments.ts`) sobre `public.comments`, com criação e exclusão lógica. As policies atuais (`comments_select/insert/update_same_org`) liberam leitura e escrita a qualquer perfil ativo da organização — diferente dos módulos operacionais, `member` **pode** comentar. A exclusão é oferecida na UI ao autor ou a administradores (`canDeleteComment`); a RLS segue sendo a fonte da verdade e o `DELETE` físico permanece bloqueado. O componente aceita contexto de Ação ou Entregável (`{ actionId }` / `{ deliverableId }`), respeitando a constraint `comments_exactly_one_context`. Ambos os contextos estão plugados na UI: comentários da Ação em `/actions/$actionId` e comentários de cada Entregável dentro de `deliverables-section.tsx`, reutilizando o mesmo componente sem duplicar lógica. Não há gate de admin no formulário de comentário — qualquer perfil `active` da organização comenta, exatamente como as policies permitem.
- **Auditoria**: `UPDATE` e soft-delete de Ações geram `action.updated` / `action.soft_deleted` em `public.audit_events` pelo trigger `trg_actions_audit_change` (migration `20260809100000`). Clientes e Embarcações têm cobertura equivalente pela migration `20260809101500_audit_client_vessel_updates_and_soft_deletes.sql` (`trg_clients_audit_change` / `trg_vessels_audit_change`, eventos `client.updated`, `client.soft_deleted`, `vessel.updated`, `vessel.soft_deleted`, payload `{before, after}` idêntico ao de Ações) — **já aplicada no Development (dp-suite-dev)**. Entregáveis (`trg_deliverables_audit_change`) e Evidências (`trg_evidences_audit_change`) também já registram eventos `deliverable.updated` / `deliverable.soft_deleted` e `evidence.updated` / `evidence.soft_deleted` — **já aplicados no Development**. Comentários também têm cobertura: `trg_comments_audit_change` grava `comment.updated` / `comment.soft_deleted` (migration `20260817173000_audit_comment_updates_and_soft_deletes.sql`, **já aplicada no Development** e agora versionada no repositório).
- **Attachments**: upload continua bloqueado por falta de bucket/policies de Storage (`docs/attachments-storage-gap.md`); nenhum fluxo de upload é exposto na UI. O único bucket existente no Development é `evidences-private` (privado, 50 MB, MIME restritos).

### Status de fechamento da US-004

Os módulos operacionais da US-004 (Clientes, Embarcações, Ações, Entregáveis, Evidências e Comentários) estão implementados end-to-end: CRUD com exclusão lógica, gates de UI espelhando as policies, auditoria de `UPDATE`/soft-delete em todas as entidades e observabilidade sanitizada. Com isso, a US-004 é considerada **tecnicamente pronta para encerramento do escopo atual**, com **um único bloqueio externo de infraestrutura**:

- **Attachments**: não existe bucket nem policies de `storage.objects` para anexos. Enquanto esse DDL não for aplicado no Supabase, nenhum fluxo de upload de anexos será exposto (decisão deliberada — ver `docs/attachments-storage-gap.md`).

Itens fora do escopo da US-004:

- **Leaked password protection** (Supabase Auth) pertence a **Production Readiness**, não à US-004.
- **Limpeza de objetos órfãos** no bucket após soft-delete de evidências é retenção/infra, tratada fora deste escopo (o soft-delete preserva o objeto por design de auditoria).

## Dashboard Operacional (US-005 — 1º ciclo)

...

- **Testes**: `src/lib/dashboard.test.ts` cobre vencimento, status fechados, KPIs, distribuições, rankings e `attentionList` de forma determinística (datas fixas, sem rede).

### US-005 — 2º ciclo (filtros gerenciais)

- **Filtros**: cliente, embarcação, responsável, status, prioridade e janela de prazo (`Todos os prazos`, `Vencidos`, `Próximos 7 dias`, `Próximos 30 dias`), combinados de forma conjuntiva no cartão "Filtros gerenciais" (`src/components/dashboard-filters.tsx`).
- **Recorte único**: `applyFilters` (`src/lib/dashboard.ts`) produz um único conjunto filtrado de ações e entregáveis; KPIs, distribuições, rankings e a lista de atenção imediata consomem **exatamente o mesmo recorte**. Entregáveis herdam o escopo das ações visíveis e, quando há janela de prazo ativa, respeitam também o próprio `due_date`.
- **Janelas de prazo**: `Vencidos` = `due_date < hoje` e item aberto; `Próximos N dias` = `hoje <= due_date <= hoje + N` (limites inclusivos). Itens sem prazo só aparecem em `Todos os prazos`.
- **Agregação client-side**: os filtros são aplicados em memória sobre os dados já carregados, tenant-scoped via RLS — sem DDL, sem seeds, sem `service_role`. Nenhum filtro amplia o escopo de leitura. Gap futuro documentado: se o volume crescer, avaliar view/RPC/índice de agregação server-side (não implementado neste ciclo).
- **Empty states**: distingue organização sem dados (empty state global com CTAs) de recorte sem resultados (empty state filtrado com "Limpar filtros"). O botão "Limpar filtros" fica desabilitado sem filtros ativos e o contador exibe quantos filtros estão aplicados.
- **Acessibilidade**: `Select` rotulado com `Label`/ID, `aria-live="polite"` no estado de carregamento, `role="status"` no aviso de recorte filtrado e grid responsivo (`sm`/`lg`) em filtros, KPIs, distribuições e rankings.
- **Testes**: 11 testes determinísticos cobrem contagem de filtros ativos, filtros individuais e combinados, janelas de prazo (inclusive limites e itens sem prazo), herança de escopo dos entregáveis, consistência do recorte em KPIs/rankings/atenção e opções derivadas dos dados carregados.

## Notificações e Central de Alertas (US-006 — ciclos 1 e 2, escopo MVP **concluído**)

- **Status**: escopo MVP da US-006 validado e encerrado (leitura/interação in-app + hardening + geração automática por triggers). Itens listados em "Fora de escopo" seguem como evoluções futuras.
- **Escopo do ciclo 1**: apenas **leitura e interação in-app**. Nenhuma DDL, nenhum trigger de geração automática, nenhum uso de `service_role`.
- **Camada de dados** (`src/lib/notifications.ts`): lista as notificações do usuário (`listNotifications`), conta as não lidas server-side (`fetchUnreadCount`, `count: "exact", head: true`) e marca leitura individual (`markAsRead`) ou em massa (`markAllAsRead`). Erros do Supabase são registrados sanitizados via `emitEvent` (`backend.request.failure`) e devolvidos à UI como mensagem PT-BR.
- **RLS como fonte da verdade**: nenhuma query filtra por usuário no cliente. `public.notifications` só expõe linhas do próprio recipient dentro do tenant (`notifications_select_own_recipient`) e só permite UPDATE do próprio recipient (`notifications_update_recipient_only`, com `WITH CHECK` impedindo troca de `recipient_user_id`/`organization_id`).
- **Idempotência**: `markAsRead` e `markAllAsRead` aplicam `.is("read_at", null)` no UPDATE — reexecutar é no-op (zero linhas afetadas), nunca reescreve o carimbo de leitura já existente e nunca alcança linhas de outro usuário.
- **Badge sem polling** (`src/hooks/use-unread-notifications.ts` + `src/components/notification-badge.tsx`): store de módulo compartilhado com deduplicação por promise em voo — header e sidebar montam o mesmo hook e geram **uma única** requisição por gatilho. Gatilhos: montagem, mudança de rota e o evento de janela `dp-suite:notifications-changed`, disparado após cada mutação de leitura. Não há `setInterval`.
- **Links de origem**: `entity_type = "action"` navega para `/actions/$actionId`; `entity_type = "deliverable"` resolve a ação pai via `deliverables.action_id` (consulta em lote, tenant-scoped) e só então gera link. Falha nessa resolução não derruba a lista: os links ficam indisponíveis. Tipos sem rota suportada não geram link — não inventamos schema.
- **UI** (`src/routes/_authenticated/notifications.tsx`): destaque visual de não lidas, estados de loading/erro (`role="alert"`)/vazio distintos, "Marcar todas como lidas" com contador e ações individuais com estado ocupado. O badge do header é decorativo (`aria-hidden`) porque a contagem já é anunciada no `aria-label` do próprio link.
- **Testes**: `src/lib/notifications.test.ts` cobre mapping de linhas, `isUnread`/`countUnread`, resolução de destino (action, deliverable com e sem mapa, tipos desconhecidos) e formatação PT-BR — determinístico, sem rede.

### Ciclo 2 — hardening + geração automática (estado real)

- **Migration versionada** `db/migrations/20260824190000_us006_notifications_hardening_and_triggers.sql` espelha **exatamente** o DDL já aplicado no Supabase Development (nenhum DDL foi aplicado pelo Lovable).
- **Sem INSERT pelo cliente**: a policy `notifications_insert_same_org` foi removida e `INSERT` revogado de `authenticated`; permanecem apenas `SELECT`/`UPDATE` (RLS own-recipient). O frontend não contém nenhum `insert` em `notifications` — a criação é exclusivamente server-side.
- **Triggers/funções privadas** (`SECURITY DEFINER`, `search_path = pg_catalog, public, private`, `EXECUTE` revogado de public/anon/authenticated):
  - `private.notify_action_assignment()` → `trg_actions_notify_assignment`, tipo `action.assigned`, título `Ação atribuída a você`, `entity_type = action`.
  - `private.notify_deliverable_assignment()` → `trg_deliverables_notify_assignment`, tipo `deliverable.assigned`, título `Entregável atribuído a você`, `entity_type = deliverable`.
  - `private.notify_comment_created()` → `trg_comments_notify_created`, tipo `comment.created`, notifica o responsável do deliverable/action comentado, preservando `entity_type` (`deliverable` ou `action`) e body truncado a 240 chars.
- **Regras compartilhadas**: linhas com `deleted_at` não nulo são ignoradas; ninguém é notificado da própria ação (`actor_user_id = auth.uid()` apenas quando diferente do recipient, caso contrário `null`); em `UPDATE`, só dispara quando `responsible_user_id` muda de fato.
- **UI por tipo**: `notificationTypeLabel()` traduz os tipos reais (`Ação atribuída`, `Entregável atribuído`, `Novo comentário`) com fallback genérico, exibido como badge no item. Links continuam resolvendo `action` direto e `deliverable` via ação pai.
- **Testes**: `src/lib/notifications.test.ts` cobre rótulos por tipo e os targets dos três tipos gerados automaticamente, além do mapping/contagem/formatação do ciclo 1 — determinístico, sem rede.

### Fora de escopo (permanece)

- **Lembretes por prazo/scheduler**: nenhum `pg_cron`, job ou lembrete de vencimento foi criado — continua fora de escopo.
- **Sem e-mail, push externo ou Realtime**: a atualização depende de navegação/mutação local.
- **Sem paginação**: a lista carrega as 50 mais recentes; paginação/filtros por tipo ficam para um ciclo futuro.
- **Sem preferências por tipo**: canais e preferências por usuário estão fora do escopo.

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
