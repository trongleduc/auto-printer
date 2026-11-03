import { z } from "zod";
import { parseBody, route } from "@/lib/api";
import { createOrder } from "@/lib/queue";

const Body = z.object({
  label: z.string().trim().max(80).default(""),
  photos: z
    .array(
      z.object({
        key: z.string().regex(/^photos\/\d{4}-\d{2}\/[0-9a-f-]{36}\.jpg$/, "invalid photo key"),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(50),
});

export const POST = route("user", async (req, _ctx, viewer) =>
  createOrder({ ...(await parseBody(req, Body)), ownerSid: viewer.sid }),
);
