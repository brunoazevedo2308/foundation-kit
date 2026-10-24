import { createFileRoute } from "@tanstack/react-router";
import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, Clock3, NotebookPen, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  CalendarEntryFormSchema,
  createCalendarEntry,
  isSameCalendarDay,
  listCalendarEntries,
  type CalendarEntry,
  type CalendarEntryType,
} from "@/lib/calendar-entries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({
    meta: [
      { title: "Calendário · Atino DP Suite" },
      { name: "description", content: "Notas e atividades programadas da organização." },
    ],
  }),
  component: CalendarPage,
});

function CalendarPage() {
  const { user } = Route.useRouteContext();
  const [month, setMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date());
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadEntries = useCallback(async (visibleMonth: Date) => {
    setLoading(true);
    setError(null);
    try {
      const from = startOfWeek(startOfMonth(visibleMonth), { weekStartsOn: 0 });
      const to = endOfWeek(endOfMonth(visibleMonth), { weekStartsOn: 0 });
      setEntries(await listCalendarEntries(from, to));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Não foi possível carregar o calendário.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEntries(month);
  }, [loadEntries, month]);

  const selectedEntries = useMemo(
    () => entries.filter((entry) => isSameCalendarDay(entry.startsAt, selectedDay)),
    [entries, selectedDay],
  );
  const daysWithEntries = useMemo(
    () => entries.map((entry) => new Date(entry.startsAt)),
    [entries],
  );

  async function handleCreated(entry: CalendarEntry) {
    setEntries((current) =>
      [...current.filter((item) => item.id !== entry.id), entry].sort((left, right) =>
        left.startsAt.localeCompare(right.startsAt),
      ),
    );
    const day = new Date(entry.startsAt);
    setSelectedDay(day);
    setMonth(day);
    setDialogOpen(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendário"
        description="Crie notas e programe atividades compartilhadas com sua organização."
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 size-4" />
                Novo registro
              </Button>
            </DialogTrigger>
            <CalendarEntryDialog day={selectedDay} createdBy={user.id} onCreated={handleCreated} />
          </Dialog>
        }
      />

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(22rem,0.9fr)_minmax(24rem,1.1fr)]">
        <section className="overflow-hidden rounded-xl border border-border bg-card p-3 shadow-sm sm:p-5">
          <Calendar
            mode="single"
            locale={ptBR}
            month={month}
            onMonthChange={setMonth}
            selected={selectedDay}
            onSelect={(day) => day && setSelectedDay(day)}
            modifiers={{ hasEntries: daysWithEntries }}
            modifiersClassNames={{
              hasEntries:
                "after:absolute after:bottom-1 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-secondary",
            }}
            className="mx-auto w-full bg-transparent p-0 [--cell-size:clamp(2.25rem,8vw,3.25rem)]"
            classNames={{ month: "flex w-full flex-col gap-4", table: "w-full border-collapse" }}
          />
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-secondary" /> Dia com registro
            </span>
            <span>Selecione um dia para ver os detalhes.</span>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <h2 className="font-semibold text-foreground">
                {format(selectedDay, "EEEE, d 'de' MMMM", { locale: ptBR })}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedEntries.length === 0
                  ? "Nenhum registro neste dia."
                  : `${selectedEntries.length} ${selectedEntries.length === 1 ? "registro" : "registros"}`}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 size-4" />
              Adicionar
            </Button>
          </div>

          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Carregando registros...
            </p>
          ) : selectedEntries.length === 0 ? (
            <div className="py-10 text-center">
              <CalendarDays className="mx-auto size-9 text-muted-foreground" aria-hidden />
              <p className="mt-3 text-sm font-medium">Dia livre</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Inclua uma nota ou agende uma atividade.
              </p>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {selectedEntries.map((entry) => (
                <CalendarEntryCard key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function CalendarEntryCard({ entry }: { entry: CalendarEntry }) {
  const isNote = entry.entryType === "note";
  return (
    <li className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-lg",
            isNote ? "bg-secondary/15 text-secondary" : "bg-primary/10 text-primary",
          )}
        >
          {isNote ? <NotebookPen className="size-4" /> : <Clock3 className="size-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium text-foreground">{entry.title}</h3>
            <span className="text-xs font-medium text-muted-foreground">
              {isNote
                ? "Nota"
                : `${format(new Date(entry.startsAt), "HH:mm")}–${format(new Date(entry.endsAt ?? entry.startsAt), "HH:mm")}`}
            </span>
          </div>
          {entry.description ? (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {entry.description}
            </p>
          ) : null}
          <p className="mt-3 text-xs text-muted-foreground">
            Criado por {entry.createdByName ?? "usuário"}
          </p>
        </div>
      </div>
    </li>
  );
}

function CalendarEntryDialog({
  day,
  createdBy,
  onCreated,
}: {
  day: Date;
  createdBy: string;
  onCreated: (entry: CalendarEntry) => Promise<void>;
}) {
  const [entryType, setEntryType] = useState<CalendarEntryType>("activity");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => format(day, "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => setDate(format(day, "yyyy-MM-dd")), [day]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsed = CalendarEntryFormSchema.safeParse({
      entryType,
      title,
      description,
      date,
      startTime,
      endTime,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revise os dados informados.");
      return;
    }

    setSubmitting(true);
    try {
      const created = await createCalendarEntry(parsed.data, createdBy);
      setTitle("");
      setDescription("");
      await onCreated(created);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar o registro.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Novo registro</DialogTitle>
        <DialogDescription>
          Adicione uma nota ou agende uma atividade no calendário compartilhado.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="calendar-type">Tipo</Label>
            <Select
              value={entryType}
              onValueChange={(value) => setEntryType(value as CalendarEntryType)}
            >
              <SelectTrigger id="calendar-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="activity">Atividade</SelectItem>
                <SelectItem value="note">Nota</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="calendar-date">Data</Label>
            <Input
              id="calendar-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="calendar-title">Título</Label>
          <Input
            id="calendar-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={160}
            autoFocus
            required
          />
        </div>
        {entryType === "activity" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="calendar-start">Início</Label>
              <Input
                id="calendar-start"
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="calendar-end">Término</Label>
              <Input
                id="calendar-end"
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                required
              />
            </div>
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="calendar-description">Descrição (opcional)</Label>
          <Textarea
            id="calendar-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={4000}
            rows={4}
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Salvando..." : "Salvar registro"}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
