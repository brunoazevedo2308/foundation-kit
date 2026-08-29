import { describe, it, expect, vi } from "vitest";

import {
  ATTACHMENT_BUCKET,
  ATTACHMENT_MAX_BYTES,
  AttachmentStorageError,
  attachmentContextFilter,
  attachmentLinkColumns,
  buildAttachmentPath,
  createAttachmentSignedUrl,
  sanitizeAttachmentFilename,
  uploadAttachment,
  validateAttachmentFile,
  type AttachmentSupabaseLike,
} from "./attachment-storage";

const ORG = "11111111-1111-4111-8111-111111111111";
const ATTACH = "55555555-5555-4555-8555-555555555555";
const ACTION = "22222222-2222-4222-8222-222222222222";
const DELIV = "33333333-3333-4333-8333-333333333333";
const COMMENT = "44444444-4444-4444-8444-444444444444";
const USER = "66666666-6666-4666-8666-666666666666";

function fileLike(name: string, size: number, type: string) {
  return { name, size, type } as unknown as File;
}

describe("sanitizeAttachmentFilename", () => {
  it("strips path components (unix + windows)", () => {
    expect(sanitizeAttachmentFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeAttachmentFilename("C:\\evil\\report.pdf")).toBe("report.pdf");
  });
  it("removes control chars", () => {
    expect(sanitizeAttachmentFilename("bad\x00name\x1f.pdf")).toBe("badname.pdf");
  });
  it("normalizes unsafe characters and lowercases the extension", () => {
    expect(sanitizeAttachmentFilename("relatório final #1.PDF")).toBe("relat_rio_final_1.pdf");
  });
  it("rejects empty / dot-only names", () => {
    expect(() => sanitizeAttachmentFilename("")).toThrow(AttachmentStorageError);
    expect(() => sanitizeAttachmentFilename(".")).toThrow(AttachmentStorageError);
    expect(() => sanitizeAttachmentFilename("..")).toThrow(AttachmentStorageError);
  });
  it("caps length at 180 chars keeping the extension", () => {
    const out = sanitizeAttachmentFilename("a".repeat(400) + ".pdf");
    expect(out.length).toBeLessThanOrEqual(180);
    expect(out.endsWith(".pdf")).toBe(true);
  });
});

describe("buildAttachmentPath", () => {
  it("builds the canonical tenant-scoped path", () => {
    expect(
      buildAttachmentPath({ organizationId: ORG, attachmentId: ATTACH, filename: "Doc A.pdf" }),
    ).toBe(`${ORG}/${ATTACH}/Doc_A.pdf`);
  });
  it("has exactly three segments (matches the storage policy)", () => {
    const path = buildAttachmentPath({
      organizationId: ORG,
      attachmentId: ATTACH,
      filename: "../../x/y.pdf",
    });
    expect(path.split("/")).toHaveLength(3);
  });
  it("rejects non-uuid identifiers", () => {
    expect(() =>
      buildAttachmentPath({ organizationId: "org", attachmentId: ATTACH, filename: "a.pdf" }),
    ).toThrow(AttachmentStorageError);
  });
});

describe("validateAttachmentFile", () => {
  it("accepts an allowed MIME within the size cap", () => {
    expect(() => validateAttachmentFile(fileLike("a.pdf", 1024, "application/pdf"))).not.toThrow();
  });
  it("rejects empty files", () => {
    expect(() => validateAttachmentFile(fileLike("a.pdf", 0, "application/pdf"))).toThrow(/vazio/i);
  });
  it("rejects files above 25 MiB", () => {
    expect(() =>
      validateAttachmentFile(fileLike("a.pdf", ATTACHMENT_MAX_BYTES + 1, "application/pdf")),
    ).toThrow(AttachmentStorageError);
  });
  it("rejects disallowed MIME types", () => {
    expect(() => validateAttachmentFile(fileLike("a.exe", 10, "application/x-msdownload"))).toThrow(
      /não permitido/i,
    );
  });
});

describe("attachment context mapping", () => {
  it("maps each context to exactly one link column", () => {
    expect(attachmentLinkColumns({ actionId: ACTION })).toEqual({
      action_id: ACTION,
      deliverable_id: null,
      comment_id: null,
    });
    expect(attachmentLinkColumns({ deliverableId: DELIV })).toEqual({
      action_id: null,
      deliverable_id: DELIV,
      comment_id: null,
    });
    expect(attachmentLinkColumns({ commentId: COMMENT })).toEqual({
      action_id: null,
      deliverable_id: null,
      comment_id: COMMENT,
    });
  });
  it("maps context to the list filter column", () => {
    expect(attachmentContextFilter({ commentId: COMMENT })).toEqual({
      column: "comment_id",
      value: COMMENT,
    });
    expect(attachmentContextFilter({ deliverableId: DELIV })).toEqual({
      column: "deliverable_id",
      value: DELIV,
    });
  });
  it("rejects invalid ids", () => {
    expect(() => attachmentLinkColumns({ actionId: "nope" })).toThrow(AttachmentStorageError);
  });
});

type Recorder = {
  client: AttachmentSupabaseLike;
  inserted: Record<string, unknown>[];
  updated: Record<string, unknown>[];
  uploads: { bucket: string; path: string }[];
};

function makeClient(opts: {
  insertError?: unknown;
  uploadError?: unknown;
  updateError?: unknown;
}): Recorder {
  const inserted: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];
  const uploads: { bucket: string; path: string }[] = [];
  const client: AttachmentSupabaseLike = {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push(row);
        return {
          select: () => ({
            single: async () => ({
              data: opts.insertError ? null : { id: row.id },
              error: opts.insertError ?? null,
            }),
          }),
        };
      },
      update: (row: Record<string, unknown>) => ({
        eq: async () => {
          updated.push(row);
          return { error: opts.updateError ?? null };
        },
      }),
    }),
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string) => {
          uploads.push({ bucket, path });
          return { data: opts.uploadError ? null : { path }, error: opts.uploadError ?? null };
        },
        createSignedUrl: async (path: string, expiresIn: number) => ({
          data: { signedUrl: `https://example.test/${path}?exp=${expiresIn}` },
          error: null,
        }),
      }),
    },
  };
  return { client, inserted, updated, uploads };
}

describe("uploadAttachment", () => {
  const input = {
    organizationId: ORG,
    context: { actionId: ACTION } as const,
    uploadedBy: USER,
    file: fileLike("Plano de Ação.pdf", 2048, "application/pdf"),
  };

  it("writes metadata before uploading the object", async () => {
    const rec = makeClient({});
    const result = await uploadAttachment(input, rec.client);

    expect(rec.inserted).toHaveLength(1);
    expect(rec.inserted[0]).toMatchObject({
      organization_id: ORG,
      action_id: ACTION,
      deliverable_id: null,
      comment_id: null,
      file_name: "Plano_de_A_o.pdf",
      mime_type: "application/pdf",
      size_bytes: 2048,
      uploaded_by: USER,
    });
    expect(rec.uploads).toEqual([{ bucket: ATTACHMENT_BUCKET, path: result.storagePath }]);
    expect(result.storagePath).toBe(`${ORG}/${result.attachmentId}/Plano_de_A_o.pdf`);
    expect(rec.updated).toHaveLength(0);
  });

  it("never touches the evidences bucket", async () => {
    const rec = makeClient({});
    await uploadAttachment(input, rec.client);
    expect(rec.uploads.every((u) => u.bucket === "attachments-private")).toBe(true);
  });

  it("does not upload when the metadata insert fails", async () => {
    const rec = makeClient({ insertError: { message: "rls" } });
    await expect(uploadAttachment(input, rec.client)).rejects.toMatchObject({
      code: "metadata_insert_failed",
    });
    expect(rec.uploads).toHaveLength(0);
  });

  it("soft-deletes the metadata when the storage upload fails", async () => {
    const rec = makeClient({ uploadError: { message: "boom" } });
    await expect(uploadAttachment(input, rec.client)).rejects.toMatchObject({
      code: "upload_failed",
    });
    expect(rec.updated).toHaveLength(1);
    expect(typeof rec.updated[0]!.deleted_at).toBe("string");
  });

  it("surfaces a pending-cleanup error when compensation also fails", async () => {
    const rec = makeClient({ uploadError: { message: "boom" }, updateError: { message: "rls" } });
    await expect(uploadAttachment(input, rec.client)).rejects.toThrow(/pendente de limpeza/i);
  });

  it("fails fast without a client", async () => {
    await expect(uploadAttachment(input, null)).rejects.toMatchObject({
      code: "supabase_unavailable",
    });
  });
});

describe("createAttachmentSignedUrl", () => {
  it("defaults to a 120s TTL on the attachments bucket", async () => {
    const spy = vi.fn(async (path: string, expiresIn: number) => ({
      data: { signedUrl: `https://example.test/${path}?exp=${expiresIn}` },
      error: null,
    }));
    const client = {
      from: () => ({}),
      storage: {
        from: () => ({ upload: async () => ({ data: null, error: null }), createSignedUrl: spy }),
      },
    } as unknown as AttachmentSupabaseLike;

    const url = await createAttachmentSignedUrl(`${ORG}/${ATTACH}/a.pdf`, undefined, client);
    expect(spy).toHaveBeenCalledWith(`${ORG}/${ATTACH}/a.pdf`, 120);
    expect(url).toContain("exp=120");
  });

  it("clamps the TTL to at most one hour", async () => {
    const spy = vi.fn(async (path: string, expiresIn: number) => ({
      data: { signedUrl: `https://example.test/${path}?exp=${expiresIn}` },
      error: null,
    }));
    const client = {
      from: () => ({}),
      storage: {
        from: () => ({ upload: async () => ({ data: null, error: null }), createSignedUrl: spy }),
      },
    } as unknown as AttachmentSupabaseLike;

    await createAttachmentSignedUrl(`${ORG}/${ATTACH}/a.pdf`, 999999, client);
    expect(spy).toHaveBeenCalledWith(`${ORG}/${ATTACH}/a.pdf`, 3600);
  });

  it("throws a typed error when the signed URL cannot be created", async () => {
    const client = {
      from: () => ({}),
      storage: {
        from: () => ({
          upload: async () => ({ data: null, error: null }),
          createSignedUrl: async () => ({ data: null, error: { message: "denied" } }),
        }),
      },
    } as unknown as AttachmentSupabaseLike;

    await expect(
      createAttachmentSignedUrl(`${ORG}/${ATTACH}/a.pdf`, 120, client),
    ).rejects.toMatchObject({ code: "signed_url_failed" });
  });
});
