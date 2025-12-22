import { describe, it, expect } from "vitest";

import { extractAttachmentsFromBodyStructure } from "./attachments";

describe("extractAttachmentsFromBodyStructure", () => {
  it("extracts attachments from multipart/mixed", () => {
    const bodyStructure = {
      type: "multipart/mixed",
      subParts: [
        { partId: "1", type: "text/html" },
        {
          partId: "2",
          blobId: "blob-2",
          type: "application/pdf",
          name: "invoice.pdf",
          disposition: "attachment",
          size: 12345
        },
        {
          partId: "3",
          blobId: "blob-3",
          type: "application/zip",
          name: "docs.zip",
          disposition: "attachment",
          size: 99
        }
      ]
    };

    const { attachments, inlineImages } = extractAttachmentsFromBodyStructure(bodyStructure);
    expect(inlineImages).toHaveLength(0);
    expect(attachments.map((a) => ({ blobId: a.blobId, name: a.name, contentType: a.contentType }))).toEqual([
      { blobId: "blob-2", name: "invoice.pdf", contentType: "application/pdf" },
      { blobId: "blob-3", name: "docs.zip", contentType: "application/zip" }
    ]);
  });

  it("extracts inline cid images from multipart/related into inlineImages section", () => {
    const bodyStructure = {
      type: "multipart/related",
      subParts: [
        { partId: "1", type: "text/html" },
        {
          partId: "2",
          blobId: "blob-img",
          type: "image/png",
          name: "logo.png",
          disposition: "inline",
          cid: "<logo-123>",
          size: 555
        }
      ]
    };

    const { attachments, inlineImages } = extractAttachmentsFromBodyStructure(bodyStructure);
    expect(attachments).toHaveLength(0);
    expect(inlineImages).toHaveLength(1);
    expect(inlineImages[0]?.blobId).toBe("blob-img");
    expect(inlineImages[0]?.cid).toBe("logo-123");
    expect(inlineImages[0]?.disposition).toBe("inline");
  });

  it("ignores container parts and body parts without blobId", () => {
    const bodyStructure = {
      type: "multipart/mixed",
      subParts: [
        {
          type: "multipart/alternative",
          subParts: [
            { partId: "1", type: "text/plain" },
            { partId: "2", type: "text/html" }
          ]
        }
      ]
    };

    const { attachments, inlineImages } = extractAttachmentsFromBodyStructure(bodyStructure);
    expect(attachments).toEqual([]);
    expect(inlineImages).toEqual([]);
  });

  it("includes leaf parts with blobId even if disposition/name are missing (download-only)", () => {
    const bodyStructure = {
      type: "multipart/mixed",
      subParts: [
        { partId: "1", type: "text/html" },
        {
          partId: "2",
          blobId: "blob-unknown",
          type: "application/octet-stream",
          size: 10
        }
      ]
    };

    const { attachments, inlineImages } = extractAttachmentsFromBodyStructure(bodyStructure);
    expect(inlineImages).toHaveLength(0);
    expect(attachments).toHaveLength(1);
    expect(attachments[0]?.blobId).toBe("blob-unknown");
    expect(attachments[0]?.name).toMatch(/^attachment-blob-unk/);
  });

  it("names unnamed rfc822 attachments as eml-<n>.eml", () => {
    const bodyStructure = {
      type: "multipart/mixed",
      subParts: [
        { partId: "1", type: "text/html" },
        { partId: "2", blobId: "b1", type: "message/rfc822", size: 1 },
        { partId: "3", blobId: "b2", type: "message/rfc822", size: 2 }
      ]
    };

    const { attachments } = extractAttachmentsFromBodyStructure(bodyStructure);
    expect(attachments.map((a) => a.name)).toEqual(["eml-1.eml", "eml-2.eml"]);
  });
});


