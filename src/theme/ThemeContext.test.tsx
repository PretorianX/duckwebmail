import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ThemeProvider, useTheme } from "./ThemeContext";

function ThemeProbe() {
  const { theme, scheme, toggleTheme } = useTheme();
  return (
    <div>
      <div data-testid="theme">{theme}</div>
      <div data-testid="scheme">{scheme}</div>
      <button type="button" onClick={toggleTheme}>
        toggle
      </button>
    </div>
  );
}

describe("ThemeProvider storage keys", () => {
  test('ignores generic localStorage key "theme" (prevents cross-app collisions)', () => {
    localStorage.setItem("theme", "dark");
    localStorage.removeItem("duckwebmail:theme");

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    // matchMedia is mocked to prefers light in setupTests.ts.
    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    expect(document.body.dataset.theme).toBe("light");
  });

  test('persists under "duckwebmail:theme" (not the generic "theme" key)', async () => {
    localStorage.clear();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    await user.click(screen.getByRole("button", { name: /toggle/i }));

    expect(localStorage.getItem("duckwebmail:theme")).toBe("dark");
    expect(localStorage.getItem("theme")).toBeNull();
  });
});


