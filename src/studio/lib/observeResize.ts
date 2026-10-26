/**
 * ResizeObserver with a window-resize fallback.
 *
 * Safari iOS < 13.1 ships without ResizeObserver, so the constructor throws
 * and the editor crashes at mount. This helper wraps the API and degrades
 * to a window resize listener when the native one is unavailable.
 *
 * The fallback fires on viewport resize only — not on intra-page layout
 * shifts (panel open/close). That's acceptable for the affected legacy
 * Safari versions; it keeps the editor usable instead of crashing.
 */
export function observeResize(target: Element, callback: () => void): () => void {
  if (typeof ResizeObserver !== "undefined") {
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(() => callback());
      ro.observe(target);
      return () => { try { ro?.disconnect(); } catch { /* noop */ } };
    } catch {
      /* fall through to window listener */
    }
  }

  const onResize = () => callback();
  if (typeof window !== "undefined") {
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
  }
  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    }
  };
}
