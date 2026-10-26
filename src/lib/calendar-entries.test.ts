import { describe, expect, it } from "vitest";

import {
  CALENDAR_ACTIVITY_TYPES,
  CalendarEntryFormSchema,
  isSameCalendarDay,
  mapCalendarEntry,
} from "./calendar-entries";

describe("CalendarEntryFormSchema", () => {
  const base = {
    entryType: "annual_trials" as const,
    vesselId: "11111111-1111-4111-8111-111111111111",
    description: "Alinhar as próximas atividades.",
    date: "2026-10-24",
  };

  it.each(CALENDAR_ACTIVITY_TYPES)("accepts the scheduled activity type %s", (entryType) => {
    expect(CalendarEntryFormSchema.safeParse({ ...base, entryType }).success).toBe(true);
  });

  it("does not accept legacy types for new records", () => {
    expect(CalendarEntryFormSchema.safeParse({ ...base, entryType: "activity" }).success).toBe(
      false,
    );
    expect(CalendarEntryFormSchema.safeParse({ ...base, entryType: "note" }).success).toBe(false);
  });

  it("normalizes an empty description", () => {
    const parsed = CalendarEntryFormSchema.parse({ ...base, description: "" });
    expect(parsed.description).toBeNull();
  });
});

describe("calendar entry mapping", () => {
  it("maps the author relationship", () => {
    const item = mapCalendarEntry({
      id: "entry-1",
      entry_type: "note",
      vessel_id: "11111111-1111-4111-8111-111111111111",
      title: "Nota do dia",
      description: null,
      starts_at: "2026-10-24T15:00:00.000Z",
      ends_at: null,
      all_day: true,
      created_by: "user-1",
      created_at: "2026-10-24T12:00:00.000Z",
      profiles: [{ full_name: "Administrador" }],
      vessels: [{ name: "ACE Defender" }],
    });
    expect(item.createdByName).toBe("Administrador");
    expect(item.vesselName).toBe("ACE Defender");
    expect(isSameCalendarDay(item.startsAt, new Date(2026, 9, 24))).toBe(true);
  });
});
