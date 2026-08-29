# Attachments — storage (gap RESOLVIDO na US-008)

> **Status:** resolvido para o MVP. Este documento nasceu na US-004 descrevendo
> o bloqueio de infraestrutura de anexos; na US-008 o bloqueio foi removido.

## Histórico do bloqueio (US-004)

Até a US-004 existia apenas o bucket privado `evidences-private`, cujas policies
validam o caminho canônico de Evidences. Não havia bucket nem policy de
`storage.objects` que aceitasse um caminho de attachment, então **nenhuma UI de
upload de anexos foi criada** — reaproveitar `evidences-private` teria burlado a
policy e gerado falhas silenciosas ou objetos órfãos.

## Resolução (US-008)

Migration versionada `db/migrations/20260828143000_us008_attachments_private_bucket.sql`,
**aplicada no Supabase Development**. O arquivo do repositório espelha o estado
aplicado e é idempotente.

- **Bucket separado**: `attachments-private` — privado, `file_size_limit`
  26214400 bytes (25 MiB), whitelist de MIME documental (PDF, JPEG, PNG, WEBP,
  TXT, CSV, DOCX, XLSX). `evidences-private` permanece intocado.
- **Caminho canônico**: `{organization_id}/{attachment_id}/{safe_file_name}` —
  exatamente três segmentos, validados pela policy.
- **Autorização centralizada**: `private.can_access_attachment_object(name, require_uploader)`
  (`security definer`, `search_path` fixo) confere a linha ativa em
  `public.attachments`, o perfil `active` do chamador e a mesma organização.
  No INSERT, exige também `uploaded_by = auth.uid()`.
- **Policies**: `attachment_objects_select_authorized` e
  `attachment_objects_insert_authorized`. **Não existem** policies de UPDATE ou
  DELETE, por design.

## Contrato de aplicação

- **Metadata-first + compensação**: insere em `public.attachments`, envia o
  objeto e, em caso de falha no Storage, soft-deleta o metadata
  (`src/lib/attachment-storage.ts`). Falha de compensação vira evento
  `critical` sanitizado.
- **Download**: signed URL de 120s (teto 1h), gerada com a sessão do usuário.
- **Sem DELETE físico**: exclusão é lógica (`deleted_at`); o objeto permanece
  para auditoria. `upsert: false` no upload impede sobrescrita.
- **Sem `service_role` no frontend**: apenas a chave publishable + sessão; a RLS
  é a única fonte da verdade.

## Cobertura de UI

| Vínculo    | Coluna           | Exposto na UI                          |
| ---------- | ---------------- | -------------------------------------- |
| Ação       | `action_id`      | Sim — `/actions/$actionId`             |
| Entregável | `deliverable_id` | Sim — `deliverables-section.tsx`       |
| Comentário | `comment_id`     | Não (suportado pela lib e pelo modelo) |

Anexos de comentário ficam fora do MVP: comentar é permitido a qualquer perfil
ativo, enquanto anexar é gated por `canManageOperationalData`; expor o upload no
comentário exigiria um gate próprio e uma UX distinta. O caminho está pronto na
lib (`AttachmentContext = { commentId }`) e no banco.

## Evolução futura

Anexos em comentários na UI, versionamento de anexo, rotina de limpeza de
objetos órfãos e verificação antivírus/conteúdo. Nada disso é pré-requisito do
MVP da US-008.
