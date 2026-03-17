import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import type {
  CanonicalLabel,
  CanonicalMessage,
  CanonicalThread,
  SyncDelta,
} from "@envelope/core";
import { db } from "../client";
import {
  attachmentCache,
  commandEvents,
  drafts,
  accounts,
  jobs,
  labels,
  loginRateLimits,
  messages,
  oauthClientConfigs,
  oauthStates,
  passkeyChallenges,
  passkeyCredentials,
  quotaEvents,
  quotaRollups,
  perfEvents,
  reminders,
  logEvents,
  workerHeartbeats,
  sessions,
  snippets,
  syncState,
  threads,
  totpFactors,
  userSettings,
  users,
} from "../schema";

const now = () => new Date();

const minuteBucket = (at: Date): Date =>
  new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), at.getUTCHours(), at.getUTCMinutes(), 0, 0));

const dayBucket = (at: Date): Date =>
  new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), 0, 0, 0, 0));

type ThreadListRow = {
  id: string;
  providerThreadId: string;
  subject: string;
  snippet: string;
  lastMessageAt: Date;
  unreadCount: number;
  providerLabelIds: string[];
};

const attachLatestSenders = async (
  accountId: string,
  rows: ThreadListRow[],
): Promise<
  Array<
    ThreadListRow & {
      senderName: string | null;
      senderEmail: string | null;
    }
  >
> => {
  if (!rows.length) {
    return [];
  }

  const providerThreadIds = Array.from(new Set(rows.map((row) => row.providerThreadId)));
  const senderRows = await db
    .select({
      providerThreadId: messages.providerThreadId,
      fromName: messages.fromName,
      fromEmail: messages.fromEmail,
    })
    .from(messages)
    .where(
      and(
        eq(messages.accountId, accountId),
        inArray(messages.providerThreadId, providerThreadIds),
      ),
    )
    .orderBy(desc(messages.internalDate));

  const latestSenderByThread = new Map<
    string,
    {
      senderName: string | null;
      senderEmail: string | null;
    }
  >();

  for (const row of senderRows) {
    if (!latestSenderByThread.has(row.providerThreadId)) {
      latestSenderByThread.set(row.providerThreadId, {
        senderName: row.fromName,
        senderEmail: row.fromEmail,
      });
    }
  }

  return rows.map((row) => ({
    ...row,
    senderName: latestSenderByThread.get(row.providerThreadId)?.senderName ?? null,
    senderEmail: latestSenderByThread.get(row.providerThreadId)?.senderEmail ?? null,
  }));
};

export const appRepository = {
  async hasUsers(): Promise<boolean> {
    const [row] = await db.select({ value: count() }).from(users);
    return Number(row?.value ?? 0) > 0;
  },

  async createUser(args: { email: string; passwordHash: string }): Promise<{ id: string; email: string }> {
    const [user] = await db
      .insert(users)
      .values({
        email: args.email,
        passwordHash: args.passwordHash,
      })
      .returning({ id: users.id, email: users.email });

    if (!user) {
      throw new Error("Failed to create user");
    }

    return user;
  },

  async getUserByEmail(email: string) {
    const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return row ?? null;
  },

  async getUserById(userId: string) {
    const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return row ?? null;
  },

  async getUserSettings(userId: string) {
    const [settings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    return (
      settings ?? {
        userId,
        theme: "system",
        density: "comfortable",
        keymap: "superhuman",
        contrast: "standard",
        accent: "amber",
        hideRareLabels: true,
        createdAt: now(),
        updatedAt: now(),
      }
    );
  },

  async upsertUserSettings(args: {
    userId: string;
    theme?: "dark" | "light" | "system";
    density?: "comfortable" | "compact";
    keymap?: "superhuman" | "vim";
    accent?: "amber" | "blue" | "emerald" | "rose" | "violet";
    hideRareLabels?: boolean;
  }) {
    const existing = await this.getUserSettings(args.userId);
    const next = {
      theme: args.theme ?? existing.theme,
      density: args.density ?? existing.density,
      keymap: args.keymap ?? existing.keymap,
      accent: args.accent ?? existing.accent,
      hideRareLabels: args.hideRareLabels ?? existing.hideRareLabels,
    };

    await db
      .insert(userSettings)
      .values({
        userId: args.userId,
        ...next,
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: {
          ...next,
          updatedAt: now(),
        },
      });

    return this.getUserSettings(args.userId);
  },

  async setTotpFactor(args: { userId: string; encryptedSecret: string; isVerified: boolean }) {
    const existing = await this.getTotpFactor(args.userId);
    if (existing) {
      await db
        .update(totpFactors)
        .set({
          encryptedSecret: args.encryptedSecret,
          isVerified: args.isVerified,
          verifiedAt: args.isVerified ? now() : null,
        })
        .where(eq(totpFactors.userId, args.userId));
      return;
    }

    await db.insert(totpFactors).values({
      userId: args.userId,
      encryptedSecret: args.encryptedSecret,
      isVerified: args.isVerified,
      verifiedAt: args.isVerified ? now() : null,
    });
  },

  async markTotpVerified(userId: string) {
    await db
      .update(totpFactors)
      .set({
        isVerified: true,
        verifiedAt: now(),
      })
      .where(eq(totpFactors.userId, userId));
  },

  async getTotpFactor(userId: string) {
    const [row] = await db.select().from(totpFactors).where(eq(totpFactors.userId, userId)).limit(1);
    return row ?? null;
  },

  async upsertPasskeyChallenge(args: {
    userId: string;
    flow: "register" | "login";
    challenge: string;
    expiresAt: Date;
  }) {
    await db
      .insert(passkeyChallenges)
      .values({
        userId: args.userId,
        flow: args.flow,
        challenge: args.challenge,
        expiresAt: args.expiresAt,
      })
      .onConflictDoUpdate({
        target: [passkeyChallenges.userId, passkeyChallenges.flow],
        set: {
          challenge: args.challenge,
          expiresAt: args.expiresAt,
          createdAt: now(),
        },
      });
  },

  async consumePasskeyChallenge(args: { userId: string; flow: "register" | "login" }) {
    const [challenge] = await db
      .select()
      .from(passkeyChallenges)
      .where(and(eq(passkeyChallenges.userId, args.userId), eq(passkeyChallenges.flow, args.flow)))
      .limit(1);

    if (!challenge) {
      return null;
    }

    await db
      .delete(passkeyChallenges)
      .where(and(eq(passkeyChallenges.userId, args.userId), eq(passkeyChallenges.flow, args.flow)));

    if (challenge.expiresAt < now()) {
      return null;
    }

    return challenge;
  },

  async listPasskeysForUser(userId: string) {
    return db
      .select()
      .from(passkeyCredentials)
      .where(eq(passkeyCredentials.userId, userId))
      .orderBy(desc(passkeyCredentials.updatedAt));
  },

  async getPasskeyByCredentialId(credentialId: string) {
    const [credential] = await db
      .select()
      .from(passkeyCredentials)
      .where(eq(passkeyCredentials.credentialId, credentialId))
      .limit(1);
    return credential ?? null;
  },

  async upsertPasskeyCredential(args: {
    userId: string;
    credentialId: string;
    publicKey: string;
    counter: number;
    backedUp?: boolean;
    transports?: string[];
    deviceType?: string;
    name?: string;
  }) {
    await db
      .insert(passkeyCredentials)
      .values({
        userId: args.userId,
        credentialId: args.credentialId,
        publicKey: args.publicKey,
        counter: args.counter,
        backedUp: args.backedUp,
        transports: args.transports ?? [],
        deviceType: args.deviceType,
        name: args.name,
      })
      .onConflictDoUpdate({
        target: passkeyCredentials.credentialId,
        set: {
          publicKey: args.publicKey,
          counter: args.counter,
          backedUp: args.backedUp,
          transports: args.transports ?? [],
          deviceType: args.deviceType,
          name: args.name,
          updatedAt: now(),
        },
      });
  },

  async updatePasskeyCounter(credentialId: string, counter: number) {
    await db
      .update(passkeyCredentials)
      .set({
        counter,
        updatedAt: now(),
      })
      .where(eq(passkeyCredentials.credentialId, credentialId));
  },

  async createSession(args: {
    userId: string;
    tokenHash: string;
    csrfToken: string;
    expiresAt: Date;
  }): Promise<{ id: string }> {
    const [session] = await db
      .insert(sessions)
      .values({
        userId: args.userId,
        tokenHash: args.tokenHash,
        csrfToken: args.csrfToken,
        expiresAt: args.expiresAt,
      })
      .returning({ id: sessions.id });

    if (!session) {
      throw new Error("Failed to create session");
    }

    return session;
  },

  async getSessionByTokenHash(tokenHash: string) {
    const [session] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.tokenHash, tokenHash), gte(sessions.expiresAt, now())))
      .limit(1);

    return session ?? null;
  },

  async deleteSessionByTokenHash(tokenHash: string) {
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  },

  async checkAndBumpLoginRateLimit(key: string): Promise<{ blocked: boolean; retryAt?: Date }> {
    const [existing] = await db.select().from(loginRateLimits).where(eq(loginRateLimits.key, key)).limit(1);
    const windowMs = 10 * 60 * 1000;
    const maxAttempts = 8;
    const blockMs = 15 * 60 * 1000;

    if (!existing) {
      await db.insert(loginRateLimits).values({
        key,
        attemptCount: 1,
      });
      return { blocked: false };
    }

    if (existing.blockedUntil && existing.blockedUntil > now()) {
      return { blocked: true, retryAt: existing.blockedUntil };
    }

    const elapsed = now().getTime() - existing.windowStartedAt.getTime();
    if (elapsed > windowMs) {
      await db
        .update(loginRateLimits)
        .set({
          attemptCount: 1,
          windowStartedAt: now(),
          blockedUntil: null,
          updatedAt: now(),
        })
        .where(eq(loginRateLimits.key, key));
      return { blocked: false };
    }

    const nextCount = existing.attemptCount + 1;
    if (nextCount > maxAttempts) {
      const retryAt = new Date(now().getTime() + blockMs);
      await db
        .update(loginRateLimits)
        .set({
          attemptCount: nextCount,
          blockedUntil: retryAt,
          updatedAt: now(),
        })
        .where(eq(loginRateLimits.key, key));
      return { blocked: true, retryAt };
    }

    await db
      .update(loginRateLimits)
      .set({
        attemptCount: nextCount,
        updatedAt: now(),
      })
      .where(eq(loginRateLimits.key, key));
    return { blocked: false };
  },

  async resetLoginRateLimit(key: string) {
    await db
      .update(loginRateLimits)
      .set({
        attemptCount: 0,
        windowStartedAt: now(),
        blockedUntil: null,
        updatedAt: now(),
      })
      .where(eq(loginRateLimits.key, key));
  },

  async saveOAuthClientConfig(args: {
    providerId: string;
    encryptedClientId: string;
    encryptedClientSecret: string;
    redirectUri: string;
    scopes: string[];
  }) {
    const [existing] = await db
      .select()
      .from(oauthClientConfigs)
      .where(eq(oauthClientConfigs.providerId, args.providerId))
      .limit(1);

    if (!existing) {
      await db.insert(oauthClientConfigs).values(args);
      return;
    }

    await db
      .update(oauthClientConfigs)
      .set({
        encryptedClientId: args.encryptedClientId,
        encryptedClientSecret: args.encryptedClientSecret,
        redirectUri: args.redirectUri,
        scopes: args.scopes,
        updatedAt: now(),
      })
      .where(eq(oauthClientConfigs.providerId, args.providerId));
  },

  async getOAuthClientConfig(providerId: string) {
    const [row] = await db
      .select()
      .from(oauthClientConfigs)
      .where(eq(oauthClientConfigs.providerId, providerId))
      .limit(1);
    return row ?? null;
  },

  async createOAuthState(args: {
    state: string;
    userId: string;
    codeVerifier: string;
    expiresAt: Date;
  }) {
    await db.insert(oauthStates).values(args);
  },

  async consumeOAuthState(state: string) {
    const [record] = await db.select().from(oauthStates).where(eq(oauthStates.state, state)).limit(1);
    if (!record) {
      return null;
    }
    await db.delete(oauthStates).where(eq(oauthStates.state, state));
    if (record.expiresAt < now()) {
      return null;
    }
    return record;
  },

  async upsertAccount(args: {
    userId: string;
    providerId: string;
    email: string;
    encryptedAccessToken: string;
    encryptedRefreshToken: string;
    tokenExpiresAt: Date;
    status: "ok" | "syncing" | "rate_limited" | "needs_reauth" | "error";
  }) {
    const [existing] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.providerId, args.providerId), eq(accounts.email, args.email)))
      .limit(1);

    if (!existing) {
      const [account] = await db
        .insert(accounts)
        .values(args)
        .returning({ id: accounts.id, email: accounts.email });
      return account ?? null;
    }

    const [account] = await db
      .update(accounts)
      .set({
        userId: args.userId,
        encryptedAccessToken: args.encryptedAccessToken,
        encryptedRefreshToken: args.encryptedRefreshToken,
        tokenExpiresAt: args.tokenExpiresAt,
        status: args.status,
        updatedAt: now(),
      })
      .where(eq(accounts.id, existing.id))
      .returning({ id: accounts.id, email: accounts.email });

    return account ?? null;
  },

  async listAccountsForUser(userId: string) {
    return db
      .select({
        id: accounts.id,
        email: accounts.email,
        providerId: accounts.providerId,
        status: accounts.status,
        lastSyncedAt: accounts.lastSyncedAt,
        backoffUntil: accounts.backoffUntil,
        lastErrorCode: accounts.lastErrorCode,
        lastErrorMessage: accounts.lastErrorMessage,
      })
      .from(accounts)
      .where(eq(accounts.userId, userId))
      .orderBy(asc(accounts.email));
  },

  async getAccountById(accountId: string) {
    const [row] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    return row ?? null;
  },

  async getAccountsForIncrementalSync() {
    return db
      .select()
      .from(accounts)
      .where(
        and(
          inArray(accounts.status, ["ok", "rate_limited"]),
          sql`${accounts.syncCursor} is not null`,
          sql`${accounts.backoffUntil} is null or ${accounts.backoffUntil} <= now()`,
        ),
      );
  },

  async removeAccount(accountId: string) {
    await db.delete(accounts).where(eq(accounts.id, accountId));
  },

  async setAccountStatus(args: {
    accountId: string;
    status: "ok" | "syncing" | "rate_limited" | "needs_reauth" | "error";
    lastErrorCode?: string | null;
    lastErrorMessage?: string | null;
    backoffUntil?: Date | null;
  }) {
    await db
      .update(accounts)
      .set({
        status: args.status,
        lastErrorCode: args.lastErrorCode ?? null,
        lastErrorMessage: args.lastErrorMessage ?? null,
        backoffUntil: args.backoffUntil ?? null,
        updatedAt: now(),
      })
      .where(eq(accounts.id, args.accountId));
  },

  async updateAccountTokens(args: {
    accountId: string;
    encryptedAccessToken: string;
    encryptedRefreshToken?: string;
    tokenExpiresAt: Date;
  }) {
    const setValues: {
      encryptedAccessToken: string;
      encryptedRefreshToken?: string;
      tokenExpiresAt: Date;
      updatedAt: Date;
    } = {
      encryptedAccessToken: args.encryptedAccessToken,
      tokenExpiresAt: args.tokenExpiresAt,
      updatedAt: now(),
    };

    if (args.encryptedRefreshToken) {
      setValues.encryptedRefreshToken = args.encryptedRefreshToken;
    }

    await db
      .update(accounts)
      .set(setValues)
      .where(eq(accounts.id, args.accountId));
  },

  async upsertLabels(accountId: string, rows: SyncDelta["upsertLabels"]) {
    if (!rows?.length) {
      return;
    }

    for (const row of rows) {
      await db
        .insert(labels)
        .values({
          accountId,
          providerLabelId: row.providerLabelId,
          name: row.name,
          type: row.type,
          colorBackground: row.color?.background,
          colorText: row.color?.text,
        })
        .onConflictDoUpdate({
          target: [labels.accountId, labels.providerLabelId],
          set: {
            name: row.name,
            type: row.type,
            colorBackground: row.color?.background,
            colorText: row.color?.text,
            updatedAt: now(),
          },
        });
    }
  },

  async upsertThreads(accountId: string, rows: SyncDelta["upsertThreads"]) {
    if (!rows?.length) {
      return;
    }

    for (const row of rows) {
      await db
        .insert(threads)
        .values({
          accountId,
          providerThreadId: row.providerThreadId,
          subject: row.subject,
          snippet: row.snippet,
          lastMessageAt: new Date(row.lastMessageAt),
          unreadCount: row.unreadCount,
          providerLabelIds: row.labelIds,
        })
        .onConflictDoUpdate({
          target: [threads.accountId, threads.providerThreadId],
          set: {
            subject: row.subject,
            snippet: row.snippet,
            lastMessageAt: new Date(row.lastMessageAt),
            unreadCount: row.unreadCount,
            providerLabelIds: row.labelIds,
            updatedAt: now(),
          },
        });
    }
  },

  async upsertMessages(accountId: string, rows: SyncDelta["upsertMessages"]) {
    if (!rows?.length) {
      return;
    }

    for (const row of rows) {
      await db
        .insert(messages)
        .values({
          accountId,
          providerMessageId: row.providerMessageId,
          providerThreadId: row.providerThreadId,
          fromName: row.from.name,
          fromEmail: row.from.email,
          toRecipients: row.to,
          ccRecipients: row.cc,
          bccRecipients: row.bcc,
          subject: row.subject,
          internalDate: new Date(row.internalDate),
          snippet: row.snippet,
          textBody: row.textBody,
          htmlBody: row.htmlBody,
          bodyState: row.textBody || row.htmlBody ? "present" : "deferred",
          isRead: row.flags.isRead,
          isStarred: row.flags.isStarred ?? false,
          isDraft: row.flags.isDraft ?? false,
          attachments: row.attachments,
        })
        .onConflictDoUpdate({
          target: [messages.accountId, messages.providerMessageId],
          set: {
            providerThreadId: row.providerThreadId,
            fromName: row.from.name,
            fromEmail: row.from.email,
            toRecipients: row.to,
            ccRecipients: row.cc,
            bccRecipients: row.bcc,
            subject: row.subject,
            internalDate: new Date(row.internalDate),
            snippet: row.snippet,
            textBody: row.textBody,
            htmlBody: row.htmlBody,
            ...(row.textBody || row.htmlBody ? { bodyState: "present" as const } : {}),
            isRead: row.flags.isRead,
            isStarred: row.flags.isStarred ?? false,
            isDraft: row.flags.isDraft ?? false,
            attachments: row.attachments,
            updatedAt: now(),
          },
        });
    }
  },

  async deleteThreadsByProviderIds(accountId: string, providerThreadIds: string[]) {
    if (!providerThreadIds.length) {
      return;
    }
    await db
      .delete(threads)
      .where(and(eq(threads.accountId, accountId), inArray(threads.providerThreadId, providerThreadIds)));
  },

  async deleteMessagesByProviderIds(accountId: string, providerMessageIds: string[]) {
    if (!providerMessageIds.length) {
      return;
    }
    await db
      .delete(messages)
      .where(and(eq(messages.accountId, accountId), inArray(messages.providerMessageId, providerMessageIds)));
  },

  async startInitialSyncProgress(args: {
    accountId: string;
    phase?: string;
    target?: number;
  }) {
    await db
      .insert(syncState)
      .values({
        accountId: args.accountId,
        initialSyncInProgress: true,
        initialSyncPhase: args.phase ?? "initializing",
        initialSyncTarget: args.target,
        initialSyncProcessed: 0,
        initialSyncStartedAt: now(),
        initialSyncCompletedAt: null,
        lastRunAt: now(),
      })
      .onConflictDoUpdate({
        target: syncState.accountId,
        set: {
          initialSyncInProgress: true,
          initialSyncPhase: args.phase ?? "initializing",
          initialSyncTarget: args.target,
          initialSyncProcessed: 0,
          initialSyncStartedAt: now(),
          initialSyncCompletedAt: null,
          lastRunAt: now(),
          updatedAt: now(),
        },
      });

    await this.setAccountStatus({ accountId: args.accountId, status: "syncing" });
  },

  async updateInitialSyncProgress(args: {
    accountId: string;
    phase?: string;
    processed?: number;
    target?: number;
  }) {
    const [existing] = await db
      .select()
      .from(syncState)
      .where(eq(syncState.accountId, args.accountId))
      .limit(1);

    if (!existing) {
      await this.startInitialSyncProgress({
        accountId: args.accountId,
        phase: args.phase,
        target: args.target,
      });
      return;
    }

    await db
      .update(syncState)
      .set({
        initialSyncInProgress: true,
        initialSyncPhase: args.phase ?? existing.initialSyncPhase ?? "running",
        initialSyncProcessed: args.processed ?? existing.initialSyncProcessed,
        initialSyncTarget: args.target ?? existing.initialSyncTarget,
        lastRunAt: now(),
        updatedAt: now(),
      })
      .where(eq(syncState.accountId, args.accountId));
  },

  async updateSyncCursor(accountId: string, cursorRaw: string) {
    await db
      .insert(syncState)
      .values({
        accountId,
        cursorRaw,
        lastRunAt: now(),
        initialSyncInProgress: false,
        initialSyncPhase: "completed",
        initialSyncCompletedAt: now(),
      })
      .onConflictDoUpdate({
        target: syncState.accountId,
        set: {
          cursorRaw,
          lastRunAt: now(),
          initialSyncInProgress: false,
          initialSyncPhase: "completed",
          initialSyncCompletedAt: now(),
          updatedAt: now(),
        },
      });

    await db
      .update(accounts)
      .set({
        syncCursor: cursorRaw,
        lastSyncedAt: now(),
        status: "ok",
        updatedAt: now(),
      })
      .where(eq(accounts.id, accountId));
  },

  async getSyncProgress(accountId: string) {
    const [state] = await db
      .select()
      .from(syncState)
      .where(eq(syncState.accountId, accountId))
      .limit(1);

    if (!state) {
      return null;
    }

    return {
      accountId,
      inProgress: state.initialSyncInProgress,
      phase: state.initialSyncPhase,
      processed: state.initialSyncProcessed,
      target: state.initialSyncTarget,
      startedAt: state.initialSyncStartedAt,
      completedAt: state.initialSyncCompletedAt,
      lastRunAt: state.lastRunAt,
      updatedAt: state.updatedAt,
      cursorRaw: state.cursorRaw,
    };
  },

  async listInboxThreads(args: {
    accountId: string;
    page: number;
    pageSize: number;
    label?: string;
  }): Promise<
    Array<{
      id: string;
      providerThreadId: string;
      subject: string;
      snippet: string;
      lastMessageAt: Date;
      unreadCount: number;
      providerLabelIds: string[];
      senderName: string | null;
      senderEmail: string | null;
    }>
  > {
    const offset = Math.max(args.page - 1, 0) * args.pageSize;
    const base = db
      .select({
        id: threads.id,
        providerThreadId: threads.providerThreadId,
        subject: threads.subject,
        snippet: threads.snippet,
        lastMessageAt: threads.lastMessageAt,
        unreadCount: threads.unreadCount,
        providerLabelIds: threads.providerLabelIds,
      })
      .from(threads)
      .where(eq(threads.accountId, args.accountId))
      .orderBy(desc(threads.lastMessageAt))
      .offset(offset)
      .limit(args.pageSize);

    const rows = await base;
    const label = args.label;
    const filteredRows = label ? rows.filter((row) => row.providerLabelIds.includes(label)) : rows;

    return attachLatestSenders(args.accountId, filteredRows);
  },

  async searchThreads(args: {
    accountId: string;
    query: string;
    page: number;
    pageSize: number;
  }) {
    const q = args.query.trim();
    if (!q) {
      return this.listInboxThreads({
        accountId: args.accountId,
        page: args.page,
        pageSize: args.pageSize,
      });
    }

    const offset = Math.max(args.page - 1, 0) * args.pageSize;
    const pattern = `%${q}%`;

    const rows = await db
      .select({
        id: threads.id,
        providerThreadId: threads.providerThreadId,
        subject: threads.subject,
        snippet: threads.snippet,
        lastMessageAt: threads.lastMessageAt,
        unreadCount: threads.unreadCount,
        providerLabelIds: threads.providerLabelIds,
      })
      .from(threads)
      .where(
        and(
          eq(threads.accountId, args.accountId),
          or(ilike(threads.subject, pattern), ilike(threads.snippet, pattern)),
        ),
      )
      .orderBy(desc(threads.lastMessageAt))
      .offset(offset)
      .limit(args.pageSize);

    return attachLatestSenders(args.accountId, rows);
  },

  async getThreadById(threadId: string, accountId: string) {
    const [thread] = await db
      .select()
      .from(threads)
      .where(and(eq(threads.id, threadId), eq(threads.accountId, accountId)))
      .limit(1);

    if (!thread) {
      return null;
    }

    const threadMessages = await db
      .select()
      .from(messages)
      .where(
        and(eq(messages.accountId, accountId), eq(messages.providerThreadId, thread.providerThreadId)),
      )
      .orderBy(asc(messages.internalDate));

    return { thread, messages: threadMessages };
  },

  async listLabels(accountId: string) {
    return db
      .select({
        id: labels.id,
        providerLabelId: labels.providerLabelId,
        name: labels.name,
        type: labels.type,
      })
      .from(labels)
      .where(eq(labels.accountId, accountId))
      .orderBy(asc(labels.name));
  },

  async archiveThreads(accountId: string, threadIds: string[]) {
    const targetThreads = await db
      .select({ id: threads.id, providerLabelIds: threads.providerLabelIds })
      .from(threads)
      .where(and(eq(threads.accountId, accountId), inArray(threads.id, threadIds)));

    for (const thread of targetThreads) {
      const nextLabels = thread.providerLabelIds.filter((label) => label !== "INBOX");
      await db
        .update(threads)
        .set({
          providerLabelIds: nextLabels,
          updatedAt: now(),
        })
        .where(eq(threads.id, thread.id));
    }
  },

  async trashThreads(accountId: string, threadIds: string[]) {
    const targetThreads = await db
      .select({ id: threads.id, providerLabelIds: threads.providerLabelIds })
      .from(threads)
      .where(and(eq(threads.accountId, accountId), inArray(threads.id, threadIds)));

    for (const thread of targetThreads) {
      const withoutInbox = thread.providerLabelIds.filter((label) => label !== "INBOX");
      const nextLabels = [...new Set([...withoutInbox, "TRASH"])];
      await db
        .update(threads)
        .set({
          providerLabelIds: nextLabels,
          updatedAt: now(),
        })
        .where(eq(threads.id, thread.id));
    }
  },

  async deleteThreads(accountId: string, threadIds: string[]) {
    if (!threadIds.length) {
      return;
    }

    const providerRows = await db
      .select({ providerThreadId: threads.providerThreadId })
      .from(threads)
      .where(and(eq(threads.accountId, accountId), inArray(threads.id, threadIds)));

    const providerThreadIds = providerRows.map((row) => row.providerThreadId);
    if (providerThreadIds.length) {
      await db
        .delete(messages)
        .where(
          and(
            eq(messages.accountId, accountId),
            inArray(messages.providerThreadId, providerThreadIds),
          ),
        );
    }

    await db
      .delete(threads)
      .where(and(eq(threads.accountId, accountId), inArray(threads.id, threadIds)));
  },

  async markThreadsSpam(accountId: string, threadIds: string[]) {
    const targetThreads = await db
      .select({ id: threads.id, providerLabelIds: threads.providerLabelIds })
      .from(threads)
      .where(and(eq(threads.accountId, accountId), inArray(threads.id, threadIds)));

    for (const thread of targetThreads) {
      const withoutInbox = thread.providerLabelIds.filter((label) => label !== "INBOX");
      const nextLabels = [...new Set([...withoutInbox, "SPAM"])];
      await db
        .update(threads)
        .set({
          providerLabelIds: nextLabels,
          updatedAt: now(),
        })
        .where(eq(threads.id, thread.id));
    }
  },

  async markThreadsRead(accountId: string, threadIds: string[]) {
    const targetThreads = await db
      .select({ providerThreadId: threads.providerThreadId })
      .from(threads)
      .where(and(eq(threads.accountId, accountId), inArray(threads.id, threadIds)));

    for (const thread of targetThreads) {
      await db
        .update(messages)
        .set({ isRead: true, updatedAt: now() })
        .where(
          and(
            eq(messages.accountId, accountId),
            eq(messages.providerThreadId, thread.providerThreadId),
          ),
        );
    }

    await db
      .update(threads)
      .set({ unreadCount: 0, updatedAt: now() })
      .where(and(eq(threads.accountId, accountId), inArray(threads.id, threadIds)));
  },

  async markThreadsUnread(accountId: string, threadIds: string[]) {
    const targetThreads = await db
      .select({ providerThreadId: threads.providerThreadId })
      .from(threads)
      .where(and(eq(threads.accountId, accountId), inArray(threads.id, threadIds)));

    for (const thread of targetThreads) {
      await db
        .update(messages)
        .set({ isRead: false, updatedAt: now() })
        .where(
          and(
            eq(messages.accountId, accountId),
            eq(messages.providerThreadId, thread.providerThreadId),
          ),
        );
    }

    await db
      .update(threads)
      .set({ unreadCount: 1, updatedAt: now() })
      .where(and(eq(threads.accountId, accountId), inArray(threads.id, threadIds)));
  },

  async addLabels(accountId: string, threadIds: string[], labelIds: string[]) {
    const targetThreads = await db
      .select({ id: threads.id, providerLabelIds: threads.providerLabelIds })
      .from(threads)
      .where(and(eq(threads.accountId, accountId), inArray(threads.id, threadIds)));

    for (const thread of targetThreads) {
      const next = [...new Set([...thread.providerLabelIds, ...labelIds])];
      await db
        .update(threads)
        .set({
          providerLabelIds: next,
          updatedAt: now(),
        })
        .where(eq(threads.id, thread.id));
    }
  },

  async removeLabels(accountId: string, threadIds: string[], labelIds: string[]) {
    const targetThreads = await db
      .select({ id: threads.id, providerLabelIds: threads.providerLabelIds })
      .from(threads)
      .where(and(eq(threads.accountId, accountId), inArray(threads.id, threadIds)));

    for (const thread of targetThreads) {
      const next = thread.providerLabelIds.filter((label) => !labelIds.includes(label));
      await db
        .update(threads)
        .set({
          providerLabelIds: next,
          updatedAt: now(),
        })
        .where(eq(threads.id, thread.id));
    }
  },

  async snoozeThreads(args: { accountId: string; threadIds: string[]; remindAt: Date; note?: string }) {
    const targetThreads = await db
      .select({ id: threads.id, providerLabelIds: threads.providerLabelIds })
      .from(threads)
      .where(and(eq(threads.accountId, args.accountId), inArray(threads.id, args.threadIds)));

    for (const thread of targetThreads) {
      const withoutInbox = thread.providerLabelIds.filter((label) => label !== "INBOX");
      const nextLabels = [...new Set([...withoutInbox, "SNOOZED"])];

      await db
        .update(threads)
        .set({
          providerLabelIds: nextLabels,
          updatedAt: now(),
        })
        .where(eq(threads.id, thread.id));

      await this.upsertReminder({
        accountId: args.accountId,
        threadId: thread.id,
        remindAt: args.remindAt,
        note: args.note,
      });
    }
  },

  async scheduleReminders(args: {
    accountId: string;
    threadIds: string[];
    remindAt: Date;
    note?: string;
  }) {
    const targetThreads = await db
      .select({ id: threads.id })
      .from(threads)
      .where(and(eq(threads.accountId, args.accountId), inArray(threads.id, args.threadIds)));

    for (const thread of targetThreads) {
      await this.upsertReminder({
        accountId: args.accountId,
        threadId: thread.id,
        remindAt: args.remindAt,
        note: args.note,
      });
    }
  },

  async upsertDraft(args: {
    accountId: string;
    draftId: string;
    providerDraftId?: string;
    providerThreadId?: string;
    payload: {
      to: Array<{ name?: string; email: string }>;
      cc?: Array<{ name?: string; email: string }>;
      bcc?: Array<{ name?: string; email: string }>;
      subject: string;
      textBody?: string;
      htmlBody?: string;
    };
    sendLaterAt?: string;
  }) {
    const [existing] = await db
      .select()
      .from(drafts)
      .where(and(eq(drafts.id, args.draftId), eq(drafts.accountId, args.accountId)))
      .limit(1);

    if (!existing) {
      await db.insert(drafts).values({
        id: args.draftId,
        accountId: args.accountId,
        providerDraftId: args.providerDraftId,
        providerThreadId: args.providerThreadId,
        toRecipients: args.payload.to,
        ccRecipients: args.payload.cc ?? [],
        bccRecipients: args.payload.bcc ?? [],
        subject: args.payload.subject,
        textBody: args.payload.textBody,
        htmlBody: args.payload.htmlBody,
        sendLaterAt: args.sendLaterAt ? new Date(args.sendLaterAt) : null,
        status: "draft",
      });
      return;
    }

    await db
      .update(drafts)
      .set({
        providerDraftId: args.providerDraftId ?? existing.providerDraftId,
        providerThreadId: args.providerThreadId ?? existing.providerThreadId,
        toRecipients: args.payload.to,
        ccRecipients: args.payload.cc ?? [],
        bccRecipients: args.payload.bcc ?? [],
        subject: args.payload.subject,
        textBody: args.payload.textBody,
        htmlBody: args.payload.htmlBody,
        sendLaterAt: args.sendLaterAt ? new Date(args.sendLaterAt) : null,
        updatedAt: now(),
      })
      .where(and(eq(drafts.id, args.draftId), eq(drafts.accountId, args.accountId)));
  },

  async patchDraftProviderMetadata(args: {
    accountId: string;
    draftId: string;
    providerDraftId?: string;
    providerThreadId?: string;
    lastProviderMessageId?: string;
  }) {
    await db
      .update(drafts)
      .set({
        providerDraftId: args.providerDraftId,
        providerThreadId: args.providerThreadId,
        lastProviderMessageId: args.lastProviderMessageId,
        updatedAt: now(),
      })
      .where(and(eq(drafts.id, args.draftId), eq(drafts.accountId, args.accountId)));
  },

  async markDraftSent(args: {
    accountId: string;
    draftId: string;
    providerMessageId?: string;
    providerThreadId?: string;
  }) {
    await db
      .update(drafts)
      .set({
        status: "sent",
        lastProviderMessageId: args.providerMessageId,
        lastProviderThreadId: args.providerThreadId,
        updatedAt: now(),
      })
      .where(and(eq(drafts.id, args.draftId), eq(drafts.accountId, args.accountId)));
  },

  async listSnippets(userId: string) {
    return db
      .select()
      .from(snippets)
      .where(eq(snippets.userId, userId))
      .orderBy(asc(snippets.title));
  },

  async listSnippetsByKind(args: { userId: string; kind: "snippet" | "template" }) {
    return db
      .select()
      .from(snippets)
      .where(and(eq(snippets.userId, args.userId), eq(snippets.kind, args.kind)))
      .orderBy(asc(snippets.title));
  },

  async createSnippet(args: { userId: string; title: string; body: string; kind?: "snippet" | "template" }) {
    const [row] = await db
      .insert(snippets)
      .values({
        userId: args.userId,
        kind: args.kind ?? "snippet",
        title: args.title,
        body: args.body,
      })
      .returning();
    return row ?? null;
  },

  async upsertReminder(args: {
    accountId: string;
    threadId: string;
    remindAt: Date;
    note?: string;
  }) {
    await db
      .insert(reminders)
      .values({
        accountId: args.accountId,
        threadId: args.threadId,
        remindAt: args.remindAt,
        note: args.note,
      })
      .onConflictDoUpdate({
        target: [reminders.accountId, reminders.threadId, reminders.remindAt],
        set: {
          note: args.note,
          status: "scheduled",
          updatedAt: now(),
        },
      });
  },

  async wakeReminderThreads(args: { accountId: string; threadIds?: string[]; nowAt?: Date }) {
    const nowAt = args.nowAt ?? now();

    const dueReminders = await db
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.accountId, args.accountId),
          inArray(reminders.status, ["scheduled"]),
          lte(reminders.remindAt, nowAt),
          args.threadIds?.length ? inArray(reminders.threadId, args.threadIds) : sql`true`,
        ),
      );

    if (!dueReminders.length) {
      return;
    }

    const threadIds = [...new Set(dueReminders.map((entry) => entry.threadId))];
    const targetThreads = await db
      .select({ id: threads.id, providerLabelIds: threads.providerLabelIds })
      .from(threads)
      .where(and(eq(threads.accountId, args.accountId), inArray(threads.id, threadIds)));

    for (const thread of targetThreads) {
      const withoutSnoozed = thread.providerLabelIds.filter((label) => label !== "SNOOZED");
      const nextLabels = [...new Set([...withoutSnoozed, "INBOX"])];

      await db
        .update(threads)
        .set({
          providerLabelIds: nextLabels,
          updatedAt: now(),
        })
        .where(eq(threads.id, thread.id));
    }

    await db
      .update(reminders)
      .set({
        status: "fired",
        updatedAt: now(),
      })
      .where(and(eq(reminders.accountId, args.accountId), inArray(reminders.id, dueReminders.map((entry) => entry.id))));
  },

  async enqueueJob(args: {
    accountId: string;
    type: string;
    payload: Record<string, unknown>;
    idempotencyKey: string;
    runAt?: Date;
  }): Promise<{ jobId: string }> {
    const [existing] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.accountId, args.accountId),
          eq(jobs.idempotencyKey, args.idempotencyKey),
          inArray(jobs.status, ["pending", "running"]),
        ),
      )
      .limit(1);

    if (existing) {
      return { jobId: existing.id };
    }

    const [row] = await db
      .insert(jobs)
      .values({
        accountId: args.accountId,
        type: args.type,
        payload: args.payload,
        idempotencyKey: args.idempotencyKey,
        runAt: args.runAt ?? now(),
      })
      .returning({ id: jobs.id });

    if (!row) {
      throw new Error("Failed to enqueue job");
    }

    return { jobId: row.id };
  },

  async cancelPendingSend(args: { accountId: string; clientMutationId: string }) {
    const [job] = await db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.accountId, args.accountId),
          eq(jobs.status, "pending"),
          inArray(jobs.type, ["gmail.sendMessage", "gmail.sendLater"]),
          sql`${jobs.payload} ->> 'clientMutationId' = ${args.clientMutationId}`,
        ),
      )
      .orderBy(desc(jobs.createdAt))
      .limit(1);

    if (!job) {
      return null;
    }

    const [updated] = await db
      .update(jobs)
      .set({
        status: "dead",
        lastErrorCode: "CANCELLED",
        lastErrorMessage: "Cancelled by user undo-send",
        updatedAt: now(),
      })
      .where(eq(jobs.id, job.id))
      .returning();

    return updated ?? null;
  },

  async takeDueJobs(limit = 20) {
    const candidates = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, "pending"), lte(jobs.runAt, now())))
      .orderBy(asc(jobs.runAt))
      .limit(limit);

    const locked: Array<(typeof candidates)[number]> = [];

    for (const candidate of candidates) {
      const [updated] = await db
        .update(jobs)
        .set({
          status: "running",
          attempt: candidate.attempt + 1,
          updatedAt: now(),
        })
        .where(and(eq(jobs.id, candidate.id), eq(jobs.status, "pending")))
        .returning();

      if (updated) {
        locked.push(updated);
      }
    }

    return locked;
  },

  async completeJob(jobId: string) {
    await db
      .update(jobs)
      .set({
        status: "succeeded",
        updatedAt: now(),
      })
      .where(eq(jobs.id, jobId));
  },

  async retryJob(args: {
    jobId: string;
    retryAfterMs: number;
    errorCode: string;
    errorMessage: string;
  }) {
    await db
      .update(jobs)
      .set({
        status: "pending",
        retryAfterMs: args.retryAfterMs,
        runAt: new Date(now().getTime() + args.retryAfterMs),
        lastErrorCode: args.errorCode,
        lastErrorMessage: args.errorMessage,
        updatedAt: now(),
      })
      .where(eq(jobs.id, args.jobId));
  },

  async deadLetterJob(args: { jobId: string; errorCode: string; errorMessage: string }) {
    await db
      .update(jobs)
      .set({
        status: "dead",
        lastErrorCode: args.errorCode,
        lastErrorMessage: args.errorMessage,
        updatedAt: now(),
      })
      .where(eq(jobs.id, args.jobId));
  },

  async retryDeadJob(args: { jobId: string; accountId: string }) {
    const [job] = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, args.jobId), eq(jobs.accountId, args.accountId)))
      .limit(1);

    if (!job) {
      return null;
    }

    if (!(job.status === "dead" || job.status === "failed")) {
      return job;
    }

    const [updated] = await db
      .update(jobs)
      .set({
        status: "pending",
        runAt: now(),
        retryAfterMs: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        updatedAt: now(),
      })
      .where(eq(jobs.id, args.jobId))
      .returning();

    return updated ?? null;
  },

  async listRecentJobs(limit = 50) {
    return db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(limit);
  },

  async getSyncCursor(accountId: string) {
    const [row] = await db
      .select({ cursorRaw: syncState.cursorRaw })
      .from(syncState)
      .where(eq(syncState.accountId, accountId))
      .limit(1);
    return row?.cursorRaw ?? null;
  },

  async recordQuotaEvent(args: {
    accountId: string;
    windowLabel: string;
    used?: number;
    limit?: number;
    backoffUntil?: Date;
    errorCode?: string;
    errorMessage?: string;
  }) {
    await db.insert(quotaEvents).values({
      accountId: args.accountId,
      windowLabel: args.windowLabel,
      used: args.used,
      limit: args.limit,
      backoffUntil: args.backoffUntil,
      errorCode: args.errorCode,
      errorMessage: args.errorMessage,
    });
  },

  async incrementQuotaRequestCount(args: { accountId: string; at?: Date; count?: number }) {
    const at = args.at ?? now();
    const countDelta = args.count ?? 1;
    const minuteStart = minuteBucket(at);
    const dayStart = dayBucket(at);

    for (const bucket of [
      { type: "minute", start: minuteStart },
      { type: "day", start: dayStart },
    ]) {
      const [existing] = await db
        .select()
        .from(quotaRollups)
        .where(
          and(
            eq(quotaRollups.accountId, args.accountId),
            eq(quotaRollups.bucketType, bucket.type),
            eq(quotaRollups.bucketStart, bucket.start),
          ),
        )
        .limit(1);

      if (!existing) {
        await db.insert(quotaRollups).values({
          accountId: args.accountId,
          bucketType: bucket.type,
          bucketStart: bucket.start,
          requestCount: countDelta,
        });
        continue;
      }

      await db
        .update(quotaRollups)
        .set({
          requestCount: existing.requestCount + countDelta,
          updatedAt: now(),
        })
        .where(eq(quotaRollups.id, existing.id));
    }
  },

  async getQuotaSummary(accountId: string) {
    const cutoff60s = new Date(now().getTime() - 60 * 1000);
    const todayStart = dayBucket(now());

    const [minuteRequests] = await db
      .select({ value: sql<number>`coalesce(sum(${quotaRollups.requestCount}), 0)` })
      .from(quotaRollups)
      .where(
        and(
          eq(quotaRollups.accountId, accountId),
          eq(quotaRollups.bucketType, "minute"),
          gte(quotaRollups.bucketStart, cutoff60s),
        ),
      );

    const [dailyRequests] = await db
      .select({ value: sql<number>`coalesce(sum(${quotaRollups.requestCount}), 0)` })
      .from(quotaRollups)
      .where(
        and(
          eq(quotaRollups.accountId, accountId),
          eq(quotaRollups.bucketType, "day"),
          eq(quotaRollups.bucketStart, todayStart),
        ),
      );

    const [lastRateLimit] = await db
      .select()
      .from(quotaEvents)
      .where(
        and(
          eq(quotaEvents.accountId, accountId),
          inArray(quotaEvents.errorCode, ["RATE_LIMITED", "PERMISSION_DENIED"]),
        ),
      )
      .orderBy(desc(quotaEvents.recordedAt))
      .limit(1);

    const account = await this.getAccountById(accountId);

    return {
      requestsLast60s: Number(minuteRequests?.value ?? 0),
      dailyEstimate: Number(dailyRequests?.value ?? 0),
      lastRateLimitEvent: lastRateLimit
        ? {
            at: lastRateLimit.recordedAt,
            code: lastRateLimit.errorCode,
            message: lastRateLimit.errorMessage,
          }
        : null,
      backoffUntil: account?.backoffUntil ?? null,
      status: account?.status ?? null,
    };
  },

  async listQuotaEvents(accountId: string, limit = 50) {
    return db
      .select()
      .from(quotaEvents)
      .where(eq(quotaEvents.accountId, accountId))
      .orderBy(desc(quotaEvents.recordedAt))
      .limit(limit);
  },

  async diagnosticsForUser(userId: string) {
    const userAccounts = await this.listAccountsForUser(userId);
    const recentJobs = await this.listRecentJobs(100);
    const recentCommandEvents = await this.listCommandEvents(userId, 200);
    const recentLogs = await this.listLogEvents(userId, 300);
    const recentPerfEvents = await this.listPerfEvents(userId, 200);

    return {
      accounts: userAccounts,
      jobs: recentJobs,
      commandEvents: recentCommandEvents,
      logs: recentLogs,
      perfEvents: recentPerfEvents,
    };
  },

  async loadAccountContext(accountId: string) {
    const [account] = await db
      .select({
        id: accounts.id,
        email: accounts.email,
        providerId: accounts.providerId,
        encryptedAccessToken: accounts.encryptedAccessToken,
        encryptedRefreshToken: accounts.encryptedRefreshToken,
        tokenExpiresAt: accounts.tokenExpiresAt,
        status: accounts.status,
        syncCursor: accounts.syncCursor,
      })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);

    return account ?? null;
  },

  async listThreadsForAccount(accountId: string): Promise<CanonicalThread[]> {
    const rows = await db.select().from(threads).where(eq(threads.accountId, accountId));
    return rows.map((row) => ({
      accountId,
      providerId: "gmail",
      providerThreadId: row.providerThreadId,
      subject: row.subject,
      snippet: row.snippet,
      lastMessageAt: row.lastMessageAt.toISOString(),
      unreadCount: row.unreadCount,
      labelIds: row.providerLabelIds,
    }));
  },

  async getProviderThreadIds(accountId: string, threadIds: string[]) {
    if (!threadIds.length) {
      return [];
    }

    return db
      .select({ id: threads.id, providerThreadId: threads.providerThreadId })
      .from(threads)
      .where(and(eq(threads.accountId, accountId), inArray(threads.id, threadIds)));
  },

  async listMessagesForThread(args: {
    accountId: string;
    providerThreadId: string;
  }): Promise<CanonicalMessage[]> {
    const rows = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.accountId, args.accountId),
          eq(messages.providerThreadId, args.providerThreadId),
        ),
      )
      .orderBy(asc(messages.internalDate));

    return rows.map((row) => ({
      accountId: args.accountId,
      providerId: "gmail",
      providerMessageId: row.providerMessageId,
      providerThreadId: row.providerThreadId,
      from: { name: row.fromName ?? undefined, email: row.fromEmail },
      to: row.toRecipients,
      cc: row.ccRecipients,
      bcc: row.bccRecipients,
      subject: row.subject,
      internalDate: row.internalDate.toISOString(),
      snippet: row.snippet ?? undefined,
      textBody: row.textBody ?? undefined,
      htmlBody: row.htmlBody ?? undefined,
      flags: {
        isRead: row.isRead,
        isStarred: row.isStarred,
        isDraft: row.isDraft,
      },
      attachments: row.attachments,
    }));
  },

  async listLabelsCanonical(accountId: string): Promise<CanonicalLabel[]> {
    const rows = await this.listLabels(accountId);
    return rows.map((row) => ({
      accountId,
      providerId: "gmail",
      providerLabelId: row.providerLabelId,
      name: row.name,
      type: row.type,
    }));
  },

  async updateMessageBodies(args: {
    accountId: string;
    providerMessageId: string;
    textBody?: string;
    htmlBody?: string;
  }) {
    const hasBody = Boolean(args.textBody || args.htmlBody);
    await db
      .update(messages)
      .set({
        textBody: args.textBody,
        htmlBody: args.htmlBody,
        bodyState: hasBody ? "present" : "failed",
        updatedAt: now(),
      })
      .where(
        and(
          eq(messages.accountId, args.accountId),
          eq(messages.providerMessageId, args.providerMessageId),
        ),
      );
  },

  async getMessageByProviderId(args: { accountId: string; providerMessageId: string }) {
    const [message] = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.accountId, args.accountId),
          eq(messages.providerMessageId, args.providerMessageId),
        ),
      )
      .limit(1);

    return message ?? null;
  },

  async getMessageById(args: { accountId: string; messageId: string }) {
    const [message] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.accountId, args.accountId), eq(messages.id, args.messageId)))
      .limit(1);
    return message ?? null;
  },

  async getThreadByProviderId(args: { accountId: string; providerThreadId: string }) {
    const [thread] = await db
      .select()
      .from(threads)
      .where(
        and(eq(threads.accountId, args.accountId), eq(threads.providerThreadId, args.providerThreadId)),
      )
      .limit(1);
    return thread ?? null;
  },

  async listMessagesMissingBodies(args: { accountId: string; providerThreadId: string }) {
    return db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.accountId, args.accountId),
          eq(messages.providerThreadId, args.providerThreadId),
          eq(messages.bodyState, "deferred"),
        ),
      );
  },

  async markMessageBodyFetchFailed(args: {
    accountId: string;
    providerMessageId: string;
  }) {
    await db
      .update(messages)
      .set({
        bodyState: "failed",
        updatedAt: now(),
      })
      .where(
        and(
          eq(messages.accountId, args.accountId),
          eq(messages.providerMessageId, args.providerMessageId),
        ),
      );
  },

  async getAttachmentCache(args: {
    accountId: string;
    providerMessageId: string;
    providerAttachmentId: string;
  }) {
    const [cached] = await db
      .select()
      .from(attachmentCache)
      .where(
        and(
          eq(attachmentCache.accountId, args.accountId),
          eq(attachmentCache.providerMessageId, args.providerMessageId),
          eq(attachmentCache.providerAttachmentId, args.providerAttachmentId),
        ),
      )
      .limit(1);
    return cached ?? null;
  },

  async upsertAttachmentCache(args: {
    accountId: string;
    providerMessageId: string;
    providerAttachmentId: string;
    filename: string;
    mimeType: string;
    sizeBytes?: number;
    bytesBase64: string;
  }) {
    await db
      .insert(attachmentCache)
      .values({
        accountId: args.accountId,
        providerMessageId: args.providerMessageId,
        providerAttachmentId: args.providerAttachmentId,
        filename: args.filename,
        mimeType: args.mimeType,
        sizeBytes: args.sizeBytes,
        bytesBase64: args.bytesBase64,
      })
      .onConflictDoUpdate({
        target: [
          attachmentCache.accountId,
          attachmentCache.providerMessageId,
          attachmentCache.providerAttachmentId,
        ],
        set: {
          filename: args.filename,
          mimeType: args.mimeType,
          sizeBytes: args.sizeBytes,
          bytesBase64: args.bytesBase64,
          updatedAt: now(),
        },
      });
  },

  async recordCommandEvent(args: {
    userId: string;
    accountId?: string | null;
    commandId: string;
    commandVersion: number;
    viewScope: string;
    selectionCount: number;
    status: "success" | "queued" | "error";
    durationMs?: number;
    errorMessage?: string;
  }) {
    await db.insert(commandEvents).values({
      userId: args.userId,
      accountId: args.accountId ?? null,
      commandId: args.commandId,
      commandVersion: args.commandVersion,
      viewScope: args.viewScope,
      selectionCount: args.selectionCount,
      status: args.status,
      durationMs: args.durationMs,
      errorMessage: args.errorMessage,
    });
  },

  async listCommandEvents(userId: string, limit = 100) {
    return db
      .select()
      .from(commandEvents)
      .where(eq(commandEvents.userId, userId))
      .orderBy(desc(commandEvents.recordedAt))
      .limit(limit);
  },

  async recordLogEvent(args: {
    userId: string;
    accountId?: string | null;
    level: "debug" | "info" | "warn" | "error";
    scope: string;
    message: string;
    metadata?: Record<string, unknown>;
  }) {
    await db.insert(logEvents).values({
      userId: args.userId,
      accountId: args.accountId ?? null,
      level: args.level,
      scope: args.scope,
      message: args.message,
      metadata: args.metadata,
    });
  },

  async recordAccountLogEvent(args: {
    accountId: string;
    level: "debug" | "info" | "warn" | "error";
    scope: string;
    message: string;
    metadata?: Record<string, unknown>;
  }) {
    const account = await this.getAccountById(args.accountId);
    if (!account) {
      return;
    }

    await this.recordLogEvent({
      userId: account.userId,
      accountId: account.id,
      level: args.level,
      scope: args.scope,
      message: args.message,
      metadata: args.metadata,
    });
  },

  async listLogEvents(userId: string, limit = 200) {
    return db
      .select()
      .from(logEvents)
      .where(eq(logEvents.userId, userId))
      .orderBy(desc(logEvents.recordedAt))
      .limit(limit);
  },

  async pingDatabase() {
    const result = await db.execute(sql<{ value: number }>`select 1 as value`);
    const row = result[0];
    return Number(row?.["value"] ?? 0) === 1;
  },

  async updateWorkerHeartbeat(args: {
    workerId: string;
    host: string;
    pid: number;
    version: string;
    recordedAt?: Date;
  }) {
    await db
      .insert(workerHeartbeats)
      .values({
        workerId: args.workerId,
        host: args.host,
        pid: args.pid,
        version: args.version,
        recordedAt: args.recordedAt ?? now(),
      })
      .onConflictDoUpdate({
        target: workerHeartbeats.workerId,
        set: {
          host: args.host,
          pid: args.pid,
          version: args.version,
          recordedAt: args.recordedAt ?? now(),
        },
      });
  },

  async getLatestWorkerHeartbeat() {
    const [heartbeat] = await db
      .select()
      .from(workerHeartbeats)
      .orderBy(desc(workerHeartbeats.recordedAt))
      .limit(1);
    return heartbeat ?? null;
  },

  async recordPerfEvent(args: {
    userId: string;
    accountId?: string | null;
    route: string;
    metric: string;
    valueMs: number;
    metadata?: Record<string, unknown>;
  }) {
    await db.insert(perfEvents).values({
      userId: args.userId,
      accountId: args.accountId ?? null,
      route: args.route,
      metric: args.metric,
      valueMs: args.valueMs,
      metadata: args.metadata,
    });
  },

  async listPerfEvents(userId: string, limit = 200) {
    return db
      .select()
      .from(perfEvents)
      .where(eq(perfEvents.userId, userId))
      .orderBy(desc(perfEvents.recordedAt))
      .limit(limit);
  },

  async listFailedJobsForAccount(accountId: string) {
    return db
      .select()
      .from(jobs)
      .where(and(eq(jobs.accountId, accountId), inArray(jobs.status, ["failed", "dead"])))
      .orderBy(desc(jobs.updatedAt));
  },
};
