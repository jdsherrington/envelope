import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env["DATABASE_URL"] ?? "postgres://envelope:envelope@localhost:5432/envelope";

export const sql = postgres(connectionString, {
  max: 10,
  prepare: false,
  idle_timeout: 20,
});

export const db = drizzle(sql, { schema, casing: "snake_case" });

export type DbClient = typeof db;
