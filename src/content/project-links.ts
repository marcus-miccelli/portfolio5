export const projectLinkKinds = [
  "github",
  "vscode",
  "devpost",
  "itch",
  "website",
  "document",
] as const;

export type ProjectLinkKind = (typeof projectLinkKinds)[number];

export function projectLinkKind(
  href: string,
  explicit?: ProjectLinkKind,
): ProjectLinkKind {
  if (explicit) return explicit;
  const host = new URL(href).hostname;
  if (host === "github.com") return "github";
  if (host === "devpost.com") return "devpost";
  if (host === "itch.io" || host.endsWith(".itch.io")) return "itch";
  if (host === "marketplace.visualstudio.com") return "vscode";
  return "website";
}
