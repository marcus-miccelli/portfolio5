import { MOBILE_EFFECTS_MAX_WIDTH } from "./scene/config";

export const ABOUT_SLIDESHOW_MIN_WIDTH = 1280;

export const MEDIA = {
  aboutSlideshow: `(min-width: ${ABOUT_SLIDESHOW_MIN_WIDTH}px)`,
  mobileEffects: `(max-width: ${MOBILE_EFFECTS_MAX_WIDTH}px)`,
  panelPreloads:
    `(min-width: ${MOBILE_EFFECTS_MAX_WIDTH + 1}px) and ` +
    "(hover: hover) and (pointer: fine)",
  reducedMotion: "(prefers-reduced-motion: reduce)",
} as const;

export type MediaCondition = keyof typeof MEDIA;
type MediaListener = (matches: boolean) => void;

interface MediaEntry {
  query: MediaQueryList;
  listeners: Set<MediaListener>;
  publish: (event: MediaQueryListEvent) => void;
}

const entries = new Map<MediaCondition, MediaEntry>();

function entryFor(condition: MediaCondition): MediaEntry {
  const existing = entries.get(condition);
  if (existing) return existing;

  const query = window.matchMedia(MEDIA[condition]);
  const listeners = new Set<MediaListener>();
  const entry: MediaEntry = {
    query,
    listeners,
    publish: (event) => {
      let failed = false;
      let firstError: unknown;
      [...listeners].forEach((listener) => {
        try {
          listener(event.matches);
        } catch (error) {
          if (!failed) firstError = error;
          failed = true;
        }
      });
      if (failed) throw firstError;
    },
  };
  entries.set(condition, entry);
  return entry;
}

/** Shared responsive environment; feature state remains owned by subscribers. */
export const media = {
  matches(condition: MediaCondition): boolean {
    return entryFor(condition).query.matches;
  },
  subscribe(condition: MediaCondition, listener: MediaListener): () => void {
    const entry = entryFor(condition);
    const subscriber: MediaListener = (matches) => listener(matches);
    const unsubscribe = () => {
      if (!entry.listeners.delete(subscriber)) return;
      if (entry.listeners.size === 0)
        entry.query.removeEventListener("change", entry.publish);
    };
    entry.listeners.add(subscriber);
    if (entry.listeners.size === 1)
      entry.query.addEventListener("change", entry.publish);
    try {
      subscriber(entry.query.matches);
    } catch (error) {
      unsubscribe();
      throw error;
    }
    return unsubscribe;
  },
};
