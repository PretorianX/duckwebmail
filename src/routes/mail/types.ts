import type { JmapEmailSummary } from "../../jmap/email";

export type Folder = {
  id: string;
  name: string;
  unread: number;
  parentId?: string | null;
};

export type Attachment = {
  id: string;
  name: string;
  sizeBytes: number;
  contentType: string;
  content: string;
};

export type Message = {
  id: string;
  from: string;
  fromRaw?: JmapEmailSummary["from"];
  to: string;
  subject: string;
  preview: string;
  receivedAt: string;
  unread: boolean;
  starred: boolean;
  hasAttachments: boolean;
  attachments: Attachment[];
  blobId: string | null;
  html?: string;
  text?: string;
};

export type ComposeDraft = {
  from: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  /** HTML (rich-text) body */
  body: string;
};

export type FolderIndex = {
  byId: Map<string, Folder>;
  childrenByParent: Map<string | null, Folder[]>;
};

export type FolderOption = {
  id: string;
  label: string;
  depth: number;
};

