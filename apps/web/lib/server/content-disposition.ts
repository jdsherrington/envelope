const CONTROL_CHARS = /[\x00-\x1f\x7f]/g;
const PATH_SEPARATORS = /[\\/]/g;

export const sanitizeDownloadFilename = (value: string | null | undefined): string => {
  const base = (value ?? "").replace(CONTROL_CHARS, "").replace(PATH_SEPARATORS, "_").trim();
  const normalized = base
    .replace(/\s+/g, " ")
    .replace(/["';`]/g, "_")
    .replace(/\.+/g, ".")
    .replace(/^\.+/, "");

  if (!normalized) {
    return "attachment";
  }

  return normalized.slice(0, 180);
};

const escapeQuoted = (value: string): string => value.replace(/(["\\])/g, "\\$1");

const encodeRFC5987 = (value: string): string =>
  encodeURIComponent(value)
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%(7C|60|5E)/g, (match) => match.toLowerCase());

export const attachmentDisposition = (rawFilename: string | null | undefined): string => {
  const safe = sanitizeDownloadFilename(rawFilename);
  return `attachment; filename="${escapeQuoted(safe)}"; filename*=UTF-8''${encodeRFC5987(safe)}`;
};
