import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  EVIDENCE_ALLOWED_MIME_TYPES,
  EVIDENCE_MAX_BYTES,
  EvidenceStorageError,
} from "@/lib/evidences";

/**
 * US-004 (5º ciclo) — formulário reutilizável de upload de evidência.
 * Valida MIME/tamanho no cliente conforme o bucket privado antes de
 * qualquer chamada de rede. A escrita real é gated por RLS no backend.
 */
export interface EvidenceUploadValues {
  title: string;
  description: string;
  file: File;
}

interface EvidenceUploadFormProps {
  onSubmit: (values: EvidenceUploadValues) => Promise<void>;
  onCancel: () => void;
}

export function EvidenceUploadForm({ onSubmit, onCancel }: EvidenceUploadFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-3 rounded-md border border-border bg-muted/30 p-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        if (!file) {
          setError("Selecione um arquivo para enviar.");
          return;
        }
        setBusy(true);
        try {
          await onSubmit({ title, description, file });
        } catch (err) {
          setError(
            err instanceof EvidenceStorageError || err instanceof Error
              ? err.message
              : "Não foi possível enviar a evidência.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="evidence-title">Título</Label>
        <Input
          id="evidence-title"
          value={title}
          maxLength={160}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Ex.: Relatório de teste anual DP"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="evidence-description">Descrição (opcional)</Label>
        <Textarea
          id="evidence-description"
          value={description}
          maxLength={2000}
          rows={2}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="evidence-file">Arquivo</Label>
        <Input
          id="evidence-file"
          type="file"
          accept={EVIDENCE_ALLOWED_MIME_TYPES.join(",")}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          required
        />
        <p className="text-xs text-muted-foreground">
          PDF, imagens (JPEG/PNG/WEBP), TXT, CSV, DOCX ou XLSX. Máximo{" "}
          {EVIDENCE_MAX_BYTES / (1024 * 1024)} MB.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Enviando..." : "Enviar evidência"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
