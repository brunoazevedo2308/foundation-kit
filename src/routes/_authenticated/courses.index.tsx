import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpenCheck, ChevronRight, ClipboardCheck } from "lucide-react";

import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/courses/")({
  head: () => ({
    meta: [
      { title: "Cursos · Atino DP Suite" },
      { name: "description", content: "Cursos disponíveis no Atino DP Suite." },
    ],
  }),
  component: CoursesPage,
});

const COURSES = [
  {
    title: "ASOG/CAM",
    description: "Área dedicada ao curso ASOG/CAM.",
    to: "/courses/asog-cam" as const,
    icon: BookOpenCheck,
  },
  {
    title: "DP Assessment",
    description: "Área dedicada ao curso DP Assessment.",
    to: "/courses/dp-assessment" as const,
    icon: ClipboardCheck,
  },
];

function CoursesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Cursos" description="Acesse os cursos disponíveis na plataforma." />

      <div className="grid gap-4 lg:grid-cols-2">
        {COURSES.map((course) => (
          <Link
            key={course.to}
            to={course.to}
            className="group flex min-h-36 items-start gap-4 rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6"
          >
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <course.icon className="size-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-foreground">{course.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{course.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                Abrir curso
                <ChevronRight
                  className="size-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
