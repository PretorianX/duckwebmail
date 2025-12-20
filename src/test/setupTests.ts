import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

import i18n, { STORAGE_LANG } from "../i18n/i18n";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  // Make tests deterministic: always run in English.
  localStorage.removeItem(STORAGE_LANG);
  localStorage.removeItem("i18nextLng");
  void i18n.changeLanguage("en");
});

// JSDOM doesn't implement matchMedia; MailPage relies on it.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false
  })
});


