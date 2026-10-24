import { describe, expect, it } from "vitest";

import { ATTACHMENT_BUCKET, type AttachmentSupabaseLike } from "./attachment-storage";
import { formatDocumentFileSize, isDocumentCategory, uploadDocumentFile } from "./document-files";

const ORG = "11111111-1111-4111-8111-111111111111";
const COMPANY = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";

function fileLike(name: string, size: number, type: string) {
  return { name, size, type } as unknown as File;
}

function makeClient(options: { insertError?: unknown; uploadError?: unknown } = {}) {
  const inserted: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];
  const uploads: { bucket: string; path: string }[] = [];
  const client: AttachmentSupabaseLike = {
    from: () => ({
      insert: (row) => {
        inserted.push(row);
        return {
          select: () => ({
            single: async () => ({
              data: options.insertError ? null : { id: row.id },
              error: options.insertError ?? null,
            }),
          }),
        };
      },
      update: (row) => ({
        eq: async () => {
          updated.push(row);
          return { error: null };
        },
      }),
    }),
    storage: {
      from: (bucket) => ({
        upload: async (path) => {
          uploads.push({ bucket, path });
          return {
            data: options.uploadError ? null : { path },
            error: options.uploadError ?? null,
          };
        },
        createSignedUrl: async () => ({ data: { signedUrl: "https://example.test" }, error: null }),
      }),
    },
  };
  return { client, inserted, updated, uploads };
}

describe("document file categories", () => {
  it("accepts only the five library categories", () => {
    expect(isDocumentCategory("procedures")).toBe(true);
    expect(isDocumentCategory("forms")).toBe(true);
    expect(isDocumentCategory("trials-fmea")).toBe(true);
    expect(isDocumentCategory("documents")).toBe(true);
    expect(isDocumentCategory("audits")).toBe(true);
    expect(isDocumentCategory("other")).toBe(false);
  });
});

describe("formatDocumentFileSize", () => {
  it("formats bytes, KB and MB", () => {
    expect(formatDocumentFileSize(400)).toBe("400 B");
    expect(formatDocumentFileSize(2048)).toBe("2.0 KB");
    expect(formatDocumentFileSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });
});

describe("uploadDocumentFile", () => {
  const input = {
    organizationId: ORG,
    companyId: COMPANY,
    category: "procedures" as const,
    uploadedBy: USER,
    file: fileLike("Procedimento DP.pdf", 4096, "application/pdf"),
  };

  it("registers tenant metadata before uploading to the private bucket", async () => {
    const recorder = makeClient();
    const result = await uploadDocumentFile(input, recorder.client);

    expect(recorder.inserted[0]).toMatchObject({
      organization_id: ORG,
      company_id: COMPANY,
      category: "procedures",
      file_name: "Procedimento_DP.pdf",
      uploaded_by: USER,
    });
    expect(recorder.uploads).toEqual([{ bucket: ATTACHMENT_BUCKET, path: result.storagePath }]);
    expect(result.storagePath.split("/")).toHaveLength(3);
  });

  it("does not upload when metadata registration is denied", async () => {
    const recorder = makeClient({ insertError: { message: "rls" } });
    await expect(uploadDocumentFile(input, recorder.client)).rejects.toMatchObject({
      code: "metadata_insert_failed",
    });
    expect(recorder.uploads).toHaveLength(0);
  });

  it("soft-deletes metadata when the object upload fails", async () => {
    const recorder = makeClient({ uploadError: { message: "storage" } });
    await expect(uploadDocumentFile(input, recorder.client)).rejects.toMatchObject({
      code: "upload_failed",
    });
    expect(recorder.updated).toHaveLength(1);
  });
});
