import { z } from "zod";

import type { AppRole } from "./auth";
import { fetchCurrentOrganizationId } from "./clients";
import { emitEvent, sanitize } from "./observability";
import { supabase } from "./supabase";

export type AssessmentDepartment = "nautical" | "engineering";
export type AssessmentDifficulty = "basic" | "intermediate" | "advanced";
export type AssessmentCriticality = "normal" | "relevant" | "critical";

export const DEPARTMENT_LABELS: Record<AssessmentDepartment, string> = {
  nautical: "Grupo A · Náutica",
  engineering: "Grupo B · Máquinas",
};

export const THEME_LABELS = {
  "decision-support": "Ferramentas de apoio à decisão",
  "fmea-key-elements": "FMEA e elementos-chave",
  "vessel-capability": "Capacidade da embarcação",
  "power-plant": "Planta de potência",
  "software-sensors-prs": "Software, sensores e PRS",
  "incident-factors": "Fatores de incidentes",
} as const;

export const DIFFICULTY_LABELS: Record<AssessmentDifficulty, string> = {
  basic: "Básica",
  intermediate: "Intermediária",
  advanced: "Avançada",
};

export const CRITICALITY_LABELS: Record<AssessmentCriticality, string> = {
  normal: "Normal",
  relevant: "Relevante",
  critical: "Crítica",
};

export const QuestionSchema = z.object({
  slotId: z.string().uuid(),
  prompt: z.string().trim().min(10, "Escreva uma pergunta com ao menos 10 caracteres.").max(4000),
  options: z.array(z.string().trim().min(1, "Preencha todas as alternativas.").max(1000)).length(4),
  correctOption: z.number().int().min(0).max(3),
  criticality: z.enum(["normal", "relevant", "critical"]),
  explanation: z
    .string()
    .trim()
    .max(4000)
    .transform((value) => value || null),
  isPublished: z.boolean(),
});

export type QuestionInput = z.input<typeof QuestionSchema>;

export type AssessmentModel = {
  id: string;
  department: AssessmentDepartment;
  modelNumber: number;
  isActive: boolean;
  durationMinutes: number;
};

export type AssessmentThemeRule = {
  department: AssessmentDepartment;
  themeCode: keyof typeof THEME_LABELS;
  minimumPercentage: number;
};

export type AssessmentSlot = {
  id: string;
  modelId: string;
  sequenceNumber: number;
  themeCode: keyof typeof THEME_LABELS;
  difficulty: AssessmentDifficulty;
  weight: number;
};

export type AssessmentQuestion = {
  id: string;
  slotId: string;
  prompt: string;
  options: string[];
  correctOption: number;
  criticality: AssessmentCriticality;
  explanation: string | null;
  isPublished: boolean;
};

export type CandidateTrack = {
  userId: string;
  fullName: string;
  department: AssessmentDepartment | null;
};

export type AssessmentAssignment = {
  id: string;
  userId: string;
  fullName: string;
  department: AssessmentDepartment;
  modelNumber: number;
  attemptNumber: number;
  status: string;
  assignedAt: string;
};

export type AssessmentAdminData = {
  models: AssessmentModel[];
  slots: AssessmentSlot[];
  questions: AssessmentQuestion[];
  candidates: CandidateTrack[];
  assignments: AssessmentAssignment[];
  themeRules: AssessmentThemeRule[];
};

export type CandidateAssessmentState = {
  state: "unassigned" | "preparing" | "assigned" | "in_progress";
  department?: AssessmentDepartment;
  assignment_id?: string;
  assigned_at?: string;
  ready_models?: number;
  required_models?: number;
};

function client() {
  if (!supabase) throw new Error("Supabase não está configurado.");
  return supabase;
}

export function canAdministerAssessment(role: AppRole): boolean {
  return role === "system_admin" || role === "organization_admin";
}

export function canEditAssessmentQuestions(role: AppRole): boolean {
  return role === "system_admin";
}

export function modelProgress(
  modelId: string,
  slots: AssessmentSlot[],
  questions: AssessmentQuestion[],
) {
  const modelSlots = slots.filter((slot) => slot.modelId === modelId);
  const questionBySlot = new Map(questions.map((question) => [question.slotId, question]));
  const filled = modelSlots.filter((slot) => questionBySlot.has(slot.id)).length;
  const published = modelSlots.filter((slot) => questionBySlot.get(slot.id)?.isPublished).length;
  return { total: modelSlots.length, filled, published, ready: published === 50 };
}

export async function listAssessmentAdminData(role: AppRole): Promise<AssessmentAdminData> {
  const c = client();
  const organizationId = await fetchCurrentOrganizationId();
  if (!organizationId) throw new Error("Seu perfil não está vinculado a uma organização.");

  const [modelsResult, slotsResult, rulesResult, usersResult, tracksResult, assignmentsResult] =
    await Promise.all([
      c
        .from("assessment_models")
        .select("id, department, model_number, is_active, duration_minutes")
        .order("department")
        .order("model_number"),
      c
        .from("assessment_model_slots")
        .select("id, model_id, sequence_number, theme_code, difficulty, weight")
        .order("sequence_number"),
      c.from("assessment_theme_rules").select("department, theme_code, minimum_percentage"),
      c
        .from("profiles")
        .select("id, full_name")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("full_name"),
      c
        .from("assessment_candidate_tracks")
        .select("user_id, department")
        .eq("organization_id", organizationId),
      c
        .from("assessment_assignments")
        .select(
          "id, user_id, department, attempt_number, status, assigned_at, assessment_models(model_number), profiles!assessment_assignments_user_id_fkey(full_name)",
        )
        .eq("organization_id", organizationId)
        .order("assigned_at", { ascending: false }),
    ]);

  const firstError = [
    modelsResult,
    slotsResult,
    rulesResult,
    usersResult,
    tracksResult,
    assignmentsResult,
  ].find((result) => result.error)?.error;
  if (firstError) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "assessment.admin.list", supabase_error: sanitize(firstError) },
    });
    throw new Error("Não foi possível carregar o DP Assessment.");
  }

  let questions: AssessmentQuestion[] = [];
  if (canEditAssessmentQuestions(role)) {
    const result = await c
      .from("assessment_questions")
      .select(
        "id, slot_id, prompt, options, correct_option, criticality, explanation, is_published",
      );
    if (result.error) throw new Error("Não foi possível carregar o banco de questões.");
    questions = (result.data ?? []).map((row) => ({
      id: row.id,
      slotId: row.slot_id,
      prompt: row.prompt,
      options: Array.isArray(row.options) ? row.options.map(String) : [],
      correctOption: row.correct_option,
      criticality: row.criticality as AssessmentCriticality,
      explanation: row.explanation,
      isPublished: row.is_published,
    }));
  }

  const tracks = new Map((tracksResult.data ?? []).map((row) => [row.user_id, row.department]));
  return {
    models: (modelsResult.data ?? []).map((row) => ({
      id: row.id,
      department: row.department as AssessmentDepartment,
      modelNumber: row.model_number,
      isActive: row.is_active,
      durationMinutes: row.duration_minutes,
    })),
    slots: (slotsResult.data ?? []).map((row) => ({
      id: row.id,
      modelId: row.model_id,
      sequenceNumber: row.sequence_number,
      themeCode: row.theme_code as keyof typeof THEME_LABELS,
      difficulty: row.difficulty as AssessmentDifficulty,
      weight: row.weight ?? 0,
    })),
    questions,
    themeRules: (rulesResult.data ?? []).map((row) => ({
      department: row.department as AssessmentDepartment,
      themeCode: row.theme_code as keyof typeof THEME_LABELS,
      minimumPercentage: row.minimum_percentage,
    })),
    candidates: (usersResult.data ?? []).map((row) => ({
      userId: row.id,
      fullName: row.full_name ?? "Nome não informado",
      department: (tracks.get(row.id) as AssessmentDepartment | undefined) ?? null,
    })),
    assignments: (assignmentsResult.data ?? []).map((row) => {
      const model = Array.isArray(row.assessment_models)
        ? row.assessment_models[0]
        : row.assessment_models;
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        id: row.id,
        userId: row.user_id,
        fullName: profile?.full_name ?? "Nome não informado",
        department: row.department as AssessmentDepartment,
        modelNumber: model?.model_number ?? 0,
        attemptNumber: row.attempt_number,
        status: row.status,
        assignedAt: row.assigned_at,
      };
    }),
  };
}

export async function saveCandidateTrack(userId: string, department: AssessmentDepartment) {
  const organizationId = await fetchCurrentOrganizationId();
  if (!organizationId) throw new Error("Seu perfil não está vinculado a uma organização.");
  const { error } = await client()
    .from("assessment_candidate_tracks")
    .upsert(
      { organization_id: organizationId, user_id: userId, department },
      { onConflict: "user_id" },
    );
  if (error) throw new Error("Não foi possível definir o grupo do participante.");
}

export async function saveAssessmentQuestion(input: QuestionInput) {
  const parsed = QuestionSchema.parse(input);
  const { error } = await client().from("assessment_questions").upsert(
    {
      slot_id: parsed.slotId,
      prompt: parsed.prompt,
      options: parsed.options,
      correct_option: parsed.correctOption,
      criticality: parsed.criticality,
      explanation: parsed.explanation,
      is_published: parsed.isPublished,
    },
    { onConflict: "slot_id" },
  );
  if (error) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "assessment.question.save", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível salvar a questão.");
  }
}

export async function deleteAssessmentQuestion(questionId: string) {
  const { error } = await client().from("assessment_questions").delete().eq("id", questionId);
  if (error) throw new Error("Não foi possível remover a questão.");
}

export async function assignMyAssessment(): Promise<CandidateAssessmentState> {
  const { data, error } = await client().rpc("assign_my_dp_assessment");
  if (error) throw new Error("Não foi possível preparar sua prova.");
  return data as CandidateAssessmentState;
}
