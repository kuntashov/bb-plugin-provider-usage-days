// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CodexResetCredits, formatCodexReset } from "./reset-credits.js";

const credits = {
  status: "ok" as const,
  availableCount: 4,
  credits: [
    { id: "late", expiresAt: "2026-12-01T00:00:00Z" },
    { id: "second", expiresAt: "2026-11-07T23:15:00.654321Z" },
    { id: "expired", expiresAt: "2026-10-27T00:00:00Z" },
    { id: "first", expiresAt: "2026-10-30T18:45:00.123456Z" },
    { id: "forever", expiresAt: null },
  ],
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("shows the two earliest unexpired resets on one sidebar line", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-28T18:00:00Z"));
  const view = render(<CodexResetCredits value={credits} layout="compact" />);
  expect(view.container.textContent).toBe(
    "4 resets - #1 2 days left 30.10 21:45, #2 08.11 02:15 MSK",
  );
  const emphasis = [...view.container.querySelectorAll("strong")];
  expect(emphasis.map((node) => node.textContent)).toEqual(["2 days left"]);
  expect(emphasis.map((node) => node.className)).toEqual([
    "font-bold text-primary",
  ]);
  expect(view.container.textContent).not.toContain("01.12");
  expect(view.container.textContent).not.toContain("no expiry");
});

it("uses full days and a singular day on the first reset", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-30T18:00:00Z"));
  const view = render(
    <CodexResetCredits
      value={{
        status: "ok",
        availableCount: 1,
        credits: [{ id: "soon", expiresAt: "2026-10-31T19:00:00Z" }],
      }}
      layout="compact"
    />,
  );
  expect(view.container.textContent).toBe(
    "1 reset - #1 1 day left 31.10 22:00 MSK",
  );
  view.rerender(
    <CodexResetCredits
      value={{
        status: "ok",
        availableCount: 1,
        credits: [{ id: "soon", expiresAt: "2026-10-30T18:45:00Z" }],
      }}
      layout="detail"
    />,
  );
  expect(view.container.textContent).toBe(
    "1 reset#1: use by 30.10.2026, 21:45 MSK - 0 days left",
  );
});

it("lists every unexpired reset on its own settings line", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-28T18:00:00Z"));
  const view = render(<CodexResetCredits value={credits} layout="detail" />);
  const lines = [...view.container.querySelectorAll("span")].map(
    (line) => line.textContent,
  );
  expect(lines).toEqual([
    "4 resets",
    "#1: use by 30.10.2026, 21:45 MSK - 2 days left",
    "#2: use by 08.11.2026, 02:15 MSK",
    "#3: use by 01.12.2026, 03:00 MSK",
    "#4: no expiry",
  ]);
  expect(view.container.textContent).not.toContain("27.10");
  const emphasis = [...view.container.querySelectorAll("strong")];
  expect(emphasis.map((node) => node.textContent)).toEqual(["2 days left"]);
  expect(emphasis.map((node) => node.className)).toEqual([
    "font-bold text-primary",
  ]);
});

it("distinguishes missing data, failure, zero resets, and no expiration", () => {
  const view = render(<CodexResetCredits value={null} layout="compact" />);
  expect(view.container.textContent).toBe("");
  view.rerender(
    <CodexResetCredits
      value={{ status: "error", message: "Unavailable" }}
      layout="compact"
    />,
  );
  expect(view.container.textContent).toBe(
    "Additional resets: could not refresh",
  );
  view.rerender(
    <CodexResetCredits
      value={{ status: "ok", availableCount: 0, credits: [] }}
      layout="compact"
    />,
  );
  expect(view.container.textContent).toBe("0 resets");
  view.rerender(
    <CodexResetCredits
      value={{
        status: "ok",
        availableCount: 1,
        credits: [{ id: "no-expiry", expiresAt: null }],
      }}
      layout="compact"
    />,
  );
  expect(view.container.textContent).toBe("1 reset - #1 no expiry");
  view.rerender(
    <CodexResetCredits
      value={{ status: "ok", availableCount: 2, credits: [] }}
      layout="detail"
    />,
  );
  expect(view.container.textContent).toBe(
    "2 resetsExpiration times were not received.",
  );
});

it("formats the regular quota reset using the same explicit timezone", () => {
  expect(formatCodexReset("2026-11-05T07:00:00Z")).toBe(
    "Reset: 05.11.2026, 10:00 MSK",
  );
});
