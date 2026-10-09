# DP Suite — Backup e restauração

Última revisão: 2026-10-09.

## Objetivo e limites

Este runbook protege o banco PostgreSQL, usuários do Auth, migrations e
metadados do Storage. Os backups de banco do Supabase **não incluem os arquivos
binários** armazenados pela Storage API; eles preservam apenas as linhas de
metadados. Evidências e anexos precisam de cópia própria antes de o MVP receber
dados de clientes.

Metas operacionais iniciais:

- RPO do banco/Auth: até 24 horas, conforme o backup diário;
- RTO do banco/Auth: até 4 horas para um incidente pequeno do MVP;
- RPO/RTO de arquivos: não garantido até a cópia externa do Storage estar
  configurada e testada.

PITR não faz parte da baseline do MVP. Ele é um add-on pago e só deve ser
ativado após aprovação explícita de custo.

## Estado verificado

### Projeto principal — `dp-suite-dev`

- project ref: `lyxonmqsldtsixdhcaww`;
- branch: `main / PRODUCTION`;
- plano: Pro;
- backups físicos diários visíveis no painel entre 2026-10-01 e 2026-10-08;
- 32 migrations, com última versão `20260919222852`;
- 12 tabelas de domínio esperadas e todas com RLS;
- buckets privados `evidences-private` e `attachments-private` presentes;
- dados operacionais de homologação migrados em 2026-10-09;
- dois objetos no Storage, ambos com 225 bytes e MD5
  `464aeb7c273d598b85ce115648496a49`;
- `db/tests/backup_restore_readiness.sql` aprovado após a migração;
- `app.callyvon.com` auditado apontando para este projeto.

### Branch — `dp-suite-staging`

- project ref: `ggehwncqjetinynwlqhj`;
- tipo informado pela API: preview não persistente (`persistent=false`);
- preserva temporariamente a origem dos dados usados na homologação;
- 32 migrations, com última versão `20260919222852`;
- 12 tabelas esperadas e todas com RLS;
- dois objetos no Storage na auditoria de 2026-10-08.

Essa branch não é mais o banco ativo da aplicação. Mantenha-a intacta durante a
janela de retenção pós-migração. Branches de preview são ambientes temporários:
apagar, recriar ou resetar a branch pode eliminar seus dados.

## Migração concluída

Em 2026-10-09, o dataset operacional foi migrado de `ggeh...` para
`lyxon...`. A operação:

1. preservou os quatro usuários, senhas e sessões existentes em Production;
2. remapeou referências de usuário por e-mail e a organização pelo slug
   `callyvon`;
3. transferiu cliente, embarcação, ação, entregável, comentários, notificações
   e eventos de auditoria;
4. recriou o anexo e a evidência nos buckets privados do projeto principal;
5. conferiu tamanho e checksum dos objetos contra a origem;
6. validou migrations, tabelas, RLS, buckets, integridade referencial e o
   dashboard autenticado.

A branch de origem deve permanecer intacta por pelo menos 72 horas após a
migração. A cópia externa automatizada dos arquivos continua pendente; os
backups físicos do Supabase não incluem os binários do Storage.

## Export lógico oficial

Use uma connection string direta, armazenada apenas em variável local, e a CLI
fixada no repositório. Descubra os flags na versão instalada antes de executar.
O fluxo oficial separa roles, schema e dados:

```bash
supabase db dump --db-url "$SOURCE_DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$SOURCE_DB_URL" -f schema.sql
supabase db dump --db-url "$SOURCE_DB_URL" -f data.sql --use-copy --data-only \
  -x "storage.buckets_vectors" -x "storage.vector_indexes"
supabase db dump --db-url "$SOURCE_DB_URL" -f history_schema.sql \
  --schema supabase_migrations
supabase db dump --db-url "$SOURCE_DB_URL" -f history_data.sql --use-copy \
  --data-only --schema supabase_migrations
```

Os arquivos devem ficar em diretório temporário criptografado, fora do
repositório, com permissão restrita, checksum e data de expiração. Ao final do
teste, eliminar as cópias temporárias de forma segura.

## Ensaio de restauração

Nunca ensaie em Production. Use um projeto temporário vazio ou um destino
isolado autorizado.

1. Registre backup escolhido, horário UTC e responsável.
2. Restaure roles, schema, dados e histórico com `psql --single-transaction
--variable ON_ERROR_STOP=1`.
3. Reconfigure Auth, SMTP, URLs permitidas, Edge Functions e secrets; esses
   itens não são garantidos por um restore lógico.
4. Recrie/copie objetos de Storage e confira o total esperado.
5. Execute `db/tests/backup_restore_readiness.sql`.
6. Rode os testes cross-tenant e o smoke test autenticado.
7. Registre duração, divergências e decisão de aprovar/rejeitar o restore.
8. Destrua o ambiente temporário apenas depois de preservar o relatório do
   ensaio; nunca preserve o dump no repositório.

## Restauração emergencial pelo painel

Uma restauração física no mesmo projeto causa indisponibilidade e substitui o
estado atual. Antes de clicar em **Restore**:

1. declarar incidente e bloquear novas escritas;
2. definir o instante anterior ao erro e calcular a perda máxima de dados;
3. confirmar que subscriptions/replication slots externos foram tratados;
4. obter aprovação explícita para o restore destrutivo;
5. restaurar o backup mais próximo anterior ao incidente;
6. executar a verificação SQL e o smoke test;
7. reconciliar transações ocorridas depois do ponto recuperado;
8. reabrir o aplicativo e encerrar o incidente.

Quando disponível e financeiramente aprovado, **Restore to a new project** é
preferível para inspeção e recuperação seletiva, porque mantém a origem
intacta. Mesmo nesse modo, arquivos do Storage, configurações de Auth, Edge
Functions, secrets e integrações exigem validação separada.

## Cadência

- semanal: confirmar que existe backup físico com menos de 36 horas;
- mensal: executar a query de readiness nos ambientes ativos;
- trimestral: restaurar em destino isolado e cronometrar o exercício;
- após incidente ou mudança estrutural: repetir o ensaio antes do próximo
  lançamento.
