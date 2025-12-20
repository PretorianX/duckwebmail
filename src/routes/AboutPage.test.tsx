import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import AboutPage from "./AboutPage";

vi.mock("../shared/ProfileMenu", () => ({
  default: () => null
}));

describe("AboutPage", () => {
  test("renders about copy", () => {
    render(
      <MemoryRouter initialEntries={["/about"]}>
        <AboutPage />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: /about duckwebmail/i })).toBeInTheDocument();
  });
});


