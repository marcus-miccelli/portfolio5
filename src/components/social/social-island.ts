export function attachSocialIsland(root: HTMLElement): () => void {
  const button = root.querySelector<HTMLButtonElement>("[data-copy-email]");
  const label = root.querySelector<HTMLElement>("[data-copy-label]");
  const status = root.querySelector<HTMLElement>("[data-copy-status]");
  if (!button || !label || !status) return () => {};

  const events = new AbortController();
  let resetTimer: number | undefined;
  let disposed = false;
  const reset = () => {
    label.textContent = "copy email";
    status.textContent = "";
  };
  const copy = async () => {
    const email = atob(button.dataset.email ?? "");
    let copied = false;
    try {
      await navigator.clipboard.writeText(email);
      copied = true;
    } catch {
      const area = document.createElement("textarea");
      area.value = email;
      area.readOnly = true;
      area.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      document.body.append(area);
      area.select();
      try {
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      }
      area.remove();
    }
    if (disposed) return;
    label.textContent = copied ? "copied!" : email;
    status.textContent = copied
      ? "Email address copied to clipboard"
      : "Email address could not be copied";
    if (resetTimer) window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(reset, 1800);
  };
  button.addEventListener("click", () => void copy(), {
    signal: events.signal,
  });
  return () => {
    disposed = true;
    events.abort();
    if (resetTimer) window.clearTimeout(resetTimer);
  };
}
