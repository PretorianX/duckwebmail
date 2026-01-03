import DOMPurify from "dompurify";

let hooksInstalled = false;

function stripAsciiControls(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    // ASCII C0 controls + DEL
    if (code <= 31 || code === 127) continue;
    out += value[i] ?? "";
  }
  return out;
}

function installHooksOnce() {
  if (hooksInstalled) return;
  hooksInstalled = true;

  // Tighten URI handling beyond ALLOWED_URI_REGEXP:
  // - Block scriptable protocols even if obfuscated with whitespace/control chars.
  // - Do not rely on the browser to "block" inside sandbox (we want no noisy warnings).
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (!(node instanceof Element)) return;

    const attrs = ["href", "src", "xlink:href"] as const;
    for (const attr of attrs) {
      if (!node.hasAttribute(attr)) continue;
      const raw = node.getAttribute(attr);
      if (!raw) continue;

      // Normalize: trim + remove ASCII control chars + collapse whitespace.
      // Avoid control-character regex literals to satisfy eslint `no-control-regex`.
      const normalized2 = stripAsciiControls(raw.trim())
        .replace(/\s+/g, "")
        .toLowerCase();

      if (normalized2.startsWith("javascript:") || normalized2.startsWith("vbscript:")) {
        node.removeAttribute(attr);
      }
    }
  });
}

export function sanitizeEmailHtml(htmlContent: string): string {
  if (!htmlContent || htmlContent.trim().length === 0) return "";
  installHooksOnce();

  return (
    DOMPurify.sanitize(htmlContent, {
      ADD_TAGS: ["style"],
      ADD_ATTR: ["target"],
      // Script is forbidden; the iframe is sandboxed without allow-scripts on purpose.
      FORBID_TAGS: ["script", "iframe", "object", "embed"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
      ALLOW_DATA_ATTR: false,
      // Allow inline images rewritten to blob: URLs (created after authenticated fetch).
      // Keep this tight: only allow http(s), mailto/tel, blob and data.
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|blob|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i
    }) ?? ""
  );
}


