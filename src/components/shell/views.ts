export const landingViews = [
  {
    id: "about",
    menuLabel: "about me",
    documentTitle: "About Marcus",
  },
  {
    id: "projects",
    menuLabel: "projects",
    documentTitle: "Marcus' Projects",
  },
  {
    id: "gallery",
    menuLabel: "gallery",
    documentTitle: "Marcus' Gallery",
  },
] as const;

export type ViewId = (typeof landingViews)[number]["id"];

export function isViewId(value: string): value is ViewId {
  return landingViews.some(({ id }) => id === value);
}
