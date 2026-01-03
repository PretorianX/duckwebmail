import { describe, expect, test } from "vitest";

import { sanitizeEmailHtml } from "./sanitizeEmailHtml";

describe("sanitizeEmailHtml", () => {
  test("removes <script> tags", () => {
    const out = sanitizeEmailHtml(`<p>ok</p><script>alert(1)</script>`);
    expect(out).toContain("<p>ok</p>");
    expect(out.toLowerCase()).not.toContain("<script");
    expect(out.toLowerCase()).not.toContain("alert(");
  });

  test("removes <iframe> tags", () => {
    const out = sanitizeEmailHtml(`<p>ok</p><iframe src="https://evil.test"></iframe>`);
    expect(out).toContain("<p>ok</p>");
    expect(out.toLowerCase()).not.toContain("<iframe");
  });

  test("removes common event handler attributes (onerror/onload/...)", () => {
    const out = sanitizeEmailHtml(`<img src="https://ok.test/x.png" onerror="alert(1)" onload="alert(2)" />`);
    expect(out).toContain('src="https://ok.test/x.png"');
    expect(out.toLowerCase()).not.toContain("onerror=");
    expect(out.toLowerCase()).not.toContain("onload=");
  });

  test("strips javascript: href even when obfuscated with whitespace and ASCII control chars", () => {
    const ctrl = String.fromCharCode(0x01);
    const out = sanitizeEmailHtml(`<a href="  java${ctrl}script:alert(1)  ">x</a>`);
    expect(out).toContain(">x</a>");
    expect(out.toLowerCase()).not.toContain("javascript:");
    // We expect the unsafe href to be removed entirely.
    expect(out.toLowerCase()).not.toContain("href=");
  });

  test("strips vbscript: href", () => {
    const out = sanitizeEmailHtml(`<a href="vbscript:msgbox('x')">x</a>`);
    expect(out).toContain(">x</a>");
    expect(out.toLowerCase()).not.toContain("vbscript:");
    expect(out.toLowerCase()).not.toContain("href=");
  });

  test("allows safe protocols in links (https/mailto/tel)", () => {
    const out = sanitizeEmailHtml(
      `<a href="https://example.test/x">a</a><a href="mailto:user@example.test">m</a><a href="tel:+123">t</a>`
    );
    expect(out).toContain('href="https://example.test/x"');
    expect(out).toContain('href="mailto:user@example.test"');
    expect(out).toContain('href="tel:+123"');
  });

  test("allows inline images via data: and blob:", () => {
    const out = sanitizeEmailHtml(
      `<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB" /><img src="blob:https://example.test/123" />`
    );
    expect(out.toLowerCase()).toContain('src="data:image/png;base64,ivborw0kggoaaaansuheugaaaaeaaaab"');
    expect(out).toContain('src="blob:https://example.test/123"');
  });

  test("removes <style> tags (defense-in-depth: avoid CSS-based attacks)", () => {
    const out = sanitizeEmailHtml(`<style>p{color:red}</style><p>ok</p>`);
    expect(out.toLowerCase()).not.toContain("<style");
    expect(out).toContain("<p>ok</p>");
  });
});


