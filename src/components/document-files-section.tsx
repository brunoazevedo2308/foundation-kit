import { Download, FileText, FolderOpen, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DOCUMENT_FILE_ALLOWED_MIME_TYPES,
  DOCUMENT_FILE_MAX_BYTES,
  createDocumentFile,
  formatDocumentFileSize,
  getDocumentFileDownloadUrl,
  listDocumentFiles,
  type DocumentCategory,
  type DocumentFileListItem,
} from "@/lib/document-files";

interface DocumentFilesSectionProps {
  companyId: string;
  vesselId: string;
  category: DocumentCategory;
  canManage: boolean;
}

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function DocumentFilesSection({
  companyId,
  vesselId,
  category,
  canManage,
}: DocumentFilesSectionProps) {
  const [items, setItems] = useState<DocumentFileListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const rows = await listDocumentFiles(companyId, vesselId, category);
    setItems(rows);
    setError(null);
  }, [category, companyId, vesselId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    listDocumentFiles(companyId, vesselId, category)
      .then((rows) => {
        if (active) setItems(rows);
      })
      .catch((caught) => {
        if (active) {
          setError(
            caught instanceof Error ? caught.message : "Não foi possível carregar os documentos.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [category, companyId, vesselId]);

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FileText className="size-4" aria-hidden />
          Arquivos
          {items.length > 0 ? <Badge variant="secondary">{items.length}</Badge> : null}
        </div>
        {canManage ? (
          <Button type="button" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            <Upload className="mr-2 size-4" aria-hidden />
            {busy ? "Enviando..." : "Inserir documento"}
          </Button>
        ) : null}
      </div>

      {canManage ? (
        <div>
          <Label htmlFor={`document-file-${companyId}-${vesselId}-${category}`} className="sr-only">
            Selecionar documento
          </Label>
          <Input
            ref={inputRef}
            id={`document-file-${companyId}-${vesselId}-${category}`}
            type="file"
            className="hidden"
            accept={DOCUMENT_FILE_ALLOWED_MIME_TYPES.join(",")}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setBusy(true);
              setError(null);
              try {
                await createDocumentFile({ companyId, vesselId, category, file });
                await reload();
              } catch (caught) {
                setError(
                  caught instanceof Error
                    ? caught.message
                    : "Não foi possível inserir o documento.",
                );
              } finally {
                setBusy(false);
              }
            }}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            PDF, imagens, TXT, CSV, DOCX ou XLSX. Máximo de{" "}
            {DOCUMENT_FILE_MAX_BYTES / (1024 * 1024)} MB por arquivo.
          </p>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Carregando documentos...
        </p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <FolderOpen className="mx-auto size-7 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-sm font-medium">Nenhum documento inserido.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canManage
              ? "Use o botão acima para inserir o primeiro documento desta categoria."
              : "Os documentos aparecerão aqui quando forem inseridos."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
              <FileText className="size-5 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.fileName}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDocumentFileSize(item.sizeBytes)} ·{" "}
                  {item.uploadedByName ?? "Autor não identificado"} ·{" "}
                  {DATE_FORMATTER.format(new Date(item.createdAt))}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Baixar ${item.fileName}`}
                onClick={async () => {
                  setError(null);
                  try {
                    const url = await getDocumentFileDownloadUrl(item.storagePath);
                    const anchor = document.createElement("a");
                    anchor.href = url;
                    anchor.rel = "noopener noreferrer";
                    anchor.download = item.fileName;
                    document.body.appendChild(anchor);
                    anchor.click();
                    anchor.remove();
                  } catch (caught) {
                    setError(
                      caught instanceof Error
                        ? caught.message
                        : "Não foi possível gerar o link de download.",
                    );
                  }
                }}
              >
                <Download className="mr-2 size-4" aria-hidden />
                Baixar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
