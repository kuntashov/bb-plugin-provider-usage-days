import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { z } from "zod";
import { naparnikHostContract } from "./naparnik-contract.js";
import type { UsageMeasurement } from "./usage-source-contract.js";

const profile = join(homedir(), ".naparnik-relay", "connection.json");
const origin = "http://127.0.0.1:47831";
const timestamp = z.iso.datetime({ offset: true });
const windowSchema = z.object({
  used_percent: z.number().nonnegative(),
  resets_at: timestamp.nullable(),
});
const panel = z.object({
  configured: z.boolean(),
  checked: timestamp.nullable(),
  problem: z.unknown(),
  limits: z.unknown(),
});
const limitsSchema = z.object({
  sliding_5h: windowSchema,
  weekly: windowSchema,
});
const account = { plan: null, accountEmail: null, planLabel: null };
const unknown = { accountKey: null, observedAt: null };

export async function readRelayUsage(
  refresh: boolean,
): Promise<UsageMeasurement> {
  const signal = AbortSignal.timeout(20_000);
  const headers = { "x-relay-panel": "1", "Content-Type": "application/json" };
  try {
    const { admin } = z
      .object({ admin: z.string().min(1) })
      .parse(JSON.parse(await readFile(profile, "utf8")));
    const session = await fetch(origin + "/panel/session", {
      method: "POST",
      headers,
      body: JSON.stringify({ token: admin }),
      signal,
      redirect: "error",
    });
    const cookie = session.headers.get("set-cookie")?.split(";")[0];
    if (!session.ok || !cookie?.startsWith("relay_session=")) throw new Error();
    const panelHeaders = { ...headers, cookie };
    async function state(update: boolean) {
      const response = await fetch(
        origin + (update ? "/panel/refresh" : "/panel/state"),
        {
          method: update ? "POST" : "GET",
          headers: panelHeaders,
          body: update ? "{}" : undefined,
          signal,
          redirect: "error",
        },
      );
      if (!response.ok) throw new Error();
      return panel.parse(await response.json());
    }
    let result = await state(refresh);
    if (
      !refresh &&
      result.configured &&
      (result.problem !== null ||
        !result.checked ||
        Date.now() - Date.parse(result.checked) >= 60_000)
    )
      result = await state(true);
    if (!result.configured)
      return { ...unknown, usage: { ...account, status: "unauthenticated" } };
    const limits = limitsSchema.safeParse(result.limits);
    if (result.problem !== null || !result.checked || !limits.success)
      return {
        ...unknown,
        usage: {
          ...account,
          status: "error",
          message: "Naparnik Relay could not refresh the account limits.",
        },
      };
    const windows = (["sliding_5h", "weekly"] as const).map((id) => ({
      id,
      kind: id === "weekly" ? ("weekly" as const) : ("five-hour" as const),
      label: id === "weekly" ? "Weekly limit" : "Five-hour limit",
      usedPercent: limits.data[id].used_percent,
      resetsAt: limits.data[id].resets_at,
      cost: null,
      model: null,
    }));
    return {
      accountKey: null,
      observedAt: Date.parse(result.checked),
      usage: { ...account, status: "ok", windows },
    };
  } catch {
    return {
      ...unknown,
      usage: {
        ...account,
        status: "error",
        message: "Could not read the local Naparnik Relay panel.",
      },
    };
  }
}

export default experimental_defineHostEntry({
  contract: naparnikHostContract,
  handlers: {
    async hasRelayProfile() {
      try {
        return (await stat(profile)).isFile();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw new Error("Could not check the Naparnik Relay profile.");
      }
    },
    readRelayUsage: ({ refresh }) => readRelayUsage(refresh),
  },
});
