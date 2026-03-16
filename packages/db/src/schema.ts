import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const accountStatusEnum = pgEnum("account_status", [
  "ok",
  "syncing",
  "rate_limited",
  "needs_reauth",
  "error",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
  "dead",
]);

export const labelTypeEnum = pgEnum("label_type", ["system", "user"]);
export const messageBodyStateEnum = pgEnum("message_body_state", ["deferred", "present", "failed"]);
export const snippetKindEnum = pgEnum("snippet_kind", ["snippet", "template"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  theme: text("theme").notNull().default("dark"),
  density: text("density").notNull().default("comfortable"),
  keymap: text("keymap").notNull().default("superhuman"),
  contrast: text("contrast").notNull().default("standard"),
  hideRareLabels: boolean("hide_rare_labels").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const totpFactors = pgTable("totp_factors", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  encryptedSecret: text("encrypted_secret").notNull(),
  isVerified: boolean("is_verified").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  csrfToken: text("csrf_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const loginRateLimits = pgTable("login_rate_limits", {
  key: text("key").primaryKey(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).defaultNow().notNull(),
  blockedUntil: timestamp("blocked_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const oauthClientConfigs = pgTable("oauth_client_configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  providerId: text("provider_id").notNull().unique(),
  encryptedClientId: text("encrypted_client_id").notNull(),
  encryptedClientSecret: text("encrypted_client_secret").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  scopes: text("scopes").array().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const oauthStates = pgTable("oauth_states", {
  state: text("state").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  codeVerifier: text("code_verifier").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    status: accountStatusEnum("status").default("syncing").notNull(),
    encryptedAccessToken: text("encrypted_access_token").notNull(),
    encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
    syncCursor: text("sync_cursor"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    backoffUntil: timestamp("backoff_until", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    providerEmailUnique: unique("accounts_provider_email_unique").on(table.providerId, table.email),
  }),
);

export const labels = pgTable(
  "labels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    providerLabelId: text("provider_label_id").notNull(),
    name: text("name").notNull(),
    type: labelTypeEnum("type").notNull(),
    colorBackground: text("color_background"),
    colorText: text("color_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    accountProviderLabelUnique: unique("labels_account_provider_label_unique").on(
      table.accountId,
      table.providerLabelId,
    ),
  }),
);

export const threads = pgTable(
  "threads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    providerThreadId: text("provider_thread_id").notNull(),
    subject: text("subject").notNull(),
    snippet: text("snippet").notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull(),
    unreadCount: integer("unread_count").default(0).notNull(),
    providerLabelIds: text("provider_label_ids").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    accountProviderThreadUnique: unique("threads_account_provider_thread_unique").on(
      table.accountId,
      table.providerThreadId,
    ),
  }),
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    providerMessageId: text("provider_message_id").notNull(),
    providerThreadId: text("provider_thread_id").notNull(),
    fromName: text("from_name"),
    fromEmail: text("from_email").notNull(),
    toRecipients: jsonb("to_recipients").$type<Array<{ name?: string; email: string }>>().notNull(),
    ccRecipients: jsonb("cc_recipients")
      .$type<Array<{ name?: string; email: string }>>()
      .notNull()
      .default([]),
    bccRecipients: jsonb("bcc_recipients")
      .$type<Array<{ name?: string; email: string }>>()
      .notNull()
      .default([]),
    subject: text("subject").notNull(),
    internalDate: timestamp("internal_date", { withTimezone: true }).notNull(),
    snippet: text("snippet"),
    textBody: text("text_body"),
    htmlBody: text("html_body"),
    bodyState: messageBodyStateEnum("body_state").notNull().default("deferred"),
    isRead: boolean("is_read").default(false).notNull(),
    isStarred: boolean("is_starred").default(false).notNull(),
    isDraft: boolean("is_draft").default(false).notNull(),
    attachments: jsonb("attachments")
      .$type<
        Array<{
          providerAttachmentId: string;
          filename: string;
          mimeType: string;
          sizeBytes?: number;
          inline?: boolean;
          contentId?: string;
        }>
      >()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    accountProviderMessageUnique: unique("messages_account_provider_message_unique").on(
      table.accountId,
      table.providerMessageId,
    ),
  }),
);

export const threadLabels = pgTable(
  "thread_labels",
  {
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.threadId, table.labelId] }),
  }),
);

export const jobs = pgTable("jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: jobStatusEnum("status").default("pending").notNull(),
  runAt: timestamp("run_at", { withTimezone: true }).defaultNow().notNull(),
  attempt: integer("attempt").default(0).notNull(),
  maxAttempts: integer("max_attempts").default(6).notNull(),
  retryAfterMs: integer("retry_after_ms"),
  lastErrorCode: text("last_error_code"),
  lastErrorMessage: text("last_error_message"),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const syncState = pgTable("sync_state", {
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => accounts.id, { onDelete: "cascade" }),
  cursorRaw: text("cursor_raw"),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  backoffUntil: timestamp("backoff_until", { withTimezone: true }),
  lastErrorCode: text("last_error_code"),
  lastErrorMessage: text("last_error_message"),
  initialSyncInProgress: boolean("initial_sync_in_progress").default(false).notNull(),
  initialSyncPhase: text("initial_sync_phase"),
  initialSyncTarget: integer("initial_sync_target"),
  initialSyncProcessed: integer("initial_sync_processed").default(0).notNull(),
  initialSyncStartedAt: timestamp("initial_sync_started_at", { withTimezone: true }),
  initialSyncCompletedAt: timestamp("initial_sync_completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const quotaEvents = pgTable("quota_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  windowLabel: text("window_label").notNull(),
  used: integer("used"),
  limit: integer("limit"),
  backoffUntil: timestamp("backoff_until", { withTimezone: true }),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
});

export const drafts = pgTable(
  "drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    providerDraftId: text("provider_draft_id"),
    providerThreadId: text("provider_thread_id"),
    toRecipients: jsonb("to_recipients").$type<Array<{ name?: string; email: string }>>().notNull(),
    ccRecipients: jsonb("cc_recipients")
      .$type<Array<{ name?: string; email: string }>>()
      .notNull()
      .default([]),
    bccRecipients: jsonb("bcc_recipients")
      .$type<Array<{ name?: string; email: string }>>()
      .notNull()
      .default([]),
    subject: text("subject").notNull(),
    textBody: text("text_body"),
    htmlBody: text("html_body"),
    sendLaterAt: timestamp("send_later_at", { withTimezone: true }),
    lastProviderMessageId: text("last_provider_message_id"),
    lastProviderThreadId: text("last_provider_thread_id"),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    providerDraftUnique: unique("drafts_account_provider_draft_unique").on(
      table.accountId,
      table.providerDraftId,
    ),
  }),
);

export const snippets = pgTable("snippets", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: snippetKindEnum("kind").notNull().default("snippet"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    remindAt: timestamp("remind_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("scheduled"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    reminderUnique: unique("reminders_account_thread_remind_at_unique").on(
      table.accountId,
      table.threadId,
      table.remindAt,
    ),
  }),
);

export const attachmentCache = pgTable(
  "attachment_cache",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    providerMessageId: text("provider_message_id").notNull(),
    providerAttachmentId: text("provider_attachment_id").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes"),
    bytesBase64: text("bytes_base64").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    attachmentUnique: unique("attachment_cache_account_message_attachment_unique").on(
      table.accountId,
      table.providerMessageId,
      table.providerAttachmentId,
    ),
  }),
);

export const passkeyCredentials = pgTable(
  "passkey_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    credentialId: text("credential_id").notNull(),
    publicKey: text("public_key").notNull(),
    counter: integer("counter").default(0).notNull(),
    backedUp: boolean("backed_up"),
    transports: text("transports").array().notNull().default([]),
    deviceType: text("device_type"),
    name: text("name"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    credentialUnique: unique("passkey_credentials_credential_id_unique").on(table.credentialId),
  }),
);

export const passkeyChallenges = pgTable(
  "passkey_challenges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    flow: text("flow").notNull(),
    challenge: text("challenge").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    challengeUnique: unique("passkey_challenges_user_flow_unique").on(table.userId, table.flow),
  }),
);

export const quotaRollups = pgTable(
  "quota_rollups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    bucketType: text("bucket_type").notNull(),
    bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
    requestCount: integer("request_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    bucketUnique: unique("quota_rollups_account_bucket_unique").on(
      table.accountId,
      table.bucketType,
      table.bucketStart,
    ),
  }),
);

export const commandEvents = pgTable("command_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
  commandId: text("command_id").notNull(),
  commandVersion: integer("command_version").notNull(),
  viewScope: text("view_scope").notNull(),
  selectionCount: integer("selection_count").notNull().default(0),
  status: text("status").notNull(),
  durationMs: integer("duration_ms"),
  errorMessage: text("error_message"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
});

export const logEvents = pgTable("log_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
  level: text("level").notNull(),
  scope: text("scope").notNull(),
  message: text("message").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
});

export const workerHeartbeats = pgTable(
  "worker_heartbeats",
  {
    workerId: text("worker_id").primaryKey(),
    host: text("host").notNull(),
    pid: integer("pid").notNull(),
    version: text("version").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workerHostPidUnique: unique("worker_heartbeats_host_pid_unique").on(table.host, table.pid),
  }),
);

export const perfEvents = pgTable("perf_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
  route: text("route").notNull(),
  metric: text("metric").notNull(),
  valueMs: integer("value_ms").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type Job = typeof jobs.$inferSelect;
