import { Download, FileText, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { EvidenceUploadForm } from "@/components/evidence-upload-form";
import { SoftDeleteDialog } from "@/components/soft-delete-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  createEvidence,
  formatFileSize,
  getEvidenceDownloadUrl,
  groupEvidenceVersions,
  listEvidences,
  softDeleteEvidence,
  type EvidenceListItem,
} from "@/lib/evidences";

/**
 * US-004 (5º ciclo) — evidências de um entregável.
 *
 * Leitura liberada a qualquer perfil ativo da organização (RLS isola o
 * tenant). Upload e exclusão lógica são gated por `canManage` na UI e
 * revalidados pelas policies de `public.evidences` + `storage.objects`.
 */
interface EvidencesSectionProps {
  actionId: string;
  deliverableId: string;
  canManage: boolean;
}

export function EvidencesSection({ actionId, deliverableId, canManage }: EvidencesSectionProps) {
  const [items, setItems] = useState<EvidenceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const reload = useCallback(async () => {
    const rows = await listEvidences(deliverableId);
    setItems(rows);
  }, [deliverableId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    listEvidences(deliverableId)
      .then((rows) => {
        if (active) setItems(rows);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Não foi possível carregar as evidências.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [deliverableId]);

  const groups = groupEvidenceVersions(items);

  return (
    <section className="mt-3 rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4" aria-hidden />
          Evidências
          {items.length > 0 ? (
            <Badge variant="secondary">
              {groups.length} {groups.length === 1 ? "arquivo" : "arquivos"} · {items.length}{" "}
              {items.length === 1 ? "versão" : "versões"}
            </Badge>
          ) : null}
        </h4>
        {canManage && !uploading ? (
          <Button size="sm" variant="outline" onClick={() => setUploading(true)}>
            <Upload className="mr-1.5 h-4 w-4" />
            Enviar evidência
          </Button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {canManage && uploading ? (
        <div className="mt-3">
          <EvidenceUploadForm
            onCancel={() => setUploading(false)}
            onSubmit={async (values) => {
              setError(null);
              // Recarrega antes de calcular a próxima versão: reduz colisão
              // com uploads concorrentes (o índice único ainda decide).
              const current = await listEvidences(deliverableId);
              setItems(current);
              await createEvidence({
                actionId,
                deliverableId,
                title: values.title,
                description: values.description,
                file: values.file,
                existing: items,
              });
              await reload();
              setUploading(false);
            }}
          />
        </div>
      ) : null}

      {loading ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Carregando evidências...</p>
      ) : items.length === 0 && !uploading ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Nenhuma evidência enviada para este entregável.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {groups.map((group) => (
            <li key={group.fileName}>
              <ul className="divide-y divide-border rounded-md border border-border">
                {group.versions.map((evidence, index) => (
                  <li key={evidence.id} className="flex flex-wrap items-start gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{evidence.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{evidence.fileName}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <Badge variant={index === 0 ? "secondary" : "outline"}>
                          v{evidence.versionNumber}
                          {index === 0 ? " · atual" : ""}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatFileSize(evidence.sizeBytes)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {evidence.uploadedByName ?? "Autor não identificado"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Baixar ${evidence.fileName}`}
                        onClick={async () => {
                          setError(null);
                          try {
                            const url = await getEvidenceDownloadUrl(evidence.storagePath);
                            // Âncora temporária em vez de window.open: o clique
                            // já foi consumido pelo await e popups seriam bloqueados.
                            const anchor = document.createElement("a");
                            anchor.href = url;
                            anchor.rel = "noopener noreferrer";
                            anchor.download = evidence.fileName;
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
                          title="Excluir esta evidência?"
                          description="O registro deixa de aparecer no entregável. O arquivo permanece armazenado e auditável (exclusão lógica)."
                          onConfirm={async () => {
                            try {
                              await softDeleteEvidence(evidence.id);
                              await reload();
                            } catch (err) {
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : "Não foi possível excluir a evidência.",
                              );
                            }
                          }}
                        />
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
