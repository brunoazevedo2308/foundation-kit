import { History, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  ActionActivityFormSchema,
  actionActivityLabel,
  createManualActionActivity,
  formatActionActivityTimestamp,
  listActionActivity,
  type ActionActivityItem,
} from "@/lib/action-activity";

interface ActionActivitySectionProps {
  actionId: string;
  revision?: number;
  onChanged?: () => void;
}

export function ActionActivitySection({
  actionId,
  revision = 0,
  onChanged,
}: ActionActivitySectionProps) {
  const [items, setItems] = useState<ActionActivityItem[]>([]);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const rows = await listActionActivity(actionId);
    setItems(rows);
    setError(null);
  }, [actionId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    listActionActivity(actionId)
      .then((rows) => {
        if (active) {
          setItems(rows);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Não foi possível carregar o histórico.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [actionId, revision]);

  async function submit() {
    setError(null);
    const parsed = ActionActivityFormSchema.safeParse({ summary });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Atualização inválida.");
      return;
    }

    setSaving(true);
    try {
      await createManualActionActivity(actionId, parsed.data.summary);
      setSummary("");
      await reload();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível registrar a atualização.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-4 w-4" aria-hidden />
          Histórico da ação
          {items.length > 0 ? <Badge variant="secondary">{items.length}</Badge> : null}
        </CardTitle>
        <CardDescription>
          Registro cronológico de atualizações, comentários, entregáveis e arquivos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="action-activity-summary" className="text-sm font-medium">
            Registrar nova atualização
          </label>
          <Textarea
            id="action-activity-summary"
            value={summary}
            rows={3}
            maxLength={500}
            placeholder="Descreva o que foi realizado ou o próximo passo..."
            onChange={(event) => setSummary(event.target.value)}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">{summary.length}/500</span>
            <Button size="sm" onClick={submit} disabled={saving}>
              <Send className="mr-1.5 h-4 w-4" />
              {saving ? "Registrando..." : "Registrar atualização"}
            </Button>
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Carregando histórico...</p>
        ) : items.length === 0 ? (
          <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
            Nenhuma movimentação registrada ainda.
          </p>
        ) : (
          <ol className="relative ml-2 border-l border-border">
            {items.map((item) => (
              <li key={item.id} className="relative pb-5 pl-5 last:pb-0">
                <span className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium">{actionActivityLabel(item.eventType)}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatActionActivityTimestamp(item.createdAt)}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                  {item.summary}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Por {item.actorName ?? "Sistema"}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
