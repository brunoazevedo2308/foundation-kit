import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";

import { ActionForm, EMPTY_ACTION_FORM } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  ACTION_PRIORITY_LABELS,
  ACTION_STATUS_LABELS,
  createAction,
  type ActionListItem,
} from "@/lib/actions";
import { canManageOperationalData } from "@/lib/clients";

export const Route = createFileRoute("/_authenticated/actions/new")({
  head: () => ({
    meta: [
      { title: "Nova ação · DP Suite" },
      { name: "description", content: "Cadastro de uma nova ação operacional DP." },
      { property: "og:title", content: "Nova ação · DP Suite" },
      { property: "og:description", content: "Cadastro de uma nova ação operacional DP." },
    ],
  }),
  beforeLoad: ({ context }) => {
    if (!context.profile || !canManageOperationalData(context.profile.role)) {
      throw redirect({ to: "/actions" });
    }
  },
  component: NewActionPage,
});

function NewActionPage() {
  const [created, setCreated] = useState<ActionListItem | null>(null);
  const [formKey, setFormKey] = useState(0);

  if (created) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Ação criada"
          description="A ação já está disponível no acompanhamento."
        />
        <div
          className="max-w-2xl rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-6"
          role="status"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" aria-hidden />
            <div>
              <p className="font-medium">{created.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {ACTION_STATUS_LABELS[created.status]} ·{" "}
                {ACTION_PRIORITY_LABELS[created.executionPriority]} ·{" "}
                {created.responsibleName ?? "Responsável definido"}
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/actions/$actionId" params={{ actionId: created.id }}>
                Abrir ação
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/actions">Voltar para ações</Link>
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setCreated(null);
                setFormKey((value) => value + 1);
              }}
            >
              Criar outra
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nova ação"
        description="Defina responsável, prioridade e vínculos operacionais da ação."
      />
      <ActionForm
        key={formKey}
        initialValues={EMPTY_ACTION_FORM}
        submitLabel="Criar ação"
        submittingLabel="Salvando..."
        cancelTo={<Link to="/actions">Cancelar</Link>}
        onSubmit={async (values) => {
          setCreated(await createAction(values));
        }}
      />
    </div>
  );
}
