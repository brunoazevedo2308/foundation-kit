import { CheckCircle2, ClipboardCheck, LockKeyhole, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import type { AppRole } from "@/lib/auth";
import {
  assignMyAssessment,
  canEditAssessmentQuestions,
  CRITICALITY_LABELS,
  deleteAssessmentQuestion,
  DEPARTMENT_LABELS,
  DIFFICULTY_LABELS,
  listAssessmentAdminData,
  modelProgress,
  QuestionSchema,
  saveAssessmentQuestion,
  saveCandidateTrack,
  THEME_LABELS,
  type AssessmentAdminData,
  type AssessmentCriticality,
  type AssessmentDepartment,
  type AssessmentQuestion,
  type CandidateAssessmentState,
} from "@/lib/dp-assessment";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const EMPTY_DATA: AssessmentAdminData = {
  models: [],
  slots: [],
  questions: [],
  candidates: [],
  assignments: [],
  themeRules: [],
};

const EMPTY_FORM = {
  prompt: "",
  options: ["", "", "", ""],
  correctOption: 0,
  criticality: "normal" as AssessmentCriticality,
  explanation: "",
  isPublished: false,
};

export function DpAssessmentPage({ role }: { role: AppRole }) {
  if (role === "member") return <CandidateAssessment />;
  return <AssessmentAdministration role={role} />;
}

function CandidateAssessment() {
  const [state, setState] = useState<CandidateAssessmentState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    assignMyAssessment()
      .then((result) => active && setState(result))
      .catch(
        (reason) =>
          active &&
          setError(
            reason instanceof Error ? reason.message : "Não foi possível preparar sua prova.",
          ),
      );
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="DP Assessment"
        description="Avaliação de competência em Dynamic Positioning."
      />
      <section className="max-w-3xl rounded-xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <ClipboardCheck className="size-6" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold">Sua avaliação</h2>
            {error ? (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {!state && !error ? (
              <p className="mt-3 text-sm text-muted-foreground">Preparando sua avaliação...</p>
            ) : null}
            {state?.state === "unassigned" ? (
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Seu grupo ainda não foi definido. Solicite ao administrador a vinculação ao Grupo A
                · Náutica ou Grupo B · Máquinas.
              </p>
            ) : null}
            {state?.state === "preparing" ? (
              <div className="mt-3 space-y-2">
                <Badge variant="secondary">
                  {state.department ? DEPARTMENT_LABELS[state.department] : "Grupo definido"}
                </Badge>
                <p className="text-sm leading-6 text-muted-foreground">
                  O banco está em preparação ({state.ready_models ?? 0} de{" "}
                  {state.required_models ?? 6} modelos completos). A prova será liberada quando os
                  seis modelos estiverem validados.
                </p>
              </div>
            ) : null}
            {state?.state === "assigned" || state?.state === "in_progress" ? (
              <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="flex items-center gap-2 font-medium text-emerald-800">
                  <CheckCircle2 className="size-5" aria-hidden /> Avaliação preparada
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {state.department ? DEPARTMENT_LABELS[state.department] : "Grupo definido"} · 50
                  questões · até 90 minutos.
                </p>
                <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <LockKeyhole className="size-4" aria-hidden /> O modelo foi atribuído de forma
                  protegida e não é exibido ao participante.
                </p>
                <Button className="mt-4" disabled>
                  Iniciar prova (próxima etapa)
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function AssessmentAdministration({ role }: { role: AppRole }) {
  const [data, setData] = useState(EMPTY_DATA);
  const [department, setDepartment] = useState<AssessmentDepartment>("nautical");
  const [modelId, setModelId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canEdit = canEditAssessmentQuestions(role);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listAssessmentAdminData(role);
      setData(result);
      setModelId(
        (current) =>
          current || result.models.find((model) => model.department === "nautical")?.id || "",
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Não foi possível carregar o DP Assessment.",
      );
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    void load();
  }, [load]);

  const departmentModels = data.models.filter((model) => model.department === department);
  const selectedModel =
    data.models.find((model) => model.id === modelId && model.department === department) ??
    departmentModels[0];

  function changeDepartment(next: string) {
    const value = next as AssessmentDepartment;
    setDepartment(value);
    setModelId(data.models.find((model) => model.department === value)?.id ?? "");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="DP Assessment"
        description="Modelos de prova, banco de questões e distribuição protegida por participante."
      />
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Estrutura ATN-DP-ASS-004</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Seis modelos por grupo, 50 questões por modelo e matriz de dificuldade bloqueada.
            </p>
          </div>
          <Badge variant="outline">
            <ShieldCheck className="mr-1 size-4" aria-hidden /> Modelo oculto do participante
          </Badge>
        </div>

        <Tabs value={department} onValueChange={changeDepartment} className="mt-5">
          <TabsList className="grid h-auto w-full grid-cols-2 sm:w-fit">
            <TabsTrigger value="nautical">Grupo A · Náutica</TabsTrigger>
            <TabsTrigger value="engineering">Grupo B · Máquinas</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <p className="mt-6 text-sm text-muted-foreground">Carregando modelos...</p>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {departmentModels.map((model) => {
              const progress = modelProgress(model.id, data.slots, data.questions);
              const selected = selectedModel?.id === model.id;
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => setModelId(model.id)}
                  className={`touch-manipulation rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">Modelo {model.modelNumber}</span>
                    <span
                      className={`size-2 rounded-full ${progress.ready ? "bg-emerald-500" : "bg-amber-500"}`}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {canEdit
                      ? `${progress.published}/50 publicadas`
                      : "Identificação administrativa"}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {canEdit && selectedModel ? (
        <QuestionBank
          modelId={selectedModel.id}
          modelNumber={selectedModel.modelNumber}
          department={department}
          data={data}
          onChanged={load}
        />
      ) : (
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Banco de questões protegido</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Somente o administrador do sistema pode consultar gabaritos e editar questões. Você pode
            definir os grupos dos participantes e consultar os modelos atribuídos.
          </p>
        </section>
      )}

      <CandidateManagement data={data} onChanged={load} />
    </div>
  );
}

function QuestionBank({
  modelId,
  modelNumber,
  department,
  data,
  onChanged,
}: {
  modelId: string;
  modelNumber: number;
  department: AssessmentDepartment;
  data: AssessmentAdminData;
  onChanged: () => Promise<void>;
}) {
  const slots = useMemo(
    () => data.slots.filter((slot) => slot.modelId === modelId),
    [data.slots, modelId],
  );
  const questionBySlot = useMemo(
    () => new Map(data.questions.map((question) => [question.slotId, question])),
    [data.questions],
  );
  const [slotId, setSlotId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setSlotId("");
    setForm(EMPTY_FORM);
  }, [modelId]);

  function selectSlot(value: string) {
    setSlotId(value);
    const question = questionBySlot.get(value);
    setForm(
      question
        ? {
            prompt: question.prompt,
            options: [...question.options],
            correctOption: question.correctOption,
            criticality: question.criticality,
            explanation: question.explanation ?? "",
            isPublished: question.isPublished,
          }
        : EMPTY_FORM,
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const parsed = QuestionSchema.safeParse({ slotId, ...form });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? "Revise a questão.");
      return;
    }
    setSaving(true);
    try {
      await saveAssessmentQuestion({ slotId, ...form });
      setMessage("Questão salva.");
      await onChanged();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Não foi possível salvar a questão.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(question: AssessmentQuestion) {
    if (
      !window.confirm(
        `Remover a questão ${slots.find((slot) => slot.id === question.slotId)?.sequenceNumber ?? ""}?`,
      )
    )
      return;
    try {
      await deleteAssessmentQuestion(question.id);
      setSlotId("");
      setForm(EMPTY_FORM);
      await onChanged();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Não foi possível remover a questão.");
    }
  }

  const progress = modelProgress(modelId, data.slots, data.questions);
  const grouped = Object.entries(THEME_LABELS).map(([code, label]) => {
    const themeSlots = slots.filter((slot) => slot.themeCode === code);
    const rule = data.themeRules.find(
      (item) => item.department === department && item.themeCode === code,
    );
    return {
      code,
      label,
      total: themeSlots.length,
      filled: themeSlots.filter((slot) => questionBySlot.has(slot.id)).length,
      basic: themeSlots.filter((slot) => slot.difficulty === "basic").length,
      intermediate: themeSlots.filter((slot) => slot.difficulty === "intermediate").length,
      advanced: themeSlots.filter((slot) => slot.difficulty === "advanced").length,
      minimumPercentage: rule?.minimumPercentage ?? 0,
    };
  });

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">
            {DEPARTMENT_LABELS[department]} · Modelo {modelNumber}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {progress.filled}/50 preenchidas · {progress.published}/50 publicadas
          </p>
        </div>
        <Badge variant={progress.ready ? "default" : "secondary"}>
          {progress.ready ? "Pronto para sorteio" : "Em preparação"}
        </Badge>
      </div>

      <div className="mt-5 overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3">Tema</th>
              <th className="p-3">Básicas</th>
              <th className="p-3">Intermediárias</th>
              <th className="p-3">Avançadas</th>
              <th className="p-3">Mínimo</th>
              <th className="p-3">Preenchidas</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((row) => (
              <tr key={row.code} className="border-t">
                <td className="p-3 font-medium">{row.label}</td>
                <td className="p-3">{row.basic}</td>
                <td className="p-3">{row.intermediate}</td>
                <td className="p-3">{row.advanced}</td>
                <td className="p-3">{row.minimumPercentage}%</td>
                <td className="p-3">
                  {row.filled}/{row.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={submit} className="mt-6 space-y-5 rounded-lg border border-border p-4">
        <div>
          <Label htmlFor="assessment-slot">Posição na matriz</Label>
          <Select value={slotId} onValueChange={selectSlot}>
            <SelectTrigger id="assessment-slot" className="mt-2">
              <SelectValue placeholder="Selecione a posição da questão" />
            </SelectTrigger>
            <SelectContent>
              {slots.map((slot) => (
                <SelectItem key={slot.id} value={slot.id}>
                  Questão {slot.sequenceNumber} · {THEME_LABELS[slot.themeCode]} ·{" "}
                  {DIFFICULTY_LABELS[slot.difficulty]}{" "}
                  {questionBySlot.has(slot.id) ? "(preenchida)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="assessment-prompt">Pergunta</Label>
          <Textarea
            id="assessment-prompt"
            className="mt-2 min-h-28"
            value={form.prompt}
            onChange={(event) => setForm((current) => ({ ...current, prompt: event.target.value }))}
            disabled={!slotId}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {form.options.map((option, index) => (
            <div key={index}>
              <Label htmlFor={`assessment-option-${index}`}>
                Alternativa {String.fromCharCode(65 + index)}
              </Label>
              <Input
                id={`assessment-option-${index}`}
                className="mt-2"
                value={option}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    options: current.options.map((item, itemIndex) =>
                      itemIndex === index ? event.target.value : item,
                    ),
                  }))
                }
                disabled={!slotId}
              />
            </div>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Resposta correta</Label>
            <Select
              value={String(form.correctOption)}
              onValueChange={(value) =>
                setForm((current) => ({ ...current, correctOption: Number(value) }))
              }
              disabled={!slotId}
            >
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[0, 1, 2, 3].map((index) => (
                  <SelectItem key={index} value={String(index)}>
                    Alternativa {String.fromCharCode(65 + index)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Criticidade</Label>
            <Select
              value={form.criticality}
              onValueChange={(value) =>
                setForm((current) => ({ ...current, criticality: value as AssessmentCriticality }))
              }
              disabled={!slotId}
            >
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CRITICALITY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="assessment-explanation">Justificativa do gabarito (opcional)</Label>
          <Textarea
            id="assessment-explanation"
            className="mt-2"
            value={form.explanation}
            onChange={(event) =>
              setForm((current) => ({ ...current, explanation: event.target.value }))
            }
            disabled={!slotId}
          />
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={form.isPublished}
            onChange={(event) =>
              setForm((current) => ({ ...current, isPublished: event.target.checked }))
            }
            disabled={!slotId}
            className="size-4"
          />{" "}
          Publicada e disponível para compor a prova
        </label>
        {message ? (
          <p role="status" className="text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!slotId || saving}>
            {saving ? "Salvando..." : "Salvar questão"}
          </Button>
          {slotId && questionBySlot.get(slotId) ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => void remove(questionBySlot.get(slotId)!)}
            >
              <Trash2 className="mr-2 size-4" aria-hidden /> Remover
            </Button>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function CandidateManagement({
  data,
  onChanged,
}: {
  data: AssessmentAdminData;
  onChanged: () => Promise<void>;
}) {
  const [savingUser, setSavingUser] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function assign(userId: string, department: AssessmentDepartment) {
    setSavingUser(userId);
    setMessage(null);
    try {
      await saveCandidateTrack(userId, department);
      await onChanged();
      setMessage("Grupo do participante atualizado.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Não foi possível atualizar o grupo.");
    } finally {
      setSavingUser(null);
    }
  }

  const latestByUser = new Map<string, AssessmentAdminData["assignments"][number]>();
  for (const assignment of data.assignments)
    if (!latestByUser.has(assignment.userId)) latestByUser.set(assignment.userId, assignment);

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <h2 className="font-semibold">Participantes e distribuição</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Defina o grupo. Quando os seis modelos estiverem completos, o primeiro acesso do
        participante recebe automaticamente o modelo menos utilizado, com desempate aleatório.
      </p>
      {message ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
      <div className="mt-5 space-y-3">
        {data.candidates.map((candidate) => {
          const assignment = latestByUser.get(candidate.userId);
          return (
            <div
              key={candidate.userId}
              className="grid gap-3 rounded-lg border p-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.7fr)_minmax(180px,0.6fr)] md:items-center"
            >
              <div>
                <p className="font-medium">{candidate.fullName}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {assignment
                    ? `Modelo ${assignment.modelNumber} · tentativa ${assignment.attemptNumber} · ${assignment.status}`
                    : "Modelo ainda não atribuído"}
                </p>
              </div>
              <Select
                value={candidate.department ?? ""}
                onValueChange={(value) =>
                  void assign(candidate.userId, value as AssessmentDepartment)
                }
                disabled={savingUser === candidate.userId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Definir grupo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nautical">Grupo A · Náutica</SelectItem>
                  <SelectItem value="engineering">Grupo B · Máquinas</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground">
                {candidate.department
                  ? DEPARTMENT_LABELS[candidate.department]
                  : "Aguardando definição"}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
