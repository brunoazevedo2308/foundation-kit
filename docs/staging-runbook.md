# DP Suite — Staging runbook

Este runbook descreve a homologação do MVP na branch Supabase
`dp-suite-staging` e a geração de um bundle portátil no GitHub Actions. Nenhum
passo depende da Lovable, Cloudflare ou de outro provedor de hospedagem.

## Estado do backend

- Supabase project ref: `ggehwncqjetinynwlqhj`
- URL: `https://ggehwncqjetinynwlqhj.supabase.co`
- Dados de Production/Development: não copiados
- Persistência da branch: temporária
- Schema: 30 migrations, 12 tabelas públicas com RLS
- Storage: buckets privados `evidences-private` e `attachments-private`

## 1. Configurar o GitHub Environment

Crie um Environment chamado `staging` no repositório e configure:

| Tipo | Nome | Valor |
| --- | --- | --- |
| Variable | `VITE_SUPABASE_URL` | `https://ggehwncqjetinynwlqhj.supabase.co` |
| Secret | `VITE_SUPABASE_PUBLISHABLE_KEY` | publishable key da branch |

Nunca configure uma `service_role` no GitHub ou no frontend. A publishable key
identifica o projeto; RLS e a sessão autenticada continuam sendo a barreira de
acesso aos dados.

## 2. Gerar o bundle de homologação

Antes do merge, aplique o label `build-staging` ao pull request. Depois que o
workflow estiver na branch principal, também será possível abrir
**Actions → Build Staging → Run workflow**.

O workflow:

1. confirma que a URL pertence à branch correta;
2. instala as dependências com lockfile;
3. executa lint, typecheck, testes e build;
4. valida o servidor Node gerado em `dist/server/index.mjs`;
5. armazena o diretório `dist/` como artifact por 14 dias.

O artifact não é uma URL pública. Ele é um pacote validado e independente de
provedor, pronto para uma plataforma que execute Node.js 22.

## 3. Publicar a Preview na Vercel

Importe o repositório `brunoazevedo2308/foundation-kit` na Vercel e confirme o
Framework Preset **TanStack Start**. O arquivo `vercel.json` torna essa detecção
explícita; não configure Output Directory manualmente.

No ambiente **Preview** da Vercel, configure:

- `VITE_APP_ENV=staging`;
- `VITE_SUPABASE_URL=https://ggehwncqjetinynwlqhj.supabase.co`;
- `VITE_SUPABASE_PUBLISHABLE_KEY` com a publishable key da branch.

Esses valores são públicos por contrato do Vite. Nunca adicione uma
`service_role`, secret key ou credencial do banco com prefixo `VITE_`.

Cada atualização da branch do PR cria uma Preview imutável. O merge em `main`
continua separado da homologação e não deve ocorrer antes do E2E.

## 4. Configurar URLs do Supabase Auth

Depois que existir uma URL HTTPS pública, configure no painel da branch:

- **Site URL**: origem pública do app;
- **Redirect URLs**: a mesma origem e, no mínimo, o caminho `/reset-password`.

Não use URLs de Development em Staging. Valide recuperação de senha somente
depois dessas URLs estarem salvas.

## 5. Bootstrap dos usuários de homologação

Siga `db/bootstrap/first_admin.sql.template` para criar a organização inicial
e o primeiro `system_admin`. Crie os usuários pela Auth Admin API ou pelo
Studio; nunca insira manualmente em `auth.users`.

Use contas dedicadas e identificáveis:

- um `system_admin` ativo;
- um `organization_admin` ativo;
- um `member` ativo;
- opcionalmente, um perfil `inactive` e um `blocked` para os gates de login.

Senhas, e-mails reais e chaves não devem ser registrados neste repositório.

## 6. Checklist E2E do MVP

### Sessão e acesso

- login válido redireciona para `/dashboard`;
- logout encerra a sessão;
- recuperação de senha retorna a `/reset-password`;
- perfis inactive, blocked, ausentes ou soft-deleted não acessam rotas privadas.

### System Admin

- lista organizações;
- cria uma organização;
- não acessa dados de outro tenant por consultas comuns.

### Organization Admin

- atualiza configurações da própria organização;
- cria e altera usuários da própria organização;
- gerencia clientes, embarcações, ações, entregáveis, evidências e anexos;
- não consegue referenciar entidades de outra organização.

### Member

- consulta dados autorizados da própria organização;
- cria comentários quando permitido;
- não vê controles administrativos;
- INSERT/UPDATE administrativos são recusados pela RLS mesmo com chamada direta.

### Operação

- dashboard e filtros usam o mesmo recorte;
- busca global não retorna linhas soft-deleted ou de outro tenant;
- notificações só aparecem ao destinatário;
- uploads respeitam MIME/tamanho e downloads usam signed URLs;
- relatórios exibem o mesmo escopo permitido pela RLS.

## 7. Encerramento

Registre evidências da homologação no PR. Enquanto a branch Supabase estiver
ativa, ela continua gerando cobrança. Não faça merge no banco nem exclua a
branch sem uma decisão explícita; a exclusão remove o ambiente de homologação.
