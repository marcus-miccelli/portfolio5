export const projectLinkKinds = [
  "github",
  "vscode",
  "devpost",
  "itch",
  "website",
  "document",
] as const;

export type ProjectLinkKind = (typeof projectLinkKinds)[number];
