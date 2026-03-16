export type SnippetKind = "snippet" | "template";

export type SnippetEntry = {
  id: string;
  title: string;
  body: string;
  kind: SnippetKind;
};

export type TemplateEntry = SnippetEntry & {
  kind: "template";
};
