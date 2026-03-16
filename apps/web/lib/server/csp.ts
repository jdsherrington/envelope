const CONNECT_SOURCES = [
  "'self'",
  "https://accounts.google.com",
  "https://oauth2.googleapis.com",
  "https://gmail.googleapis.com",
];

const scriptSource = (nonce: string, isProd: boolean): string =>
  isProd
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

export const buildCsp = (nonce: string, isProd: boolean): string => {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob: https: cid:",
    "font-src 'self' data:",
    // Keep inline styles for Tailwind/Next runtime compatibility.
    "style-src 'self' 'unsafe-inline'",
    scriptSource(nonce, isProd),
    `connect-src ${CONNECT_SOURCES.join(" ")}`,
    "form-action 'self'",
    "frame-src https://accounts.google.com",
    "worker-src 'self' blob:",
  ];

  if (isProd) {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join('; ');
};
