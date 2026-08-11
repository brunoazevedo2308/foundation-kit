import { describe, expect, it } from "vitest";

import {
  formatFileSize,
  groupEvidenceVersions,
  mapEvidence,
  nextEvidenceVersion,
  type EvidenceListItem,
} from "./evidences";

function item(over: Partial<EvidenceListItem>): EvidenceListItem {
  return {
    id: "1",
    deliverableId: "d1",
    title: "t",
    description: null,
    storagePath: "p",
    fileName: "a.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    versionNumber: 1,
    uploadedBy: "u",
    uploadedByName: null,
    createdAt: "2026-01-01",
    ...over,
  };
}

describe("mapEvidence", () => {
  it("maps a row including the embedded uploader profile", () => {
    expect(
      mapEvidence({
        id: "e1",
        deliverable_id: "d1",
        title: "Relatório",
        description: null,
        storage_path: "organization/o/x",
        file_name: "r.pdf",
        mime_type: "application/pdf",
        size_bytes: 10,
        version_number: 2,
        uploaded_by: "u1",
        created_at: "2026-01-02",
        profiles: [{ full_name: "Ana" }],
      }),
    ).toMatchObject({ id: "e1", versionNumber: 2, uploadedByName: "Ana" });
  });
});

describe("nextEvidenceVersion", () => {
  it("starts at 1 for a new file name", () => {
    expect(nextEvidenceVersion([], "a.pdf")).toBe(1);
  });
  it("increments only for the same file name", () => {
    const items = [item({ versionNumber: 2 }), item({ fileName: "b.pdf", versionNumber: 7 })];
    expect(nextEvidenceVersion(items, "a.pdf")).toBe(3);
    expect(nextEvidenceVersion(items, "b.pdf")).toBe(8);
    expect(nextEvidenceVersion(items, "c.pdf")).toBe(1);
  });
});

describe("groupEvidenceVersions", () => {
  it("groups by file name with the newest version first", () => {
    const groups = groupEvidenceVersions([
      item({ id: "a1", versionNumber: 1 }),
      item({ id: "a2", versionNumber: 3 }),
      item({ id: "b1", fileName: "b.pdf" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].fileName).toBe("a.pdf");
    expect(groups[0].versions.map((v) => v.versionNumber)).toEqual([3, 1]);
  });
});

describe("formatFileSize", () => {
  it("formats bytes, KB and MB", () => {
    expect(formatFileSize(null)).toBe("—");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
