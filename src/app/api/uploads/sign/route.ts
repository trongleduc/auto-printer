import { z } from "zod";
import { parseBody, route } from "@/lib/api";
import { signPut, UPLOAD_CACHE_CONTROL } from "@/lib/r2";

const Body = z.object({ count: z.number().int().min(1).max(50) });

/** Returns one presigned PUT URL per photo; the browser uploads straight to R2. */
export const POST = route("user", async (req) => {
  const { count } = await parseBody(req, Body);
  const month = new Date().toISOString().slice(0, 7);
  const uploads = await Promise.all(
    Array.from({ length: count }, async () => {
      const key = `photos/${month}/${crypto.randomUUID()}.jpg`;
      return { key, url: await signPut(key, "image/jpeg") };
    }),
  );
  return { uploads, headers: { "Content-Type": "image/jpeg", "Cache-Control": UPLOAD_CACHE_CONTROL } };
});
