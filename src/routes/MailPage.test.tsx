import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import MailPage from "./MailPage";
import { ThemeProvider } from "../theme/ThemeContext";

function renderMailPage() {
  return render(
    <MemoryRouter initialEntries={["/mail"]}>
      <ThemeProvider>
        <MailPage />
      </ThemeProvider>
    </MemoryRouter>
  );
}

describe("MailPage", () => {
  test("allows expanding multiple messages at the same time", async () => {
    const user = userEvent.setup();
    renderMailPage();

    const welcome = screen.getByRole("button", { name: /welcome/i });
    const invoice = screen.getByRole("button", { name: /invoice #1234/i });

    await user.click(welcome);
    await user.click(invoice);

    expect(screen.getByRole("region", { name: /message welcome/i })).toBeVisible();
    expect(screen.getByRole("region", { name: /message invoice #1234/i })).toBeVisible();
  });

  test("keeps message body mounted even when collapsed (cached)", async () => {
    const user = userEvent.setup();
    renderMailPage();

    // Bodies should be in the DOM even before expanding, but hidden.
    const welcomeRegion = screen.getByTestId("message-body-m1");
    const invoiceRegion = screen.getByTestId("message-body-m2");
    expect(welcomeRegion).toBeInTheDocument();
    expect(invoiceRegion).toBeInTheDocument();
    expect(welcomeRegion).not.toBeVisible();

    const welcome = screen.getByRole("button", { name: /welcome/i });
    await user.click(welcome);
    expect(welcomeRegion).toBeVisible();

    await user.click(welcome);
    expect(welcomeRegion).not.toBeVisible();
    expect(welcomeRegion).toBeInTheDocument();
  });
});


