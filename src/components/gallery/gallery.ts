export function attachGallery(root: HTMLElement): () => void {
  const dialog = root.querySelector<HTMLDialogElement>("dialog");
  if (!dialog || typeof dialog.showModal !== "function") return () => {};
  const links = [...root.querySelectorAll<HTMLAnchorElement>("[data-image]")];
  const image = dialog.querySelector<HTMLImageElement>("[data-full-image]")!;
  const caption = dialog.querySelector<HTMLElement>("[data-caption]")!;
  const counter = dialog.querySelector<HTMLElement>("[data-count]")!;
  const cancellation = new AbortController(),
    options = { signal: cancellation.signal };
  let selected = 0;
  const show = (index: number) => {
    selected = (index + links.length) % links.length;
    const link = links[selected];
    image.src = link.href;
    image.alt = link.querySelector("img")?.alt ?? "";
    caption.textContent = link.dataset.caption || link.dataset.title || "";
    counter.textContent = `${selected + 1} / ${links.length}`;
  };
  links.forEach((link, index) =>
    link.addEventListener(
      "click",
      (event) => {
        if (
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        )
          return;
        event.preventDefault();
        show(index);
        dialog.showModal();
      },
      options,
    ),
  );
  dialog
    .querySelector("[data-close]")!
    .addEventListener("click", () => dialog.close(), options);
  dialog
    .querySelector("[data-previous]")!
    .addEventListener("click", () => show(selected - 1), options);
  dialog
    .querySelector("[data-next]")!
    .addEventListener("click", () => show(selected + 1), options);
  dialog.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        show(selected + (event.key === "ArrowLeft" ? -1 : 1));
      }
    },
    options,
  );
  dialog.addEventListener(
    "close",
    () => links[selected]?.focus({ preventScroll: true }),
    options,
  );
  return () => {
    cancellation.abort();
    if (dialog.open) dialog.close();
  };
}
