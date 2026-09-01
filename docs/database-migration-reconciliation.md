# Reconciliação das migrations do Supabase

## Resultado da auditoria

Em 2026-08-30, o projeto remoto `dp-suite-dev` tinha 26 migrations aplicadas e schema operacional saudável. A auditoria inicial encontrou 24 arquivos em `db/migrations`; o espelho ausente de Deliverables foi recuperado depois, totalizando 25 arquivos históricos. A maior parte representa o mesmo DDL com timestamps ou nomes diferentes; alguns passos remotos foram consolidados em um único arquivo local.

Por isso, `db/migrations` continua sendo um conjunto de espelhos históricos. A cadeia executável fica em `supabase/migrations`, com os 26 timestamps e nomes do histórico remoto.

## Divergências relevantes

- `add_safe_profile_provisioning` e `reconcile_profile_provisioning_metadata` aparecem localmente com nomes diferentes.
- `add_system_admin_organization_creation` e `harden_create_organization_rpc_grants` foram consolidadas em `20260721100000_us005_organizations_and_roles.sql`.
- `harden_deliverables_admin_writes_and_audit` existia apenas no remoto; foi acrescentada ao repositório com o timestamp remoto `20260809140820`.
- A migration local de Evidências e Attachments combina hardening e auditoria que aparecem separadamente no histórico remoto.
- O cabeçalho da migration do bucket `attachments-private` estava desatualizado; o bucket já está aplicado no Development.

## Estado da normalização

- Supabase CLI `2.116.0` está fixada nas dependências de desenvolvimento.
- `supabase/config.toml` define Postgres 17, Data API sem exposição automática e Auth local na porta do app (`8080`).
- `supabase/migrations` contém as 26 versões remotas em ordem.
- A etapa remota separada `20260721064853_harden_create_organization_rpc_grants.sql` foi recuperada do histórico aplicado.
- Ainda falta o gate decisivo: replay completo em banco vazio seguido dos testes SQL.

## Procedimento de validação

Antes da primeira migration nova de schema:

1. Autenticar a Supabase CLI em um ambiente seguro.
2. Fazer `supabase link --project-ref lyxonmqsldtsixdhcaww` somente para comparação.
3. Confirmar com `supabase migration list` que as 26 versões locais correspondem ao histórico remoto.
4. Validar `supabase/migrations` em um projeto/branch Supabase vazio e executar os testes SQL de `db/tests`.
5. Comparar o schema reconstruído com Development e registrar qualquer diferença antes de promover DDL novo.
6. Só então criar migrations novas com `supabase migration new <nome>` e promover Development → Staging → Production.

Não use `migration repair`, reset de banco ou alteração manual da tabela de histórico sem revisão explícita: essas operações podem mascarar drift ou perder dados.

## Segurança observada

- Todas as 12 tabelas públicas têm RLS habilitada.
- O frontend usa somente chave publishable e não contém `service_role`.
- O RPC `create_organization` é `SECURITY DEFINER`, mas valida `auth.uid()` e `private.is_system_admin()` antes de qualquer escrita; permanece um ponto de revisão obrigatória.
- Os grants de Data API ainda refletem o padrão legado, incluindo acesso de objeto para `anon` e privilégios físicos de `DELETE`. As policies impedem acesso indevido, mas uma migration futura deve aplicar grants mínimos depois da baseline e de testes E2E.
- A proteção contra senhas vazadas está desabilitada e deve ser ativada antes de produção.
