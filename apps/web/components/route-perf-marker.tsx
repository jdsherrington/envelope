"use client";

import { useEffect } from "react";
import { recordPerfEvent } from "@/lib/client/perf";

export function RoutePerfMarker({
  route,
  accountId,
}: {
  route: string;
  accountId?: string | null;
}) {
  useEffect(() => {
    const navEntry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const coldLoadMs = navEntry?.domContentLoadedEventEnd ?? performance.now();
    void recordPerfEvent({
      accountId: accountId ?? null,
      route,
      metric: "cold_load_ms",
      valueMs: coldLoadMs,
    });
  }, [accountId, route]);

  return null;
}
