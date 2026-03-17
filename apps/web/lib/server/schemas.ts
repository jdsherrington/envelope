import { z } from "zod";

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
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

const emailAddressSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email(),
});

export const outgoingMessageSchema = z.object({
  to: z.array(emailAddressSchema).min(1),
  cc: z.array(emailAddressSchema).optional(),
  bcc: z.array(emailAddressSchema).optional(),
  subject: z.string().min(1).max(998),
  textBody: z.string().optional(),
  htmlBody: z.string().optional(),
  threadProviderId: z.string().optional(),
});

export const sendActionSchema = z.object({
  accountId: z.string().uuid(),
  clientMutationId: z.string().min(3),
  message: outgoingMessageSchema,
});

export const draftCreateSchema = z.object({
  accountId: z.string().uuid(),
  draftId: z.string().uuid(),
  draft: outgoingMessageSchema,
  sendLaterAt: z.string().datetime().optional(),
});

export const draftUpdateSchema = draftCreateSchema.extend({
  providerDraftId: z.string().min(1),
});

export const draftSendSchema = z.object({
  accountId: z.string().uuid(),
  draftId: z.string().uuid(),
  providerDraftId: z.string().min(1),
});

export const sendLaterSchema = z.object({
  accountId: z.string().uuid(),
  clientMutationId: z.string().min(3),
  sendAt: z.string().datetime(),
  message: outgoingMessageSchema,
});

export const sendUndoSchema = z.object({
  accountId: z.string().uuid(),
  undoToken: z.string().min(3),
});

export const snoozeActionSchema = threadActionSchema.extend({
  remindAt: z.string().datetime(),
});

export const reminderActionSchema = threadActionSchema.extend({
  remindAt: z.string().datetime(),
  note: z.string().max(500).optional(),
});

export const syncRefreshSchema = z.object({
  accountId: z.string().uuid(),
});

export const settingsSchema = z.object({
  theme: z.enum(["dark", "light", "system"]).optional(),
  density: z.enum(["comfortable", "compact"]).optional(),
  keymap: z.enum(["superhuman", "vim"]).optional(),
  accent: z.enum(["amber", "blue", "emerald", "rose", "violet"]).optional(),
  hideRareLabels: z.boolean().optional(),
});

export const searchSchema = z.object({
  accountId: z.string().uuid(),
  q: z.string().trim().min(1),
  page: z.coerce.number().int().positive().default(1),
});

export const commandEventSchema = z.object({
  accountId: z.string().uuid().nullable().optional(),
  commandId: z.string().min(1),
  commandVersion: z.number().int().positive(),
  viewScope: z.string().min(1),
  selectionCount: z.number().int().min(0),
  status: z.enum(["success", "queued", "error"]),
  durationMs: z.number().int().nonnegative().optional(),
  errorMessage: z.string().optional(),
});

export const perfEventSchema = z.object({
  accountId: z.string().uuid().nullable().optional(),
  route: z.string().min(1),
  metric: z.string().min(1),
  valueMs: z.number().int().nonnegative(),
  metadata: z.record(z.unknown()).optional(),
});
