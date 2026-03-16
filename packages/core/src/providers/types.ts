export type ProviderId = "gmail" | "imap" | "outlook" | (string & {});

export type EmailAddress = {
  name?: string;
  email: string;
};

export type CanonicalAttachment = {
  providerAttachmentId: string;
  filename: string;
  mimeType: string;
  sizeBytes?: number;
  inline?: boolean;
  contentId?: string;
};

export type CanonicalThread = {
  accountId: string;
  providerId: ProviderId;
  providerThreadId: string;
  subject: string;
  snippet: string;
  lastMessageAt: string;
  unreadCount: number;
  labelIds: string[];
};

export type CanonicalMessage = {
  accountId: string;
  providerId: ProviderId;
  providerMessageId: string;
  providerThreadId: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  subject: string;
  internalDate: string;
  snippet?: string;
  textBody?: string;
  htmlBody?: string;
  flags: {
    isRead: boolean;
    isStarred?: boolean;
    isDraft?: boolean;
  };
  attachments: CanonicalAttachment[];
};

export type CanonicalDraft = {
  accountId: string;
  providerId: ProviderId;
  providerDraftId?: string;
  providerThreadId?: string;
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  subject: string;
  textBody?: string;
  htmlBody?: string;
  sendLaterAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type CanonicalReminder = {
  accountId: string;
  providerThreadId: string;
  remindAt: string;
  reason?: string;
};

export type AttachmentBlob = {
  providerAttachmentId: string;
  filename: string;
  mimeType: string;
  bytesBase64: string;
  cacheControl?: string;
};

export type CanonicalLabel = {
  accountId: string;
  providerId: ProviderId;
  providerLabelId: string;
  name: string;
  type: "system" | "user";
  color?: { background: string; text: string };
};

export type ProviderCapabilities = {
  supportsThreads: boolean;
  supportsLabels: boolean;
  supportsFolders: boolean;
  supportsSendLater: boolean;
  supportsSnooze: boolean;
  supportsUndoSend: boolean;
  supportsReminders: boolean;
  supportsPushSync: boolean;
  supportsQuotaReporting: boolean;
};

export type OAuthClientConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type OAuthTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scope: string[];
  tokenType: "Bearer";
};

export type SyncCursor = {
  raw: string;
};

export type SyncDelta = {
  newCursor: SyncCursor;
  upsertLabels?: CanonicalLabel[];
  upsertThreads?: CanonicalThread[];
  upsertMessages?: CanonicalMessage[];
  deleteThreadIds?: string[];
  deleteMessageIds?: string[];
};

export type InitialSyncChunk = {
  upsertLabels?: CanonicalLabel[];
  upsertThreads?: CanonicalThread[];
  upsertMessages?: CanonicalMessage[];
};

export type ListPage<T> = {
  items: T[];
  nextPageToken?: string | null;
};

export type ProviderAccountContext = {
  accountId: string;
  email: string;
  oauthConfig: OAuthClientConfig;
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
  };
  quota?: {
    used?: number;
    limit?: number;
    resetAt?: string;
  };
};

export type OutgoingAttachment = {
  filename: string;
  mimeType: string;
  bytesBase64: string;
  inline?: boolean;
  contentId?: string;
};

export type OutgoingDraft = {
  threadProviderId?: string;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  textBody?: string;
  htmlBody?: string;
  attachments?: OutgoingAttachment[];
};

export type OutgoingMessage = OutgoingDraft;

export type ProviderQuotaSnapshot = {
  windowLabel: "perMinute" | "perDay" | "unknown";
  used?: number;
  limit?: number;
  resetAt?: string;
  backoffUntil?: string;
  lastError?: {
    code: string;
    message: string;
    at: string;
  };
};

export type ProviderErrorCode =
  | "AUTH_EXPIRED"
  | "AUTH_REVOKED"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "NOT_FOUND"
  | "INVALID_REQUEST"
  | "PERMISSION_DENIED"
  | "CONFLICT"
  | "UNKNOWN";

export class ProviderError extends Error {
  code: ProviderErrorCode;
  retryable: boolean;
  retryAfterMs?: number;
  providerStatus?: number;
  providerPayload?: unknown;

  constructor(args: {
    message: string;
    code: ProviderErrorCode;
    retryable: boolean;
    retryAfterMs?: number;
    providerStatus?: number;
    providerPayload?: unknown;
  }) {
    super(args.message);
    this.name = "ProviderError";
    this.code = args.code;
    this.retryable = args.retryable;
    this.retryAfterMs = args.retryAfterMs;
    this.providerStatus = args.providerStatus;
    this.providerPayload = args.providerPayload;
  }
}

export type AuthProvider = {
  getAuthorizationUrl(args: {
    oauthConfig: OAuthClientConfig;
    state: string;
    scopes: string[];
    loginHint?: string;
    codeChallenge?: string;
    codeChallengeMethod?: "S256";
  }): Promise<string>;

  exchangeCodeForTokens(args: {
    oauthConfig: OAuthClientConfig;
    code: string;
    codeVerifier?: string;
  }): Promise<OAuthTokenSet>;

  refreshAccessToken(args: {
    oauthConfig: OAuthClientConfig;
    refreshToken: string;
  }): Promise<Pick<OAuthTokenSet, "accessToken" | "expiresAt" | "scope" | "tokenType">>;

  revoke(args: { accessToken?: string; refreshToken?: string }): Promise<void>;
};

export type MailProvider = {
  listLabels(args: {
    account: ProviderAccountContext;
  }): Promise<CanonicalLabel[]>;

  listThreads(args: {
    account: ProviderAccountContext;
    query?: string;
    pageToken?: string | null;
    pageSize: number;
    labelFilter?: string[];
  }): Promise<ListPage<CanonicalThread>>;

  getThread(args: {
    account: ProviderAccountContext;
    providerThreadId: string;
    includeBodies?: boolean;
  }): Promise<{ thread: CanonicalThread; messages: CanonicalMessage[]; historyId?: string }>;

  getMessage(args: {
    account: ProviderAccountContext;
    providerMessageId: string;
    includeBodies?: boolean;
  }): Promise<CanonicalMessage>;

  getAttachment(args: {
    account: ProviderAccountContext;
    providerMessageId: string;
    providerAttachmentId: string;
  }): Promise<AttachmentBlob>;

  initialSync(args: {
    account: ProviderAccountContext;
    mode: "recent";
    onProgress?: (progress: { phase: string; processed: number; target?: number }) => Promise<void> | void;
    onChunk?: (chunk: InitialSyncChunk) => Promise<void> | void;
  }): Promise<SyncDelta>;

  incrementalSync(args: {
    account: ProviderAccountContext;
    cursor: SyncCursor;
  }): Promise<SyncDelta>;
};

export type MutationProvider = {
  archiveThreads(args: {
    account: ProviderAccountContext;
    providerThreadIds: string[];
  }): Promise<void>;

  trashThreads(args: {
    account: ProviderAccountContext;
    providerThreadIds: string[];
  }): Promise<void>;

  deleteThreadsPermanently(args: {
    account: ProviderAccountContext;
    providerThreadIds: string[];
  }): Promise<void>;

  markThreadsRead(args: {
    account: ProviderAccountContext;
    providerThreadIds: string[];
  }): Promise<void>;

  markThreadsUnread(args: {
    account: ProviderAccountContext;
    providerThreadIds: string[];
  }): Promise<void>;

  addLabelsToThreads(args: {
    account: ProviderAccountContext;
    providerThreadIds: string[];
    providerLabelIds: string[];
  }): Promise<void>;

  removeLabelsFromThreads(args: {
    account: ProviderAccountContext;
    providerThreadIds: string[];
    providerLabelIds: string[];
  }): Promise<void>;

  moveThreadsToSpam?(args: {
    account: ProviderAccountContext;
    providerThreadIds: string[];
  }): Promise<void>;

  snoozeThreads?(args: {
    account: ProviderAccountContext;
    providerThreadIds: string[];
    until: string;
  }): Promise<void>;

  createDraft(args: {
    account: ProviderAccountContext;
    draft: OutgoingDraft;
  }): Promise<{ providerDraftId: string; providerMessageId?: string }>;

  updateDraft(args: {
    account: ProviderAccountContext;
    providerDraftId: string;
    draft: OutgoingDraft;
  }): Promise<void>;

  sendDraft(args: {
    account: ProviderAccountContext;
    providerDraftId: string;
  }): Promise<{ providerMessageId: string; providerThreadId?: string }>;

  sendMessage(args: {
    account: ProviderAccountContext;
    message: OutgoingMessage;
  }): Promise<{ providerMessageId: string; providerThreadId?: string }>;

  sendLater?(args: {
    account: ProviderAccountContext;
    message: OutgoingMessage;
    sendAt: string;
  }): Promise<{ providerMessageId: string; providerThreadId?: string }>;
};

export type QuotaProvider = {
  getQuotaSnapshot(args: {
    account: ProviderAccountContext;
  }): Promise<ProviderQuotaSnapshot>;
};

export type DiagnosticsProvider = {
  getDebugInfo(args: {
    account: ProviderAccountContext;
  }): Promise<Record<string, unknown>>;
};

export type ProviderAdapter = {
  providerId: ProviderId;
  displayName: string;
  capabilities: ProviderCapabilities;
  auth: AuthProvider;
  mail: MailProvider;
  mutate: MutationProvider;
  quota: QuotaProvider;
  diagnostics?: DiagnosticsProvider;
};
