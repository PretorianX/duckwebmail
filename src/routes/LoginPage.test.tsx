import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import LoginPage from "./LoginPage";
import { ThemeProvider } from "../theme/ThemeContext";
import { AuthError, type AuthErrorKind } from "../auth/AuthContext";

vi.mock("../shared/useMediaQuery", () => ({
  useMediaQuery: () => false
}));

vi.mock("../theme/ThemeToggle", () => ({
  default: () => null
}));

vi.mock("../shared/ProfileMenu", () => ({
  default: () => null
}));

const profile = { id: "personal", name: "Personal" };

let signInMock: (email: string, password: string) => Promise<void>;

vi.mock("../auth/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("../auth/AuthContext")>("../auth/AuthContext");
  return {
    ...actual,
    useAuth: () => ({
      profiles: [profile],
      activeProfileId: profile.id,
      activeProfile: profile,
      setActiveProfileId: vi.fn(),
      authByProfile: {},
      activeAuth: null,
      rehydrating: false,
      signIn: signInMock,
      signOut: vi.fn()
    })
  };
});

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <ThemeProvider>
        <LoginPage />
      </ThemeProvider>
    </MemoryRouter>
  );
}

function expectNoForbiddenCopy(text: string) {
  expect(text).not.toMatch(/domain\.ote/i);
  expect(text).not.toMatch(/\bdev\b/i);
  expect(text).not.toMatch(/docker-compose/i);
  expect(text).not.toMatch(/config\.toml/i);
}

async function submitForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/email/i), "duck@mail-duck.com");
  await user.type(screen.getByLabelText(/^password$/i), "pw");
  await user.click(screen.getByRole("button", { name: /continue/i }));
}

describe("LoginPage", () => {
  test("uses neutral placeholder copy (no test/domain hints)", () => {
    signInMock = vi.fn(async () => {});
    renderLogin();
    expect(screen.getByPlaceholderText(/duck@mail-duck\.com/i)).toBeInTheDocument();
  });

  test.each([
    ["invalid_credentials", /email\/username and password/i],
    ["network", /couldn’t reach the server/i],
    ["server", /server returned an error/i],
    ["unexpected", /please try again/i]
  ] as Array<[AuthErrorKind, RegExp]>)("shows safe, actionable error message: %s", async (kind, expected) => {
    signInMock = vi.fn(async () => {
      throw new AuthError("internal", { kind });
    });
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderLogin();

    await submitForm(user);

    const alert = await screen.findByRole("alert");
    expect(alert).toBeVisible();
    expect(alert).toHaveTextContent(expected);
    expectNoForbiddenCopy(alert.textContent ?? "");
  });

  test("password show/hide toggle changes input type", async () => {
    signInMock = vi.fn(async () => {});
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderLogin();

    const password = screen.getByLabelText(/^password$/i);
    expect(password).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: /show password/i }));
    expect(password).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: /hide password/i }));
    expect(password).toHaveAttribute("type", "password");
  });
});


