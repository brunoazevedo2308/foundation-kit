import { MessageSquare, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { SoftDeleteDialog } from "@/components/soft-delete-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  CommentFormSchema,
  canDeleteComment,
  createComment,
  formatCommentTimestamp,
  listComments,
  softDeleteComment,
  type CommentContext,
  type CommentListItem,
} from "@/lib/comments";

/**
 * US-004 (6º ciclo) — comentários de uma Ação ou Entregável.
 *
 * As policies de `public.comments` permitem leitura e escrita a qualquer
 * perfil ativo da organização; por isso não há gate de admin para criar.
 * A exclusão lógica é oferecida ao autor e a administradores (regra de
 * produto — a RLS permanece como fonte da verdade).
 */
interface CommentsSectionProps {
  context: CommentContext;
  currentUserId: string;
  role: string;
  title?: string;
}

export function CommentsSection({
  context,
  currentUserId,
  role,
  title = "Comentários",
}: CommentsSectionProps) {
  const contextKey = "actionId" in context ? `a:${context.actionId}` : `d:${context.deliverableId}`;
  const [items, setItems] = useState<CommentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setItems(await listComments(context));
    setError(null);
    // contextKey identifica o alvo de forma estável entre renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    listComments(context)
      .then((rows) => {
        if (active) setItems(rows);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Não foi possível carregar os comentários.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey]);

  async function submit() {
    setError(null);
    const parsed = CommentFormSchema.safeParse({ body });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Comentário inválido.");
      return;
    }
    setSaving(true);
    try {
      await createComment(context, { body: parsed.data.body });
      setBody("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível publicar o comentário.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <MessageSquare className="h-4 w-4" aria-hidden />
          {title}
          {items.length > 0 ? <Badge variant="secondary">{items.length}</Badge> : null}
        </h3>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-3 space-y-2">
        <label htmlFor="comment-body" className="sr-only">
          Novo comentário
        </label>
        <Textarea
          id="comment-body"
          value={body}
          rows={3}
          maxLength={2000}
          placeholder="Escreva um comentário para a equipe..."
          onChange={(event) => setBody(event.target.value)}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={submit} disabled={saving}>
            <Send className="mr-1.5 h-4 w-4" />
            {saving ? "Publicando..." : "Comentar"}
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Carregando comentários...</p>
      ) : items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nenhum comentário registrado ainda.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-md border border-border">
          {items.map((comment) => (
            <li key={comment.id} className="flex flex-wrap items-start gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {comment.authorName ?? "Autor não identificado"}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {formatCommentTimestamp(comment.createdAt)}
                  </span>
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                  {comment.body}
                </p>
              </div>
              {canDeleteComment(comment, currentUserId, role) ? (
                <SoftDeleteDialog
                  title="Excluir este comentário?"
                  description="O comentário deixa de aparecer para a organização. O registro é mantido no histórico (exclusão lógica)."
                  onConfirm={async () => {
                    try {
                      await softDeleteComment(comment.id);
                      await reload();
                    } catch (err) {
                      setError(
                        err instanceof Error
                          ? err.message
                          : "Não foi possível excluir o comentário.",
                      );
                    }
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
