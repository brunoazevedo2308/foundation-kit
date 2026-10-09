# DP Suite — Runbook de produção

Última revisão: 2026-10-09.

## 1. Objetivo

Este documento é a referência operacional para publicar, verificar, diagnosticar e recuperar o DP Suite. Ele não substitui os procedimentos detalhados de [observabilidade](./observability.md), [backup e restauração](./backup-restore.md), [homologação](./staging-runbook.md) ou [LGPD](./lgpd.md).

Princípios:

- GitHub é a fonte da verdade para código, migrations e histórico de revisão;
- Supabase é a fonte da verdade do estado do banco, Auth, Storage e Edge Functions;
- Vercel hospeda o aplicativo e associa `app.callyvon.com` à implantação de produção;
- nenhum segredo, token, URL assinada, senha ou dado de cliente entra em issue, PR, log ou artifact;
- mudanças de produção devem ser pequenas, revisadas, testadas e reversíveis;
- restauração destrutiva, exclusão de branch, rotação emergencial e merge de banco exigem autorização explícita.

## 2. Ambientes e contatos

| Ambiente | Aplicação                  | Supabase                                    | Uso                          |
| -------- | -------------------------- | ------------------------------------------- | ---------------------------- |
| Produção | `https://app.callyvon.com` | `lyxonmqsldtsixdhcaww`                      | usuários e dados reais       |
| Staging  | preview Vercel do PR       | `ggehwncqjetinynwlqhj` / `dp-suite-staging` | migrations, RLS e smoke test |
| Local    | `http://127.0.0.1:8080`    | stack local ou projeto autorizado           | desenvolvimento              |

Contato administrativo atual: `admin@callyvon.com`.

Antes do lançamento comercial, preencher:

- responsável operacional primário e substituto;
- telefone/canal de emergência;
- responsável de privacidade;
- fornecedor/contato jurídico;
- janela de manutenção comunicada aos clientes.

## 3. Classificação de incidentes

| Severidade | Exemplo                                                            | Resposta inicial                        | Atualização           |
| ---------- | ------------------------------------------------------------------ | --------------------------------------- | --------------------- |
| SEV-1      | indisponibilidade total, vazamento confirmado, acesso cross-tenant | imediata; conter e preservar evidências | a cada 30 min         |
| SEV-2      | login/upload indisponível, degradação ampla, perda parcial         | até 30 min                              | a cada 60 min         |
| SEV-3      | erro localizado com alternativa, usuário isolado                   | mesmo dia útil                          | quando houver mudança |
| SEV-4      | defeito visual ou melhoria sem impacto operacional                 | backlog normal                          | no ciclo do produto   |

Para incidente de dados pessoais, seguir também `docs/lgpd.md`: avaliar risco relevante, envolver responsável executivo/jurídico e manter o registro exigido, sem aguardar a análise jurídica final do produto.

## 4. Checklist diário e semanal

### Diário

- confirmar que `https://app.callyvon.com/api/health` responde `200` com `status=ok`;
- verificar falhas em **GitHub Actions → Production Monitoring**;
- verificar falhas no workflow **Storage Backup**;
- revisar alertas de implantação e erros recentes na Vercel;
- revisar Auth/API/Storage/Postgres logs do Supabase quando houver relato.

### Semanal

- confirmar um backup de Storage verde com menos de 36 horas;
- confirmar backup de banco disponível no painel do Supabase;
- verificar expiração, volume e acesso aos artifacts criptografados;
- revisar usuários administradores e remover acessos sem necessidade;
- revisar Advisors de segurança e performance do Supabase;
- executar manualmente o monitoramento de produção e registrar o resultado.

### Mensal/trimestral

- mensal: executar readiness de backup e revisar uso/custo de Vercel e Supabase;
- trimestral: ensaiar restauração em ambiente isolado e medir RPO/RTO;
- trimestral: revisar chaves S3, secrets e permissões do GitHub/Vercel/Supabase;
- após mudança estrutural ou incidente: repetir smoke test e ensaio afetado.

## 5. Mudança padrão: código sem migration

1. Criar branch `codex/<tema>` a partir da `main` atual.
2. Implementar e executar `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build`.
3. Abrir PR com escopo, risco, verificação e rollback.
4. Validar a Preview da Vercel usando dados de staging.
5. Executar o smoke test das áreas alteradas.
6. Confirmar CI verde e ausência de secrets no diff/logs.
7. Fazer merge somente após aprovação.
8. Acompanhar a implantação automática da `main` e confirmar o commit publicado.
9. Executar `GET /api/health`, entrada pública e smoke test mínimo.
10. Observar logs e monitoramento por pelo menos 15 minutos.

Se o health check falhar, interromper o rollout e seguir **Rollback da aplicação**.

## 6. Mudança com migration Supabase

Nunca experimentar DDL diretamente em produção.

1. Consultar documentação oficial e changelog do Supabase.
2. Criar a migration com `supabase migration new <nome>`.
3. Definir constraints, índices, grants e RLS explícitos; tabela em `public` nunca pode ficar exposta sem RLS.
4. Aplicar primeiro no `dp-suite-staging`.
5. Testar papéis `system_admin`, `organization_admin` e `member`, incluindo tentativa cross-tenant e rollback do dado de teste.
6. Executar Supabase Security e Performance Advisors.
7. Gerar/atualizar os tipos TypeScript e validar frontend.
8. Abrir PR; conferir se a versão da migration local corresponde ao histórico de staging.
9. Antes de produção, registrar backup disponível e plano de rollback/forward-fix.
10. Aplicar a migration em produção uma única vez e confirmar no histórico remoto.
11. Validar tabela/policies/grants, health e smoke test antes de liberar o frontend dependente.

Preferir migrations compatíveis com a versão anterior do aplicativo. Para mudanças destrutivas, usar expansão/contração em releases separadas: primeiro adicionar, depois migrar uso e somente em outro ciclo remover.

Rollback de schema não deve apagar dados automaticamente. Em produção, preferir uma migration corretiva `forward-fix`. Restore físico é último recurso e segue `docs/backup-restore.md`.

## 7. Edge Functions, Auth e SMTP

### Edge Function `invite-user`

Após mudança:

- implantar primeiro em staging;
- confirmar `APP_ENV` e `APP_URL` do ambiente;
- em produção, `APP_URL` deve ser exatamente `https://app.callyvon.com`;
- nunca expor `SUPABASE_SERVICE_ROLE_KEY`; ela existe apenas no secret store do Supabase;
- testar convite por `organization_admin`, negar `member` e conferir auditoria;
- confirmar que o link termina em `/reset-password` na origem correta.

O fallback versionado de `APP_URL` é apenas defensivo; produção nunca deve depender dele.

### Auth/SMTP

Verificar depois de mudanças de domínio, Resend ou Supabase Auth:

- Site URL e Redirect URLs incluem `https://app.callyvon.com` e `/reset-password`;
- domínio do remetente continua verificado no Resend;
- host, porta, usuário, senha e remetente estão configurados somente no Supabase;
- recuperação de senha chega, abre uma única vez e finaliza em `/login`;
- convite chega, permite definir senha e cria/ativa apenas o perfil esperado;
- logs não exibem conteúdo ou tokens dos links.

Em falha de e-mail, não repetir convites em massa. Verificar primeiro Resend, limites do Supabase e configuração SMTP; depois reenviar um único teste.

## 8. Smoke test de produção

Executar com contas de teste identificáveis e sem dados reais sensíveis:

1. `GET /api/health` retorna `200`, ambiente `production`, app e Auth `ok`.
2. Login válido abre `/dashboard`; login inválido usa mensagem genérica.
3. `member` não vê controles administrativos e não grava entidades restritas.
4. `organization_admin` lista usuários e executa uma leitura operacional.
5. Abrir uma ação, baixar arquivo existente por URL assinada e confirmar expiração.
6. Fazer upload de arquivo de teste sem dados pessoais e removê-lo logicamente quando aplicável.
7. Recuperação de senha e convite usam `app.callyvon.com`.
8. Busca, notificações e relatório respeitam o mesmo tenant.
9. Central de Privacidade registra pedido e mantém detalhes invisíveis a outro membro.
10. Monitoramento manual fica verde após o teste.

Registrar commit, horário UTC, executor, contas/papéis usados e resultado; nunca registrar senhas ou tokens.

## 9. Triagem por sintoma

### Aplicação ou domínio indisponível

1. Executar Production Monitoring manualmente.
2. Conferir domínio e última implantação na Vercel.
3. Inspecionar build/runtime logs pelo horário UTC.
4. Se a implantação atual causou a falha, executar rollback.
5. Se DNS/TLS for a causa, não alterar o banco; validar registros e certificado.

### Health `503` com `supabase_auth=error`

1. Verificar status do projeto e Auth logs no Supabase.
2. Confirmar variáveis Production da Vercel sem imprimir seus valores.
3. Verificar mudança recente em URL/publishable key.
4. Não trocar para `service_role` como correção.

### Login, convite ou recuperação falha

1. Identificar se é credencial, status do perfil, redirect ou entrega de e-mail.
2. Consultar Auth logs no período UTC.
3. Verificar Resend e configuração SMTP sem copiar tokens.
4. Confirmar `profiles.status`, `deleted_at` e organização sob acesso administrativo autorizado.
5. Manter mensagens públicas genéricas para evitar enumeração de usuários.

### Upload/download falha

1. Verificar MIME/tamanho e caminho canônico.
2. Consultar Storage e API logs.
3. Confirmar bucket privado, metadata e RLS.
4. Verificar se houve cleanup compensatório.
5. Nunca tornar o bucket público como solução temporária.

### Suspeita de acesso cross-tenant

1. Declarar SEV-1 e preservar logs; não reproduzir com dados reais.
2. Suspender a operação afetada quando possível, sem destruir evidências.
3. Identificar tabela, policy, usuário, organização e intervalo de tempo.
4. Reproduzir somente em staging com dados sintéticos e transação com rollback.
5. Corrigir RLS/grants, executar teste cross-tenant e Advisors.
6. Avaliar incidente LGPD e comunicação regulatória.

## 10. Rollback da aplicação Vercel

Antes do rollback, confirmar equipe, projeto, implantação atual, commit e alvo conhecido como saudável.

- Dashboard: selecionar uma implantação anterior saudável e promover/rollback conforme a interface disponível.
- CLI autenticada: `vercel rollback <deployment-url-or-id>`.
- Inspeção: `vercel inspect <deployment-url>` e `vercel logs <deployment-url>`.

Depois do rollback:

1. confirmar `app.callyvon.com` apontando para o alvo esperado;
2. repetir health e smoke mínimo;
3. observar que o rollback desativa a atribuição automática de novas implantações até uma promoção restaurar o fluxo;
4. abrir correção em nova branch; não reescrever histórico compartilhado;
5. usar `vercel promote <deployment-url-or-id>` somente após testar o novo alvo.

Referências: [rollbacks](https://vercel.com/docs/deployments/rollback-a-deployment) e [promoção de deployments](https://vercel.com/docs/deployments/promoting-a-deployment).

## 11. Backup, restauração e perda de dados

- banco/Auth: usar backups Supabase e o procedimento detalhado de restauração;
- arquivos: usar o artifact criptografado diário do GitHub;
- migrations/código: recuperar do GitHub;
- configurações Auth, SMTP, Edge secrets e variáveis Vercel: conferir/recriar separadamente.

Nunca restaurar diretamente em produção como teste. Antes de restore destrutivo: bloquear novas escritas, calcular perda máxima, preservar estado atual, obter autorização explícita e preparar reconciliação posterior.

Metas iniciais: RPO de até 24 horas e RTO de até 4 horas, sujeitos a revisão após crescimento de volume.

## 12. Segurança e rotação de credenciais

Rotacionar imediatamente quando houver exposição confirmada ou suspeita:

- senha SMTP/Resend;
- chaves S3 do Storage;
- passphrase do backup;
- secrets de Edge Functions;
- tokens administrativos GitHub/Vercel/Supabase.

Após rotação, atualizar somente os cofres corretos, executar um fluxo controlado e revogar a credencial anterior. A publishable key pode aparecer no bundle, mas continua proibido substituir a segurança de RLS por obscuridade da chave.

## 13. Encerramento de incidente

Um incidente só é encerrado quando:

- serviço e dados foram validados;
- causa e impacto foram registrados;
- medidas temporárias foram removidas;
- credenciais expostas foram rotacionadas;
- smoke/monitoramento/backup aplicáveis estão verdes;
- ações corretivas têm responsável e prazo;
- a necessidade de comunicação LGPD foi decidida e documentada.

Produzir post-mortem sem dados pessoais: linha do tempo UTC, detecção, impacto, causa raiz, resolução, o que funcionou, o que falhou e ações preventivas.

## 14. Gate de lançamento do MVP

Antes de declarar o MVP pronto:

- [ ] CI e E2E automatizado verdes;
- [ ] smoke test de produção aprovado;
- [ ] monitoramento e backup com execuções recentes verdes;
- [ ] restauração ensaiada e documentada;
- [ ] runbook revisado por responsável operacional;
- [ ] pendências LGPD jurídicas concluídas: CNPJ/endereço, canal, contratos, retenção e revisão do aviso;
- [ ] responsáveis e contatos de emergência preenchidos;
- [ ] plano de rollback conhecido e testável.
