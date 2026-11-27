// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsageMeter, usageWindowDays } from "./usage-days.js";

const DAY_MS = 24 * 60 * 60_000;
const NOW = Date.parse("2026-11-26T12:00:00Z");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderDays(
  providerId: string,
  label: string,
  usedPercent: number,
  resetsAt: string | null = null,
) {
  return render(
    <UsageMeter
      days={usageWindowDays(providerId, label)}
      surface="settings"
      window={{ label, usedPercent, resetsAt, cost: null }}
    />,
  );
}

describe("day-equivalent usage", () => {
  it.each([
    ["codex", "Weekly limit", 7, 3.5],
    ["codex", "Weekly · Spark", 7, 3.5],
    ["acp-cursor", "Tokens this month", 30, 15],
  ])("converts %s %s consumption to days", (providerId, label, count, days) => {
    const view = renderDays(providerId, label, 50);
    const meter = view.getByRole("meter");
    expect(meter.children).toHaveLength(count);
    expect(meter.getAttribute("aria-valuenow")).toBe(String(days));
    expect(meter.getAttribute("aria-valuemax")).toBe(String(count));
    const filled = Array.from(meter.children).map((segment) =>
      segment.firstElementChild?.getAttribute("style"),
    );
    expect(filled.slice(0, Math.floor(days))).toEqual(
      Array.from({ length: Math.floor(days) }, () => "width: 100%;"),
    );
    if (days % 1 !== 0) expect(filled[Math.floor(days)]).toBe("width: 50%;");
    expect(filled.slice(Math.ceil(days))).toEqual(
      Array.from({ length: count - Math.ceil(days) }, () => "width: 0%;"),
    );
  });

  it.each([0, -10, 100, 140])(
    "bounds segment fill for %s percent",
    (percent) => {
      const view = renderDays("codex", "Weekly limit", percent);
      const meter = view.getByRole("meter");
      expect(meter.getAttribute("aria-valuenow")).toBe(
        percent <= 0 ? "0" : "7",
      );
      for (const segment of meter.children) {
        expect(segment.firstElementChild?.getAttribute("style")).toBe(
          percent <= 0 ? "width: 0%;" : "width: 100%;",
        );
      }
    },
  );

  it.each([
    ["codex", "Weekly limit", 7],
    ["acp-cursor", "Tokens this month", 30],
  ])("marks the first, second and last days for %s", (providerId, label, days) => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const percent = days === 7 ? 90 : 91;
    const view = renderDays(
      providerId,
      label,
      percent,
      new Date(NOW + days * DAY_MS).toISOString(),
    );
    const meter = view.getByRole("meter");
    const usedDays = (percent * days) / 100;
    const filled = Array.from(meter.children, (segment) =>
      Number.parseFloat((segment.firstElementChild as HTMLElement).style.width),
    );
    expect(filled.reduce((total, segmentFill) => total + segmentFill, 0) / days)
      .toBeCloseTo(percent);
    expect(filled[Math.floor(usedDays)]).toBeCloseTo((usedDays % 1) * 100);
    expect(meter.children[0]?.querySelector('[data-period-day="1"]')).toBeTruthy();
    expect(meter.getAttribute("aria-valuetext")).toContain(`Day 1 of ${days}`);

    act(() => vi.advanceTimersByTime(DAY_MS - 1));
    expect(meter.querySelector('[data-period-day="1"]')).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(meter.children[1]?.querySelector('[data-period-day="2"]')).toBeTruthy();
    act(() => vi.advanceTimersByTime((days - 2) * DAY_MS));
    expect(meter.children[days - 1]?.querySelector(`[data-period-day="${days}"]`))
      .toBeTruthy();
    expect(meter.getAttribute("aria-valuetext")).toContain(`Day ${days} of ${days}`);
    act(() => vi.advanceTimersByTime(DAY_MS));
    expect(meter.querySelector("[data-period-day]")).toBeNull();
    expect(meter.getAttribute("aria-valuetext")).not.toContain(". Day");
    expect(meter.getAttribute("aria-valuenow")).toBe(String(usedDays));
  });

  it.each([null, "invalid", new Date(NOW - 1).toISOString()])(
    "hides the arrow when reset is %s",
    (resetsAt) => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const view = renderDays("codex", "Weekly limit", 90, resetsAt);
      const meter = view.getByRole("meter");
      expect(meter.querySelector("[data-period-day]")).toBeNull();
      expect(meter.getAttribute("aria-valuetext")).toBe("6.3 / 7 days used");
    },
  );

  it.each([
    [79, "bg-primary"],
    [80, "bg-warning"],
    [94, "bg-warning"],
    [95, "bg-destructive"],
  ])("uses the existing color threshold at %s percent", (percent, tone) => {
    const meter = renderDays("codex", "Weekly limit", percent).getByRole("meter");
    expect(meter.firstElementChild?.firstElementChild?.classList.contains(tone))
      .toBe(true);
  });

  it.each([
    ["codex", "Five-hour limit"],
    ["claude-code", "Weekly limit"],
    ["acp-opencode", "Monthly"],
  ])("keeps a plain meter for %s %s", (providerId, label) => {
    const meter = renderDays(providerId, label, 50).getByRole("meter");
    expect(meter.children).toHaveLength(1);
    expect(meter.firstElementChild?.getAttribute("style")).toBe("width: 50%;");
    expect(meter.getAttribute("aria-valuenow")).toBe("50");
    expect(meter.getAttribute("aria-valuemax")).toBe("100");
  });
});
