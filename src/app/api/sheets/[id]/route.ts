import { z } from "zod";
import { idParam, parseBody, route } from "@/lib/api";
import { sheetAction } from "@/lib/queue";

const Body = z.object({ action: z.enum(["retry", "reprint", "mark_printed"]) });

export const POST = route("admin", async (req, ctx: RouteContext<"/api/sheets/[id]">) => {
  const id = await idParam(ctx);
  const { action } = await parseBody(req, Body);
  await sheetAction(id, action);
});
