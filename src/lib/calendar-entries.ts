import { z } from "zod";

import { fetchCurrentOrganizationId } from "./clients";
import { emitEvent, sanitize } from "./observability";
import { supabase } from "./supabase";

export const CALENDAR_ACTIVITY_TYPES = ["annual_trials", "proving_trials", "dp_audit"] as const;
export type CalendarActivityType = (typeof CALENDAR_ACTIVITY_TYPES)[number];

export const CALENDAR_ENTRY_TYPES = [...CALENDAR_ACTIVITY_TYPES, "note", "activity"] as const;
export type CalendarEntryType = (typeof CALENDAR_ENTRY_TYPES)[number];

export const CALENDAR_ENTRY_TYPE_LABELS: Record<CalendarEntryType, string> = {
  annual_trials: "Annual Trials",
  proving_trials: "Proving Trials",
  dp_audit: "Auditoria DP",
  note: "Nota",
  activity: "Atividade",
};

export const VESSEL_CALENDAR_COLORS = [
  {
    dot: "bg-sky-500",
    badge: "border-sky-200 bg-sky-50 text-sky-800",
    border: "border-l-sky-500",
    dayMarker: "after:bg-sky-500",
  },
  {
    dot: "bg-emerald-500",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
    border: "border-l-emerald-500",
    dayMarker: "after:bg-emerald-500",
  },
  {
    dot: "bg-amber-500",
    badge: "border-amber-200 bg-amber-50 text-amber-800",
    border: "border-l-amber-500",
    dayMarker: "after:bg-amber-500",
  },
  {
    dot: "bg-violet-500",
    badge: "border-violet-200 bg-violet-50 text-violet-800",
    border: "border-l-violet-500",
    dayMarker: "after:bg-violet-500",
  },
  {
    dot: "bg-rose-500",
    badge: "border-rose-200 bg-rose-50 text-rose-800",
    border: "border-l-rose-500",
    dayMarker: "after:bg-rose-500",
  },
  {
    dot: "bg-cyan-500",
    badge: "border-cyan-200 bg-cyan-50 text-cyan-800",
    border: "border-l-cyan-500",
    dayMarker: "after:bg-cyan-500",
  },
  {
    dot: "bg-orange-500",
    badge: "border-orange-200 bg-orange-50 text-orange-800",
    border: "border-l-orange-500",
    dayMarker: "after:bg-orange-500",
  },
  {
    dot: "bg-indigo-500",
    badge: "border-indigo-200 bg-indigo-50 text-indigo-800",
    border: "border-l-indigo-500",
    dayMarker: "after:bg-indigo-500",
  },
] as const;

export function getVesselCalendarColor(vesselId: string) {
  let hash = 2166136261;
  for (const character of vesselId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return VESSEL_CALENDAR_COLORS[(hash >>> 0) % VESSEL_CALENDAR_COLORS.length];
}

export const CalendarEntryFormSchema = z.object({
  entryType: z.enum(CALENDAR_ACTIVITY_TYPES),
  vesselId: z.string().uuid("Selecione uma embarcação."),
  description: z
    .string()
    .trim()
    .max(4000, "Máximo de 4000 caracteres.")
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .default(null),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida."),
});

export type CalendarEntryFormInput = z.input<typeof CalendarEntryFormSchema>;

export type CalendarEntry = {
  id: string;
  entryType: CalendarEntryType;
  vesselId: string;
  vesselName: string;
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
  vessel_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  created_by: string;
  created_at: string;
  profiles?: Related<{ full_name: string | null }>;
  vessels?: Related<{ name: string }>;
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
    vesselId: row.vessel_id,
    vesselName: one(row.vessels)?.name ?? "Embarcação",
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
  "id, entry_type, vessel_id, title, description, starts_at, ends_at, all_day, created_by, created_at, vessels(name), profiles!calendar_entries_created_by_fkey(full_name)";

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

function localCalendarDate(date: string): string {
  return new Date(`${date}T12:00:00`).toISOString();
}

export async function createCalendarEntry(
  input: CalendarEntryFormInput,
  createdBy: string,
): Promise<CalendarEntry> {
  const parsed = CalendarEntryFormSchema.parse(input);
  const organizationId = await fetchCurrentOrganizationId();
  if (!organizationId) throw new Error("Seu perfil não está vinculado a uma organização.");

  const startsAt = localCalendarDate(parsed.date);

  const { data, error } = await client()
    .from("calendar_entries")
    .insert({
      organization_id: organizationId,
      entry_type: parsed.entryType,
      vessel_id: parsed.vesselId,
      title: CALENDAR_ENTRY_TYPE_LABELS[parsed.entryType],
      description: parsed.description,
      starts_at: startsAt,
      ends_at: null,
      all_day: true,
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
