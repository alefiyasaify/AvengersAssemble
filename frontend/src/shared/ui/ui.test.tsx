import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { cn } from "@/shared/lib/cn";

import { Button, Card, CardDescription, CardTitle, Skeleton, StatusBadge } from "./index";

describe("shared/ui", () => {
  it("Button defaults to type=button so it never submits forms by accident", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "button");
  });

  it("StatusBadge conveys status in text, with a decorative dot hidden from assistive tech", () => {
    const { container } = render(<StatusBadge tone="success">Operational</StatusBadge>);
    expect(screen.getByText("Operational")).toBeInTheDocument();
    expect(container.querySelector("[aria-hidden='true']")).not.toBeNull();
  });

  it("Card renders a titled section", () => {
    render(
      <Card aria-labelledby="t">
        <CardTitle id="t">Title</CardTitle>
        <CardDescription>Body</CardDescription>
      </Card>,
    );
    expect(screen.getByRole("region", { name: "Title" })).toHaveTextContent("Body");
  });

  it("Skeleton is hidden from assistive tech", () => {
    const { container } = render(<Skeleton className="h-4" />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });

  it("cn lets later Tailwind classes win", () => {
    expect(cn("p-2 text-sm", false, "p-4")).toBe("text-sm p-4");
  });
});
