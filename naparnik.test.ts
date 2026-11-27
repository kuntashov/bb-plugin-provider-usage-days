import { afterEach, expect, it, vi } from "vitest";
import { readRelayUsage } from "./host.js";
import {
  createFakePluginHost,
  makeHostResponse,
} from "@get-bb/plugin-sdk/testing";
import plugin from "./server.js";
import { usageFetchMethod, usageListMethod } from "./usage-source-contract.js";

vi.mock("node:fs/promises", async (original) => ({
  ...(await original<typeof import("node:fs/promises")>()),
  readFile: vi.fn().mockResolvedValue('{"admin":"test-only"}'),
}));

afterEach(() => vi.unstubAllGlobals());
const checked = "2026-11-27T12:53:13.787Z";
const weeklyReset = "2026-11-29T04:24:48.636585+00:00";
const budget = {
  configured: true,
  checked,
  problem: null,
  localKey: "secret-test-value",
  limits: {
    sliding_5h: { used_percent: 0, resets_at: null },
    weekly: { used_percent: 23, resets_at: weeklyReset },
  },
};
function mockPanel(state: unknown) {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response("{}", {
        headers: {
          "set-cookie": "relay_session=example; HttpOnly; Path=/panel",
        },
      }),
    )
    .mockResolvedValueOnce(Response.json(state));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
it("refreshes the local panel and returns only quota fields", async () => {
  const fetch = mockPanel(budget);
  const result = await readRelayUsage(true);
  expect(fetch.mock.calls[1]).toMatchObject([
    "http://127.0.0.1:47831/panel/refresh",
    {
      method: "POST",
      redirect: "error",
      headers: { cookie: "relay_session=example" },
    },
  ]);
  expect(result).toMatchObject({
    observedAt: Date.parse(checked),
    usage: {
      status: "ok",
      windows: [
        { usedPercent: 0, resetsAt: null },
        { usedPercent: 23, resetsAt: weeklyReset },
      ],
    },
  });
  expect(JSON.stringify(result)).not.toContain("secret-test-value");
});
it("distinguishes an unconfigured account, a failed budget check with old limits and an unreachable relay", async () => {
  mockPanel({ ...budget, configured: false });
  expect((await readRelayUsage(false)).usage.status).toBe("unauthenticated");
  mockPanel({ ...budget, problem: { message: "private upstream error" } });
  const failed = await readRelayUsage(true);
  expect(failed).toMatchObject({
    observedAt: null,
    usage: { status: "error" },
  });
  expect(JSON.stringify(failed)).not.toContain("private upstream error");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error()));
  expect((await readRelayUsage(true)).usage).toMatchObject({
    status: "error",
    message: expect.not.stringContaining("refresh the account limits"),
  });
});
it("lists only the machine with a profile and shows its quota alongside signed-out OpenCode Go", async () => {
  const self = "provider-usage-days";
  const selected = "host-with-relay";
  const callHost = vi.fn(async ({ method, hostId }) => {
    if (method === "hasRelayProfile") return hostId === selected;
    expect(hostId).toBe(selected);
    mockPanel(budget);
    return readRelayUsage(true);
  });
  const localRpc = (method: string, input: unknown): Promise<unknown> =>
    host.harness.behavior.callRpc(method, input);
  const host = createFakePluginHost({
    pluginId: self,
    experimental_callHostRpc: callHost,
    sdk: {
      system: { config: async () => ({ primaryHostId: null }) },
      hosts: {
        list: async () =>
          [selected, "other"].map((id) =>
            makeHostResponse({ id, name: id, status: "connected" }),
          ),
      },
      providers: { list: async () => [] },
      plugins: {
        experimental_discoverRpc: async () =>
          [self, "acp"].map((pluginId) => ({
            pluginId,
            displayName: pluginId,
            method: usageListMethod,
          })),
        callRpc: async ({ pluginId, method, input }) => {
          if (pluginId === self) return localRpc(method, input);
          return method === usageListMethod
            ? {
                resources: [
                  {
                    id: "go",
                    providerId: "acp-opencode",
                    label: "OpenCode",
                    scope: {
                      kind: "host",
                      hostId: selected,
                      hostName: selected,
                    },
                  },
                ],
              }
            : {
                observedAt: null,
                usage: {
                  status: "unauthenticated",
                  accountEmail: null,
                  planLabel: null,
                },
              };
        },
      },
    },
  });
  try {
    plugin(host.bb);
    const request = {
      machineIds: [selected],
      providerIds: [],
      force: false,
      maxAgeMs: 0,
    };
    await localRpc("getUsage", request);
    expect(
      callHost.mock.calls.every(([call]) => call.method === "hasRelayProfile"),
    ).toBe(true);
    expect(
      await localRpc("getUsage", {
        ...request,
        providerIds: ["acp-opencode", "naparnik-relay"],
      }),
    ).toMatchObject({
      machines: [
        {
          id: selected,
          providers: expect.arrayContaining([
            expect.objectContaining({
              providerId: "acp-opencode",
              usage: { status: "unauthenticated" },
            }),
            expect.objectContaining({
              displayName: "1С:Напарник",
              usage: expect.objectContaining({
                status: "ok",
                windows: expect.arrayContaining([
                  expect.objectContaining({ usedPercent: 23 }),
                ]),
              }),
            }),
          ]),
        },
        { id: "other", providers: [] },
      ],
    });
    await expect(
      localRpc(usageFetchMethod, { resourceId: "other", refresh: true }),
    ).rejects.toThrow();
  } finally {
    host.harness.lifecycle.dispose();
  }
});
