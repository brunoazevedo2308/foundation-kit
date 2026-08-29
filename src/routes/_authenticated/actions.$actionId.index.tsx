import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ListChecks, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { AttachmentsSection } from "@/components/attachments-section";
import { CommentsSection } from "@/components/comments-section";
import { DeliverablesSection } from "@/components/deliverables-section";
import { PageHeader } from "@/components/page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ACTION_CRITICALITY_LABELS,
  ACTION_PRIORITY_LABELS,
  ACTION_SITUATION_LABELS,
  ACTION_STATUS_LABELS,
  getAction,
  isOverdue,
  softDeleteAction,
  type ActionListItem,
} from "@/lib/actions";
import { canManageOperationalData } from "@/lib/clients";

export const Route = createFileRoute("/_authenticated/actions/$actionId/")({
  head: () => ({
    meta: [
      { title: "Detalhe da ação · DP Suite" },
      { name: "description", content: "Detalhe de uma ação operacional DP." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ActionDetailPage,
});

function ActionDetailPage() {
  const { actionId } = Route.useParams();
  const { profile, user } = Route.useRouteContext();
  const canManage = canManageOperationalData(profile.role);
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
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

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title={action?.title ?? "Detalhe da ação"}
        description="Dados operacionais da ação dentro da sua organização."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/actions" className="flex items-center gap-1.5">
                <ArrowLeft className="h-4 w-4" />
                Voltar para Ações
              </Link>
            </Button>
            {canManage && action ? (
              <>
                <Button asChild size="sm">
                  <Link
                    to="/actions/$actionId/edit"
                    params={{ actionId }}
                    className="flex items-center gap-1.5"
                  >
                    <Pencil className="h-4 w-4" />
                    Editar
                  </Link>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={deleting}>
                      <Trash2 className="mr-1.5 h-4 w-4" />
                      Excluir
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir esta ação?</AlertDialogTitle>
                      <AlertDialogDescription>
                        A ação deixa de aparecer nas listagens da organização. O registro é mantido
                        no histórico (exclusão lógica) para fins de auditoria.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          setDeleting(true);
                          try {
                            await softDeleteAction(actionId);
                            await navigate({ to: "/actions" });
                          } catch (err) {
                            setError(
                              err instanceof Error
                                ? err.message
                                : "Não foi possível excluir a ação.",
                            );
                          } finally {
                            setDeleting(false);
                          }
                        }}
                      >
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            ) : null}
          </div>
        }
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
      ) : !action && !error ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <ListChecks className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-sm font-medium">Ação não encontrada.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ela pode ter sido removida ou pertence a outra organização.
          </p>
        </div>
      ) : action ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{ACTION_STATUS_LABELS[action.status]}</Badge>
              <Badge variant="outline">{ACTION_SITUATION_LABELS[action.situation]}</Badge>
              {isOverdue(action) ? <Badge variant="destructive">Vencida</Badge> : null}
            </div>
            <CardTitle className="mt-2">{action.title}</CardTitle>
            <CardDescription>
              {action.description ?? "Sem descrição informada para esta ação."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail label="Responsável" value={action.responsibleName} />
              <Detail label="Prazo" value={action.dueDate} />
              <Detail
                label="Prioridade de execução"
                value={ACTION_PRIORITY_LABELS[action.executionPriority]}
              />
              <Detail
                label="Criticidade operacional"
                value={ACTION_CRITICALITY_LABELS[action.operationalCriticality]}
              />
              <Detail label="Cliente" value={action.clientName} />
              <Detail label="Embarcação" value={action.vesselName} />
              <Detail label="Origem" value={action.origin} />
              <Detail label="Tipo" value={action.actionType} />
            </dl>
          </CardContent>
        </Card>
      ) : null}

      {action ? (
        <AttachmentsSection
          context={{ actionId }}
          canManage={canManage}
          title="Anexos da ação"
        />
      ) : null}

      {action ? (
        <DeliverablesSection
          actionId={actionId}
          canManage={canManage}
          currentUserId={user.id}
          role={profile.role}
        />
      ) : null}

      {action ? (
        <CommentsSection
          context={{ actionId }}
          currentUserId={user.id}
          role={profile.role}
          title="Comentários da ação"
        />
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value ?? "—"}</dd>
    </div>
  );
}
