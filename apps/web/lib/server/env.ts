import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ORIGIN: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).default("postgres://envelope:envelope@localhost:5432/envelope"),
  ENVELOPE_SECRETS_KEY: z
    .string()
    .min(10)
    .default("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="),
  SESSION_COOKIE_NAME: z.string().min(1).default("envelope_session"),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(24),
  GMAIL_SCOPES: z
    .string()
    .default(
      "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.labels",
    ),
  WEBAUTHN_RP_NAME: z.string().default("Envelope"),
  WEBAUTHN_RP_ID: z.string().optional(),
  APP_VERSION: z.string().default("dev"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment: ${parsed.error.message}`);
}

export const env = parsed.data;

export const gmailScopes = env.GMAIL_SCOPES.split(" ").filter(Boolean);
