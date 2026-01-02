export function htmlToPlainText(html: string): string {
  const input = (html ?? "").trim();
  if (input === "") return "";

  const doc = new DOMParser().parseFromString(input, "text/html");

  // Remove non-content nodes early.
  for (const el of Array.from(doc.querySelectorAll("script, style, noscript"))) el.remove();

  type ListCtx = { type: "ul" | "ol"; index: number };
  type Ctx = { preserveWhitespace: boolean; listStack: ListCtx[] };

  const normalizeNewlines = (s: string) => s.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const rtrimLineSpaces = (s: string) => s.replace(/[ \t]+\n/g, "\n");

  const collapseInlineWhitespace = (s: string) =>
    s
      .replace(/\u00A0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ");

  const prefixLines = (text: string, prefix: string) =>
    text
      .split("\n")
      .map((line) => (line.trim() === "" ? line : `${prefix}${line}`))
      .join("\n");

  const renderChildren = (node: Node, ctx: Ctx): string => {
    let out = "";
    for (const child of Array.from(node.childNodes)) out += renderNode(child, ctx);
    return out;
  };

  const renderNode = (node: Node, ctx: Ctx): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent ?? "";
      if (ctx.preserveWhitespace) return normalizeNewlines(t);
      return collapseInlineWhitespace(t);
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    // Ignore hidden-ish content.
    if (tag === "script" || tag === "style" || tag === "noscript") return "";

    // Inline-ish nodes.
    if (tag === "br") return "\n";
    if (tag === "hr") return "\n---\n";

    if (tag === "img") {
      const alt = (el.getAttribute("alt") ?? "").trim();
      return alt ? `[${alt}]` : "";
    }

    if (tag === "a") {
      const href = (el.getAttribute("href") ?? "").trim();
      const text = renderChildren(el, ctx).trim();
      if (!href) return text;
      if (!text) return href;
      if (text === href) return text;
      return `${text} (${href})`;
    }

    if (tag === "code" && !ctx.preserveWhitespace) {
      // Inline code.
      const text = collapseInlineWhitespace(renderChildren(el, { ...ctx, preserveWhitespace: false })).trim();
      return text ? `\`${text}\`` : "";
    }

    if (tag === "pre") {
      // Preserve whitespace exactly inside pre.
      const preText = normalizeNewlines(el.textContent ?? "");
      const cleaned = preText.replace(/\n{3,}/g, "\n\n").trimEnd();
      return cleaned ? `\n\n${cleaned}\n\n` : "\n\n";
    }

    if (tag === "blockquote") {
      const inner = renderChildren(el, ctx);
      const cleaned = inner.replace(/\n{3,}/g, "\n\n").trim();
      const quoted = prefixLines(cleaned, "> ");
      return quoted ? `\n\n${quoted}\n\n` : "\n\n";
    }

    if (tag === "ul" || tag === "ol") {
      const nextStack = [...ctx.listStack, { type: tag as "ul" | "ol", index: 0 }];
      const inner = renderChildren(el, { ...ctx, listStack: nextStack });
      return inner.trim() ? `\n${inner}\n` : "\n";
    }

    if (tag === "li") {
      const depth = Math.max(0, ctx.listStack.length - 1);
      const current = ctx.listStack[ctx.listStack.length - 1];
      const nextStack = [...ctx.listStack];
      if (current && current.type === "ol") {
        current.index += 1;
        nextStack[nextStack.length - 1] = current;
      }
      const marker =
        current?.type === "ol"
          ? `${"  ".repeat(depth)}${current.index}. `
          : `${"  ".repeat(depth)}- `;

      const body = renderChildren(el, { ...ctx, listStack: nextStack }).trim();
      return body ? `${marker}${body}\n` : `${marker}\n`;
    }

    if (tag === "table") {
      const rows = Array.from(el.querySelectorAll("tr"));
      const renderedRows = rows
        .map((tr) => {
          const cells = Array.from(tr.querySelectorAll("th,td")).map((cell) =>
            collapseInlineWhitespace(renderChildren(cell, { ...ctx, preserveWhitespace: false })).trim()
          );
          return cells.join("\t").trimEnd();
        })
        .filter((r) => r.trim() !== "");
      const text = renderedRows.join("\n");
      return text ? `\n\n${text}\n\n` : "\n\n";
    }

    // Block-ish containers (paragraph-like).
    if (
      tag === "p" ||
      tag === "div" ||
      tag === "section" ||
      tag === "article" ||
      tag === "header" ||
      tag === "footer"
    ) {
      const inner = renderChildren(el, ctx).trim();
      return inner ? `${inner}\n\n` : "\n\n";
    }

    if (/^h[1-6]$/.test(tag)) {
      const inner = renderChildren(el, ctx).trim();
      if (!inner) return "\n\n";
      return `${inner}\n\n`;
    }

    // Default: recurse.
    return renderChildren(el, ctx);
  };

  const rendered = renderChildren(doc.body, { preserveWhitespace: false, listStack: [] });
  const normalized = rtrimLineSpaces(normalizeNewlines(rendered));

  // Cleanup: collapse excessive blank lines & trim.
  const collapsed = normalized
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return collapsed;
}


