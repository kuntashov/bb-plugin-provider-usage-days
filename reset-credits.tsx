import type { UsageProvider } from "./usage-schema.js";
import { Fragment, useEffect, useState } from "react";

type ResetCredits = NonNullable<UsageProvider["resetCredits"]>;
type ResetCredit = Extract<ResetCredits, { status: "ok" }>["credits"][number];

const moscowTimeZone = "Europe/Moscow";

function moscowParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: moscowTimeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const hour = read("hour") === "24" ? "00" : read("hour");
  return {
    day: read("day"),
    month: read("month"),
    year: read("year"),
    hour,
    minute: read("minute"),
  };
}

export function formatCodexReset(value: string | null): string | null {
  if (value === null) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const { day, month, year, hour, minute } = moscowParts(date);
  return `Reset: ${day}.${month}.${year}, ${hour}:${minute} MSK`;
}

function formatCompactResetDate(value: string): string {
  const { day, month, hour, minute } = moscowParts(new Date(value));
  return `${day}.${month} ${hour}:${minute}`;
}

function formatDetailResetDate(value: string): string {
  const { day, month, year, hour, minute } = moscowParts(new Date(value));
  return `${day}.${month}.${year}, ${hour}:${minute} MSK`;
}

function activeCredits(
  credits: readonly ResetCredit[],
  now: number,
): ResetCredit[] {
  return credits
    .filter(
      (credit) =>
        credit.expiresAt === null || new Date(credit.expiresAt).getTime() > now,
    )
    .sort(
      (left, right) =>
        (left.expiresAt === null ? Infinity : Date.parse(left.expiresAt)) -
        (right.expiresAt === null ? Infinity : Date.parse(right.expiresAt)),
    );
}

function resetNoun(count: number): string {
  return count === 1 ? "reset" : "resets";
}

function fullDaysLeft(expiresAt: string, now: number): number {
  return Math.max(0, Math.floor((Date.parse(expiresAt) - now) / 86_400_000));
}

function daysLeftLabel(expiresAt: string, now: number): string {
  const days = fullDaysLeft(expiresAt, now);
  return `${days} ${days === 1 ? "day" : "days"} left`;
}

function DaysLeft({
  expiresAt,
  now,
}: {
  expiresAt: string;
  now: number;
}) {
  return (
    <strong className="font-bold text-primary">
      {daysLeftLabel(expiresAt, now)}
    </strong>
  );
}

function CompactResetLine({
  count,
  credits,
  now,
}: {
  count: number;
  credits: readonly ResetCredit[];
  now: number;
}) {
  const noun = `${count} ${resetNoun(count)}`;
  const shown = credits.slice(0, 2);
  if (shown.length === 0) {
    return (
      <>
        {count > 0 ? `${noun} - expiration times were not received` : noun}
      </>
    );
  }
  return (
    <>
      {noun}
      {" - "}
      {shown.map((credit, index) => (
        <Fragment key={credit.id}>
          {index > 0 ? ", " : null}
          {credit.expiresAt === null ? (
            `#${index + 1} no expiry`
          ) : index === 0 ? (
            <>
              #{index + 1} <DaysLeft expiresAt={credit.expiresAt} now={now} />{" "}
              {formatCompactResetDate(credit.expiresAt)}
            </>
          ) : (
            `#${index + 1} ${formatCompactResetDate(credit.expiresAt)}`
          )}
        </Fragment>
      ))}
      {shown.some((credit) => credit.expiresAt !== null) ? " MSK" : null}
    </>
  );
}

export function CodexResetCredits({
  value,
  layout,
}: {
  value: UsageProvider["resetCredits"];
  layout: "compact" | "detail";
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  if (value == null) return null;
  const className =
    layout === "compact"
      ? "col-span-full text-2xs text-subtle-foreground"
      : "col-span-full grid gap-1 text-2xs text-subtle-foreground";
  if (value.status === "error") {
    return (
      <div data-codex-reset-credits="" className={className}>
        Additional resets: could not refresh
      </div>
    );
  }
  const credits = activeCredits(value.credits, now);
  if (layout === "compact") {
    return (
      <div data-codex-reset-credits="" className={className}>
        <CompactResetLine
          count={value.availableCount}
          credits={credits}
          now={now}
        />
      </div>
    );
  }
  return (
    <div data-codex-reset-credits="" className={className}>
      <span>
        {value.availableCount} {resetNoun(value.availableCount)}
      </span>
      {credits.map((credit, index) => (
        <span key={credit.id}>
          {credit.expiresAt === null ? (
            `#${index + 1}: no expiry`
          ) : (
            <>
              #{index + 1}: use by{" "}
              <time dateTime={credit.expiresAt}>
                {formatDetailResetDate(credit.expiresAt)}
              </time>
              {index === 0 ? (
                <>
                  {" - "}
                  <DaysLeft expiresAt={credit.expiresAt} now={now} />
                </>
              ) : null}
            </>
          )}
        </span>
      ))}
      {value.availableCount > 0 && credits.length === 0 ? (
        <span>Expiration times were not received.</span>
      ) : null}
    </div>
  );
}
