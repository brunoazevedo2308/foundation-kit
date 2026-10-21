# DP Suite — Instalação no celular

O DP Suite é uma Progressive Web App (PWA). A aplicação continua sendo servida
por HTTPS na Vercel, mas pode ser instalada na tela inicial e aberta em modo
independente, sem a barra do navegador.

Antes de liberar uma versão, executar este roteiro no Preview da branch e, após
a aprovação, repetir no domínio de produção.

## iPhone e iPad

1. Abrir `https://app.callyvon.com` no Safari.
2. Tocar em **Compartilhar**.
3. Selecionar **Adicionar à Tela de Início**.
4. Confirmar o nome **DP Suite** e tocar em **Adicionar**.
5. Abrir pelo novo ícone e validar login, logout e retorno ao aplicativo.

## Android

1. Abrir `https://app.callyvon.com` no Chrome.
2. Abrir o menu do navegador.
3. Selecionar **Instalar app** ou **Adicionar à tela inicial**.
4. Confirmar a instalação.
5. Abrir pelo novo ícone e validar login, logout e retorno ao aplicativo.

## Política de funcionamento offline

O service worker guarda apenas o manifesto, os ícones, a página estática de
indisponibilidade e ativos de build (`script`, `style`, `font` e `image`).

- páginas autenticadas sempre usam a rede;
- respostas de `fetch`/XHR e dados do Supabase não são persistidos pelo cache da PWA;
- sem conexão, uma página neutra informa que dados atualizados exigem internet;
- o aplicativo não promete operação offline no MVP.

Essa restrição é intencional para evitar que dados de organizações fiquem
armazenados pelo service worker em um dispositivo compartilhado.

## Smoke test após cada publicação

1. Confirmar `200` e MIME `application/manifest+json` em `/manifest.webmanifest`.
2. Confirmar `200` em `/service-worker.js` e nos ícones 192 e 512.
3. Abrir `/dashboard` sem sessão e confirmar redirecionamento para `/login`.
4. Instalar ou atualizar a PWA em pelo menos um dispositivo real.
5. Autenticar com conta de teste e validar dashboard, navegação e logout.
6. Desativar a rede, recarregar e confirmar a página estática de indisponibilidade.
7. Reativar a rede e confirmar que os dados atuais voltam a carregar.

Nunca executar o smoke test com dados pessoais reais ou registrar credenciais,
tokens e conteúdo operacional em capturas de tela.
