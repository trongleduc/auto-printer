import { idParam, route } from "@/lib/api";
import { cancelQueued } from "@/lib/queue";

export const DELETE = route("user", async (_req, ctx: RouteContext<"/api/orders/[id]">, viewer) => {
  await cancelQueued({ orderId: await idParam(ctx) }, viewer);
});
