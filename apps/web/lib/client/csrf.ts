export const getCsrfTokenFromCookie = (): string | null => {
  if (typeof document === "undefined") {
    return null;
  }

  const pairs = document.cookie.split(";").map((chunk) => chunk.trim());
  for (const pair of pairs) {
    if (!pair.startsWith("envelope_csrf=")) {
      continue;
    }
    return decodeURIComponent(pair.split("=")[1] ?? "");
  }

  return null;
};

export const withCsrfHeaders = (init: RequestInit = {}): RequestInit => {
  const token = getCsrfTokenFromCookie();
  return {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      ...(token ? { "x-csrf-token": token } : {}),
    },
  };
};
