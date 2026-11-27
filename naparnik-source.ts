import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  naparnikHostContract,
  naparnikId,
  naparnikName,
} from "./naparnik-contract.js";
import {
  usageSourceRpcContract,
  usageListMethod,
  usageFetchMethod,
} from "./usage-source-contract.js";

export function registerNaparnikSource(bb: BbPluginApi) {
  const host = bb.hosts.experimental_client({ contract: naparnikHostContract });
  const known = new Set<string>();
  bb.rpc.register(
    usageSourceRpcContract,
    {
      async [usageListMethod]() {
        const machines = (await bb.sdk.hosts.list()).filter(
          (h) => h.type !== "ephemeral",
        );
        const lists = await Promise.all(
          machines.map(async (machine) => {
            if (machine.status === "connected") {
              try {
                if (
                  await host.call(
                    "hasRelayProfile",
                    {},
                    { hostId: machine.id, timeoutMs: 5000 },
                  )
                )
                  known.add(machine.id);
                else known.delete(machine.id);
              } catch {
                /* Keep previously discovered profiles while a host is unavailable. */
              }
            }
            return known.has(machine.id)
              ? [
                  {
                    id: machine.id,
                    providerId: naparnikId,
                    accountKey: null,
                    label: naparnikName,
                    scope: {
                      kind: "host" as const,
                      hostId: machine.id,
                      hostName: machine.name,
                    },
                  },
                ]
              : [];
          }),
        );
        return { resources: lists.flat() };
      },
      [usageFetchMethod]({ resourceId, refresh }) {
        if (!known.has(resourceId))
          throw new Error("Unknown Naparnik Relay resource.");
        return host.call(
          "readRelayUsage",
          { refresh },
          { hostId: resourceId, timeoutMs: 25_000 },
        );
      },
    },
    { experimental_discoverable: true },
  );
}
