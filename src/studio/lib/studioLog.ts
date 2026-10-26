/**
 * Studio log client.
 *
 * Buffers log entries and flushes them to /api/studio-logs in batches.
 * - Calls fail silently — instrumentation must never break the editor.
 * - Uses sendBeacon on pagehide/visibilitychange so in-flight entries
 *   make it out even when the user closes the tab mid-import.
 * - Throttled flush avoids hammering the backend during error storms.
 */

import { apiUrl, apiFetchOptions } from "./api";

export type LogLevel = "info" | "warn" | "error" | "fatal";

export type LogCategory =
  // Imports
  | "import_image"
  | "import_psd"
  | "import_pdf"
  | "import_heic"
  | "import_tiff"
  | "import_svg"
  | "import_eps"
  | "import_ai"
  // Studio internals
  | "tool_crash"
  | "canvas_init"
  | "canvas_export"
  | "canvas_save"
  | "fabric_error"
  | "ai_generation"
  | "shape_factory"
  // Browser-level
  | "uncaught_exception"
  | "unhandled_promise"
  | "resource_error"
  // Generic
  | "validation"
  | "network"
  | "unknown";

export interface LogEntry {
  level: LogLevel;
  category: LogCategory | string;
  source?: string;
  message: string;
  stack?: string;
  details?: Record<string, unknown>;
  url?: string;
}

const buffer: LogEntry[] = [];
const MAX_BUFFER = 50;
const FLUSH_INTERVAL_MS = 1500;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let installed = false;

function describeError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    return { message: err.message || err.name || "Error", stack: err.stack };
  }
  if (typeof err === "string") return { message: err };
  try {
    return { message: JSON.stringify(err).slice(0, 500) };
  } catch {
    return { message: String(err) };
  }
}

function flushNow(useBeacon = false) {
  if (buffer.length === 0) return;
  const entries = buffer.splice(0, buffer.length);
  if (typeof window === "undefined") return;
  const url = apiUrl("/api/studio-logs");
  const body = JSON.stringify({ entries });

  if (useBeacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(url, blob);
      return;
    } catch {
      /* fall through to fetch */
    }
  }

  // Fire-and-forget — never let logging fail the caller.
  fetch(url, {
    ...apiFetchOptions,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    /* swallow */
  });
}

function scheduleFlush() {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushNow(false);
  }, FLUSH_INTERVAL_MS);
}

export function logStudioEvent(entry: LogEntry) {
  if (typeof window === "undefined") return;
  const enriched: LogEntry = {
    ...entry,
    url: entry.url || (typeof window.location !== "undefined" ? window.location.href : undefined),
  };
  buffer.push(enriched);

  if (buffer.length >= MAX_BUFFER || entry.level === "fatal") {
    flushNow(false);
  } else {
    scheduleFlush();
  }
}

export function logStudioError(
  category: LogCategory | string,
  err: unknown,
  ctx: { source?: string; details?: Record<string, unknown>; level?: Extract<LogLevel, "error" | "fatal" | "warn"> } = {},
) {
  const { message, stack } = describeError(err);
  logStudioEvent({
    level: ctx.level ?? "error",
    category,
    source: ctx.source,
    message,
    stack,
    details: ctx.details,
  });
}

/** Install global handlers once at app boot. Idempotent. */
export function installStudioLogHandlers() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (e) => {
    // Resource load failures (img/script/...) come through with no .error and a target.
    if (!e.error && e.target && (e.target as HTMLElement).tagName) {
      const el = e.target as HTMLElement & { src?: string; href?: string; tagName: string };
      logStudioEvent({
        level: "warn",
        category: "resource_error",
        source: el.tagName.toLowerCase(),
        message: `Resource failed to load: ${el.src || el.href || el.tagName}`,
        details: { src: el.src, href: el.href },
      });
      return;
    }
    const { message, stack } = describeError(e.error ?? e.message);
    logStudioEvent({
      level: "error",
      category: "uncaught_exception",
      source: e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : undefined,
      message,
      stack,
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const { message, stack } = describeError(e.reason);
    logStudioEvent({
      level: "error",
      category: "unhandled_promise",
      message,
      stack,
    });
  });

  // Best-effort flush on tab close / hide.
  const onLeave = () => flushNow(true);
  window.addEventListener("pagehide", onLeave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushNow(true);
  });
}
