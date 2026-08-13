import { describe, it, expect, vi } from "vitest";
import {
  sanitizeEvidenceFilename,
  buildEvidencePath,
  validateEvidenceFile,
  uploadEvidence,
  createEvidenceSignedUrl,
  EvidenceStorageError,
  EVIDENCE_ALLOWED_MIME_TYPES,
  EVIDENCE_MAX_BYTES,
  type EvidenceSupabaseLike,
} from "./evidence-storage";

const ORG = "11111111-1111-4111-8111-111111111111";
const ACTION = "22222222-2222-4222-8222-222222222222";
const DELIV = "33333333-3333-4333-8333-333333333333";
const EVID = "44444444-4444-4444-8444-444444444444";

describe("sanitizeEvidenceFilename", () => {
  it("strips path components (unix + windows)", () => {
    expect(sanitizeEvidenceFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeEvidenceFilename("C:\\evil\\report.pdf")).toBe("report.pdf");
  });
  it("removes control chars and NUL bytes", () => {
    expect(sanitizeEvidenceFilename("bad\x00name\x1f.pdf")).toBe("badname.pdf");
  });
  it("normalizes unsafe characters", () => {
    expect(sanitizeEvidenceFilename("relatório final #1.PDF")).toBe("relat_rio_final_1.pdf");
  });
  it("preserves a single extension and lowercases it", () => {
    expect(sanitizeEvidenceFilename("Report.Final.DOCX")).toBe("Report.Final.docx");
  });
  it("rejects empty / dotfile-only names", () => {
    expect(() => sanitizeEvidenceFilename("")).toThrow(EvidenceStorageError);
    expect(() => sanitizeEvidenceFilename(".")).toThrow(EvidenceStorageError);
    expect(() => sanitizeEvidenceFilename("..")).toThrow(EvidenceStorageError);
  });
  it("caps length at 180 chars, preserving extension", () => {
    const long = "a".repeat(400) + ".pdf";
    const out = sanitizeEvidenceFilename(long);
    expect(out.length).toBeLessThanOrEqual(180);
    expect(out.endsWith(".pdf")).toBe(true);
  });
});

describe("buildEvidencePath", () => {
  it("builds the canonical path", () => {
    expect(
      buildEvidencePath({
        organizationId: ORG,
        actionId: ACTION,
        deliverableId: DELIV,
        evidenceId: EVID,
        filename: "hello world.pdf",
      }),
    ).toBe(
      `organization/${ORG}/actions/${ACTION}/deliverables/${DELIV}/evidences/${EVID}/hello_world.pdf`,
    );
  });
  it("rejects non-UUID inputs", () => {
    expect(() =>
      buildEvidencePath({
        organizationId: "not-a-uuid",
        actionId: ACTION,
        deliverableId: DELIV,
        evidenceId: EVID,
        filename: "x.pdf",
      }),
    ).toThrow(EvidenceStorageError);
  });
});

describe("validateEvidenceFile", () => {
  it("accepts a small allowed pdf", () => {
    expect(() =>
      validateEvidenceFile({ name: "a.pdf", size: 1024, type: "application/pdf" }),
    ).not.toThrow();
  });
  it("rejects empty files", () => {
    expect(() => validateEvidenceFile({ name: "a.pdf", size: 0, type: "application/pdf" })).toThrow(
      EvidenceStorageError,
    );
  });
  it("rejects oversize files", () => {
    try {
      validateEvidenceFile({
        name: "a.pdf",
        size: EVIDENCE_MAX_BYTES + 1,
        type: "application/pdf",
      });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(EvidenceStorageError);
      expect((e as EvidenceStorageError).code).toBe("file_too_large");
    }
  });
  it("rejects disallowed MIME types", () => {
    try {
      validateEvidenceFile({ name: "a.exe", size: 10, type: "application/x-msdownload" });
      throw new Error("expected throw");
    } catch (e) {
      expect((e as EvidenceStorageError).code).toBe("mime_not_allowed");
    }
  });
  it("exposes exactly the approved MIME whitelist (mirrors remote)", () => {
    expect([...EVIDENCE_ALLOWED_MIME_TYPES].sort()).toEqual(
      [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
        "text/plain",
        "text/csv",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ].sort(),
    );
  });
  it.each([
    "image/gif",
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ])("rejects legacy/removed MIME type %s", (mime) => {
    try {
      validateEvidenceFile({ name: "x.bin", size: 10, type: mime });
      throw new Error("expected throw");
    } catch (e) {
      expect((e as EvidenceStorageError).code).toBe("mime_not_allowed");
    }
  });
});

// ---- upload flow with mocked Supabase --------------------------------------

function makeFile(): File {
  return new File([new Uint8Array([1, 2, 3, 4])], "Report Q1.pdf", { type: "application/pdf" });
}

function makeClient(overrides?: {
  insertError?: unknown;
  uploadError?: unknown;
  updateError?: unknown;
}): EvidenceSupabaseLike & {
  _uploads: { path: string }[];
  _updates: { id: unknown; row: Record<string, unknown> }[];
} {
  const uploads: { path: string }[] = [];
  const updates: { id: unknown; row: Record<string, unknown> }[] = [];
  return {
    _uploads: uploads,
    _updates: updates,
    from(_table: string) {
      return {
        insert(_row: Record<string, unknown>) {
          return {
            select(_c: string) {
              return {
                single: async () => ({
                  data: overrides?.insertError ? null : { id: "ok" },
                  error: overrides?.insertError ?? null,
                }),
              };
            },
          };
        },
        update(row: Record<string, unknown>) {
          return {
            eq: async (_col: string, val: unknown) => {
              updates.push({ id: val, row });
              return { error: overrides?.updateError ?? null };
            },
          };
        },
      };
    },
    storage: {
      from(_bucket: string) {
        return {
          upload: async (path: string) => {
            uploads.push({ path });
            return { data: null, error: overrides?.uploadError ?? null };
          },
          createSignedUrl: async (_p: string, _t: number) => ({
            data: { signedUrl: "https://signed.example/x" },
            error: null,
          }),
        };
      },
    },
  };
}

describe("uploadEvidence", () => {
  const base = {
    organizationId: ORG,
    actionId: ACTION,
    deliverableId: DELIV,
    uploadedBy: "55555555-5555-4555-8555-555555555555",
    title: "Relatório",
  };

  it("returns canonical path on success", async () => {
    const client = makeClient();
    const result = await uploadEvidence({ ...base, file: makeFile() }, client);
    expect(result.storagePath).toMatch(
      new RegExp(
        `^organization/${ORG}/actions/${ACTION}/deliverables/${DELIV}/evidences/[0-9a-f-]{36}/Report_Q1\\.pdf$`,
      ),
    );
    expect(client._uploads[0].path).toBe(result.storagePath);
    expect(client._updates).toHaveLength(0);
  });

  it("throws metadata_insert_failed and skips upload when insert fails", async () => {
    const client = makeClient({ insertError: { message: "rls" } });
    await expect(uploadEvidence({ ...base, file: makeFile() }, client)).rejects.toMatchObject({
      code: "metadata_insert_failed",
    });
    expect(client._uploads).toHaveLength(0);
  });

  it("soft-deletes metadata when upload fails (compensating cleanup)", async () => {
    const client = makeClient({ uploadError: { message: "network" } });
    const err = await uploadEvidence({ ...base, file: makeFile() }, client).catch((e) => e);
    expect(err).toBeInstanceOf(EvidenceStorageError);
    expect((err as EvidenceStorageError).code).toBe("upload_failed");
    expect(client._updates).toHaveLength(1);
    expect(client._updates[0].row).toHaveProperty("deleted_at");
  });

  it("surfaces distinct error when cleanup also fails", async () => {
    const client = makeClient({
      uploadError: { message: "network" },
      updateError: { message: "rls" },
    });
    const err = await uploadEvidence({ ...base, file: makeFile() }, client).catch((e) => e);
    expect((err as EvidenceStorageError).code).toBe("upload_failed");
    expect((err as EvidenceStorageError).message).toMatch(/administrador/i);
  });

  it("retries with the next version when the unique index rejects a concurrent upload", async () => {
    const rows: Record<string, unknown>[] = [];
    let remainingConflicts = 2;
    const client: EvidenceSupabaseLike = {
      from() {
        return {
          insert(row: Record<string, unknown>) {
            return {
              select() {
                return {
                  single: async () => {
                    if (remainingConflicts > 0) {
                      remainingConflicts -= 1;
                      return { data: null, error: { code: "23505", message: "duplicate key" } };
                    }
                    rows.push(row);
                    return { data: { id: row.id }, error: null };
                  },
                };
              },
            };
          },
          update() {
            return { eq: async () => ({ error: null }) };
          },
        };
      },
      storage: {
        from() {
          return {
            upload: async () => ({ data: null, error: null }),
            createSignedUrl: async () => ({ data: { signedUrl: "x" }, error: null }),
          };
        },
      },
    };
    const result = await uploadEvidence({ ...base, versionNumber: 1, file: makeFile() }, client);
    expect(result.versionNumber).toBe(3);
    expect(rows[0]).toMatchObject({ version_number: 3 });
  });

  it("gives up with a friendly message when the version keeps colliding", async () => {
    const client = makeClient({ insertError: { code: "23505", message: "duplicate key" } });
    const err = await uploadEvidence({ ...base, file: makeFile() }, client).catch((e) => e);
    expect((err as EvidenceStorageError).code).toBe("metadata_insert_failed");
    expect((err as EvidenceStorageError).message).toMatch(/ao mesmo tempo/i);
    expect(client._uploads).toHaveLength(0);
  });

  it("throws supabase_unavailable when client is null", async () => {
    await expect(uploadEvidence({ ...base, file: makeFile() }, null)).rejects.toMatchObject({
      code: "supabase_unavailable",
    });
  });

  it("validates the file before touching the network", async () => {
    const client = makeClient();
    const spy = vi.spyOn(client.storage, "from");
    const bad = new File([new Uint8Array([1])], "x.exe", { type: "application/x-msdownload" });
    await expect(uploadEvidence({ ...base, file: bad }, client)).rejects.toMatchObject({
      code: "mime_not_allowed",
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("createEvidenceSignedUrl", () => {
  it("returns a signed URL from the client", async () => {
    const client = makeClient();
    const url = await createEvidenceSignedUrl("some/path.pdf", 60, client);
    expect(url).toBe("https://signed.example/x");
  });
  it("throws when the client returns an error", async () => {
    const client: EvidenceSupabaseLike = {
      from: () => ({
        insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
      storage: {
        from: () => ({
          upload: async () => ({ data: null, error: null }),
          createSignedUrl: async () => ({ data: null, error: { message: "denied" } }),
        }),
      },
    };
    await expect(createEvidenceSignedUrl("p", 60, client)).rejects.toMatchObject({
      code: "signed_url_failed",
    });
  });
});
