# Evidences — estratégia de versionamento e substituição (TT-007)

## Princípios

O DP Suite trata **Evidences** como registros imutáveis vinculados a uma
Deliverable. Uma vez enviado, um objeto no bucket privado
`evidences-private` **não pode ser sobrescrito, atualizado nem apagado**
pelo frontend — a política de RLS do storage não expõe `UPDATE` ou
`DELETE` para o papel `authenticated`, e o módulo `src/lib/evidence-storage.ts`
sempre envia com `upsert: false`.

## Substituir uma evidência = criar uma nova versão

Para substituir uma evidência já enviada:

1. O usuário faz upload de um novo arquivo pela mesma Deliverable.
2. O módulo gera um **novo Evidence UUID**, uma nova linha em
   `public.evidences` (incrementando `version_number`) e um **novo
   caminho canônico** contendo esse UUID.
3. A versão anterior permanece exatamente como está: a linha antiga em
   `public.evidences` continua ativa (`deleted_at IS NULL`), o objeto
   antigo permanece no bucket sob o caminho antigo e continua acessível
   por signed URL, respeitando RLS.

O par `(deliverable_id, version_number, file_name)` mantém a unicidade
das versões ativas via `evidences_active_version_file_uniq`. Fica a
critério da UI de listagem ordenar por `version_number desc` e sinalizar
qual versão é a "atual".

### Concorrência

A próxima versão calculada no cliente é apenas um palpite: dois uploads
simultâneos do mesmo arquivo chegariam com o mesmo `version_number`. O
índice único é a fonte da verdade — ao receber `23505`, o módulo
reincrementa a versão, gera **novo UUID e novo caminho** e tenta
novamente (até `EVIDENCE_VERSION_MAX_RETRIES`). Persistindo o conflito,
o usuário recebe uma mensagem pedindo para atualizar a lista. Nenhum
objeto é enviado antes de o metadata existir, então uma colisão nunca
deixa arquivo órfão no bucket.

## Por que não sobrescrever?

- **Auditoria**: cada versão é rastreável de forma imutável — o
  `audit_events` (imutável por trigger) preserva o histórico completo.
- **Segurança**: sobrescrever exigiria política `UPDATE` no
  `storage.objects`, o que amplia superfície de ataque sem ganho real.
- **Compliance**: operações DP exigem trilhas de evidência preservadas;
  a mesma URL nunca deve apontar para conteúdo diferente ao longo do
  tempo.

## Fluxo transacional compensatório

O upload é **metadata-first**:

1. Gerar UUID no cliente.
2. `INSERT` em `public.evidences` (RLS válida organização, deliverable e
   perfil ativo).
3. `POST` do objeto para o bucket (RLS revalida a mesma cadeia).
4. Se o passo 3 falhar, o módulo executa `UPDATE ... SET deleted_at =
now()` na linha inserida no passo 2, liberando o índice único de
   versão para uma nova tentativa e evitando metadata órfão.

Se a limpeza compensatória (passo 4) também falhar, o módulo devolve
um `EvidenceStorageError` distinto instruindo o usuário a contatar um
administrador. **O frontend nunca usa `service_role`** — a reconciliação
manual é responsabilidade operacional.

## Attachments seguem separados

`public.attachments` cobre anexos genéricos (comentários, avulsos em
Actions/Deliverables) e permanece um domínio distinto: bucket próprio,
policies próprias, ciclo de vida próprio. Não misture os dois:

- **Evidence** = artefato formal de conformidade da Deliverable.
- **Attachment** = material de apoio de comentários e discussões.

Qualquer futura funcionalidade de "substituir arquivo" em Attachments
deverá seguir o mesmo padrão de versionamento se e quando o negócio
exigir imutabilidade — mas o backlog atual não exige, e os dois módulos
permanecem tecnicamente independentes.
