import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

// pooled endpoint + small client pool: serverless functions must not hold many conns
const sql = postgres(url, { max: 1, prepare: false });
export const db = drizzle(sql, { schema });
export { schema };
