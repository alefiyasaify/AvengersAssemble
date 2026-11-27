import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { describe, expect, it } from "vitest";

import { API_ORIGIN, fixtures } from "@/test/msw/handlers";
import { server } from "@/test/msw/server";
import { renderWithQuery } from "@/test/render";

import { SystemStatusCard } from "./SystemStatusCard";

describe("SystemStatusCard", () => {
  it("shows a loading state, then Operational with checks and version when the API is healthy", async () => {
    renderWithQuery(<SystemStatusCard />);

    expect(screen.getByText("Checking system status…")).toBeInTheDocument();

    expect(await screen.findByText("Operational")).toBeInTheDocument();
    const checks = screen.getByRole("list", { name: "Dependency checks" });
    expect(within(checks).getByText("database")).toBeInTheDocument();
    expect(within(checks).getByText("OK")).toBeInTheDocument();
    expect(await screen.findByText("0.1.0")).toBeInTheDocument();
    expect(screen.getByText("abc1234")).toBeInTheDocument();
  });

  it("shows Unavailable with the envelope message and request id when readiness returns 503", async () => {
    server.use(
      http.get(`${API_ORIGIN}/api/v1/health/ready`, () =>
        HttpResponse.json(fixtures.dbUnavailable, { status: 503 }),
      ),
    );
    renderWithQuery(<SystemStatusCard />);

    expect(await screen.findByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText("The database is not reachable.")).toBeInTheDocument();
    expect(screen.getByText("req-123")).toBeInTheDocument();
  });

  it("shows Unknown version when the version call fails", async () => {
    server.use(
      http.get(`${API_ORIGIN}/api/v1/version`, () =>
        HttpResponse.text("bad gateway", { status: 502 }),
      ),
    );
    renderWithQuery(<SystemStatusCard />);

    expect(await screen.findAllByText("Unknown")).toHaveLength(2);
  });

  it("re-checks readiness when the user presses Check again", async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(
      http.get(`${API_ORIGIN}/api/v1/health/ready`, () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json(fixtures.dbUnavailable, { status: 503 })
          : HttpResponse.json(fixtures.ready);
      }),
    );
    renderWithQuery(<SystemStatusCard />);
    expect(await screen.findByText("Unavailable")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Check again" }));

    expect(await screen.findByText("Operational")).toBeInTheDocument();
    expect(calls).toBe(2);
  });
});
