# Saída da Lovable

## Estado

Desde 2026-08-30, o DP Suite pode ser instalado, desenvolvido, testado e compilado sem a Lovable. O GitHub é a fonte de verdade do código e o Supabase é a fonte de verdade dos dados, Auth, Storage e estado aplicado do banco.

## O que foi removido

- `@lovable.dev/vite-tanstack-config`, substituído pelos plugins oficiais do TanStack Start, Vite, React, Tailwind e Nitro.
- `@lovable.dev/mcp-js` e suas rotas MCP geradas. As ferramentas `echo` e `get_status` serviam à integração do editor e não faziam parte do PRD do MVP.
- Telemetria `window.__lovableEvents` e `window.__lovableReportRuntimeError`. Erros de UI agora seguem apenas a taxonomia sanitizada em `src/lib/observability.ts`.
- `bun.lock` e `bunfig.toml`, que apontavam para caches privados. O projeto usa `pnpm-lock.yaml`, resolvido pelo registro público.
- Instruções de sincronização com o editor no `AGENTS.md`.

## Fluxo operacional

1. Criar uma branch `codex/*` ou outra branch de feature a partir da branch principal.
2. Executar `pnpm install --frozen-lockfile` com Node.js 22.12 ou superior.
3. Antes de abrir PR, executar `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build`.
4. Publicar o bundle Nitro `cloudflare-module` somente a partir de uma branch revisada e com variáveis do ambiente de destino configuradas.
5. Alterações de banco devem ser aditivas, versionadas e validadas primeiro fora de produção. O histórico remoto nunca deve ser reescrito.

O workflow `.github/workflows/ci.yml` repete os quatro checks em todo pull request e em pushes para `main`.

## Pendências antes de produção

- Provisionar um projeto Supabase separado para Staging.
- Capturar uma baseline canônica do banco com Supabase CLI; os arquivos atuais em `db/migrations` são espelhos históricos e seus timestamps não coincidem integralmente com o histórico remoto. Consulte `docs/database-migration-reconciliation.md`.
- Executar E2E autenticado com perfis `system_admin`, `organization_admin` e `member`.
- Definir o domínio e o pipeline de deploy do Cloudflare; o build já gera `dist/server/wrangler.json`, mas nenhum deploy é automático.
- Ativar proteção contra senhas vazadas no Supabase Auth antes da abertura pública.

## Compatibilidade temporária

O repositório ainda pode continuar conectado ao projeto histórico na Lovable, mas essa conexão não é necessária e não deve ser tratada como fonte de verdade. Nenhum pacote, endpoint ou hook de runtime da Lovable permanece no aplicativo.
