import { describe, expect, it } from "vitest";

import { formatAttachmentSize, mapAttachment } from "./attachments";

describe("mapAttachment", () => {
  it("maps a row with the embedded uploader profile (array shape)", () => {
    expect(
      mapAttachment({
        id: "a1",
        action_id: "act1",
        deliverable_id: null,
        comment_id: null,
        file_name: "plano.pdf",
        storage_path: "org/a1/plano.pdf",
        mime_type: "application/pdf",
        size_bytes: 2048,
        uploaded_by: "u1",
        created_at: "2026-08-29",
        profiles: [{ full_name: "Ana" }],
      }),
    ).toEqual({
      id: "a1",
      actionId: "act1",
      deliverableId: null,
      commentId: null,
      fileName: "plano.pdf",
      storagePath: "org/a1/plano.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      uploadedBy: "u1",
      uploadedByName: "Ana",
      createdAt: "2026-08-29",
    });
  });

  it("tolerates object shape and missing uploader profile", () => {
    expect(
      mapAttachment({
        id: "a2",
        action_id: null,
        deliverable_id: "d1",
        comment_id: null,
        file_name: "n.csv",
        storage_path: "org/a2/n.csv",
        mime_type: null,
        size_bytes: null,
        uploaded_by: "u2",
        created_at: "2026-08-29",
        profiles: { full_name: null },
      }),
    ).toMatchObject({ deliverableId: "d1", uploadedByName: null, sizeBytes: null });

    expect(
      mapAttachment({
        id: "a3",
        action_id: null,
        deliverable_id: null,
        comment_id: "c1",
        file_name: "n.txt",
        storage_path: "org/a3/n.txt",
        mime_type: "text/plain",
        size_bytes: 1,
        uploaded_by: "u3",
        created_at: "2026-08-29",
      }),
    ).toMatchObject({ commentId: "c1", uploadedByName: null });
  });
});

describe("formatAttachmentSize", () => {
  it("formats bytes, KB and MB", () => {
    expect(formatAttachmentSize(512)).toBe("512 B");
    expect(formatAttachmentSize(2048)).toBe("2.0 KB");
    expect(formatAttachmentSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
  it("renders an em dash for unknown sizes", () => {
    expect(formatAttachmentSize(null)).toBe("—");
  });
});
