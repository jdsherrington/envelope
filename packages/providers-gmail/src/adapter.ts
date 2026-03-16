import {
  ProviderError,
  type AttachmentBlob,
  type CanonicalAttachment,
  type CanonicalLabel,
  type CanonicalMessage,
  type CanonicalThread,
  type EmailAddress,
  type OAuthTokenSet,
  type OutgoingDraft,
  type OutgoingMessage,
  type ProviderAdapter,
  type ProviderAccountContext,
  type ProviderQuotaSnapshot,
  type SyncDelta,
  type InitialSyncChunk,
} from "@envelope/core";

type GmailApiMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    mimeType?: string;
    body?: { data?: string; size?: number; attachmentId?: string };
    parts?: GmailApiMessage["payload"][];
    filename?: string;
  };
};

type GmailApiThread = {
  id: string;
  snippet?: string;
  historyId?: string;
  messages?: GmailApiMessage[];
};

type GmailApiError = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

type GmailAttachmentResponse = {
  data?: string;
  size?: number;
};

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const OAUTH_BASE = "https://oauth2.googleapis.com";
const INITIAL_SYNC_BATCH_SIZE = 5;

const parseRetryAfterMs = (response: Response): number | undefined => {
  const header = response.headers.get("retry-after");
  if (!header) {
    return undefined;
  }

  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return seconds * 1000;
  }

  const date = Date.parse(header);
  if (!Number.isFinite(date)) {
    return undefined;
  }

  return Math.max(date - Date.now(), 0);
};

export const mapGmailErrorResponse = async (response: Response): Promise<ProviderError> => {
  let payload: GmailApiError | undefined;
  try {
    payload = (await response.json()) as GmailApiError;
  } catch {
    payload = undefined;
  }

  const message = payload?.error?.message ?? response.statusText ?? "Unknown Gmail API error";
  const retryAfterMs = parseRetryAfterMs(response);

  if (response.status === 401) {
    return new ProviderError({
      message,
      code: "AUTH_EXPIRED",
      retryable: true,
      providerStatus: response.status,
      providerPayload: payload,
    });
  }

  if (response.status === 403) {
    const isRateLimit = /rate|quota|limit/i.test(message);
    return new ProviderError({
      message,
      code: isRateLimit ? "RATE_LIMITED" : "PERMISSION_DENIED",
      retryable: isRateLimit,
      retryAfterMs,
      providerStatus: response.status,
      providerPayload: payload,
    });
  }

  if (response.status === 404) {
    return new ProviderError({
      message,
      code: "NOT_FOUND",
      retryable: false,
      providerStatus: response.status,
      providerPayload: payload,
    });
  }

  if (response.status === 400) {
    return new ProviderError({
      message,
      code: "INVALID_REQUEST",
      retryable: false,
      providerStatus: response.status,
      providerPayload: payload,
    });
  }

  if (response.status === 429 || response.status >= 500) {
    return new ProviderError({
      message,
      code: "RATE_LIMITED",
      retryable: true,
      retryAfterMs,
      providerStatus: response.status,
      providerPayload: payload,
    });
  }

  return new ProviderError({
    message,
    code: "UNKNOWN",
    retryable: response.status >= 500,
    retryAfterMs,
    providerStatus: response.status,
    providerPayload: payload,
  });
};

const gmailFetch = async <T>(
  account: ProviderAccountContext,
  path: string,
  init: RequestInit = {},
): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(`${GMAIL_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${account.tokens.accessToken}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    throw new ProviderError({
      message: error instanceof Error ? error.message : "Network error",
      code: "NETWORK_ERROR",
      retryable: true,
    });
  }

  if (!response.ok) {
    throw await mapGmailErrorResponse(response);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
};

const oauthFetch = async <T>(path: string, init: RequestInit): Promise<T> => {
  const response = await fetch(`${OAUTH_BASE}${path}`, init);
  if (!response.ok) {
    let message = response.statusText;
    let payload:
      | {
          error?: string;
          error_description?: string;
        }
      | undefined;
    try {
      payload = (await response.json()) as { error?: string; error_description?: string };
      message = payload.error_description ?? payload.error ?? response.statusText;
    } catch {
      // ignore
    }

    if (payload?.error === "invalid_grant") {
      throw new ProviderError({
        message,
        code: "AUTH_REVOKED",
        retryable: false,
        providerStatus: response.status,
        providerPayload: payload,
      });
    }

    throw new ProviderError({
      message,
      code:
        response.status === 401
          ? "AUTH_EXPIRED"
          : response.status === 400
            ? "INVALID_REQUEST"
            : "NETWORK_ERROR",
      retryable: response.status >= 500,
      providerStatus: response.status,
      providerPayload: payload,
    });
  }

  return (await response.json()) as T;
};

const decodeBase64Url = (value: string): string =>
  Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

const base64UrlToBase64 = (value: string): string => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = normalized.length % 4;
  if (remainder === 0) {
    return normalized;
  }
  return normalized.padEnd(normalized.length + (4 - remainder), "=");
};

const parseEmailAddress = (value: string | undefined): EmailAddress[] => {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const match = chunk.match(/^(.*)<(.+)>$/);
      if (match) {
        return {
          name: match[1]?.trim().replace(/^"|"$/g, "") || undefined,
          email: match[2]?.trim() ?? "",
        };
      }
      return { email: chunk };
    })
    .filter((entry) => entry.email.length > 0);
};

const findHeader = (
  headers: Array<{ name: string; value: string }> | undefined,
  name: string,
): string | undefined => headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value;

const extractBodies = (payload: GmailApiMessage["payload"] | undefined): { textBody?: string; htmlBody?: string } => {
  if (!payload) {
    return {};
  }

  const queue = [payload];
  let textBody: string | undefined;
  let htmlBody: string | undefined;

  while (queue.length > 0) {
    const part = queue.shift();
    if (!part) {
      continue;
    }

    if (part.mimeType === "text/plain" && part.body?.data && !textBody) {
      textBody = decodeBase64Url(part.body.data);
    }

    if (part.mimeType === "text/html" && part.body?.data && !htmlBody) {
      htmlBody = decodeBase64Url(part.body.data);
    }

    if (part.parts?.length) {
      for (const child of part.parts) {
        if (child) {
          queue.push(child);
        }
      }
    }
  }

  return { textBody, htmlBody };
};

const extractAttachments = (
  payload: GmailApiMessage["payload"] | undefined,
): CanonicalAttachment[] => {
  if (!payload) {
    return [];
  }

  const attachments: CanonicalAttachment[] = [];
  const queue = [payload];

  while (queue.length > 0) {
    const part = queue.shift();
    if (!part) {
      continue;
    }

    if (part.body?.attachmentId) {
      attachments.push({
        providerAttachmentId: part.body.attachmentId,
        filename: part.filename ?? "attachment",
        mimeType: part.mimeType ?? "application/octet-stream",
        sizeBytes: part.body.size,
        inline: Boolean(part.filename === ""),
      });
    }

    if (part.parts?.length) {
      for (const child of part.parts) {
        if (child) {
          queue.push(child);
        }
      }
    }
  }

  return attachments;
};

const toCanonicalMessage = (
  account: ProviderAccountContext,
  message: GmailApiMessage,
  includeBodies: boolean,
): CanonicalMessage => {
  const headers = message.payload?.headers ?? [];
  const from = parseEmailAddress(findHeader(headers, "From"))[0] ?? { email: "unknown@example.com" };
  const to = parseEmailAddress(findHeader(headers, "To"));
  const cc = parseEmailAddress(findHeader(headers, "Cc"));
  const bcc = parseEmailAddress(findHeader(headers, "Bcc"));
  const subject = findHeader(headers, "Subject") ?? "(no subject)";
  const labelIds = message.labelIds ?? [];
  const bodies = includeBodies ? extractBodies(message.payload) : {};

  return {
    accountId: account.accountId,
    providerId: "gmail",
    providerMessageId: message.id,
    providerThreadId: message.threadId,
    from,
    to,
    cc,
    bcc,
    subject,
    internalDate: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : new Date().toISOString(),
    snippet: message.snippet,
    textBody: bodies.textBody,
    htmlBody: bodies.htmlBody,
    flags: {
      isRead: !labelIds.includes("UNREAD"),
      isStarred: labelIds.includes("STARRED"),
      isDraft: labelIds.includes("DRAFT"),
    },
    attachments: extractAttachments(message.payload),
  };
};

const toCanonicalThread = (
  account: ProviderAccountContext,
  thread: GmailApiThread,
): CanonicalThread => {
  const messages = thread.messages ?? [];
  const latestMessage = messages[messages.length - 1];
  const subject =
    latestMessage?.payload?.headers?.find((header) => header.name.toLowerCase() === "subject")
      ?.value ?? "(no subject)";

  const unreadCount = messages.filter((message) => message.labelIds?.includes("UNREAD")).length;
  const labels = [...new Set(messages.flatMap((message) => message.labelIds ?? []))];

  return {
    accountId: account.accountId,
    providerId: "gmail",
    providerThreadId: thread.id,
    subject,
    snippet: thread.snippet ?? latestMessage?.snippet ?? "",
    lastMessageAt: latestMessage?.internalDate
      ? new Date(Number(latestMessage.internalDate)).toISOString()
      : new Date().toISOString(),
    unreadCount,
    labelIds: labels,
  };
};

const makeRawMessage = (draft: OutgoingDraft): string => {
  const headers: string[] = [];
  headers.push(`To: ${draft.to.map((entry) => (entry.name ? `${entry.name} <${entry.email}>` : entry.email)).join(", ")}`);

  if (draft.cc?.length) {
    headers.push(
      `Cc: ${draft.cc.map((entry) => (entry.name ? `${entry.name} <${entry.email}>` : entry.email)).join(", ")}`,
    );
  }

  if (draft.bcc?.length) {
    headers.push(
      `Bcc: ${draft.bcc.map((entry) => (entry.name ? `${entry.name} <${entry.email}>` : entry.email)).join(", ")}`,
    );
  }

  headers.push(`Subject: ${draft.subject}`);
  headers.push("MIME-Version: 1.0");

  const hasHtml = Boolean(draft.htmlBody);
  if (hasHtml) {
    headers.push('Content-Type: text/html; charset="UTF-8"');
  } else {
    headers.push('Content-Type: text/plain; charset="UTF-8"');
  }

  const body = hasHtml ? draft.htmlBody ?? "" : draft.textBody ?? "";
  const payload = `${headers.join("\r\n")}\r\n\r\n${body}`;
  return Buffer.from(payload, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const makeGmailAdapter = (): ProviderAdapter => {
  const auth = {
    async getAuthorizationUrl(args: {
      oauthConfig: { clientId: string; clientSecret: string; redirectUri: string };
      state: string;
      scopes: string[];
      loginHint?: string;
      codeChallenge?: string;
      codeChallengeMethod?: "S256";
    }): Promise<string> {
      const params = new URLSearchParams({
        client_id: args.oauthConfig.clientId,
        redirect_uri: args.oauthConfig.redirectUri,
        response_type: "code",
        access_type: "offline",
        prompt: "consent",
        state: args.state,
        scope: args.scopes.join(" "),
        include_granted_scopes: "true",
      });

      if (args.loginHint) {
        params.set("login_hint", args.loginHint);
      }

      if (args.codeChallenge) {
        params.set("code_challenge", args.codeChallenge);
        params.set("code_challenge_method", args.codeChallengeMethod ?? "S256");
      }

      return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    },

    async exchangeCodeForTokens(args: {
      oauthConfig: { clientId: string; clientSecret: string; redirectUri: string };
      code: string;
      codeVerifier?: string;
    }): Promise<OAuthTokenSet> {
      const body = new URLSearchParams({
        code: args.code,
        client_id: args.oauthConfig.clientId,
        client_secret: args.oauthConfig.clientSecret,
        redirect_uri: args.oauthConfig.redirectUri,
        grant_type: "authorization_code",
      });

      if (args.codeVerifier) {
        body.set("code_verifier", args.codeVerifier);
      }

      const token = await oauthFetch<{
        access_token: string;
        refresh_token?: string;
        expires_in: number;
        scope: string;
        token_type: "Bearer";
      }>("/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      if (!token.refresh_token) {
        throw new ProviderError({
          message: "Google did not return a refresh token",
          code: "AUTH_REVOKED",
          retryable: false,
        });
      }

      return {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
        scope: token.scope.split(" "),
        tokenType: token.token_type,
      };
    },

    async refreshAccessToken(args: {
      oauthConfig: { clientId: string; clientSecret: string; redirectUri: string };
      refreshToken: string;
    }) {
      const body = new URLSearchParams({
        client_id: args.oauthConfig.clientId,
        client_secret: args.oauthConfig.clientSecret,
        refresh_token: args.refreshToken,
        grant_type: "refresh_token",
      });

      const token = await oauthFetch<{
        access_token: string;
        expires_in: number;
        scope?: string;
        token_type: "Bearer";
      }>("/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      return {
        accessToken: token.access_token,
        expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
        scope: token.scope?.split(" ") ?? [],
        tokenType: token.token_type,
      };
    },

    async revoke(args: { accessToken?: string; refreshToken?: string }): Promise<void> {
      const token = args.refreshToken ?? args.accessToken;
      if (!token) {
        return;
      }

      const body = new URLSearchParams({ token });
      await oauthFetch("/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
    },
  };

  const mail = {
    async listLabels(args: { account: ProviderAccountContext }): Promise<CanonicalLabel[]> {
      const response = await gmailFetch<{ labels?: Array<{ id: string; name: string; type: "system" | "user"; color?: { backgroundColor?: string; textColor?: string } }> }>(
        args.account,
        "/labels",
      );

      return (response.labels ?? []).map((label) => ({
        accountId: args.account.accountId,
        providerId: "gmail",
        providerLabelId: label.id,
        name: label.name,
        type: label.type,
        color: label.color
          ? {
              background: label.color.backgroundColor ?? "#000000",
              text: label.color.textColor ?? "#ffffff",
            }
          : undefined,
      }));
    },

    async listThreads(args: {
      account: ProviderAccountContext;
      query?: string;
      pageToken?: string | null;
      pageSize: number;
      labelFilter?: string[];
    }) {
      const params = new URLSearchParams({
        maxResults: String(Math.min(args.pageSize, 100)),
      });

      if (args.query) {
        params.set("q", args.query);
      }
      if (args.pageToken) {
        params.set("pageToken", args.pageToken);
      }
      for (const labelId of args.labelFilter ?? []) {
        params.append("labelIds", labelId);
      }

      const response = await gmailFetch<{
        threads?: Array<{ id: string }>;
        nextPageToken?: string;
      }>(args.account, `/threads?${params.toString()}`);

      const ids = response.threads?.map((thread) => thread.id) ?? [];
      const fullThreads = await Promise.all(
        ids.map((providerThreadId) =>
          mail.getThread({
            account: args.account,
            providerThreadId,
            includeBodies: false,
          }),
        ),
      );

      return {
        items: fullThreads.map((entry) => entry.thread),
        nextPageToken: response.nextPageToken ?? null,
      };
    },

    async getThread(args: {
      account: ProviderAccountContext;
      providerThreadId: string;
      includeBodies?: boolean;
    }) {
      const format = args.includeBodies ? "full" : "metadata";
      const thread = await gmailFetch<GmailApiThread>(
        args.account,
        `/threads/${args.providerThreadId}?format=${format}`,
      );

      const canonicalThread = toCanonicalThread(args.account, thread);
      const canonicalMessages = (thread.messages ?? []).map((message) =>
        toCanonicalMessage(args.account, message, Boolean(args.includeBodies)),
      );

      return {
        thread: canonicalThread,
        messages: canonicalMessages,
        historyId: thread.historyId,
      };
    },

    async getMessage(args: {
      account: ProviderAccountContext;
      providerMessageId: string;
      includeBodies?: boolean;
    }) {
      const format = args.includeBodies ? "full" : "metadata";
      const message = await gmailFetch<GmailApiMessage>(
        args.account,
        `/messages/${args.providerMessageId}?format=${format}`,
      );
      return toCanonicalMessage(args.account, message, Boolean(args.includeBodies));
    },

    async getAttachment(args: {
      account: ProviderAccountContext;
      providerMessageId: string;
      providerAttachmentId: string;
    }): Promise<AttachmentBlob> {
      const metadata = await mail.getMessage({
        account: args.account,
        providerMessageId: args.providerMessageId,
        includeBodies: false,
      });

      const attachmentMeta = metadata.attachments.find(
        (item) => item.providerAttachmentId === args.providerAttachmentId,
      );

      const attachment = await gmailFetch<GmailAttachmentResponse>(
        args.account,
        `/messages/${args.providerMessageId}/attachments/${args.providerAttachmentId}`,
      );

      if (!attachment.data) {
        throw new ProviderError({
          message: "Attachment payload is missing",
          code: "NOT_FOUND",
          retryable: false,
        });
      }

      return {
        providerAttachmentId: args.providerAttachmentId,
        filename: attachmentMeta?.filename ?? "attachment",
        mimeType: attachmentMeta?.mimeType ?? "application/octet-stream",
        bytesBase64: base64UrlToBase64(attachment.data),
      };
    },

    async initialSync(args: {
      account: ProviderAccountContext;
      mode: "recent";
      onProgress?: (progress: { phase: string; processed: number; target?: number }) => Promise<void> | void;
      onChunk?: (chunk: InitialSyncChunk) => Promise<void> | void;
    }): Promise<SyncDelta> {
      const labels = await mail.listLabels({ account: args.account });
      await args.onProgress?.({ phase: "labels", processed: 0, target: 1000 });
      await args.onChunk?.({ upsertLabels: labels });

      let pageToken: string | null | undefined = null;
      const upsertThreads: CanonicalThread[] = [];
      const upsertMessages: CanonicalMessage[] = [];
      let highestHistoryId = BigInt(0);
      let processed = 0;
      const target = 1000;

      const flushChunk = async () => {
        if (!args.onChunk || (!upsertThreads.length && !upsertMessages.length)) {
          return;
        }

        await args.onChunk({
          upsertThreads: upsertThreads.splice(0, upsertThreads.length),
          upsertMessages: upsertMessages.splice(0, upsertMessages.length),
        });
      };

      for (let page = 0; page < 20; page += 1) {
        const params = new URLSearchParams({
          maxResults: "50",
        });

        if (pageToken) {
          params.set("pageToken", pageToken);
        }

        const pageResult = await gmailFetch<{
          threads?: Array<{ id: string }>;
          nextPageToken?: string;
        }>(args.account, `/threads?${params.toString()}`);

        for (const thread of pageResult.threads ?? []) {
          const full = await mail.getThread({
            account: args.account,
            providerThreadId: thread.id,
            includeBodies: false,
          });

          const latestMessage = full.messages.at(-1);
          let messagesForUpsert = full.messages;

          if (latestMessage && !latestMessage.textBody && !latestMessage.htmlBody) {
            const withBody = await mail.getMessage({
              account: args.account,
              providerMessageId: latestMessage.providerMessageId,
              includeBodies: true,
            });
            messagesForUpsert = full.messages.map((message) =>
              message.providerMessageId === withBody.providerMessageId ? withBody : message,
            );
          }

          upsertThreads.push(full.thread);
          upsertMessages.push(...messagesForUpsert);
          processed += 1;
          await args.onProgress?.({ phase: "threads", processed, target });

          if (full.historyId) {
            const parsed = BigInt(full.historyId);
            if (parsed > highestHistoryId) {
              highestHistoryId = parsed;
            }
          }

          if (upsertThreads.length >= INITIAL_SYNC_BATCH_SIZE) {
            await flushChunk();
          }
        }

        if (!pageResult.nextPageToken) {
          break;
        }
        pageToken = pageResult.nextPageToken;
      }

      await flushChunk();

      await args.onProgress?.({
        phase: "cursor",
        processed,
        target,
      });

      if (highestHistoryId === BigInt(0)) {
        const profile = await gmailFetch<{ historyId: string }>(args.account, "/profile");
        highestHistoryId = BigInt(profile.historyId ?? "0");
      }

      return {
        newCursor: { raw: highestHistoryId.toString() },
        upsertLabels: args.onChunk ? undefined : labels,
        upsertThreads: args.onChunk ? undefined : upsertThreads,
        upsertMessages: args.onChunk ? undefined : upsertMessages,
      };
    },

    async incrementalSync(args: {
      account: ProviderAccountContext;
      cursor: { raw: string };
    }): Promise<SyncDelta> {
      const response = await gmailFetch<{
        history?: Array<{
          id: string;
          messagesAdded?: Array<{ message: GmailApiMessage }>;
          messagesDeleted?: Array<{ message: { id: string; threadId: string } }>;
          labelsAdded?: Array<{ message: GmailApiMessage }>;
          labelsRemoved?: Array<{ message: GmailApiMessage }>;
        }>;
        historyId?: string;
      }>(
        args.account,
        `/history?startHistoryId=${encodeURIComponent(args.cursor.raw)}&historyTypes=messageAdded&historyTypes=messageDeleted&historyTypes=labelAdded&historyTypes=labelRemoved`,
      );

      const affectedThreadIds = new Set<string>();
      const deleteMessageIds = new Set<string>();
      const deleteThreadIds = new Set<string>();

      for (const item of response.history ?? []) {
        for (const added of item.messagesAdded ?? []) {
          affectedThreadIds.add(added.message.threadId);
        }
        for (const labelsAdded of item.labelsAdded ?? []) {
          affectedThreadIds.add(labelsAdded.message.threadId);
        }
        for (const labelsRemoved of item.labelsRemoved ?? []) {
          affectedThreadIds.add(labelsRemoved.message.threadId);
        }
        for (const deleted of item.messagesDeleted ?? []) {
          deleteMessageIds.add(deleted.message.id);
          if (deleted.message.threadId) {
            affectedThreadIds.add(deleted.message.threadId);
          }
        }
      }

      const upsertThreads: CanonicalThread[] = [];
      const upsertMessages: CanonicalMessage[] = [];

      for (const providerThreadId of affectedThreadIds) {
        try {
          const full = await mail.getThread({
            account: args.account,
            providerThreadId,
            includeBodies: false,
          });
          upsertThreads.push(full.thread);
          upsertMessages.push(...full.messages);
        } catch (error) {
          if (error instanceof ProviderError && error.code === "NOT_FOUND") {
            deleteThreadIds.add(providerThreadId);
            continue;
          }
          throw error;
        }
      }

      const nextCursor = response.historyId ?? args.cursor.raw;
      return {
        newCursor: { raw: nextCursor },
        upsertThreads,
        upsertMessages,
        deleteMessageIds: [...deleteMessageIds],
        deleteThreadIds: [...deleteThreadIds],
      };
    },
  };

  const mutate = {
    async archiveThreads(args: { account: ProviderAccountContext; providerThreadIds: string[] }) {
      await Promise.all(
        args.providerThreadIds.map((threadId) =>
          gmailFetch(args.account, `/threads/${threadId}/modify`, {
            method: "POST",
            body: JSON.stringify({ removeLabelIds: ["INBOX"] }),
          }),
        ),
      );
    },

    async trashThreads(args: { account: ProviderAccountContext; providerThreadIds: string[] }) {
      await Promise.all(
        args.providerThreadIds.map((threadId) =>
          gmailFetch(args.account, `/threads/${threadId}/trash`, { method: "POST" }),
        ),
      );
    },

    async deleteThreadsPermanently(args: { account: ProviderAccountContext; providerThreadIds: string[] }) {
      await Promise.all(
        args.providerThreadIds.map((threadId) =>
          gmailFetch(args.account, `/threads/${threadId}`, { method: "DELETE" }),
        ),
      );
    },

    async markThreadsRead(args: { account: ProviderAccountContext; providerThreadIds: string[] }) {
      await Promise.all(
        args.providerThreadIds.map((threadId) =>
          gmailFetch(args.account, `/threads/${threadId}/modify`, {
            method: "POST",
            body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
          }),
        ),
      );
    },

    async markThreadsUnread(args: { account: ProviderAccountContext; providerThreadIds: string[] }) {
      await Promise.all(
        args.providerThreadIds.map((threadId) =>
          gmailFetch(args.account, `/threads/${threadId}/modify`, {
            method: "POST",
            body: JSON.stringify({ addLabelIds: ["UNREAD"] }),
          }),
        ),
      );
    },

    async addLabelsToThreads(args: {
      account: ProviderAccountContext;
      providerThreadIds: string[];
      providerLabelIds: string[];
    }) {
      await Promise.all(
        args.providerThreadIds.map((threadId) =>
          gmailFetch(args.account, `/threads/${threadId}/modify`, {
            method: "POST",
            body: JSON.stringify({ addLabelIds: args.providerLabelIds }),
          }),
        ),
      );
    },

    async removeLabelsFromThreads(args: {
      account: ProviderAccountContext;
      providerThreadIds: string[];
      providerLabelIds: string[];
    }) {
      await Promise.all(
        args.providerThreadIds.map((threadId) =>
          gmailFetch(args.account, `/threads/${threadId}/modify`, {
            method: "POST",
            body: JSON.stringify({ removeLabelIds: args.providerLabelIds }),
          }),
        ),
      );
    },

    async moveThreadsToSpam(args: {
      account: ProviderAccountContext;
      providerThreadIds: string[];
    }) {
      await Promise.all(
        args.providerThreadIds.map((threadId) =>
          gmailFetch(args.account, `/threads/${threadId}/modify`, {
            method: "POST",
            body: JSON.stringify({ addLabelIds: ["SPAM"], removeLabelIds: ["INBOX"] }),
          }),
        ),
      );
    },

    async createDraft(args: { account: ProviderAccountContext; draft: OutgoingDraft }) {
      const response = await gmailFetch<{ id: string; message: { id: string } }>(args.account, "/drafts", {
        method: "POST",
        body: JSON.stringify({
          message: {
            raw: makeRawMessage(args.draft),
            threadId: args.draft.threadProviderId,
          },
        }),
      });

      return {
        providerDraftId: response.id,
        providerMessageId: response.message.id,
      };
    },

    async updateDraft(args: {
      account: ProviderAccountContext;
      providerDraftId: string;
      draft: OutgoingDraft;
    }): Promise<void> {
      await gmailFetch(args.account, `/drafts/${args.providerDraftId}`, {
        method: "PUT",
        body: JSON.stringify({
          id: args.providerDraftId,
          message: {
            raw: makeRawMessage(args.draft),
            threadId: args.draft.threadProviderId,
          },
        }),
      });
    },

    async sendDraft(args: { account: ProviderAccountContext; providerDraftId: string }) {
      const response = await gmailFetch<{ id: string; threadId: string }>(args.account, "/drafts/send", {
        method: "POST",
        body: JSON.stringify({ id: args.providerDraftId }),
      });

      return {
        providerMessageId: response.id,
        providerThreadId: response.threadId,
      };
    },

    async sendMessage(args: { account: ProviderAccountContext; message: OutgoingMessage }) {
      const response = await gmailFetch<{ id: string; threadId: string }>(args.account, "/messages/send", {
        method: "POST",
        body: JSON.stringify({
          raw: makeRawMessage(args.message),
          threadId: args.message.threadProviderId,
        }),
      });

      return {
        providerMessageId: response.id,
        providerThreadId: response.threadId,
      };
    },

    async sendLater(args: { account: ProviderAccountContext; message: OutgoingMessage; sendAt: string }) {
      throw new ProviderError({
        message: `Gmail native send later is not available via this adapter (${args.sendAt})`,
        code: "INVALID_REQUEST",
        retryable: false,
      });
    },
  };

  const quota = {
    async getQuotaSnapshot(): Promise<ProviderQuotaSnapshot> {
      return {
        windowLabel: "unknown",
      };
    },
  };

  const diagnostics = {
    async getDebugInfo(args: { account: ProviderAccountContext }): Promise<Record<string, unknown>> {
      return {
        provider: "gmail",
        accountId: args.account.accountId,
        tokenExpiresAt: args.account.tokens.expiresAt,
      };
    },
  };

  return {
    providerId: "gmail",
    displayName: "Gmail",
    capabilities: {
      supportsThreads: true,
      supportsLabels: true,
      supportsFolders: false,
      supportsSendLater: false,
      supportsSnooze: false,
      supportsUndoSend: false,
      supportsReminders: false,
      supportsPushSync: false,
      supportsQuotaReporting: true,
    },
    auth,
    mail,
    mutate,
    quota,
    diagnostics,
  };
};

export const gmailAdapter = makeGmailAdapter();
