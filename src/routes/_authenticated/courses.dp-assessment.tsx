import { createFileRoute } from "@tanstack/react-router";

import { CoursePage } from "@/components/course-page";

export const Route = createFileRoute("/_authenticated/courses/dp-assessment")({
  head: () => ({
    meta: [
      { title: "DP Assessment · Atino DP Suite" },
      { name: "description", content: "Curso DP Assessment." },
    ],
  }),
  component: DpAssessmentCoursePage,
});

function DpAssessmentCoursePage() {
  return (
    <CoursePage
      title="DP Assessment"
      description="Conteúdo e materiais de capacitação do curso DP Assessment."
    />
  );
}
