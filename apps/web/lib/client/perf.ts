"use client";

import { withCsrfHeaders } from "./csrf";

export const recordPerfEvent = async (args: {
  accountId?: string | null;
  route: string;
  metric: string;
  valueMs: number;
  metadata?: Record<string, unknown>;
}) => {
  try {
    await fetch(
      "/api/perf/events",
      withCsrfHeaders({
        method: "POST",
        body: JSON.stringify({
          accountId: args.accountId ?? null,
          route: args.route,
          metric: args.metric,
          valueMs: Math.max(0, Math.round(args.valueMs)),
          metadata: args.metadata,
        }),
      }),
    );
  } catch {
    // Ignore perf event failures.
  }
};
