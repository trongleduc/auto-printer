import { route } from "@/lib/api";
import { listAdminSessions } from "@/lib/sessions";

export const GET = route("admin", async (_req, _ctx, admin) => ({ sessions: await listAdminSessions(admin.sid) }));
