import { idParam, route } from "@/lib/api";
import { cancelQueued } from "@/lib/queue";

export const DELETE = route("user", async (_req, ctx: RouteContext<"/api/photos/[id]">, viewer) => {
  await cancelQueued({ photoId: await idParam(ctx) }, viewer);
});
