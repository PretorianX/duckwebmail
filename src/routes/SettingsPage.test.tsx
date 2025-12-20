import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import SettingsPage from "./SettingsPage";
import { LanguageProvider } from "../i18n/LanguageContext";
import { STORAGE_LANG } from "../i18n/i18n";
import { STORAGE_TIMEZONE, TimezoneProvider } from "../time/TimezoneContext";
import { ThemeProvider } from "../theme/ThemeContext";

vi.mock("../shared/ProfileMenu", () => ({
  default: () => null
}));

function renderSettings() {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <ThemeProvider>
        <LanguageProvider>
          <TimezoneProvider>
            <SettingsPage />
          </TimezoneProvider>
        </LanguageProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

describe("SettingsPage", () => {
  test("persists theme, language, and timezone selections", async () => {
    localStorage.clear();
    localStorage.setItem(STORAGE_TIMEZONE, "UTC");
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    renderSettings();

    await user.selectOptions(screen.getByLabelText(/theme/i), "dark");
    await waitFor(() => expect(localStorage.getItem("duckwebmail:theme")).toBe("dark"));

    await user.selectOptions(screen.getByLabelText(/time zone/i), "Europe/London");
    await waitFor(() => expect(localStorage.getItem(STORAGE_TIMEZONE)).toBe("Europe/London"));

    // Change language last; it updates label text and could break subsequent queries.
    await user.selectOptions(screen.getByLabelText(/language/i), "es");
    await waitFor(() => expect(localStorage.getItem(STORAGE_LANG)).toBe("es"));
  });
});


