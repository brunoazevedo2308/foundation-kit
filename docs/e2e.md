# DP Suite — E2E automatizado

## Escopo

O Playwright valida o caminho navegador → aplicação → Supabase staging → interface.

### Automático em todo PR e push na `main`

- health da aplicação e do Supabase Auth;
- login e recuperação de senha acessíveis;
- aviso de privacidade e canal administrativo;
- redirect de rota protegida preservando o destino.

Workflow: `.github/workflows/e2e-public.yml`.

### Autenticado, disparado manualmente

- login real como `member` e administrador;
- carregamento do dashboard e dados tenant-scoped;
- ausência de escrita administrativa para `member`;
- gate do módulo de usuários;
- acesso administrativo a usuários e clientes;
- leitura da Central de Privacidade com o escopo correto.

Workflow: `.github/workflows/e2e-authenticated.yml`.

Os testes autenticados são somente leitura. Eles não criam clientes, ações,
arquivos ou solicitações LGPD e, portanto, podem ser repetidos sem acumular
dados de teste.

## Secrets necessários

No GitHub Environment `staging`, configurar:

- `VITE_SUPABASE_PUBLISHABLE_KEY` (já usado pelo build de staging);
- `E2E_MEMBER_EMAIL`;
- `E2E_MEMBER_PASSWORD`;
- `E2E_ADMIN_EMAIL`;
- `E2E_ADMIN_PASSWORD`.

Use contas dedicadas e ativas da branch Supabase `dp-suite-staging`. O admin
pode ser `organization_admin` ou `system_admin`. Nunca use credenciais de
produção e nunca registre os valores em issue, PR, artifact ou mensagem.

Depois de configurar os secrets, execute **Actions → E2E Authenticated → Run
workflow**. O job falha cedo quando qualquer secret está ausente, evitando
resultado verde com cenários ignorados.

## Execução local

Instale o Chromium uma vez:

```bash
pnpm exec playwright install chromium
```

Testes públicos usam as configurações locais da aplicação:

```bash
pnpm test:e2e:public
```

Para os autenticados, forneça credenciais somente no ambiente do processo:

```bash
E2E_MEMBER_EMAIL='...' E2E_MEMBER_PASSWORD='...' \
E2E_ADMIN_EMAIL='...' E2E_ADMIN_PASSWORD='...' \
pnpm test:e2e:authenticated
```

Para testar uma URL já publicada, defina `E2E_REMOTE=true` e uma origem HTTPS
em `E2E_BASE_URL`. Não use esse modo contra produção para cenários que possam
escrever dados.

## Evidências e diagnóstico

Em falha no GitHub, traces, screenshots, vídeos e relatório HTML são enviados
como artifact privado do run por 14 dias. Mesmo assim, eles podem conter dados
visíveis na tela; restrinja o acesso e remova a evidência depois da análise.

Para reproduzir:

```bash
pnpm exec playwright show-trace test-results/<teste>/trace.zip
```

Antes de classificar como defeito, conferir:

1. alvo `ggehwncqjetinynwlqhj` e `VITE_APP_ENV=staging`;
2. status das contas de teste;
3. Auth/API logs do Supabase no horário UTC;
4. screenshots e primeira requisição que falhou;
5. migrations aplicadas no staging.
