const viewIds = ["about", "projects", "gallery"] as const;
type ViewId = (typeof viewIds)[number];
interface PortfolioShellState {
  view: ViewId;
  returnsToMenu: boolean;
}
const titles: Record<ViewId, string> = {
  about: "About Marcus",
  projects: "Marcus' Projects",
  gallery: "Marcus' Gallery",
};

function viewFromHash(): ViewId | null {
  const value = location.hash.slice(1);
  return viewIds.includes(value as ViewId) ? (value as ViewId) : null;
}

function currentHistoryState(): Record<string, unknown> {
  return history.state && typeof history.state === "object"
    ? (history.state as Record<string, unknown>)
    : {};
}

function shellState(): PortfolioShellState | null {
  const state = history.state?.portfolioShell as
    | Partial<PortfolioShellState>
    | undefined;
  return state &&
    viewIds.includes(state.view as ViewId) &&
    typeof state.returnsToMenu === "boolean"
    ? (state as PortfolioShellState)
    : null;
}

export function attachPortfolioShell(
  root: HTMLElement,
  nav: HTMLElement,
  back: HTMLButtonElement,
): () => void {
  const panels = [...root.querySelectorAll<HTMLElement>("[data-panel]")];
  const navButtons = [
    ...nav.querySelectorAll<HTMLButtonElement>("[data-nav-view]"),
  ];
  const events = new AbortController();
  const options = { signal: events.signal };
  let view: ViewId | null = null;
  const menuTitle = document.title;
  let returnButton: HTMLButtonElement | undefined;
  let focusFrame = 0;
  let closing = false;

  const render = (next: ViewId | null, moveFocus = true) => {
    if (!next && moveFocus) {
      if (returnButton)
        returnButton.dispatchEvent(
          new Event("navigation:restore-selection", { bubbles: true }),
        );
      else nav.dispatchEvent(new Event("navigation:clear"));
    }
    view = next;
    document.body.dataset.view = next ?? "menu";
    document.title = next ? titles[next] : menuTitle;
    panels.forEach((panel) => {
      const active = panel.dataset.panel === next;
      panel.hidden = !active;
      panel.inert = !active;
    });
    navButtons.forEach((button) => {
      if (button.dataset.navView === next)
        button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    back.hidden = next === null;
    document.dispatchEvent(new Event("portfolio:viewchange"));
    cancelAnimationFrame(focusFrame);
    focusFrame = 0;
    if (!moveFocus) return;
    focusFrame = requestAnimationFrame(() => {
      focusFrame = 0;
      if (next)
        root
          .querySelector<HTMLElement>(
            `[data-panel="${next}"] [data-panel-focus], [data-panel="${next}"][data-panel-focus]`,
          )
          ?.focus({ preventScroll: true });
      else returnButton?.focus({ preventScroll: true });
    });
  };

  const open = (next: ViewId, trigger?: HTMLButtonElement) => {
    if (next === view) return;
    if (trigger && nav.contains(trigger)) returnButton = trigger;
    const returnsToMenu = view ? (shellState()?.returnsToMenu ?? false) : true;
    const state = {
      ...currentHistoryState(),
      portfolioShell: { view: next, returnsToMenu },
    };
    if (view) history.replaceState(state, "", `#${next}`);
    else history.pushState(state, "", `#${next}`);
    render(next);
  };
  const close = () => {
    if (!view || closing) return;
    if (shellState()?.returnsToMenu) {
      closing = true;
      history.back();
    } else {
      const state = { ...currentHistoryState() };
      delete state.portfolioShell;
      history.replaceState(state, "", location.pathname + location.search);
      render(null);
    }
  };

  back.addEventListener("click", close, options);

  document.addEventListener(
    "click",
    (event) => {
      if (
        event.button !== 0 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      const element = event.target instanceof Element ? event.target : null;
      const navTarget = element?.closest<HTMLButtonElement>("[data-nav-view]");
      const linkTarget = element?.closest<HTMLAnchorElement>('a[href^="#"]');
      const target = navTarget ?? linkTarget;
      if (!target) return;
      const next =
        target instanceof HTMLButtonElement
          ? target.dataset.navView
          : target.hash.slice(1);
      if (!viewIds.includes(next as ViewId)) return;
      event.preventDefault();
      open(next as ViewId, navTarget ?? undefined);
    },
    { capture: true, signal: events.signal },
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Escape" &&
        view &&
        !event.defaultPrevented &&
        !document.querySelector("dialog[open]")
      ) {
        event.preventDefault();
        close();
      }
    },
    options,
  );
  window.addEventListener(
    "popstate",
    () => {
      closing = false;
      render(viewFromHash());
    },
    options,
  );
  render(viewFromHash(), false);
  return () => {
    cancelAnimationFrame(focusFrame);
    events.abort();
  };
}
