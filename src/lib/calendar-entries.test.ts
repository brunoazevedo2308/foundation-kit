import { describe, expect, it } from "vitest";

import { CalendarEntryFormSchema, isSameCalendarDay, mapCalendarEntry } from "./calendar-entries";

describe("CalendarEntryFormSchema", () => {
  const base = {
    entryType: "activity" as const,
    title: "Reunião de planejamento",
    description: "Alinhar as próximas atividades.",
    date: "2026-10-24",
    startTime: "09:00",
    endTime: "10:00",
  };

  it("accepts a scheduled activity", () => {
    expect(CalendarEntryFormSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an activity ending before it starts", () => {
    expect(CalendarEntryFormSchema.safeParse({ ...base, endTime: "08:59" }).success).toBe(false);
  });

  it("normalizes an empty description", () => {
    const parsed = CalendarEntryFormSchema.parse({ ...base, entryType: "note", description: "" });
    expect(parsed.description).toBeNull();
  });
});

describe("calendar entry mapping", () => {
  it("maps the author relationship", () => {
    const item = mapCalendarEntry({
      id: "entry-1",
      entry_type: "note",
      title: "Nota do dia",
      description: null,
      starts_at: "2026-10-24T15:00:00.000Z",
      ends_at: null,
      all_day: true,
      created_by: "user-1",
      created_at: "2026-10-24T12:00:00.000Z",
      profiles: [{ full_name: "Administrador" }],
    });
    expect(item.createdByName).toBe("Administrador");
    expect(isSameCalendarDay(item.startsAt, new Date(2026, 9, 24))).toBe(true);
  });
});
