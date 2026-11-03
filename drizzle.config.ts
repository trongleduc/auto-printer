import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Use the same .env.local that Next.js reads.
loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
