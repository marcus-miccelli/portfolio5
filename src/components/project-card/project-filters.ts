export function attachProjectFilters(root: HTMLElement): () => void {
  const tiles = [...root.querySelectorAll<HTMLElement>(".project-tile")];
  const filters = [
    ...root.querySelectorAll<HTMLButtonElement>("[data-project-filter]"),
  ];
  const reset = root.querySelector<HTMLButtonElement>(
    "[data-project-filter-reset]",
  );
  const status = root.querySelector<HTMLElement>("[data-project-filter-status]");
  const selectedTags = new Set<string>();
  const events = new AbortController();

  const update = (announce = false) => {
    filters.forEach((button) => {
      const tag = button.dataset.projectFilter ?? "";
      const active = selectedTags.has(tag);
      button.setAttribute("aria-pressed", String(active));
    });
    if (reset) reset.hidden = selectedTags.size === 0;
    tiles.forEach((tile) => {
      const tags = new Set((tile.dataset.projectTags ?? "").split("|"));
      tile.hidden =
        selectedTags.size > 0 &&
        ![...selectedTags].some((tag) => tags.has(tag));
    });
    const visible = tiles.filter((tile) => !tile.hidden).length;
    if (announce && status) status.textContent = `${visible} projects shown.`;
  };

  root.addEventListener(
    "click",
    (event) => {
      const button =
        event.target instanceof Element
          ? event.target.closest<HTMLButtonElement>("[data-project-filter]")
          : null;
      if (!button) return;
      const tag = button.dataset.projectFilter ?? "";
      if (selectedTags.has(tag)) selectedTags.delete(tag);
      else selectedTags.add(tag);
      update(true);
    },
    { signal: events.signal },
  );
  reset?.addEventListener(
    "click",
    () => {
      selectedTags.clear();
      update(true);
    },
    { signal: events.signal },
  );
  update();
  return () => events.abort();
}
