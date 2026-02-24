import { z } from "zod";

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  totpCode: z.string().length(6),
  totpSecret: z.string().min(16),
});

export const gmailConfigSchema = z.object({
  clientId: z.string().min(5),
  clientSecret: z.string().min(5),
  redirectUri: z.string().url(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totpCode: z.string().length(6),
});

export const threadActionSchema = z.object({
  accountId: z.string().uuid(),
  threadIds: z.array(z.string().uuid()).min(1),
});

export const labelActionSchema = threadActionSchema.extend({
  labelIds: z.array(z.string()).min(1),
});
