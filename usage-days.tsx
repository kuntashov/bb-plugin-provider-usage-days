import { useEffect, useState } from "react";
import type { UsageWindow } from "./usage-schema.js";
import { usageBarColorClass } from "./usage-format.js";

const DAY_MS = 24 * 60 * 60_000;
const dayFormat = { maximumFractionDigits: 1 };

function usedQuotaDays(usedPercent: number, days: number): number {
  return (Math.max(0, usedPercent) * days) / 100;
}

export function formatRemainingQuota(usedPercent: number, days: number): string {
  const remainingPercent = Math.max(0, 100 - Math.max(0, usedPercent));
  const totalHours = Math.floor((remainingPercent * days * 24) / 100);
  const wholeDays = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (wholeDays === 0) return `${hours}h`;
  return hours === 0 ? `${wholeDays}d` : `${wholeDays}d ${hours}h`;
}

export function usageWindowDays(providerId: string, label: string): number | null {
  if (providerId === "codex" && /^Weekly\b/u.test(label)) return 7;
  if (providerId === "acp-cursor") return 30;
  return null;
}

export function UsageMeter({
  window,
  days,
  surface,
  descriptionId,
}: {
  window: UsageWindow;
  days: number | null;
  surface: "sidebar" | "settings";
  descriptionId?: string;
}) {
  if (days !== null) {
    return (
      <SegmentedUsageMeter
        window={window}
        days={days}
        descriptionId={descriptionId}
      />
    );
  }

  const percent = Math.max(0, Math.min(100, window.usedPercent));
  const trackClass =
    surface === "sidebar" ? "h-1 bg-sidebar-border" : "h-1.5 bg-muted";
  return (
    <span
      role="meter"
      aria-label={window.label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={`block min-w-0 overflow-hidden rounded-full ${trackClass}`}
    >
      <span
        className={`block h-full rounded-full ${usageBarColorClass(window.usedPercent)}`}
        style={{ width: `${Math.max(2, percent)}%` }}
      />
    </span>
  );
}

function SegmentedUsageMeter({
  window,
  days,
  descriptionId,
}: {
  window: UsageWindow;
  days: number;
  descriptionId?: string;
}) {
  const resetAt = window.resetsAt === null ? NaN : Date.parse(window.resetsAt);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!Number.isFinite(resetAt)) return;
    let timer: ReturnType<typeof setTimeout>;
    function updateDay() {
      const currentTime = Date.now();
      setNow(currentTime);
      const remaining = resetAt - currentTime;
      if (remaining > 0) {
        const nextBoundary = remaining - (Math.ceil(remaining / DAY_MS) - 1) * DAY_MS;
        timer = setTimeout(updateDay, nextBoundary);
      }
    }

    updateDay();
    return () => clearTimeout(timer);
  }, [resetAt]);

  const daysUntilReset = Math.ceil((resetAt - now) / DAY_MS);
  const periodDay = daysUntilReset > 0 ? Math.max(1, days - daysUntilReset + 1) : null;
  const usedDays = usedQuotaDays(window.usedPercent, days);
  const usedLabel = `${usedDays.toLocaleString(undefined, dayFormat)} / ${days} days used`;
  const remainingLabel = `${formatRemainingQuota(window.usedPercent, days)} left`;
  const description = `${usedLabel} · ${remainingLabel}`;
  const label = periodDay === null ? description : `${description}. Day ${periodDay} of ${days}`;
  const colorClass = usageBarColorClass(window.usedPercent);

  return (
    <span
      role="meter"
      aria-label={`${window.label}: usage in days`}
      aria-valuemin={0}
      aria-valuemax={days}
      aria-valuenow={Math.min(days, usedDays)}
      aria-valuetext={label}
      title={`${label} · 1 day = ${(100 / days).toLocaleString(undefined, { maximumFractionDigits: 2 })}% of the limit`}
      className={`grid min-w-0 ${periodDay === null ? "" : "pb-1.5"}`}
      style={{
        gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))`,
        columnGap: "1px",
      }}
    >
      {Array.from({ length: days }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className="relative h-2 bg-sidebar-border"
        >
          <span
            className={`block h-full ${colorClass}`}
            style={{
              width: `${Math.max(0, Math.min(1, usedDays - index)) * 100}%`,
            }}
          />
          {periodDay === index + 1 ? (
            <span
              data-period-day={periodDay}
              className="absolute left-1/2 top-full mt-0.5 size-0 -translate-x-1/2 border-x-[3px] border-b-4 border-solid border-x-transparent border-b-subtle-foreground"
            />
          ) : null}
        </span>
      ))}
      {descriptionId === undefined ? null : (
        <span id={descriptionId} className="sr-only">
          {label}
        </span>
      )}
    </span>
  );
}
