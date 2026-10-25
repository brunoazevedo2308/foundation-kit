import { createFileRoute } from "@tanstack/react-router";

import { DpAssessmentPage } from "@/components/dp-assessment-page";

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
  const { profile } = Route.useRouteContext();
  return <DpAssessmentPage role={profile.role} />;
}
