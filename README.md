# DP Suite

Plataforma SaaS de governança e conformidade para operações de Dynamic Positioning.

> Estado atual: fundação técnica (TT-001) + configuração de ambientes Development e Staging (TT-002). Sem funcionalidades de negócio, autenticação ou banco de dados nesta etapa.

## Stack

TypeScript · React 19 · TanStack Start · Tailwind CSS v4 · shadcn/ui · Supabase JS (publishable key).

## Requisitos

- [Bun](https://bun.sh) ≥ 1.1 (ou Node 20+ com npm/pnpm equivalentes)
- Acesso ao projeto Supabase **dp-suite-dev** (Development)

## Variáveis de ambiente

Todas as variáveis são carregadas via `import.meta.env` e validadas em `src/lib/env.ts`.

| Variável                        | Obrigatória             | Descrição                                                    |
| ------------------------------- | ----------------------- | ------------------------------------------------------------ |
| `VITE_APP_ENV`                  | sim                     | `development` \| `staging` \| `production`                   |
| `VITE_SUPABASE_URL`             | quando o backend existe | URL do projeto Supabase do ambiente                          |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | quando o backend existe | Chave **publishable** (anon). Nunca use `service_role` aqui. |

Um template está em [`.env.example`](./.env.example). Copie para `.env.local`
(git-ignored) para desenvolvimento local. **Valores reais nunca são
versionados** — são fornecidos por configuração segura de ambiente.

## Execução local

```bash
bun install
cp .env.example .env.local   # preencha com os valores do dp-suite-dev
bun run dev                  # http://localhost:8080
```

## Ambientes

### Development (`dp-suite-dev`)

`VITE_APP_ENV=development`. URL e publishable key do projeto Supabase
`dp-suite-dev` são injetadas via variáveis de ambiente seguras (arquivo local
`.env.local` fora do Git, ou o cofre de segredos da plataforma de hosting).

### Staging

`VITE_APP_ENV=staging`. O projeto Supabase de Staging **ainda não existe**.
A aplicação está preparada por **contrato de configuração**: quando o
ambiente for provisionado, basta injetar `VITE_SUPABASE_URL` e
`VITE_SUPABASE_PUBLISHABLE_KEY` do novo projeto — nenhum código precisa mudar.
Enquanto os valores não são fornecidos, a página inicial indica que o backend
não está configurado.

### Production

Reservado. Mesma superfície de configuração dos ambientes anteriores.

## Segurança

- **Nunca** use `service_role` (ou qualquer chave de backend) no frontend.
  Apenas a **publishable (anon) key** entra no bundle.
- Credenciais reais nunca são commitadas. `.env`, `.env.local`, `.env.*.local`
  e derivados estão em `.gitignore`.
- Operações privilegiadas, RLS e regras de negócio ficam no backend — fora do
  escopo desta task.

## Scripts

```bash
bun run dev        # servidor de desenvolvimento
bun run build      # build de produção
bun run lint       # ESLint
bun run typecheck  # TypeScript (tsgo --noEmit)
bun run format     # Prettier
```
