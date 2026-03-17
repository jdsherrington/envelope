"use client";

import { useEffect, useState } from "react";

const stableDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const stableDateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

const localDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

const localTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const localDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const getLocalDayKey = (date: Date): string => {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

export const formatStableInboxTimestamp = (value: string): string => {
  return stableDateFormatter.format(new Date(value));
};

export const formatInboxTimestamp = (value: string): string => {
  const date = new Date(value);
  const now = new Date();
  const sameLocalDay = getLocalDayKey(date) === getLocalDayKey(now);

  return sameLocalDay ? localTimeFormatter.format(date) : localDateFormatter.format(date);
};

export const formatStablePreviewDate = (value: string): string => {
  return stableDateTimeFormatter.format(new Date(value));
};

export const formatPreviewDate = (value: string): string => {
  return localDateTimeFormatter.format(new Date(value));
};

export const useHydrated = (): boolean => {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return hydrated;
};
