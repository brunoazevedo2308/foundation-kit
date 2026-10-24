import { z } from "zod";

import { fetchCurrentOrganizationId } from "./clients";
import { emitEvent, sanitize } from "./observability";
import { supabase } from "./supabase";

export const CALENDAR_ENTRY_TYPES = ["note", "activity"] as const;
export type CalendarEntryType = (typeof CALENDAR_ENTRY_TYPES)[number];

export const CalendarEntryFormSchema = z
  .object({
    entryType: z.enum(CALENDAR_ENTRY_TYPES),
    title: z.string().trim().min(2, "Informe um título.").max(160, "Máximo de 160 caracteres."),
    description: z
      .string()
      .trim()
      .max(4000, "Máximo de 4000 caracteres.")
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .default(null),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida."),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Informe um horário válido."),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Informe um horário válido."),
  })
  .superRefine((value, context) => {
    if (value.entryType === "activity" && value.endTime < value.startTime) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: "O término não pode ser anterior ao início.",
      });
    }
  });

export type CalendarEntryFormInput = z.input<typeof CalendarEntryFormSchema>;

export type CalendarEntry = {
  id: string;
  entryType: CalendarEntryType;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
};

type Related<T> = T | T[] | null | undefined;
type CalendarEntryRow = {
  id: string;
  entry_type: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  created_by: string;
  created_at: string;
  profiles?: Related<{ full_name: string | null }>;
};

function one<T>(value: Related<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function client() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return supabase;
}

export function mapCalendarEntry(row: CalendarEntryRow): CalendarEntry {
  if (!CALENDAR_ENTRY_TYPES.includes(row.entry_type as CalendarEntryType)) {
    throw new Error("Tipo de registro de calendário inválido.");
  }
  return {
    id: row.id,
    entryType: row.entry_type as CalendarEntryType,
    title: row.title,
    description: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    allDay: row.all_day,
    createdBy: row.created_by,
    createdByName: one(row.profiles)?.full_name ?? null,
    createdAt: row.created_at,
  };
}

const SELECT_COLUMNS =
  "id, entry_type, title, description, starts_at, ends_at, all_day, created_by, created_at, profiles!calendar_entries_created_by_fkey(full_name)";

export async function listCalendarEntries(from: Date, to: Date): Promise<CalendarEntry[]> {
  const { data, error } = await client()
    .from("calendar_entries")
    .select(SELECT_COLUMNS)
    .gte("starts_at", from.toISOString())
    .lte("starts_at", to.toISOString())
    .order("starts_at", { ascending: true });

  if (error) {
    emitEvent({
      event_name: "backend.request.failure",
      context: { operation: "calendar_entries.list", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível carregar o calendário.");
  }

  return ((data ?? []) as CalendarEntryRow[]).map(mapCalendarEntry);
}

function localDateTime(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

export async function createCalendarEntry(
  input: CalendarEntryFormInput,
  createdBy: string,
): Promise<CalendarEntry> {
  const parsed = CalendarEntryFormSchema.parse(input);
  const organizationId = await fetchCurrentOrganizationId();
  if (!organizationId) throw new Error("Seu perfil não está vinculado a uma organização.");

  const isNote = parsed.entryType === "note";
  const startsAt = localDateTime(parsed.date, isNote ? "12:00" : parsed.startTime);
  const endsAt = isNote ? null : localDateTime(parsed.date, parsed.endTime);

  const { data, error } = await client()
    .from("calendar_entries")
    .insert({
      organization_id: organizationId,
      entry_type: parsed.entryType,
      title: parsed.title,
      description: parsed.description,
      starts_at: startsAt,
      ends_at: endsAt,
      all_day: isNote,
      created_by: createdBy,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    emitEvent({
      event_name: "backend.request.failure",
      user_id: createdBy,
      organization_id: organizationId,
      context: { operation: "calendar_entries.create", supabase_error: sanitize(error) },
    });
    throw new Error("Não foi possível salvar no calendário.");
  }

  return mapCalendarEntry(data as CalendarEntryRow);
}

export function isSameCalendarDay(value: string, day: Date): boolean {
  const entryDate = new Date(value);
  return (
    entryDate.getFullYear() === day.getFullYear() &&
    entryDate.getMonth() === day.getMonth() &&
    entryDate.getDate() === day.getDate()
  );
}
