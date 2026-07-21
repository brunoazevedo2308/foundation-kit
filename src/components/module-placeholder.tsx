import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "./page-header";

/**
 * Consistent placeholder for TT-006 module pages. Each module's real UI ships
 * in a later technical task — until then the shell renders a professional
 * empty state describing what will live here.
 */
export function ModulePlaceholder({
  title,
  description,
  icon: Icon,
  bullets,
  eta,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  bullets: string[];
  eta?: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title={title}
        description={description}
        actions={eta ? <Badge variant="secondary">{eta}</Badge> : undefined}
      />
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate">Em preparação</CardTitle>
              <CardDescription>
                A casca já está pronta. A funcionalidade completa chega em tarefas seguintes do
                backlog.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            {bullets.map((b) => (
              <li key={b} className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
