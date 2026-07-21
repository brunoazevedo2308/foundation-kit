# US-005 — Cadastrar Organization

Fluxo administrativo para criação de organizações clientes no DP Suite.

## Papéis e acesso

- Somente perfis com `profiles.role = 'system_admin'` **ativos** enxergam o
  item "Organizations" na sidebar e conseguem abrir `/organizations` e
  `/organizations/new`.
- Outros papéis (`organization_admin`, `member`) são redirecionados para
  `/dashboard` pelo `beforeLoad` das rotas, mesmo que digitem a URL manualmente.
- O `role` chega ao shell autenticado através de `fetchProfileHeader` e é
  propagado para `AppShell` → `AppSidebar` via prop tipada (`AppRole`).

## Fluxo de criação

1. O admin abre `/organizations/new` e preenche razão social, nome de
   exibição, país (ISO-3166 alpha-2), e-mail principal, status, idioma,
   fuso horário e formato de data.
2. O cliente valida via `CreateOrganizationSchema` (Zod) antes de enviar.
3. O frontend chama **exclusivamente** a RPC remota, com a assinatura
   nominal e ordem exatas:
   `public.create_organization(_legal_name, _display_name, _country_code,
    _primary_email, _status, _default_language, _timezone, _date_format)`.
   Nenhum caminho da UI faz `insert` direto em `public.organizations`.
4. A RPC retorna a linha completa de `public.organizations` (SETOF). O
   frontend extrai `id`, `name`, `slug` e `status` para exibir a confirmação.
5. Após o sucesso, o formulário mostra uma tela de confirmação com `id` e
   `nome` da Organization criada e dois botões: **Voltar para a lista** e
   **Criar outra**. Nenhum redirect imediato é feito, para que o admin
   confirme visualmente o resultado antes de sair da página.

## Regras de servidor (RPC)

- `SECURITY DEFINER` com `search_path = pg_catalog, public`.
- Autorização via `private.is_system_admin()` (SECURITY DEFINER helper).
  Chamador não-admin ou inativo recebe `SQLSTATE 42501`.
- Normaliza e valida entradas (`btrim`, `upper`, `lower`, regex ISO-2 e email).
- Gera slug canônico `org-<sufixo>` a partir de `gen_random_uuid()`.
- Insere em `public.organizations` e imediatamente insere o evento
  `organization.created` em `public.audit_events` — **a própria RPC grava
  o audit event**; não há trigger de auditoria para essa ação.
- `EXECUTE` é concedido apenas a `authenticated`; `public` e `anon` são
  revogados explicitamente na mesma migration (hardening).

## Sem regra de duplicidade de `legal_name`

Nesta entrega o remoto **não** possui unique index em `legal_name` — a UI
não infere essa regra. Conflitos (`23505`) vêm de constraints reais já
existentes (por exemplo o `unique` de `slug`) e são apresentados de forma
genérica ao usuário.

## Mapeamento de erros

| Origem                        | Categoria     | Mensagem PT-BR                                                              |
| ----------------------------- | ------------- | ---------------------------------------------------------------------------- |
| `42501` / "System Admin"      | `denied`      | "Somente System Admin ativo pode criar organizações."                        |
| `23505` (qualquer constraint) | `conflict`    | "Conflito ao gravar a organização. Tente novamente."                         |
| `23514` / `22P02`             | `validation`  | "Dados inválidos. Revise os campos e tente novamente."                       |
| qualquer outro                | `unknown`     | "Não foi possível criar a organização agora. Tente novamente em instantes." |

O detalhe cru do PostgREST **nunca** é exibido: o texto pré-aprovado do
usuário evita enumeração e vazamento de constraints.

## Migration local (espelho, não aplicar no remoto)

`db/migrations/20260721100000_us005_organizations_and_roles.sql` é um
espelho **idempotente** do estado remoto: enums `app_role` e
`organization_status`, coluna `profiles.role`, colunas estendidas de
`organizations`, `private.is_system_admin()`, RPC
`public.create_organization` com a assinatura canônica retornando
`SETOF public.organizations`, insert de `audit_events` dentro da própria
RPC, e o hardening `revoke ... from public/anon` + `grant execute ... to
authenticated`. Não deve ser reaplicada contra o banco — existe apenas
para manter o histórico versionado.
