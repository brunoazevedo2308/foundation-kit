import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import {
  getAction,
  toActionFormInput,
  updateAction,
  type ActionFormInput,
  type ActionListItem,
} from "@/lib/actions";
import { canManageOperationalData } from "@/lib/clients";

/**
 * US-004 (2º ciclo) — edição de ação.
 *
 * Escrita permitida apenas a system_admin/organization_admin: gate de UI aqui
 * e reforço no banco pela policy `actions_update_same_org`
 * (migration 20260809094500_harden_actions_admin_writes.sql).
 */
export const Route = createFileRoute("/_authenticated/actions/$actionId/edit")({
  head: () => ({
    meta: [
      { title: "Editar ação · DP Suite" },
      { name: "description", content: "Edição de uma ação operacional DP." },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: ({ context }) => {
    if (!context.profile || !canManageOperationalData(context.profile.role)) {
      throw redirect({ to: "/actions" });
    }
  },
  component: EditActionPage,
});

function EditActionPage() {
  const { actionId } = Route.useParams();
  const navigate = useNavigate();
  const [action, setAction] = useState<ActionListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getAction(actionId)
      .then((row) => {
        if (active) setAction(row);
      })
      .catch((err) => {
        if (active)
          setError(err instanceof Error ? err.message : "Não foi possível carregar a ação.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [actionId]);

  const initialValues: ActionFormInput | null = useMemo(
    () => (action ? toActionFormInput(action) : null),
    [action],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editar ação"
        description="Atualize responsável, prazos, status e vínculos operacionais."
      />

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
          Carregando ação...
        </div>
      ) : !action || !initialValues ? (
        !error ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Ação não encontrada ou pertence a outra organização.
          </div>
        ) : null
      ) : (
        <ActionForm
          initialValues={initialValues}
          submitLabel="Salvar alterações"
          submittingLabel="Salvando..."
          cancelTo={
            <Link to="/actions/$actionId" params={{ actionId }}>
              Cancelar
            </Link>
          }
          onSubmit={async (values) => {
            await updateAction(actionId, values, action.completedAt);
            await navigate({ to: "/actions/$actionId", params: { actionId } });
          }}
        />
      )}
    </div>
  );
}
