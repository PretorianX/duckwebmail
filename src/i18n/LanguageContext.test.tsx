import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LanguageProvider, useLanguage } from "./LanguageContext";
import { STORAGE_LANG } from "./i18n";

function LanguageProbe() {
  const { language, setLanguage } = useLanguage();
  return (
    <div>
      <div data-testid="lang">{language}</div>
      <button type="button" onClick={() => setLanguage("es")}>
        set-es
      </button>
    </div>
  );
}

describe("LanguageProvider storage keys", () => {
  test('persists under "duckwebmail:lang" and does not write i18nextLng automatically', async () => {
    localStorage.clear();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    render(
      <LanguageProvider>
        <LanguageProbe />
      </LanguageProvider>
    );

    expect(screen.getByTestId("lang")).toHaveTextContent(/^(en|es|uk|ru)$/);

    await user.click(screen.getByRole("button", { name: /set-es/i }));

    expect(localStorage.getItem(STORAGE_LANG)).toBe("es");
    expect(localStorage.getItem("i18nextLng")).toBeNull();
  });

  test("does not write defaults to localStorage until user explicitly changes language", () => {
    localStorage.clear();

    render(
      <LanguageProvider>
        <LanguageProbe />
      </LanguageProvider>
    );

    expect(localStorage.getItem(STORAGE_LANG)).toBeNull();
    expect(localStorage.getItem("i18nextLng")).toBeNull();
  });

  test("sets documentElement.lang", async () => {
    localStorage.clear();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    render(
      <LanguageProvider>
        <LanguageProbe />
      </LanguageProvider>
    );

    expect(document.documentElement.lang).toMatch(/^(en|es|uk|ru)$/);

    await user.click(screen.getByRole("button", { name: /set-es/i }));
    expect(document.documentElement.lang).toBe("es");
  });

  test("prefers stored language", () => {
    localStorage.clear();
    localStorage.setItem(STORAGE_LANG, "uk");

    render(
      <LanguageProvider>
        <LanguageProbe />
      </LanguageProvider>
    );

    expect(screen.getByTestId("lang")).toHaveTextContent("uk");
  });

  test("ignores invalid stored language", () => {
    localStorage.clear();
    localStorage.setItem(STORAGE_LANG, "xx");

    render(
      <LanguageProvider>
        <LanguageProbe />
      </LanguageProvider>
    );

    // Falls back to detected/default supported language.
    expect(screen.getByTestId("lang")).toHaveTextContent(/^(en|es|uk|ru)$/);
  });
});


