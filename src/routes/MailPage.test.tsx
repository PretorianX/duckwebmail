import { render, screen, within } from "@testing-library/react";
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

    const welcome = screen.getByRole("button", { name: /open welcome/i });
    const invoice = screen.getByRole("button", { name: /open invoice #1234/i });

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

    const welcome = screen.getByRole("button", { name: /open welcome/i });
    await user.click(welcome);
    expect(welcomeRegion).toBeVisible();

    await user.click(welcome);
    expect(welcomeRegion).not.toBeVisible();
    expect(welcomeRegion).toBeInTheDocument();
  });

  test("supports row actions: star, read/unread, delete", async () => {
    const user = userEvent.setup();
    renderMailPage();

    const welcomeRow = screen.getByRole("button", { name: /open welcome/i });
    await user.hover(welcomeRow);
    const welcome = within(welcomeRow);

    const star = welcome.getByRole("button", { name: /star welcome/i });
    await user.click(star);
    expect(welcome.getByRole("button", { name: /unstar welcome/i })).toBeInTheDocument();

    const markRead = welcome.getByRole("button", { name: /mark read welcome/i });
    await user.click(markRead);
    expect(welcome.getByRole("button", { name: /mark unread welcome/i })).toBeInTheDocument();

    const del = welcome.getByRole("button", { name: /delete welcome/i });
    await user.click(del);
    expect(screen.queryByRole("button", { name: /open welcome/i })).not.toBeInTheDocument();
  });

  test("reply and forward open compose with prefilled subject", async () => {
    const user = userEvent.setup();
    renderMailPage();

    const invoiceRow = screen.getByRole("button", { name: /open invoice #1234/i });
    await user.hover(invoiceRow);
    const invoice = within(invoiceRow);

    await user.click(invoice.getByRole("button", { name: /reply invoice #1234/i }));
    expect(screen.getByRole("dialog", { name: /compose email/i })).toBeVisible();
    expect(screen.getByLabelText(/subject/i)).toHaveValue("Re: Invoice #1234");

    // Close dialog and open again via forward.
    await user.click(screen.getByRole("button", { name: /close/i }));
    await user.hover(invoiceRow);
    await user.click(invoice.getByRole("button", { name: /forward invoice #1234/i }));
    expect(screen.getByRole("dialog", { name: /compose email/i })).toBeVisible();
    expect(screen.getByLabelText(/subject/i)).toHaveValue("Fwd: Invoice #1234");
  });

  test("expanded message shows To line, attachments and source download", async () => {
    const user = userEvent.setup();
    renderMailPage();

    const welcomeRow = screen.getByRole("button", { name: /open welcome/i });
    await user.click(welcomeRow);

    expect(screen.getAllByText(/to:/i).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /toggle attachments welcome/i }));
    expect(screen.getByRole("button", { name: /download attachment welcome\.txt/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download source welcome/i })).toBeInTheDocument();
  });
});


