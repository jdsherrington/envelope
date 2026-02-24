import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).default("postgres://envelope:envelope@localhost:5432/envelope"),
  ENVELOPE_SECRETS_KEY: z
    .string()
    .min(10)
    .default("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="),
  WORKER_POLL_MS: z.coerce.number().int().positive().default(5000),
  SYNC_POLL_MS: z.coerce.number().int().positive().default(45000),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid worker environment: ${parsed.error.message}`);
}

export const env = parsed.data;
