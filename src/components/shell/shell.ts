import { isViewId, landingViews, type ViewId } from "./views";

interface PortfolioShellState {
  view: ViewId;
  returnsToMenu: boolean;
}

const projectReferenceParameter = "ref";

function viewFromHash(): ViewId | null {
  const value = location.hash.slice(1);
  return isViewId(value) ? value : null;
}

function projectReferenceFromUrl(url = new URL(location.href)): string | null {
  return url.hash === "#projects"
    ? url.searchParams.get(projectReferenceParameter)
    : null;
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
    typeof state.view === "string" &&
    isViewId(state.view) &&
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
  let arrivalTarget: HTMLElement | null = null;

  const clearArrivalTarget = () => {
    arrivalTarget?.classList.remove("is-arrival-target");
    arrivalTarget = null;
  };

  const render = (
    next: ViewId | null,
    moveFocus = true,
    projectReference?: string | null,
  ) => {
    clearArrivalTarget();
    if (!next && moveFocus) {
      if (returnButton)
        returnButton.dispatchEvent(
          new Event("navigation:restore-selection", { bubbles: true }),
        );
      else nav.dispatchEvent(new Event("navigation:clear"));
    }
    view = next;
    document.body.dataset.view = next ?? "menu";
    document.title = next
      ? landingViews.find(({ id }) => id === next)!.documentTitle
      : menuTitle;
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
    if (!moveFocus && !projectReference) return;
    focusFrame = requestAnimationFrame(() => {
      focusFrame = 0;
      if (next) {
        const panel = root.querySelector<HTMLElement>(`[data-panel="${next}"]`);
        const panelFocusTarget = panel?.matches("[data-panel-focus]")
          ? panel
          : panel?.querySelector<HTMLElement>("[data-panel-focus]");
        if (moveFocus) panelFocusTarget?.focus({ preventScroll: true });
        const requestedTarget = projectReference
          ? [
              ...(panel?.querySelectorAll<HTMLElement>("[data-project-ref]") ??
                []),
            ].find(
              (project) => project.dataset.projectRef === projectReference,
            )
          : undefined;
        if (requestedTarget) {
          arrivalTarget = requestedTarget;
          arrivalTarget.classList.add("is-arrival-target");
          arrivalTarget.scrollIntoView({ block: "center" });
        }
      } else returnButton?.focus({ preventScroll: true });
    });
  };

  const open = (
    next: ViewId,
    trigger?: HTMLButtonElement,
    projectReference?: string | null,
  ) => {
    if (next === view && !projectReference) return;
    if (trigger && nav.contains(trigger)) returnButton = trigger;
    const returnsToMenu = view ? (shellState()?.returnsToMenu ?? false) : true;
    const state = {
      ...currentHistoryState(),
      portfolioShell: { view: next, returnsToMenu },
    };
    const url = new URL(location.href);
    url.hash = next;
    if (next === "projects" && projectReference)
      url.searchParams.set(projectReferenceParameter, projectReference);
    else url.searchParams.delete(projectReferenceParameter);
    const href = `${url.pathname}${url.search}${url.hash}`;
    if (view) history.replaceState(state, "", href);
    else history.pushState(state, "", href);
    render(next, true, projectReference);
  };
  const close = () => {
    if (!view || closing) return;
    if (shellState()?.returnsToMenu) {
      closing = true;
      history.back();
    } else {
      const state = { ...currentHistoryState() };
      delete state.portfolioShell;
      const url = new URL(location.href);
      url.hash = "";
      url.searchParams.delete(projectReferenceParameter);
      history.replaceState(state, "", `${url.pathname}${url.search}`);
      render(null);
    }
  };

  back.addEventListener("click", close, options);
  root.addEventListener(
    "animationend",
    (event) => {
      if (event.animationName === "project-outline-arrival")
        clearArrivalTarget();
    },
    options,
  );

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
      const linkTarget = element?.closest<HTMLAnchorElement>("a[href]");
      const target = navTarget ?? linkTarget;
      if (!target) return;
      const linkUrl = linkTarget ? new URL(linkTarget.href) : null;
      if (
        linkUrl &&
        (linkUrl.origin !== location.origin ||
          linkUrl.pathname !== location.pathname)
      )
        return;
      const next = navTarget?.dataset.navView ?? linkUrl?.hash.slice(1);
      if (!next || !isViewId(next)) return;
      event.preventDefault();
      open(
        next,
        navTarget ?? undefined,
        linkUrl ? projectReferenceFromUrl(linkUrl) : null,
      );
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
      render(viewFromHash(), true, projectReferenceFromUrl());
    },
    options,
  );
  render(viewFromHash(), false, projectReferenceFromUrl());
  return () => {
    cancelAnimationFrame(focusFrame);
    clearArrivalTarget();
    events.abort();
  };
}
