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
import { Textarea } from "@/components/ui/textarea";
import {
  ACTION_CRITICALITIES,
  ACTION_CRITICALITY_LABELS,
  ACTION_PRIORITIES,
  ACTION_PRIORITY_LABELS,
  ACTION_SITUATIONS,
  ACTION_SITUATION_LABELS,
  ACTION_STATUSES,
  ACTION_STATUS_LABELS,
  ActionFormSchema,
  type ActionFormInput,
} from "@/lib/actions";
import { listClients, type ClientListItem } from "@/lib/clients";
import { listUsers, type UserListItem } from "@/lib/users";
import { listVessels, type VesselListItem } from "@/lib/vessels";

/**
 * US-004 (2º ciclo) — formulário compartilhado de Ações.
 *
 * Usado tanto na criação (`/actions/new`) quanto na edição
 * (`/actions/$actionId/edit`), garantindo validação e rótulos idênticos.
 */

export const EMPTY_ACTION_FORM: ActionFormInput = {
  title: "",
  description: "",
  origin: "",
  actionType: "",
  responsibleUserId: "",
  clientId: "",
  vesselId: "",
  executionPriority: "medium",
  operationalCriticality: "medium",
  status: "open",
  situation: "no_blockers",
  dueDate: "",
};

type FieldErrors = Partial<Record<keyof ActionFormInput, string>>;

const NONE = "__none__";

interface ActionFormProps {
  initialValues: ActionFormInput;
  submitLabel: string;
  submittingLabel: string;
  cancelTo: ReactNode;
  onSubmit: (values: ActionFormInput) => Promise<void>;
}

export function ActionForm({
  initialValues,
  submitLabel,
  submittingLabel,
  cancelTo,
  onSubmit,
}: ActionFormProps) {
  const [values, setValues] = useState<ActionFormInput>(initialValues);
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [vessels, setVessels] = useState<VesselListItem[]>([]);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  useEffect(() => {
    let active = true;
    Promise.all([listClients(), listVessels(), listUsers()])
      .then(([c, v, u]) => {
        if (!active) return;
        setClients(c);
        setVessels(v);
        setUsers(u.filter((item) => item.status === "active"));
      })
      .catch(() => {
        if (active) setFormError("Não foi possível carregar os dados de vínculo.");
      })
      .finally(() => {
        if (active) setLoadingRefs(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function update<K extends keyof ActionFormInput>(key: K, value: ActionFormInput[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError(null);

    const parsed = ActionFormSchema.safeParse(values);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof ActionFormInput | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(values);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível salvar a ação.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-6" noValidate>
      <Field label="Título" htmlFor="title" error={errors.title}>
        <Input
          id="title"
          value={values.title}
          onChange={(e) => update("title", e.target.value)}
          maxLength={160}
          required
        />
      </Field>

      <Field label="Descrição (opcional)" htmlFor="description" error={errors.description}>
        <Textarea
          id="description"
          value={values.description ?? ""}
          onChange={(e) => update("description", e.target.value)}
          maxLength={2000}
          rows={4}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Origem (opcional)" htmlFor="origin" error={errors.origin}>
          <Input
            id="origin"
            value={values.origin ?? ""}
            onChange={(e) => update("origin", e.target.value)}
            maxLength={120}
            placeholder="Auditoria, incidente, FMEA..."
          />
        </Field>

        <Field label="Tipo (opcional)" htmlFor="actionType" error={errors.actionType}>
          <Input
            id="actionType"
            value={values.actionType ?? ""}
            onChange={(e) => update("actionType", e.target.value)}
            maxLength={80}
            placeholder="Corretiva, preventiva..."
          />
        </Field>

        <Field label="Responsável" htmlFor="responsibleUserId" error={errors.responsibleUserId}>
          <Select
            value={values.responsibleUserId ? values.responsibleUserId : undefined}
            onValueChange={(value) => update("responsibleUserId", value)}
            disabled={loadingRefs || users.length === 0}
          >
            <SelectTrigger id="responsibleUserId">
              <SelectValue
                placeholder={loadingRefs ? "Carregando..." : "Selecione o responsável"}
              />
            </SelectTrigger>
            <SelectContent>
              {users.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.fullName ?? item.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Prazo (opcional)" htmlFor="dueDate" error={errors.dueDate}>
          <Input
            id="dueDate"
            type="date"
            value={values.dueDate ?? ""}
            onChange={(e) => update("dueDate", e.target.value)}
          />
        </Field>

        <Field label="Cliente (opcional)" htmlFor="clientId" error={errors.clientId}>
          <Select
            value={values.clientId ? values.clientId : NONE}
            onValueChange={(value) => update("clientId", value === NONE ? "" : value)}
            disabled={loadingRefs}
          >
            <SelectTrigger id="clientId">
              <SelectValue placeholder="Sem vínculo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sem vínculo</SelectItem>
              {clients.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Embarcação (opcional)" htmlFor="vesselId" error={errors.vesselId}>
          <Select
            value={values.vesselId ? values.vesselId : NONE}
            onValueChange={(value) => update("vesselId", value === NONE ? "" : value)}
            disabled={loadingRefs}
          >
            <SelectTrigger id="vesselId">
              <SelectValue placeholder="Sem vínculo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sem vínculo</SelectItem>
              {vessels.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Prioridade de execução"
          htmlFor="executionPriority"
          error={errors.executionPriority}
        >
          <Select
            value={values.executionPriority}
            onValueChange={(value) =>
              update("executionPriority", value as ActionFormInput["executionPriority"])
            }
          >
            <SelectTrigger id="executionPriority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTION_PRIORITIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {ACTION_PRIORITY_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Criticidade operacional"
          htmlFor="operationalCriticality"
          error={errors.operationalCriticality}
        >
          <Select
            value={values.operationalCriticality}
            onValueChange={(value) =>
              update("operationalCriticality", value as ActionFormInput["operationalCriticality"])
            }
          >
            <SelectTrigger id="operationalCriticality">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTION_CRITICALITIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {ACTION_CRITICALITY_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Status" htmlFor="status" error={errors.status}>
          <Select
            value={values.status}
            onValueChange={(value) => update("status", value as ActionFormInput["status"])}
          >
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTION_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {ACTION_STATUS_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Situação" htmlFor="situation" error={errors.situation}>
          <Select
            value={values.situation}
            onValueChange={(value) => update("situation", value as ActionFormInput["situation"])}
          >
            <SelectTrigger id="situation">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTION_SITUATIONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {ACTION_SITUATION_LABELS[value]}
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

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? submittingLabel : submitLabel}
        </Button>
        <Button type="button" variant="outline" asChild>
          {cancelTo}
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
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
