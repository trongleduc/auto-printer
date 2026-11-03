import { route } from "@/lib/api";
import { flushQueue } from "@/lib/queue";

export const POST = route("admin", async () => ({ sheetsCreated: await flushQueue() }));
