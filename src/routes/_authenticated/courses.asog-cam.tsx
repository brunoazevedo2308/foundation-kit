import { createFileRoute } from "@tanstack/react-router";

import { CoursePage } from "@/components/course-page";

export const Route = createFileRoute("/_authenticated/courses/asog-cam")({
  head: () => ({
    meta: [
      { title: "ASOG/CAM · Atino DP Suite" },
      { name: "description", content: "Curso ASOG/CAM." },
    ],
  }),
  component: AsogCamCoursePage,
});

function AsogCamCoursePage() {
  return (
    <CoursePage
      title="ASOG/CAM"
      description="Conteúdo e materiais de capacitação do curso ASOG/CAM."
    />
  );
}
