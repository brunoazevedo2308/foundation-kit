import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { listUsers, type UserListItem } from "@/lib/users";
import { VesselFormSchema, type VesselFormInput } from "@/lib/vessels";

/**
 * US-004 (3º ciclo) — formulário compartilhado de Embarcações.
 * Usado na criação (`/vessels/new`) e na edição (`/vessels/$vesselId/edit`).
 */

export const EMPTY_VESSEL_FORM: VesselFormInput = {
  name: "",
  vesselType: "",
  dpClass: "",
  companyName: "",
  contractManagement: "",
  contractManager: "",
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
  initialKeyDpPersonnelUserIds?: string[];
  onSubmit: (values: VesselFormInput, extras: VesselFormExtras) => Promise<void>;
}

export type VesselFormExtras = {
  keyDpPersonnelUserIds: string[];
};

export function VesselForm({
  initialValues,
  submitLabel,
  submittingLabel,
  cancelTo,
  initialKeyDpPersonnelUserIds,
  onSubmit,
}: VesselFormProps) {
  const [values, setValues] = useState<VesselFormInput>(initialValues);
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [keyDpPersonnelUserIds, setKeyDpPersonnelUserIds] = useState(
    () => initialKeyDpPersonnelUserIds ?? [],
  );
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const selectedKeyDpPersonnelUserIds = new Set(keyDpPersonnelUserIds);

  useEffect(() => {
    setKeyDpPersonnelUserIds(initialKeyDpPersonnelUserIds ?? []);
  }, [initialKeyDpPersonnelUserIds]);

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
    listUsers()
      .then((rows) => {
        if (active) setUsers(rows.filter((item) => item.status === "active"));
      })
      .catch(() => {
        if (active) setFormError("Não foi possível carregar os usuários para o Key DP Personel.");
      })
      .finally(() => {
        if (active) setLoadingUsers(false);
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
      await onSubmit(parsed.data, { keyDpPersonnelUserIds });
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
        <Field label="Nome da empresa" htmlFor="companyName" error={errors.companyName}>
          <Input
            id="companyName"
            value={values.companyName ?? ""}
            onChange={(event) => update("companyName", event.target.value)}
            maxLength={160}
            autoComplete="organization"
          />
        </Field>
        <Field
          label="Gerência Contratual"
          htmlFor="contractManagement"
          error={errors.contractManagement}
        >
          <Input
            id="contractManagement"
            value={values.contractManagement ?? ""}
            onChange={(event) => update("contractManagement", event.target.value)}
            maxLength={160}
          />
        </Field>
        <Field label="Gerente de Contrato" htmlFor="contractManager" error={errors.contractManager}>
          <Input
            id="contractManager"
            value={values.contractManager ?? ""}
            onChange={(event) => update("contractManager", event.target.value)}
            maxLength={120}
            autoComplete="name"
          />
        </Field>
      </div>

      <fieldset className="space-y-3 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Key DP Personel</legend>
        <p className="text-sm text-muted-foreground">
          Selecione os tripulantes de pessoal-chave DP vinculados a esta embarcação.
        </p>
        {loadingUsers ? (
          <p className="text-sm text-muted-foreground">Carregando usuários...</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum usuário ativo disponível.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {users.map((user) => {
              const checked = selectedKeyDpPersonnelUserIds.has(user.id);
              const inputId = `key-dp-person-${user.id}`;
              return (
                <label
                  key={user.id}
                  htmlFor={inputId}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60"
                >
                  <Checkbox
                    id={inputId}
                    checked={checked}
                    onCheckedChange={(next) =>
                      setKeyDpPersonnelUserIds((current) =>
                        next === true
                          ? [...new Set([...current, user.id])]
                          : current.filter((id) => id !== user.id),
                      )
                    }
                  />
                  <span>{user.fullName ?? user.id}</span>
                </label>
              );
            })}
          </div>
        )}
      </fieldset>

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
