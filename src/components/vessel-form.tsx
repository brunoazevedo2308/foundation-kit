import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listClients, type ClientListItem } from "@/lib/clients";
import { VesselFormSchema, type VesselFormInput } from "@/lib/vessels";

/**
 * US-004 (3º ciclo) — formulário compartilhado de Embarcações.
 * Usado na criação (`/vessels/new`) e na edição (`/vessels/$vesselId/edit`).
 */

export const EMPTY_VESSEL_FORM: VesselFormInput = {
  name: "",
  imoNumber: "",
  vesselType: "",
  dpClass: "",
  status: "active",
  clientId: "",
};

type FieldErrors = Partial<Record<keyof VesselFormInput, string>>;

const NO_CLIENT = "__none__";

interface VesselFormProps {
  initialValues: VesselFormInput;
  submitLabel: string;
  submittingLabel: string;
  cancelTo: ReactNode;
  onSubmit: (values: VesselFormInput) => Promise<void>;
}

export function VesselForm({
  initialValues,
  submitLabel,
  submittingLabel,
  cancelTo,
  onSubmit,
}: VesselFormProps) {
  const [values, setValues] = useState<VesselFormInput>(initialValues);
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    listClients()
      .then((rows) => {
        if (active) setClients(rows);
      })
      .catch(() => {
        if (active) setFormError("Não foi possível carregar os clientes para vínculo.");
      })
      .finally(() => {
        if (active) setLoadingClients(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function update<K extends keyof VesselFormInput>(key: K, value: VesselFormInput[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError(null);

    const parsed = VesselFormSchema.safeParse(values);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof VesselFormInput | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(parsed.data);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Não foi possível salvar a embarcação agora.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor="name" error={errors.name}>
          <Input
            id="name"
            value={values.name}
            onChange={(e) => update("name", e.target.value)}
            maxLength={120}
            required
          />
        </Field>
        <Field label="Número IMO (opcional)" htmlFor="imoNumber" error={errors.imoNumber}>
          <Input
            id="imoNumber"
            value={values.imoNumber ?? ""}
            onChange={(e) => update("imoNumber", e.target.value)}
            inputMode="numeric"
            maxLength={20}
            placeholder="7 dígitos"
          />
        </Field>
        <Field label="Tipo de embarcação" htmlFor="vesselType" error={errors.vesselType}>
          <Input
            id="vesselType"
            value={values.vesselType ?? ""}
            onChange={(e) => update("vesselType", e.target.value)}
            maxLength={80}
            placeholder="PSV, AHTS, RSV..."
          />
        </Field>
        <Field label="Classe DP" htmlFor="dpClass" error={errors.dpClass}>
          <Input
            id="dpClass"
            value={values.dpClass ?? ""}
            onChange={(e) => update("dpClass", e.target.value)}
            maxLength={20}
            placeholder="DP1, DP2, DP3"
          />
        </Field>
        <Field label="Status" htmlFor="status" error={errors.status}>
          <Select
            value={values.status}
            onValueChange={(value) => update("status", value as VesselFormInput["status"])}
          >
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Ativa</SelectItem>
              <SelectItem value="inactive">Inativa</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Cliente (opcional)" htmlFor="clientId" error={errors.clientId}>
          <Select
            value={values.clientId ? values.clientId : NO_CLIENT}
            onValueChange={(value) => update("clientId", value === NO_CLIENT ? "" : value)}
            disabled={loadingClients}
          >
            <SelectTrigger id="clientId">
              <SelectValue placeholder={loadingClients ? "Carregando..." : "Sem vínculo"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CLIENT}>Sem vínculo</SelectItem>
              {clients.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {formError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {formError}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button asChild variant="ghost">
          {cancelTo}
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? submittingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
