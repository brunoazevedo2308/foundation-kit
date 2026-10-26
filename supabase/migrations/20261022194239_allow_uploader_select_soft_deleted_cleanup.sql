-- A política SELECT também participa da validação de UPDATE no PostgreSQL.
-- Para que o próprio autor consiga concluir a limpeza compensatória de um
-- upload, ele precisa manter visibilidade somente sobre o metadata que acabou
-- de marcar como excluído. Demais usuários continuam sem acesso a excluídos.

drop policy if exists evidences_select_same_org on public.evidences;
create policy evidences_select_same_org
on public.evidences for select to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (
    deleted_at is null
    or uploaded_by = (select auth.uid())
  )
);

drop policy if exists attachments_select_same_org on public.attachments;
create policy attachments_select_same_org
on public.attachments for select to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (
    deleted_at is null
    or uploaded_by = (select auth.uid())
  )
);
