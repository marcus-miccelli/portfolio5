export function attachNavigation(nav: HTMLElement): () => void {
  const buttons = [
    ...nav.querySelectorAll<HTMLButtonElement>("[data-nav-view]"),
  ];
  const events = new AbortController();
  const options = { signal: events.signal };
  let selected = -1;
  let transferringToPointer = false;
  let owner: "none" | "pointer" | "keyboard" | "restored" = "none";
  let pointerX = Number.NaN;
  let pointerY = Number.NaN;
  const select = (index: number) => {
    if (selected === index) return;
    selected = index;
    buttons.forEach((button, i) => {
      button.classList.toggle("is-selected", index === i);
      button.style.setProperty("--nav-push-y", `${(i - index) * 0.05}em`);
    });
    nav.dispatchEvent(new Event("navigation:motion"));
  };
  const clear = () => {
    if (selected < 0) return;
    selected = -1;
    buttons.forEach((button) => {
      button.classList.remove("is-selected");
      button.style.removeProperty("--nav-push-y");
    });
    nav.dispatchEvent(new Event("navigation:motion"));
  };
  const blurFocusedLink = () => {
    if (
      document.activeElement instanceof HTMLElement &&
      nav.contains(document.activeElement)
    ) {
      transferringToPointer = true;
      try {
        document.activeElement.blur();
      } finally {
        transferringToPointer = false;
      }
    }
  };
  const selectFromPointer = (index: number) => {
    blurFocusedLink();
    select(index);
  };
  const clearPointerFocus = () => {
    owner = "none";
    blurFocusedLink();
    clear();
  };
  const updateFromPointer = (event: PointerEvent, force = false) => {
    if (document.body.dataset.view !== "menu") return;
    if (!force && event.movementX === 0 && event.movementY === 0) return;
    if (!force && event.clientX === pointerX && event.clientY === pointerY)
      return;
    pointerX = event.clientX;
    pointerY = event.clientY;

    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest<HTMLButtonElement>("[data-nav-view]");
    const index =
      button && nav.contains(button) ? buttons.indexOf(button) : -1;
    if (index >= 0) {
      owner = "pointer";
      selectFromPointer(index);
    } else if (
      owner === "restored" ||
      (owner === "pointer" && (!target || !nav.contains(target)))
    ) {
      clearPointerFocus();
    }
  };
  buttons.forEach((button, index) => {
    button.addEventListener("focus", () => select(index), options);
  });
  nav.addEventListener("navigation:clear", clearPointerFocus, options);
  nav.addEventListener(
    "navigation:restore-selection",
    (event) => {
      const index =
        event.target instanceof HTMLButtonElement
          ? buttons.indexOf(event.target)
          : -1;
      if (index >= 0) {
        owner = "restored";
        select(index);
      }
    },
    options,
  );
  document.addEventListener("pointermove", updateFromPointer, options);
  document.addEventListener(
    "pointerdown",
    (event) => updateFromPointer(event, true),
    options,
  );
  nav.addEventListener(
    "focusout",
    (event) => {
      if (transferringToPointer) return;
      if (document.body.dataset.view !== "menu") return;
      if (owner === "pointer") return;
      if (
        !(event.relatedTarget instanceof Node) ||
        !nav.contains(event.relatedTarget)
      )
        clear();
    },
    options,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
        return;
      const target = event.target;
      const onLanding = document.body.dataset.composition === "landing";
      if (onLanding && document.body.dataset.view !== "menu") return;
      if (
        !(target instanceof Node) ||
        (!nav.contains(target) && !(onLanding && target === document.body))
      )
        return;
      if (event.key === "Tab") {
        owner = "keyboard";
        return;
      }
      if (event.key === "Enter") {
        owner = "keyboard";
        const trigger =
          target instanceof HTMLButtonElement && buttons.includes(target)
            ? target
            : target === document.body && selected >= 0
              ? buttons[selected]
              : undefined;
        if (!trigger) return;
        if (target === document.body) {
          event.preventDefault();
          trigger.click();
        }
      } else if (
        ["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)
      ) {
        event.preventDefault();
        owner = "keyboard";
        const index =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : selected < 0
                ? event.key === "ArrowUp"
                  ? buttons.length - 1
                  : 0
                : (selected +
                    (event.key === "ArrowUp" ? -1 : 1) +
                    buttons.length) %
                  buttons.length;
        select(index);
        buttons[index].focus({ preventScroll: true });
      }
    },
    options,
  );
  clear();
  return () => {
    events.abort();
    selected = -1;
    buttons.forEach((button) => {
      button.classList.remove("is-selected");
      button.style.removeProperty("--nav-push-y");
    });
  };
}

export function attachEscapeHome(homeLink: HTMLAnchorElement): () => void {
  const events = new AbortController();
  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      if (document.querySelector("dialog[open]")) return;
      event.preventDefault();
      homeLink.click();
    },
    { signal: events.signal },
  );
  return () => events.abort();
}
