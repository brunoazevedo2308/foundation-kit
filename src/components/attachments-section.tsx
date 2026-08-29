import { Download, Paperclip, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { SoftDeleteDialog } from "@/components/soft-delete-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ATTACHMENT_ALLOWED_MIME_TYPES,
  ATTACHMENT_MAX_BYTES,
  createAttachment,
  formatAttachmentSize,
  getAttachmentDownloadUrl,
  listAttachments,
  softDeleteAttachment,
  type AttachmentContext,
  type AttachmentListItem,
} from "@/lib/attachments";

/**
 * US-008 (1º ciclo) — anexos de uma Ação, Entregável ou Comentário.
 *
 * Leitura liberada a qualquer perfil ativo da organização (RLS isola o
 * tenant). Upload e exclusão lógica são gated por `canManage` na UI e
 * revalidados pelas policies de `public.attachments` + `storage.objects`.
 */
interface AttachmentsSectionProps {
  context: AttachmentContext;
  canManage: boolean;
  title?: string;
}

function contextKeyOf(context: AttachmentContext): string {
  if ("actionId" in context) return `a:${context.actionId}`;
  if ("deliverableId" in context) return `d:${context.deliverableId}`;
  return `c:${context.commentId}`;
}

export function AttachmentsSection({
  context,
  canManage,
  title = "Anexos",
}: AttachmentsSectionProps) {
  const contextKey = contextKeyOf(context);
  const [items, setItems] = useState<AttachmentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setItems(await listAttachments(context));
    setError(null);
    // contextKey identifica o alvo de forma estável entre renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setItems([]);
    listAttachments(context)
      .then((rows) => {
        if (active) setItems(rows);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Não foi possível carregar os anexos.");
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

  return (
    <section className="mt-3 rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-medium">
          <Paperclip className="h-4 w-4" aria-hidden />
          {title}
          {items.length > 0 ? <Badge variant="secondary">{items.length}</Badge> : null}
        </h4>
        {canManage ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="mr-1.5 h-4 w-4" />
            {busy ? "Enviando..." : "Anexar arquivo"}
          </Button>
        ) : null}
      </div>

      {canManage ? (
        <div className="mt-2">
          <Label htmlFor={`attachment-file-${contextKey}`} className="sr-only">
            Selecionar arquivo para anexar
          </Label>
          <Input
            ref={inputRef}
            id={`attachment-file-${contextKey}`}
            type="file"
            className="hidden"
            accept={ATTACHMENT_ALLOWED_MIME_TYPES.join(",")}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setError(null);
              setBusy(true);
              try {
                await createAttachment({ context, file });
                await reload();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Não foi possível enviar o anexo.");
              } finally {
                setBusy(false);
              }
            }}
          />
          <p className="text-xs text-muted-foreground">
            PDF, imagens (JPEG/PNG/WEBP), TXT, CSV, DOCX ou XLSX. Máximo{" "}
            {ATTACHMENT_MAX_BYTES / (1024 * 1024)} MB.
          </p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Carregando anexos...</p>
      ) : items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nenhum anexo enviado ainda.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-md border border-border">
          {items.map((attachment) => (
            <li key={attachment.id} className="flex flex-wrap items-start gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{attachment.fileName}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {formatAttachmentSize(attachment.sizeBytes)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {attachment.uploadedByName ?? "Autor não identificado"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Baixar ${attachment.fileName}`}
                  onClick={async () => {
                    setError(null);
                    try {
                      const url = await getAttachmentDownloadUrl(attachment.storagePath);
                      const anchor = document.createElement("a");
                      anchor.href = url;
                      anchor.rel = "noopener noreferrer";
                      anchor.download = attachment.fileName;
                      document.body.appendChild(anchor);
                      anchor.click();
                      anchor.remove();
                    } catch (err) {
                      setError(
                        err instanceof Error
                          ? err.message
                          : "Não foi possível gerar o link de download.",
                      );
                    }
                  }}
                >
                  <Download className="h-4 w-4" />
                </Button>
                {canManage ? (
                  <SoftDeleteDialog
                    title="Excluir este anexo?"
                    description="O registro deixa de aparecer no contexto. O arquivo permanece armazenado e auditável (exclusão lógica)."
                    onConfirm={async () => {
                      try {
                        await softDeleteAttachment(attachment.id);
                        await reload();
                      } catch (err) {
                        setError(
                          err instanceof Error ? err.message : "Não foi possível excluir o anexo.",
                        );
                      }
                    }}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
