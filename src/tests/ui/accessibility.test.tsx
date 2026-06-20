import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import Home from "@/app/page";

expect.extend(toHaveNoViolations);

// Keep and extend this file as you build out your UI.
// Note: axe in jsdom cannot evaluate colour contrast — verify manually
// with the axe DevTools browser extension or Lighthouse.

describe("Accessibility", () => {
  it("home page has no axe-detectable accessibility violations", async () => {
    const { container } = render(<Home />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
