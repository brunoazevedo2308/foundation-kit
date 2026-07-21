# DP Suite — Observabilidade mínima (TT-008)

Este documento descreve a fundação de observabilidade do frontend do DP
Suite. É intencionalmente mínima: sem serviços pagos, sem endpoint
externo, sem service_role. Um transport seguro próprio pode ser
adicionado depois sem quebrar chamadores.

## Taxonomia mínima de eventos

Nome canônico definido em `src/lib/observability.ts` (tipo `EventName`).

| Evento                                    | Severidade padrão | Quando é emitido                                                     |
| ----------------------------------------- | ----------------- | -------------------------------------------------------------------- |
| `auth.login.attempt`                      | `info`            | Usuário submete o formulário de login                                |
| `auth.login.success`                      | `info`            | Login concluído com perfil ativo                                     |
| `auth.login.failure`                      | `error`           | Falha de credencial ou erro do provider                              |
| `auth.logout`                             | `info`            | Sessão encerrada pelo usuário                                        |
| `auth.session.restored`                   | `info`            | Sessão restaurada em rota protegida                                  |
| `auth.session.invalid`                    | `error`           | Sessão ausente/expirada ao acessar rota protegida                    |
| `auth.profile.blocked`                    | `error`           | Perfil ausente / `inactive` / `blocked` no gate                      |
| `backend.request.failure`                 | `error`           | Falha genérica em request ao Supabase (auth/db/storage)              |
| `storage.upload.success`                  | `info`            | Upload de evidência concluído                                        |
| `storage.upload.failure`                  | `error`           | Falha na inserção de metadata ou no `storage.upload`                 |
| `storage.upload.compensating_cleanup`     | `warning`         | Limpeza compensatória disparada após falha de upload                 |
| `storage.signed_url.failure`              | `error`           | `createSignedUrl` falhou                                             |
| `notifications.dispatch.failure`          | `error`           | (reservado) Falha ao despachar uma notificação — a instrumentar      |
| `ui.error_boundary.caught`                | `critical`        | Erro capturado pelo `GlobalErrorBoundary` ou boundary do root        |
| `dev.controlled_error`                    | `error`           | Diagnóstico manual em `/dev/observability` (apenas Development)      |

## Severidades

`debug` · `info` · `warning` · `error` · `critical`. `critical` é
reservado para incidentes de renderização (Error Boundary) — nenhum
evento funcional deve escalar para essa severidade automaticamente.

## Campos permitidos

Todo evento contém obrigatoriamente:

- `event_name`
- `severity`
- `timestamp` (ISO)
- `environment` (`development` | `staging` | `production`)
- `correlation_id`

Opcionais, quando disponíveis:

- `user_id` (UUID do usuário)
- `organization_id` (UUID da organização)
- `context` — objeto sanitizado com no máximo profundidade 5 e 50 chaves
  por nível; strings acima de 500 caracteres são truncadas.

## Dados proibidos (nunca logar)

Sanitização recursiva redige qualquer chave que corresponda a um dos
padrões abaixo (case-insensitive):

- `password`, `pass`
- `token`, `access_token`, `refresh_token`, `id_token`
- `authorization`, `auth`, `cookie`, `set-cookie`
- `apiKey`, `api_key`, `secret`, `service_role`, `credential`
- `signedUrl`, `signed_url`
- `session`

Adicionalmente:

- **E-mails**: nunca envie o e-mail completo do usuário. Se o domínio
  for útil, use `maskEmail()` (ex.: `***@example.com`).
- **Signed URLs**: nunca envie a URL completa; use `maskSignedUrl()`,
  que preserva apenas `origin + pathname` e descarta o query string
  contendo o token de assinatura.
- **Conteúdo de arquivos**: nunca. Apenas `file_name`, `mime_type` e
  `size_bytes` são permitidos.
- **Payloads brutos do Supabase**: não repasse `data`/`error` completos
  do supabase-js. Extraia o mínimo (código, status) e sanitize.

## Correlation IDs

- `getSessionCorrelationId()` retorna um UUID estável enquanto a página
  não é recarregada — útil para agrupar eventos do mesmo usuário.
- `generateCorrelationId()` gera um novo UUID por operação (fluxo de
  login, upload, etc.).
- O `GlobalErrorBoundary` mostra o correlation ID diretamente na tela
  para o usuário informar ao suporte.

## Como consultar logs no Supabase

- **Auth logs**: Supabase Studio → *Authentication* → *Logs*. Filtre por
  janela de tempo e por e-mail conhecido do usuário afetado.
- **API/PostgREST logs**: Supabase Studio → *Logs* → *API*. Útil para
  falhas RLS (respostas 401/403/42501).
- **Storage logs**: Supabase Studio → *Logs* → *Storage*. Verifique
  falhas de política em `storage.objects` (bucket `evidences-private`)
  e mensagens de upload.
- **Postgres logs**: *Logs* → *Postgres*. Para triggers e integridade
  cross-org.

Cruze pelo `timestamp` do evento frontend (ISO UTC) e pelo `user_id`
quando presente. O `correlation_id` é do frontend — o Supabase não o
propaga hoje, mas serve como âncora quando o usuário reporta o problema.

## Reproduzir e diagnosticar um erro conhecido

Exemplo: usuário reporta que "o upload de evidência falhou".

1. Peça o correlation ID exibido na tela ou no console.
2. Localize o evento `storage.upload.failure` correspondente.
3. Verifique se houve `storage.upload.compensating_cleanup` na sequência
   (indica que a metadata foi soft-deletada).
4. Nos logs de Storage do Supabase, confirme se a RLS rejeitou o path
   canônico (mismatch com `organization/{org}/actions/...`).
5. Nos logs de API, procure o `insert` em `public.evidences` — se
   sucesso e o upload falhou, o cleanup deveria ter marcado
   `deleted_at`. Se cleanup também falhou, o evento vem com contexto
   `{ uploadError, cleanupError }` e é caso para admin reconciliar.

## Checklists

### Development

- [x] Console estruturado ativo (`consoleTransport`)
- [x] Rota `/dev/observability` disponível para disparar eventos e
      Error Boundary controladamente
- [x] Sanitização coberta por testes unitários
- [x] Instrumentação de auth, gate de perfil e evidence-storage

### Staging

- [ ] **Pendente**: Staging ainda não provisionado — este checklist
      permanece aberto até `VITE_APP_ENV=staging` estar disponível.
- [ ] Transport seguro de longo prazo (rota interna própria, sem
      service_role, sem serviço externo pago) definido e homologado.
- [ ] Verificar que o console não emite eventos em Staging
      (`consoleTransport` é substituído por `noopTransport` até que o
      transport definitivo seja aprovado).
- [ ] Fumaça: login inválido, login válido, perfil inativo, upload
      OK, upload com falha simulada. Confirmar correlation IDs
      correspondentes nos logs do Supabase (Auth/API/Storage).

## Limitações conhecidas

- O transport em staging/production é intencionalmente **no-op**. Não
  há ainda persistência de eventos no backend. Adicionar isso exige
  uma tabela e políticas RLS próprias — fora do escopo desta entrega.
- `correlation_id` é frontend-only. Propagar para requests Supabase
  exigiria header custom, o que hoje o cliente supabase-js não expõe
  por chamada de forma consistente.
- Não foram integrados Sentry, Datadog, LogRocket ou outros SaaS —
  proibido nesta entrega.
