import { z } from "zod";
import { parseBody, route } from "@/lib/api";
import { getSettings, updateSettings } from "@/lib/queue";

const Body = z.object({ autoFlushMinutes: z.number().int().min(0).max(24 * 60) });

export const GET = route("admin", async () => getSettings());

export const PUT = route("admin", async (req) => {
  await updateSettings(await parseBody(req, Body));
  return getSettings();
});
