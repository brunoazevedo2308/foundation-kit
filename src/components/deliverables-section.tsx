import { ListTodo, Pencil, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { CommentsSection } from "@/components/comments-section";
import { DeliverableForm, emptyDeliverableForm } from "@/components/deliverable-form";
import { EvidencesSection } from "@/components/evidences-section";
import { SoftDeleteDialog } from "@/components/soft-delete-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DELIVERABLE_STATUS_LABELS,
  createDeliverable,
  deliverableProgress,
  isDeliverableOverdue,
  listDeliverables,
  nextSequenceNumber,
  softDeleteDeliverable,
  toDeliverableFormInput,
  updateDeliverable,
  type DeliverableListItem,
} from "@/lib/deliverables";

/**
 * US-004 (4º ciclo) — seção de Entregáveis dentro do detalhe da Ação.
 *
 * Leitura liberada a qualquer perfil ativo da organização (RLS isola o tenant);
 * criação, edição e exclusão lógica são gated por `canManage` na UI.
 */
interface DeliverablesSectionProps {
  actionId: string;
  canManage: boolean;
  currentUserId: string;
  role: string;
}

export function DeliverablesSection({
  actionId,
  canManage,
  currentUserId,
  role,
}: DeliverablesSectionProps) {
  const [items, setItems] = useState<DeliverableListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const rows = await listDeliverables(actionId);
    setItems(rows);
    setError(null);
  }, [actionId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    listDeliverables(actionId)
      .then((rows) => {
        if (active) setItems(rows);
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof Error ? err.message : "Não foi possível carregar os entregáveis.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [actionId]);

  const progress = deliverableProgress(items);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ListTodo className="h-4 w-4" aria-hidden />
              Entregáveis
            </CardTitle>
            <CardDescription>
              Checkpoints da ação. Progresso derivado: {progress}% concluído
              {items.length > 0 ? ` (${items.length} itens)` : ""}.
            </CardDescription>
          </div>
          {canManage && !creating ? (
            <Button
              size="sm"
              onClick={() => {
                setEditingId(null);
                setCreating(true);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Novo entregável
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        {canManage && creating ? (
          <DeliverableForm
            initialValues={emptyDeliverableForm(nextSequenceNumber(items))}
            submitLabel="Adicionar entregável"
            submittingLabel="Adicionando..."
            onCancel={() => setCreating(false)}
            onSubmit={async (values) => {
              await createDeliverable(actionId, values);
              await reload();
              setCreating(false);
            }}
          />
        ) : null}

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Carregando entregáveis...
          </p>
        ) : items.length === 0 && !creating ? (
          <p className="rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            Nenhum entregável cadastrado para esta ação.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {items.map((item) =>
              editingId === item.id ? (
                <li key={item.id} className="p-3">
                  <DeliverableForm
                    initialValues={toDeliverableFormInput(item)}
                    submitLabel="Salvar alterações"
                    submittingLabel="Salvando..."
                    onCancel={() => setEditingId(null)}
                    onSubmit={async (values) => {
                      await updateDeliverable(item.id, values, item.completedAt);
                      await reload();
                      setEditingId(null);
                    }}
                  />
                </li>
              ) : (
                <li key={item.id} className="flex flex-wrap items-start gap-3 p-3">
                  <span className="mt-0.5 text-xs font-medium text-muted-foreground">
                    #{item.sequenceNumber}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{item.title}</p>
                    {item.description ? (
                      <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p>
                    ) : null}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{DELIVERABLE_STATUS_LABELS[item.status]}</Badge>
                      {item.dueDate ? <Badge variant="outline">{item.dueDate}</Badge> : null}
                      {isDeliverableOverdue(item) ? (
                        <Badge variant="destructive">Vencido</Badge>
                      ) : null}
                      <span className="text-xs text-muted-foreground">
                        {item.responsibleName ?? "Sem responsável identificado"}
                      </span>
                    </div>
                    <EvidencesSection
                      actionId={actionId}
                      deliverableId={item.id}
                      canManage={canManage}
                    />
                    <CommentsSection
                      context={{ deliverableId: item.id }}
                      currentUserId={currentUserId}
                      role={role}
                      title={`Comentários — ${item.title}`}
                    />
                  </div>
                  {canManage ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Editar ${item.title}`}
                        onClick={() => {
                          setCreating(false);
                          setEditingId(item.id);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <SoftDeleteDialog
                        title="Excluir este entregável?"
                        description="O entregável deixa de aparecer na ação. O registro é mantido no histórico (exclusão lógica) para fins de auditoria."
                        onConfirm={async () => {
                          try {
                            await softDeleteDeliverable(item.id);
                            await reload();
                          } catch (err) {
                            setError(
                              err instanceof Error
                                ? err.message
                                : "Não foi possível excluir o entregável.",
                            );
                          }
                        }}
                      />
                    </div>
                  ) : null}
                </li>
              ),
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
