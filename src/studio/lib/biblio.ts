/**
 * Client for the bibliotheques-back public images API.
 *
 * The endpoint (GET /api/public/images) is documented in
 * bibliotheques-back/src/api/public-images.routes.js. It returns
 * paginated, status='done' images filtered by type (element /
 * illustration / photo) with absolute URLs ready to drop into <img src>
 * or fabric.Image#fromURL.
 *
 * Domain is configured via NEXT_PUBLIC_BIBLIOTHEQUES_URL. Empty / unset
 * disables every call silently — callers get an empty list back and
 * the studio falls back to its existing sources only.
 */

export type BiblioType = "element" | "illustration" | "photo";
export type BiblioOrientation = "landscape" | "portrait" | "square";

export interface BiblioImage {
  id: string;
  name: string;
  thumbnail: string | null;
  fullSize: string | null;
  width: number | null;
  height: number | null;
  mimeType: string | null;
  type: BiblioType | null;
}

export interface BiblioPage {
  items: BiblioImage[];
  page: number;
  perPage: number;
  total: number;
  hasMore: boolean;
}

export interface BiblioColor {
  id: number;
  name: string;
  hex: string;
  imageCount: number;
}

export interface BiblioEvent {
  id: number;
  name: string;
  slug: string | null;
  imageCount: number;
}

function getBase(): string {
  const raw = process.env.NEXT_PUBLIC_BIBLIOTHEQUES_URL;
  if (!raw || typeof raw !== "string") return "";
  return raw.replace(/\/$/, "");
}

export function isBiblioConfigured(): boolean {
  return getBase().length > 0;
}

/**
 * Fetch a page of images from the public library.
 *
 * Returns an empty page (items:[], hasMore:false) on any failure so
 * the studio's "Images" tab gracefully degrades to its existing
 * sources when the new backend is offline, misconfigured, or returns
 * an error. Callers can detect "nothing to show" via items.length.
 */
export async function fetchBiblioImages(opts: {
  type?: BiblioType;
  q?: string;
  page?: number;
  perPage?: number;
  orientation?: BiblioOrientation;
  colorId?: number;
  eventId?: number;
  signal?: AbortSignal;
}): Promise<BiblioPage> {
  const empty: BiblioPage = { items: [], page: opts.page ?? 1, perPage: opts.perPage ?? 24, total: 0, hasMore: false };
  const base = getBase();
  if (!base) return empty;

  const params = new URLSearchParams();
  if (opts.type) params.set("type", opts.type);
  if (opts.q && opts.q.trim()) params.set("q", opts.q.trim());
  if (opts.page && opts.page > 1) params.set("page", String(opts.page));
  if (opts.perPage) params.set("perPage", String(opts.perPage));
  if (opts.orientation) params.set("orientation", opts.orientation);
  if (opts.colorId) params.set("colorId", String(opts.colorId));
  if (opts.eventId) params.set("eventId", String(opts.eventId));
  const url = `${base}/api/public/images?${params.toString()}`;

  try {
    const res = await fetch(url, { signal: opts.signal });
    if (!res.ok) return empty;
    const data = await res.json();
    return {
      items: Array.isArray(data.items) ? data.items : [],
      page: Number(data.page) || 1,
      perPage: Number(data.perPage) || (opts.perPage ?? 24),
      total: Number(data.total) || 0,
      hasMore: Boolean(data.hasMore),
    };
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") throw err;
    return empty;
  }
}

/**
 * Fetch the list of available colors from the public library. Used by
 * the studio to build a biblio-specific color filter dropdown. Returns
 * an empty list on any failure so the studio's color picker degrades
 * to the existing Pixabay-name palette only.
 */
export async function fetchBiblioColors(signal?: AbortSignal): Promise<BiblioColor[]> {
  const base = getBase();
  if (!base) return [];
  try {
    const res = await fetch(`${base}/api/public/colors`, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.items) ? data.items : [];
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") throw err;
    return [];
  }
}

/**
 * Fetch the list of available marketing events (calendrier marketing).
 * Same fail-safe pattern as fetchBiblioColors: empty array on failure.
 */
export async function fetchBiblioEvents(signal?: AbortSignal): Promise<BiblioEvent[]> {
  const base = getBase();
  if (!base) return [];
  try {
    const res = await fetch(`${base}/api/public/events`, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.items) ? data.items : [];
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") throw err;
    return [];
  }
}
