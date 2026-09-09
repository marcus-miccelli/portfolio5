const DRAG_THRESHOLD = 6;
const SORT_INTERVAL = 54;
const STORAGE_KEY = "portfolio:project-order:v1";

type Position = { x: number; y: number };
type Size = { width: number; height: number };

type DragState = {
  tile: HTMLElement;
  pointerId: number;
  startPointer: Position;
  latestPointer: Position;
  startTile: Position;
  started: boolean;
  lastSortAt: number;
};

const isInteractive = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  Boolean(target.closest("a, button, input, select, textarea"));

export function attachProjectGrid(grid: HTMLElement): () => void {
  const media = matchMedia("(min-width: 681px) and (pointer: fine)");
  const events = new AbortController();
  const resizeObserver = new ResizeObserver(() => scheduleLayout(false));
  const mutationObserver = new MutationObserver(() => scheduleLayout(true));
  let tiles = [...grid.querySelectorAll<HTMLElement>(".project-tile")];
  const authoredOrder = tiles.map((tile) => tile.dataset.projectId ?? "");
  const authoredRanks = new Map(
    authoredOrder.map((id, index) => [id, index]),
  );
  const reset = grid
    .closest<HTMLElement>("[data-project-filters]")
    ?.querySelector<HTMLButtonElement>("[data-project-order-reset]");
  let positions = new Map<HTMLElement, Position>();
  let sizes = new Map<HTMLElement, Size>();
  let drag: DragState | null = null;
  let dropTarget: HTMLElement | null = null;
  let frame = 0;
  let layoutFrame = 0;
  let enabled = false;
  let layoutGap = 20;
  let layoutColumns = 2;

  const tileId = (tile: HTMLElement): string =>
    tile.dataset.projectId ?? "";

  const isAuthoredOrder = (): boolean =>
    tiles.every((tile, index) => tileId(tile) === authoredOrder[index]);

  const updateReset = (): void => {
    if (reset) reset.hidden = isAuthoredOrder();
  };

  const persistOrder = (): void => {
    try {
      if (isAuthoredOrder()) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(tiles.map(tileId)));
    } catch {
      // Storage can be unavailable without affecting the grid interaction.
    }
    updateReset();
  };

  const restoreSavedOrder = (): void => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (!Array.isArray(saved) || !saved.every((id) => typeof id === "string"))
        return;
      const savedRanks = new Map(
        saved.map((id: string, index: number) => [id, index]),
      );
      tiles.sort((a, b) => {
        const aId = tileId(a);
        const bId = tileId(b);
        const aRank = savedRanks.get(aId);
        const bRank = savedRanks.get(bId);
        if (aRank !== undefined && bRank !== undefined) return aRank - bRank;
        if (aRank !== undefined) return -1;
        if (bRank !== undefined) return 1;
        return (authoredRanks.get(aId) ?? 0) - (authoredRanks.get(bId) ?? 0);
      });
      for (const tile of tiles) grid.append(tile);
    } catch {
      // Ignore malformed or blocked storage and retain the authored order.
    }
  };

  const setDropTarget = (tile: HTMLElement | null): void => {
    if (dropTarget === tile) return;
    dropTarget?.classList.remove("is-project-drop-target");
    dropTarget = tile;
    dropTarget?.classList.add("is-project-drop-target");
  };

  const visibleTiles = (): HTMLElement[] => tiles.filter((tile) => !tile.hidden);

  const applyLayout = (animate: boolean, measure = true): void => {
    layoutFrame = 0;
    if (!enabled) return;

    const visible = visibleTiles();
    if (measure) {
      const style = getComputedStyle(grid);
      const nextGap = Number.parseFloat(
        style.getPropertyValue("--project-gap"),
      );
      const nextColumns = Number.parseInt(
        style.getPropertyValue("--project-columns"),
        10,
      );
      if (Number.isFinite(nextGap)) layoutGap = nextGap;
      if (Number.isFinite(nextColumns) && nextColumns > 0)
        layoutColumns = nextColumns;
    }
    const gridWidth = grid.clientWidth;
    if (gridWidth <= layoutGap) return;
    const width =
      (gridWidth - layoutGap * (layoutColumns - 1)) / layoutColumns;

    if (measure) {
      for (const tile of tiles) {
        tile.style.width = `${width}px`;
        tile.style.removeProperty("height");
      }
      sizes = new Map(
        visible.map((tile) => [
          tile,
          { width: tile.offsetWidth, height: tile.offsetHeight },
        ]),
      );
    }
    const next = new Map<HTMLElement, Position>();
    let y = 0;

    for (let index = 0; index < visible.length; index += layoutColumns) {
      const row = visible.slice(index, index + layoutColumns);
      const rowHeights = row.map((tile) => sizes.get(tile)?.height ?? 0);
      const rowHeight = Math.max(...rowHeights, 0);
      row.forEach((tile, column) => {
        next.set(tile, { x: column * (width + layoutGap), y });
        tile.style.height = `${rowHeight}px`;
      });
      y += rowHeight + layoutGap;
    }

    grid.classList.toggle("is-project-grid-animating", animate);
    for (const tile of visible) {
      if (drag?.started && tile === drag.tile) continue;
      const position = next.get(tile);
      if (!position) continue;
      tile.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;
    }
    positions = next;
    grid.style.height = `${Math.max(0, y - layoutGap)}px`;
  };

  function scheduleLayout(animate: boolean): void {
    if (!enabled) return;
    cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(() => applyLayout(animate));
  }

  const reorderAtPointer = (time: number): void => {
    if (!drag?.started || time - drag.lastSortAt < SORT_INTERVAL) return;
    drag.lastSortAt = time;

    const draggedPosition = {
      x: drag.startTile.x + drag.latestPointer.x - drag.startPointer.x,
      y: drag.startTile.y + drag.latestPointer.y - drag.startPointer.y,
    };
    const draggedCenter = {
      x: draggedPosition.x + (sizes.get(drag.tile)?.width ?? 0) / 2,
      y: draggedPosition.y + (sizes.get(drag.tile)?.height ?? 0) / 2,
    };

    let closest: HTMLElement | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const tile of visibleTiles()) {
      if (tile === drag.tile) continue;
      const position = positions.get(tile);
      const size = sizes.get(tile);
      if (!position || !size) continue;
      const dx = draggedCenter.x - (position.x + size.width / 2);
      const dy = draggedCenter.y - (position.y + size.height / 2);
      const distance = dx * dx + dy * dy;
      if (distance < closestDistance) {
        closest = tile;
        closestDistance = distance;
      }
    }

    if (!closest) {
      setDropTarget(null);
      return;
    }
    const target = positions.get(closest);
    const targetSize = sizes.get(closest);
    if (!target || !targetSize) {
      setDropTarget(null);
      return;
    }
    const insideTarget =
      draggedCenter.x >= target.x &&
      draggedCenter.x <= target.x + targetSize.width &&
      draggedCenter.y >= target.y &&
      draggedCenter.y <= target.y + targetSize.height;
    if (!insideTarget) {
      setDropTarget(null);
      return;
    }

    setDropTarget(closest);

    const from = tiles.indexOf(drag.tile);
    const to = tiles.indexOf(closest);
    if (from === to) return;
    tiles.splice(from, 1);
    tiles.splice(to, 0, drag.tile);
    applyLayout(true, false);
  };

  const renderDrag = (time: number): void => {
    frame = 0;
    if (!drag) return;

    const dx = drag.latestPointer.x - drag.startPointer.x;
    const dy = drag.latestPointer.y - drag.startPointer.y;
    if (!drag.started && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
      drag.started = true;
      drag.tile.classList.add("is-project-dragging");
      document.body.classList.add("is-dragging-project");
    }
    if (!drag.started) return;

    drag.tile.style.transform = `translate3d(${drag.startTile.x + dx}px, ${drag.startTile.y + dy}px, 0)`;
    reorderAtPointer(time);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (!enabled || event.button !== 0 || isInteractive(event.target)) return;
    const tile =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>(".project-tile")
        : null;
    const position = tile ? positions.get(tile) : null;
    if (!tile || !position) return;

    drag = {
      tile,
      pointerId: event.pointerId,
      startPointer: { x: event.clientX, y: event.clientY },
      latestPointer: { x: event.clientX, y: event.clientY },
      startTile: { ...position },
      started: false,
      lastSortAt: 0,
    };
    event.preventDefault();
    tile.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.latestPointer.x = event.clientX;
    drag.latestPointer.y = event.clientY;
    if (drag.started) event.preventDefault();
    if (!frame) frame = requestAnimationFrame(renderDrag);
  };

  const finishDrag = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    cancelAnimationFrame(frame);
    frame = 0;
    const finished = drag;
    drag = null;

    if (finished.tile.hasPointerCapture(event.pointerId)) {
      finished.tile.releasePointerCapture(event.pointerId);
    }
    if (!finished.started) return;

    finished.tile.classList.remove("is-project-dragging");
    setDropTarget(null);
    document.body.classList.remove("is-dragging-project");
    for (const tile of tiles) grid.append(tile);
    persistOrder();
    applyLayout(true);
  };

  const disable = (): void => {
    enabled = false;
    cancelAnimationFrame(frame);
    cancelAnimationFrame(layoutFrame);
    frame = 0;
    layoutFrame = 0;
    if (drag?.tile.hasPointerCapture(drag.pointerId))
      drag.tile.releasePointerCapture(drag.pointerId);
    drag = null;
    setDropTarget(null);
    positions.clear();
    sizes.clear();
    grid.classList.remove("is-project-grid", "is-project-grid-animating");
    grid.style.removeProperty("height");
    document.body.classList.remove("is-dragging-project");
    for (const tile of tiles) {
      tile.classList.remove("is-project-dragging");
      tile.style.removeProperty("width");
      tile.style.removeProperty("height");
      tile.style.removeProperty("transform");
    }
  };

  const syncMode = (): void => {
    if (!media.matches) {
      disable();
      return;
    }
    if (enabled) return;
    enabled = true;
    grid.classList.add("is-project-grid");
    applyLayout(false);
  };

  grid.addEventListener("pointerdown", onPointerDown, { signal: events.signal });
  reset?.addEventListener(
    "click",
    () => {
      tiles.sort(
        (a, b) =>
          (authoredRanks.get(tileId(a)) ?? 0) -
          (authoredRanks.get(tileId(b)) ?? 0),
      );
      for (const tile of tiles) grid.append(tile);
      persistOrder();
      scheduleLayout(true);
    },
    { signal: events.signal },
  );
  window.addEventListener("pointermove", onPointerMove, {
    signal: events.signal,
    passive: false,
  });
  window.addEventListener("pointerup", finishDrag, { signal: events.signal });
  window.addEventListener("pointercancel", finishDrag, { signal: events.signal });
  media.addEventListener("change", syncMode, { signal: events.signal });
  resizeObserver.observe(grid);
  mutationObserver.observe(grid, {
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden"],
  });
  void document.fonts.ready.then(() => scheduleLayout(false));
  restoreSavedOrder();
  updateReset();
  syncMode();

  return () => {
    events.abort();
    resizeObserver.disconnect();
    mutationObserver.disconnect();
    disable();
  };
}
