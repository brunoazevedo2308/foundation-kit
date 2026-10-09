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
- RPO de arquivos: até 24 horas após a primeira execução diária aprovada;
- RTO de arquivos: até 4 horas para o volume inicial do MVP, sujeito a novo
  ensaio quando o volume crescer.

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
migração. Os backups físicos do Supabase não incluem os binários do Storage;
por isso o workflow `Storage Backup` mantém uma cópia diária criptografada fora
do Supabase.

## Backup automatizado do Storage

O workflow `.github/workflows/storage-backup.yml` executa diariamente às
03:17 UTC e também aceita execução manual. Ele:

1. enumera todos os buckets pelo endpoint S3 do projeto principal;
2. baixa todos os objetos para o runner temporário;
3. gera checksums SHA-256 e um manifesto com data, projeto e contagens;
4. cria um arquivo `tar.gz` e o criptografa com AES-256-CBC/PBKDF2;
5. publica somente o arquivo criptografado e seu checksum como artefato do
   GitHub, com retenção de 30 dias;
6. elimina o runner temporário automaticamente ao fim da execução.

São necessários três GitHub Actions secrets no repositório:

- `SUPABASE_STORAGE_ACCESS_KEY_ID`;
- `SUPABASE_STORAGE_SECRET_ACCESS_KEY`;
- `STORAGE_BACKUP_PASSPHRASE`.

O repositório é público. Portanto, o workflow nunca envia o arquivo aberto, o
manifesto nem nomes de objetos ao artefato; apenas o conteúdo cifrado deixa o
runner. Ainda assim, o acesso ao repositório e aos artefatos deve ser revisado
periodicamente.

As duas primeiras credenciais são geradas em **Supabase > Storage > Settings >
S3 access keys** e têm acesso total aos buckets, ignorando RLS. Use-as apenas no
GitHub Actions, restrinja o acesso administrativo ao repositório e faça rotação
imediata se houver suspeita de exposição. A passphrase deve ser aleatória, ter
pelo menos 32 caracteres e ser guardada também no cofre administrativo; sem
ela, o backup não pode ser restaurado.

### Verificação diária

Uma execução só é aprovada quando:

- o job termina em verde;
- o resumo informa pelo menos os buckets esperados;
- o artefato contém um `.tar.gz.enc` e um `.sha256`;
- a execução não exibe credenciais nos logs.

O GitHub envia falhas do workflow conforme as notificações configuradas para o
repositório. A checagem operacional semanal deve confirmar que há uma execução
verde com menos de 36 horas.

### Restaurar arquivos em ambiente isolado

Nunca restaure diretamente em Production. Baixe o artefato de uma execução,
confira o checksum e use um destino S3 isolado:

```bash
sha256sum --check dp-suite-storage-<run-id>.tar.gz.enc.sha256
openssl enc -d -aes-256-cbc -pbkdf2 -iter 210000 \
  -in dp-suite-storage-<run-id>.tar.gz.enc \
  -out dp-suite-storage-<run-id>.tar.gz \
  -pass env:STORAGE_BACKUP_PASSPHRASE
mkdir restored-storage
tar -xzf dp-suite-storage-<run-id>.tar.gz -C restored-storage
(cd restored-storage && sha256sum --check SHA256SUMS)
```

Depois, para cada diretório em `restored-storage/buckets/<bucket>`, use
`aws s3 sync` contra o endpoint S3 do projeto isolado. Confirme contagem,
checksums, políticas/RLS e download autenticado antes de aprovar o ensaio. Uma
restauração em Production exige declaração de incidente e autorização
explícita, pois pode sobrescrever objetos atuais.

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

- semanal: confirmar que existem backup físico e artefato de Storage aprovados
  com menos de 36 horas;
- mensal: executar a query de readiness nos ambientes ativos;
- trimestral: restaurar em destino isolado e cronometrar o exercício;
- após incidente ou mudança estrutural: repetir o ensaio antes do próximo
  lançamento.
