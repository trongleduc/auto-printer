import { route } from "@/lib/api";
import { getQueue } from "@/lib/queue";

export const GET = route("user", async (_req, _ctx, viewer) => getQueue(viewer));
