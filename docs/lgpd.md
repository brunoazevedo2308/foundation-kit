# LGPD — base operacional do DP Suite

Status: base técnica inicial. Este documento não constitui parecer jurídico nem certificação de conformidade.

## Papéis preliminares

- **Callyvon**: controladora dos dados necessários à conta, segurança, faturamento e suporte do DP Suite.
- **Organização contratante**: em regra, controladora do conteúdo operacional que seus usuários inserem no produto.
- **Callyvon**: em regra, operadora desse conteúdo por conta da organização contratante.

Os papéis dependem do contrato e da finalidade de cada tratamento. Devem ser validados juridicamente antes do lançamento comercial.

## Inventário resumido (ROPA)

| Processo              | Dados principais                                             | Finalidade                                                     | Base a validar                                               | Acesso/compartilhamento                     | Retenção proposta                                           |
| --------------------- | ------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------- | ----------------------------------------------------------- |
| Conta e autenticação  | nome, e-mail, organização, função, status, último login      | autenticar e autorizar usuários                                | execução de contrato; legítimo interesse em segurança        | Supabase Auth, equipe autorizada            | vigência da conta + prazo contratual/legal                  |
| Operação DP           | clientes, contatos, ações, responsáveis, comentários         | prestar a funcionalidade contratada                            | execução de contrato; obrigação regulatória do cliente       | usuários autorizados do mesmo tenant        | definida pela organização e obrigações marítimas aplicáveis |
| Arquivos e evidências | arquivos, nomes, metadados, autor                            | comprovação e rastreabilidade operacional                      | contrato; obrigação legal/regulatória; exercício de direitos | storage privado Supabase, tenant autorizado | definida por categoria documental                           |
| Auditoria e segurança | usuário, evento, entidade, data, metadados mínimos           | prevenir abuso, investigar incidente e demonstrar conformidade | legítimo interesse; obrigação legal; exercício de direitos   | equipe técnica autorizada                   | política formal de logs; incidentes por no mínimo 5 anos    |
| E-mails transacionais | e-mail e evento de entrega                                   | convite, recuperação de senha e alertas                        | contrato e segurança                                         | Resend e provedor de e-mail do destinatário | mínima necessária a entrega e investigação                  |
| Solicitações LGPD     | identidade autenticada, tipo, descrição, andamento, resposta | atender direitos do titular e provar atendimento               | obrigação legal; exercício de direitos                       | titular e admins do mesmo tenant            | política formal a aprovar                                   |

Campos livres e anexos podem receber dados não previstos. O produto deve orientar usuários a aplicar minimização e evitar dados sensíveis desnecessários.

## Controles implementados

- RLS e segregação por `organization_id` nas tabelas expostas.
- Buckets privados e URLs assinadas para evidências e anexos.
- Menor privilégio para usuários autenticados; chaves administrativas não ficam no navegador.
- Logs de observabilidade sanitizados e trilha de auditoria imutável.
- Backup diário criptografado com retenção técnica de 30 dias e restauração testada.
- Aviso público de privacidade e Central de Privacidade autenticada.
- Solicitações de titulares auditáveis, sem exclusão automática.

## Procedimento de solicitação do titular

1. Receber o pedido pela Central de Privacidade ou por `admin@callyvon.com`.
2. Confirmar a identidade sem coletar dados excessivos. Para pedidos dentro do produto, a sessão autenticada é o primeiro fator; ações de alto impacto podem exigir confirmação adicional.
3. Identificar se Callyvon atua como controladora ou operadora. Quando operadora, encaminhar/coordenar com a organização controladora.
4. Localizar os dados em Auth, banco, Storage, logs, backups e fornecedores relevantes.
5. Avaliar bases legais, dados de terceiros, segredos comerciais, obrigações de conservação e defesa de direitos.
6. Registrar a decisão e uma resposta compreensível. Nunca incluir senhas, tokens, chaves ou dados de terceiros na resposta.
7. Concluir ou justificar eventual indeferimento; registrar `resolved_at` e manter evidência mínima do atendimento.

Pedidos de acesso devem ser priorizados para que a resposta completa observe o prazo legal aplicável. O responsável operacional deve controlar prazos fora do sistema até existir automação dedicada.

## Incidentes de segurança

1. Conter, preservar evidências e registrar data, sistemas, categorias de dados, titulares e medidas adotadas.
2. Avaliar imediatamente risco ou dano relevante aos titulares.
3. Acionar responsável executivo e assessoria jurídica.
4. Quando aplicável, comunicar ANPD e titulares em até três dias úteis, com as informações exigidas pela regulamentação.
5. Preservar o registro do incidente por pelo menos cinco anos e executar ações corretivas.

Não inserir dados pessoais desnecessários em GitHub Issues, PRs ou logs de CI durante a resposta ao incidente.

## Retenção e descarte — decisões pendentes

A Callyvon precisa aprovar uma tabela de temporalidade por categoria. Até lá:

- não executar limpeza em massa nem exclusão automática;
- bloquear/inativar contas quando a finalidade for interromper acesso;
- avaliar pedidos de exclusão individualmente, inclusive conteúdo de terceiros e referências de auditoria;
- considerar a janela de 30 dias dos backups na comunicação ao titular;
- documentar o prazo regulatório aplicável a evidências operacionais marítimas;
- anonimizar quando a finalidade puder ser atendida sem identificação.

## Terceiros e transferência internacional

Revisar e registrar finalidade, localização, suboperadores, prazo, exclusão, medidas de segurança e mecanismo de transferência internacional de:

- Supabase (Auth, Postgres e Storage);
- Vercel (hospedagem e logs);
- Resend (e-mail transacional);
- GitHub (código, CI e artefatos criptografados de backup).

Antes do lançamento comercial, celebrar/validar contratos e anexos de tratamento de dados, inclusive as cláusulas exigidas pela regulamentação brasileira de transferência internacional.

## Pendências organizacionais para conformidade

- preencher CNPJ e endereço da Callyvon no aviso e nos contratos;
- definir e publicar o canal/responsável de privacidade (o e-mail atual é provisório);
- aprovar bases legais e a tabela de temporalidade com assessoria jurídica;
- concluir o ROPA detalhado usando o modelo da ANPD;
- realizar RIPD quando houver tratamento de alto risco;
- revisar contratos com clientes e fornecedores;
- treinar administradores para identidade, prazos, resposta e descarte;
- executar teste anual de solicitação do titular e simulado de incidente.

## Referências oficiais

- [Lei nº 13.709/2018 — LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm)
- [ANPD — Direitos dos titulares](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares)
- [ANPD — Modelo de registro das operações de tratamento (ROPA)](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/modelo_de_ropa_para_atpp.pdf)
- [ANPD — Segurança para agentes de pequeno porte](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-sobre-seguranca-da-informacao-para-agentes-de-tratamento-de-pequeno-porte)
- [ANPD — Comunicação de incidente de segurança](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-aprova-o-regulamento-de-comunicacao-de-incidente-de-seguranca)
- [ANPD — Transferência internacional de dados](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-19-de-23-de-agosto-de-2024)
