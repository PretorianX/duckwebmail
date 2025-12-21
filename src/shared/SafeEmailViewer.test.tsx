import { render, screen } from "@testing-library/react";

import SafeEmailViewer from "./SafeEmailViewer";

describe("SafeEmailViewer (plain text)", () => {
  test("renders CRLF (\\r\\n) as real line breaks", () => {
    render(<SafeEmailViewer htmlContent="" textContent={"Line 1\r\nLine 2\r\nLine 3"} />);

    const el = screen.getByText(/Line 1/);
    expect(el.textContent).toBe("Line 1\nLine 2\nLine 3");
  });

  test("renders literal escape sequences (\\\\r\\\\n) as real line breaks", () => {
    render(<SafeEmailViewer htmlContent="" textContent={"Line 1\\r\\nLine 2\\r\\nLine 3"} />);

    const el = screen.getByText(/Line 1/);
    expect(el.textContent).toBe("Line 1\nLine 2\nLine 3");
  });

  test("treats non-markup htmlContent as plain text (preserves newlines)", () => {
    render(<SafeEmailViewer htmlContent={"Line 1\r\nLine 2\r\nLine 3"} textContent="" />);

    const el = screen.getByText(/Line 1/);
    expect(el.textContent).toBe("Line 1\nLine 2\nLine 3");
    expect(document.querySelector("iframe")).toBeNull();
  });
});


