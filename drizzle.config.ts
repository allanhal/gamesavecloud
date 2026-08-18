import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // migrations must use the DIRECT (unpooled) connection
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED! },
});
