import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { usageMeasurementSchema } from "./usage-source-contract.js";

export const naparnikId = "naparnik-relay";
export const naparnikName = "1С:Напарник";
export const naparnikHostContract = defineRpcContract({
  hasRelayProfile: { input: z.strictObject({}), output: z.boolean() },
  readRelayUsage: {
    input: z.strictObject({ refresh: z.boolean() }),
    output: usageMeasurementSchema,
  },
});
