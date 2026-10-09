# DP Suite — Backup e restauração

Última revisão: 2026-10-08.

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
- sem objetos no Storage na auditoria de 2026-10-08.

### Branch — `dp-suite-staging`

- project ref: `ggehwncqjetinynwlqhj`;
- tipo informado pela API: preview não persistente (`persistent=false`);
- contém os dados usados na homologação e no lançamento inicial;
- 32 migrations, com última versão `20260919222852`;
- 12 tabelas esperadas e todas com RLS;
- dois objetos no Storage na auditoria de 2026-10-08.

Trate essa branch como banco ativo até auditar as variáveis Production da
Vercel. Branches de preview são ambientes temporários: apagar, recriar ou
resetar a branch pode eliminar seus dados. Por isso, não executar
`reset_branch`, `delete_branch`, merge ou restore nela durante a migração.

## Risco bloqueador antes de dados reais

O projeto com backups diários confirmados e a branch que contém o dataset do
lançamento não são o mesmo ambiente. O fluxo recomendado, sem contratar um
novo projeto mensal, é:

1. auditar qual project ref está configurado no ambiente Production da Vercel;
2. abrir uma janela de manutenção e interromper novas escritas;
3. gerar export lógico completo da branch `ggeh...` (roles, schema, dados e
   histórico de migrations);
4. preservar os dois objetos do Storage separadamente;
5. restaurar o export no projeto principal `lyxon...` somente após confirmar um
   ponto de retorno do estado atual;
6. executar `db/tests/backup_restore_readiness.sql` no destino;
7. testar login, isolamento RLS, download dos dois objetos e fluxos críticos;
8. trocar as variáveis Production da Vercel para o destino validado;
9. manter a origem intacta por pelo menos 72 horas antes de desativá-la.

A restauração no projeto principal é destrutiva e pode deixar o serviço
indisponível. Ela exige confirmação específica no momento da execução. Nunca
copie connection strings, senhas do Postgres ou dumps para o GitHub.

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
