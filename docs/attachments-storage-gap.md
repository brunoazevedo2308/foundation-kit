# Attachments — bloqueio de storage (US-004, 5º ciclo)

## Situação atual (verificada no Supabase remoto)

O bucket privado `evidences-private` possui **somente** duas policies em
`storage.objects`:

- `evidence_objects_insert_authorized`
- `evidence_objects_select_authorized`

Ambas validam o **caminho canônico de Evidences**
(`organization/{org}/actions/{action}/deliverables/{deliverable}/evidences/{evidence}/{arquivo}`)
e a cadeia organização → action → deliverable → evidence.

Não existe bucket próprio para `public.attachments`, nem policy de
`storage.objects` que aceite um caminho de attachment.

## Consequência

**Upload de anexos está bloqueado por infraestrutura**, não por código:

- Reaproveitar `evidences-private` para attachments seria burlar a
  policy (o caminho não passaria na validação) e produziria falhas
  silenciosas ou objetos órfãos.
- Criar bucket/policy exige DDL no Supabase, fora do escopo deste ciclo.

Por isso **não há UI de upload de anexos** no DP Suite hoje. Nenhum
fluxo "parcial" foi criado: um formulário que sempre falha no POST do
objeto é pior que a ausência dele.

## O que já é possível sem storage

`public.attachments` está criada, com RLS multi-tenant e auditoria
(`20260809113000_harden_evidences_attachments_admin_writes_and_audit.sql`).
Isso permite, sem nenhuma mudança de banco, **leitura de metadata** de
anexos que venham a ser criados por outro caminho (importação
administrativa, backfill). Enquanto não houver linhas nem storage, essa
leitura não tem valor de produto e permanece não exposta na UI.

## Desbloqueio (proposta, requer aprovação e DDL)

1. Criar bucket privado `attachments-private` (limite e MIME próprios).
2. Definir caminho canônico, por exemplo
   `organization/{org}/attachments/{attachment_id}/{arquivo}`.
3. Criar policies `INSERT`/`SELECT` em `storage.objects` espelhando o
   padrão de Evidences (validando organização e vínculo do attachment).
4. Só então implementar o módulo de upload, reaproveitando o fluxo
   metadata-first com rollback compensatório de `src/lib/evidence-storage.ts`.

Até lá, Evidences continua sendo o único artefato com arquivo no DP Suite.

## Situação no fechamento da US-004

Este é o **único bloqueio funcional de infraestrutura restante** da US-004.
Todos os demais módulos (clients, vessels, actions, deliverables, evidences,
comments) estão completos e auditados. O item "leaked password protection"
do Security Advisor **não** pertence à US-004: é Production Readiness.
