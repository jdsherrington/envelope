// Lightweight sanitizer for MVP; replace with hardened library in production.
export const sanitizeHtml = (raw: string): string =>
  raw
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/on\w+="[^"]*"/gi, "")
    .replace(/javascript:/gi, "");
