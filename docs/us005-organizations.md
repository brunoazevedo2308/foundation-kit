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
3. O frontend chama **exclusivamente** a RPC
   `public.create_organization(_country_code, _date_format, _default_language,
   _display_name, _legal_name, _primary_email, _status, _timezone)`.
   Nenhum caminho da UI faz `insert` direto em `public.organizations`.
4. A RPC roda em `SECURITY DEFINER` e:
   - exige `auth.uid()` + `profiles.status = 'active'` + `role = 'system_admin'`;
   - normaliza e valida os campos;
   - insere em `public.organizations` respeitando o unique index
     `organizations_legal_name_ci_uidx`;
   - retorna o `uuid` da nova organização, que o backend registra em
     `audit_events` (trigger existente da fase TT-004).

## Mapeamento de erros

| Origem                        | Categoria     | Mensagem PT-BR                                                          |
| ----------------------------- | ------------- | ------------------------------------------------------------------------ |
| `42501` / "System Admin"      | `denied`      | "Somente System Admin ativo pode criar organizações."                    |
| `23505` / duplicate / unique  | `conflict`    | "Já existe uma organização com essa razão social."                       |
| `23514` / `22P02`             | `validation`  | "Dados inválidos. Revise os campos e tente novamente."                   |
| qualquer outro                | `unknown`     | "Não foi possível criar a organização agora. Tente novamente em instantes." |

O detalhe cru do PostgREST **nunca** é exibido: o texto pré-aprovado do
usuário evita enumeração e vazamento de constraints.

## Auditoria

`public.create_organization` é `SECURITY DEFINER` e faz apenas um `INSERT`
em `public.organizations`. Os triggers de auditoria da TT-004 registram o
evento em `public.audit_events` com o `auth.uid()` do chamador — o
frontend não precisa registrar auditoria adicional.

## Migration local

`db/migrations/20260721100000_us005_organizations_and_roles.sql` é um
espelho **idempotente** do estado remoto (`profiles.role`, enums
`app_role` e `organization_status`, colunas estendidas de
`organizations`, RPC `create_organization`). Não deve ser reaplicada
contra o banco remoto — existe para manter o histórico versionado.
