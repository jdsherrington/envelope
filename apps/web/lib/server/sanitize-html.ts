import sanitizeHtmlLibrary from "sanitize-html";

const allowedTags = [
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "code",
  "del",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
];

export const sanitizeHtml = (raw: string): string =>
  sanitizeHtmlLibrary(raw, {
    allowedTags,
    allowedAttributes: {
      a: ["href", "name", "target", "title", "rel"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
      "*": ["align"],
    },
    disallowedTagsMode: "discard",
    allowProtocolRelative: false,
    allowedSchemes: ["http", "https", "mailto", "data", "cid"],
    allowedSchemesByTag: {
      img: ["http", "https", "data", "cid"],
    },
    enforceHtmlBoundary: true,
    parser: {
      lowerCaseTags: true,
    },
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          rel: "noopener noreferrer",
        },
      }),
    },
  });
