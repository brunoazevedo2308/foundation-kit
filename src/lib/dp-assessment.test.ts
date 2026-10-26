import { describe, expect, it } from "vitest";

import {
  canAdministerAssessment,
  canEditAssessmentQuestions,
  modelProgress,
  QuestionSchema,
  type AssessmentQuestion,
  type AssessmentSlot,
} from "./dp-assessment";

describe("DP Assessment authorization", () => {
  it("separa administração de conteúdo da gestão de participantes", () => {
    expect(canAdministerAssessment("system_admin")).toBe(true);
    expect(canAdministerAssessment("organization_admin")).toBe(true);
    expect(canAdministerAssessment("member")).toBe(false);
    expect(canEditAssessmentQuestions("system_admin")).toBe(true);
    expect(canEditAssessmentQuestions("organization_admin")).toBe(false);
  });
});

describe("QuestionSchema", () => {
  it("aceita uma questão completa com quatro alternativas", () => {
    const parsed = QuestionSchema.parse({
      slotId: "f0e98650-b623-4c8c-bc17-1238baa9bcdc",
      prompt: "Qual é a conduta correta neste cenário operacional?",
      options: ["Alternativa A", "Alternativa B", "Alternativa C", "Alternativa D"],
      correctOption: 2,
      criticality: "relevant",
      explanation: "",
      isPublished: false,
    });
    expect(parsed.explanation).toBeNull();
    expect(parsed.options).toHaveLength(4);
  });

  it("rejeita questão incompleta", () => {
    expect(
      QuestionSchema.safeParse({
        slotId: "f0e98650-b623-4c8c-bc17-1238baa9bcdc",
        prompt: "Curta",
        options: ["A", "B"],
        correctOption: 4,
        criticality: "normal",
        explanation: "",
        isPublished: false,
      }).success,
    ).toBe(false);
  });
});

describe("modelProgress", () => {
  it("conta preenchimento e publicação por modelo", () => {
    const slots = Array.from({ length: 50 }, (_, index) => ({
      id: `s${index}`,
      modelId: "m1",
      sequenceNumber: index + 1,
      themeCode: "decision-support",
      difficulty: "basic",
      weight: 1,
    })) as AssessmentSlot[];
    const questions = slots.map((slot, index) => ({
      id: `q${index}`,
      slotId: slot.id,
      prompt: "Pergunta válida para o teste",
      options: ["A", "B", "C", "D"],
      correctOption: 0,
      criticality: "normal",
      explanation: null,
      isPublished: index < 49,
    })) as AssessmentQuestion[];

    expect(modelProgress("m1", slots, questions)).toEqual({
      total: 50,
      filled: 50,
      published: 49,
      ready: false,
    });
  });
});
