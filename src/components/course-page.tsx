import { Link } from "@tanstack/react-router";
import { BookOpenCheck, Clock3 } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type CoursePageProps = {
  title: string;
  description: string;
};

export function CoursePage({ title, description }: CoursePageProps) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />

      <section className="max-w-3xl rounded-xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <BookOpenCheck className="size-6" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold text-foreground">{title}</h2>
              <Badge variant="secondary">Em preparação</Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              A área deste curso já está disponível. O conteúdo, os módulos e os materiais serão
              adicionados nas próximas etapas.
            </p>
            <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
              <Clock3 className="size-4" aria-hidden />
              <span>Conteúdo em desenvolvimento</span>
            </div>
          </div>
        </div>
      </section>

      <Button variant="outline" asChild>
        <Link to="/courses">Ver todos os cursos</Link>
      </Button>
    </div>
  );
}
