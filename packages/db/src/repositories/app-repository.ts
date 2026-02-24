import { and, asc, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type {
  CanonicalLabel,
  CanonicalMessage,
  CanonicalThread,
  SyncDelta,
} from "@envelope/core";
import { db } from "../client";
import {
  accounts,
  jobs,
  labels,
  loginRateLimits,
  messages,
  oauthClientConfigs,
  oauthStates,
  quotaEvents,
  sessions,
  syncState,
  threads,
  totpFactors,
  users,
} from "../schema";

const now = () => new Date();

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
          inArray(accounts.status, ["ok", "syncing", "rate_limited"]),
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

  async updateSyncCursor(accountId: string, cursorRaw: string) {
    await db
      .insert(syncState)
      .values({
        accountId,
        cursorRaw,
        lastRunAt: now(),
      })
      .onConflictDoUpdate({
        target: syncState.accountId,
        set: {
          cursorRaw,
          lastRunAt: now(),
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
    if (!label) {
      return rows;
    }

    return rows.filter((row) => row.providerLabelIds.includes(label));
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

    return {
      accounts: userAccounts,
      jobs: recentJobs,
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
    await db
      .update(messages)
      .set({
        textBody: args.textBody,
        htmlBody: args.htmlBody,
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

  async listFailedJobsForAccount(accountId: string) {
    return db
      .select()
      .from(jobs)
      .where(and(eq(jobs.accountId, accountId), inArray(jobs.status, ["failed", "dead"])))
      .orderBy(desc(jobs.updatedAt));
  },
};
