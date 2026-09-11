import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { http, HttpResponse } from "msw";

import { server } from "../mocks/server";
import Home from "@/app/page";

expect.extend(toHaveNoViolations);

// Note: axe in jsdom cannot evaluate colour contrast — verify manually
// with the axe DevTools browser extension or Lighthouse.

/**
 * The homepage resolves the session before deciding what to show, so it needs a
 * router and holds two renderable states. Auditing only one of them would leave
 * the other unchecked — the same gap that let the skip link and the sign-out
 * failure message go unaudited until they were reached deliberately.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function mockSignedOut() {
  server.use(
    http.get("/api/me", () =>
      HttpResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 },
      ),
    ),
  );
}

describe("Accessibility", () => {
  it("home page has no axe-detectable accessibility violations", async () => {
    mockSignedOut();
    const { container } = render(<Home />);

    await screen.findByRole("link", { name: /sign in/i });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("home page has no violations while it is resolving the session", async () => {
    // The state a signed-in member sees for the whole of the redirect
    const { container } = render(<Home />);

    await waitFor(() => expect(screen.getByText(/loading/i)).toBeInTheDocument());

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
