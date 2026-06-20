import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "@/app/page";

// TODO: Replace these placeholders with real tests for your UI.
// See todo-app/src/tests/ui/page.test.tsx for patterns.

describe("Home page", () => {
  it("renders without crashing", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
});
