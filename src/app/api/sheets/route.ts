import { route } from "@/lib/api";
import { getHistory } from "@/lib/queue";

export const GET = route("user", async (_req, _ctx, viewer) => getHistory(viewer));
