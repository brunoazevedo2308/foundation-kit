import { useEffect, useState, type FormEvent } from "react";

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
  DELIVERABLE_STATUSES,
  DELIVERABLE_STATUS_LABELS,
  DeliverableFormSchema,
  type DeliverableFormInput,
} from "@/lib/deliverables";
import { listUsers, type UserListItem } from "@/lib/users";

/**
 * US-004 (4º ciclo) — formulário compartilhado de Entregáveis,
 * usado tanto na criação quanto na edição dentro do detalhe da Ação.
 */

export function emptyDeliverableForm(sequenceNumber: number): DeliverableFormInput {
  return {
    title: "",
    description: "",
    responsibleUserId: "",
    status: "pending",
    dueDate: "",
    sequenceNumber,
  };
}

type FieldErrors = Partial<Record<keyof DeliverableFormInput, string>>;

interface DeliverableFormProps {
  initialValues: DeliverableFormInput;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (values: DeliverableFormInput) => Promise<void>;
  onCancel: () => void;
}

export function DeliverableForm({
  initialValues,
  submitLabel,
  submittingLabel,
  onSubmit,
  onCancel,
}: DeliverableFormProps) {
  const [values, setValues] = useState<DeliverableFormInput>(initialValues);
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
    listUsers()
      .then((list) => {
        if (active) setUsers(list.filter((item) => item.status === "active"));
      })
      .catch(() => {
        if (active) setFormError("Não foi possível carregar os responsáveis.");
      })
      .finally(() => {
        if (active) setLoadingRefs(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function update<K extends keyof DeliverableFormInput>(key: K, value: DeliverableFormInput[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError(null);

    const parsed = DeliverableFormSchema.safeParse(values);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof DeliverableFormInput | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(values);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Não foi possível salvar o entregável.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-border bg-muted/30 p-4"
      noValidate
    >
      <Field label="Título" htmlFor="d-title" error={errors.title}>
        <Input
          id="d-title"
          value={values.title}
          onChange={(e) => update("title", e.target.value)}
          maxLength={160}
          required
        />
      </Field>

      <Field label="Descrição (opcional)" htmlFor="d-description" error={errors.description}>
        <Textarea
          id="d-description"
          value={values.description ?? ""}
          onChange={(e) => update("description", e.target.value)}
          maxLength={2000}
          rows={3}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Responsável" htmlFor="d-responsible" error={errors.responsibleUserId}>
          <Select
            value={values.responsibleUserId ? values.responsibleUserId : undefined}
            onValueChange={(value) => update("responsibleUserId", value)}
            disabled={loadingRefs || users.length === 0}
          >
            <SelectTrigger id="d-responsible">
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

        <Field label="Status" htmlFor="d-status" error={errors.status}>
          <Select
            value={values.status}
            onValueChange={(value) => update("status", value as DeliverableFormInput["status"])}
          >
            <SelectTrigger id="d-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DELIVERABLE_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {DELIVERABLE_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Prazo (opcional)" htmlFor="d-due" error={errors.dueDate}>
          <Input
            id="d-due"
            type="date"
            value={values.dueDate ?? ""}
            onChange={(e) => update("dueDate", e.target.value)}
          />
        </Field>

        <Field label="Ordem" htmlFor="d-sequence" error={errors.sequenceNumber}>
          <Input
            id="d-sequence"
            type="number"
            min={1}
            step={1}
            value={String(values.sequenceNumber ?? 1)}
            onChange={(e) => update("sequenceNumber", e.target.value)}
          />
        </Field>
      </div>

      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? submittingLabel : submitLabel}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancelar
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
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
