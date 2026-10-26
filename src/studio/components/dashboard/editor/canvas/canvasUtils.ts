/**
 * Canvas utility functions — extracted from FrameEditor for maintainability.
 * Handles temp canvas management, blob/data URL conversions, and image processing.
 */

import { proxyImageUrl } from "@/studio/lib/imageProxy";

/**
 * Convert any color string (rgba/rgb/hex/named) into a #RRGGBB hex for
 * native <input type="color"> elements, which only accept hex. Uses the
 * browser's CSS parser via a detached canvas fillStyle round-trip.
 */
export function colorToHex(color: string | undefined | null): string {
  if (!color) return "#000000";
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  const short = color.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  const rgb = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) {
    const r = parseInt(rgb[1]).toString(16).padStart(2, "0");
    const g = parseInt(rgb[2]).toString(16).padStart(2, "0");
    const b = parseInt(rgb[3]).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  }
  // Named colors ("red", "black", etc.) via canvas fillStyle round-trip
  try {
    const c = document.createElement("canvas");
    c.width = 1; c.height = 1;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#000";
      ctx.fillStyle = color;
      const computed = ctx.fillStyle;
      if (typeof computed === "string" && /^#[0-9a-f]{6}$/i.test(computed)) return computed;
    }
  } catch { /* ignore */ }
  return "#000000";
}

/**
 * Extract the alpha channel (0..1) from a color string. Returns 1 for
 * solid hex/named colors and the actual alpha for rgba(...) strings.
 */
export function colorToAlpha(color: string | undefined | null): number {
  if (!color) return 1;
  const rgba = color.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/);
  if (rgba) return Math.max(0, Math.min(1, parseFloat(rgba[1])));
  return 1;
}

/**
 * Generate a random ID. Uses crypto.randomUUID when available (secure
 * context + modern browsers) and falls back to a non-cryptographic
 * Math.random-based ID for insecure contexts and older Safari (< 15.4).
 */
export function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  // Fallback: not cryptographically strong but unique enough for
  // per-session client IDs (upload history entries, etc.)
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  );
}

/* ── Temp canvas pooling ── */
const _canvasPool: HTMLCanvasElement[] = [];
// Big enough to handle parallel imports (10-layer PSD, multi-page PDF)
// without pool thrashing. Each slot is a 1×1 shell until reused, so the
// memory footprint is negligible.
const MAX_POOL_SIZE = 12;

/** Get a temp canvas from pool or create one. Always call releaseTempCanvas() when done. */
export function getTempCanvas(w: number, h: number): HTMLCanvasElement {
  const c = _canvasPool.pop() || document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Release all pooled canvases and free their memory. Call on session end. */
export function clearCanvasPool(): void {
  while (_canvasPool.length > 0) {
    const c = _canvasPool.pop()!;
    // Safari retains the underlying CGContext until the element is GC'd
    // even when width/height go to 0. Setting to 1×1 first is more
    // effective at forcing the GPU backing to be released on Safari,
    // and then we let GC collect the element.
    c.width = 1;
    c.height = 1;
  }
}

/** Return a temp canvas to the pool (clears pixel data). */
export function releaseTempCanvas(c: HTMLCanvasElement): void {
  if (_canvasPool.length < MAX_POOL_SIZE) {
    c.width = 1;
    c.height = 1;
    _canvasPool.push(c);
  } else {
    // Fully release: Safari frees GPU memory more reliably when the
    // canvas is resized to 1×1 than when set to 0 (which it treats as
    // a no-op on some versions).
    c.width = 1;
    c.height = 1;
  }
}

/* ── WeakMap-based memoization ── */

/**
 * WeakMap-based memoization for object-keyed caches.
 * Unlike Map, WeakMap allows GC to collect entries when keys are no longer referenced.
 * Canva uses this pattern extensively for canvas/image caches.
 */
export function createWeakMemo<K extends object, V>(fn: (key: K) => V): (key: K) => V {
  const cache = new WeakMap<K, V>();
  return (key: K) => {
    if (cache.has(key)) return cache.get(key)!;
    const val = fn(key);
    cache.set(key, val);
    return val;
  };
}

/* ── Image loading ── */

/**
 * Load an image efficiently using decode() for non-blocking decoding,
 * with fallback to onload for older browsers.
 */
export function loadImageAsync(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    // IMPORTANT: attach handlers BEFORE setting src. If src is already cached,
    // the image can be 'complete' synchronously and onload would never fire
    // if attached after. Also, waiting on decode() alone can hang when the
    // image is cached but decode() rejects: attaching onload after the fact
    // never resolves because the load event has already been dispatched.
    img.onload = () => {
      // Use decode() when available for non-blocking decoding, but don't
      // depend on it — resolve even if decode rejects.
      if (typeof img.decode === 'function') {
        img.decode().then(() => resolve(img)).catch(() => resolve(img));
      } else {
        resolve(img);
      }
    };
    img.onerror = () => reject(new Error('Image load failed'));
    // Route Selfizee CDN URLs through our backend proxy — those hosts no
    // longer return CORS headers (since Cloudflare was turned off) and the
    // crossOrigin="anonymous" flag above would otherwise hard-fail the load.
    img.src = proxyImageUrl(src);
  });
}

/**
 * Downscale an image using createImageBitmap for hardware-accelerated resizing.
 * Falls back to canvas drawImage if createImageBitmap is not available.
 */
export async function downscaleImage(source: HTMLImageElement | ImageBitmap, maxDim: number): Promise<{ bitmap: ImageBitmap | null; dataUrl: string }> {
  const w = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const h = 'naturalHeight' in source ? source.naturalHeight : source.height;
  if (w <= maxDim && h <= maxDim) {
    return { bitmap: null, dataUrl: '' }; // No downscale needed
  }
  const scale = Math.min(maxDim / w, maxDim / h);
  const nw = Math.round(w * scale);
  const nh = Math.round(h * scale);

  if (typeof createImageBitmap !== 'undefined') {
    try {
      const bitmap = await createImageBitmap(source, { resizeWidth: nw, resizeHeight: nh, resizeQuality: 'high' });
      // Convert to dataUrl via bitmaprenderer if available, else canvas.
      // IMPORTANT: the canvas used for bitmaprenderer cannot be reused
      // as a "2d" canvas afterwards (Safari/Chrome lock the context kind
      // to the first getContext call), so we use a fresh canvas (not the
      // pool) for the bitmaprenderer path and keep the pool clean.
      const bcvs = document.createElement('canvas');
      bcvs.width = nw;
      bcvs.height = nh;
      const brCtx = bcvs.getContext('bitmaprenderer') as ImageBitmapRenderingContext | null;
      if (brCtx) {
        brCtx.transferFromImageBitmap(bitmap);
        const dataUrl = bcvs.toDataURL('image/png');
        bcvs.width = 0; bcvs.height = 0;
        return { bitmap: null, dataUrl };
      }
      // 2D fallback: draw the RESIZED bitmap (not the original source),
      // otherwise we'd redo the expensive resample and lose the
      // resizeQuality: 'high' benefit of createImageBitmap.
      const c = getTempCanvas(nw, nh);
      c.getContext('2d')!.drawImage(bitmap, 0, 0);
      const dataUrl = c.toDataURL('image/png');
      releaseTempCanvas(c);
      // Close the bitmap to release GPU memory (ImageBitmap has its
      // own retained buffer separate from the canvas).
      if (typeof (bitmap as any)?.close === 'function') {
        try { (bitmap as any).close(); } catch { /* ignore */ }
      }
      return { bitmap: null, dataUrl };
    } catch {
      // Fallback to canvas
    }
  }
  // Fallback
  const c = getTempCanvas(nw, nh);
  c.getContext('2d')!.drawImage(source, 0, 0, nw, nh);
  const dataUrl = c.toDataURL('image/png');
  releaseTempCanvas(c);
  return { bitmap: null, dataUrl };
}

/* ── Image downscaling ── */
const MAX_IMAGE_DIM = 2048;

/**
 * Absolute safety ceiling for source image dimensions. Any image larger
 * than this on either axis is rejected at the import stage before
 * loadImageAsync allocates the full-res HTMLImageElement — otherwise a
 * 10000×10000 photo balloons to ~400MB of RAM and OOMs mobile Safari.
 */
export const MAX_SOURCE_IMAGE_DIM = 8192;

/**
 * Downscale a Blob directly via createImageBitmap so we never allocate
 * a full-res HTMLImageElement. Returns a PNG data URL, or null if
 * createImageBitmap isn't available (caller should fall back to the
 * HTMLImageElement path). Pre-screens source dimensions against
 * MAX_SOURCE_IMAGE_DIM and rejects anything larger.
 */
export async function downscaleBlob(blob: Blob, maxDim = MAX_IMAGE_DIM): Promise<string | null> {
  if (typeof createImageBitmap === "undefined") return null;
  try {
    // Pass resizeWidth/Height to let the bitmap decoder skip ahead to
    // the target resolution internally — much faster and lower memory
    // than loading at full-res and then resampling.
    // First, probe the intrinsic size with a small bitmap read.
    const probe = await createImageBitmap(blob);
    const w = probe.width;
    const h = probe.height;
    if (w > MAX_SOURCE_IMAGE_DIM || h > MAX_SOURCE_IMAGE_DIM) {
      if (typeof (probe as any)?.close === "function") {
        try { (probe as any).close(); } catch { /* ignore */ }
      }
      throw new Error(`Source image too large (${w}×${h})`);
    }
    let bmp: ImageBitmap;
    if (w <= maxDim && h <= maxDim) {
      bmp = probe;
    } else {
      if (typeof (probe as any)?.close === "function") {
        try { (probe as any).close(); } catch { /* ignore */ }
      }
      const scale = Math.min(maxDim / w, maxDim / h);
      const nw = Math.round(w * scale);
      const nh = Math.round(h * scale);
      bmp = await createImageBitmap(blob, { resizeWidth: nw, resizeHeight: nh, resizeQuality: "high" });
    }
    const c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext("2d")!.drawImage(bmp, 0, 0);
    const dataUrl = c.toDataURL("image/png");
    c.width = 1; c.height = 1;
    if (typeof (bmp as any)?.close === "function") {
      try { (bmp as any).close(); } catch { /* ignore */ }
    }
    return dataUrl;
  } catch {
    return null;
  }
}

/**
 * Downscale an image data URL if it exceeds MAX_IMAGE_DIM on either axis.
 * Returns the original data URL if no downscaling needed.
 * Uses loadImageAsync for non-blocking image decoding.
 */
export async function downscaleDataUrl(dataUrl: string, maxDim = MAX_IMAGE_DIM): Promise<string> {
  try {
    const img = await loadImageAsync(dataUrl);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    // Reject absurdly large sources before any further processing.
    // A 10000×10000 photo would allocate ~400MB on the next getImageData
    // call and OOM mobile Safari.
    if (w > MAX_SOURCE_IMAGE_DIM || h > MAX_SOURCE_IMAGE_DIM) {
      // Still try to downscale via createImageBitmap which can resize
      // at decode time without materialising the full-res RGBA buffer.
      // If that fails, return the original — upstream will catch it.
      if (typeof createImageBitmap !== "undefined") {
        try {
          const scale = Math.min(maxDim / w, maxDim / h);
          const nw = Math.round(w * scale);
          const nh = Math.round(h * scale);
          const bmp = await createImageBitmap(img, { resizeWidth: nw, resizeHeight: nh, resizeQuality: "high" });
          const c = document.createElement("canvas");
          c.width = nw; c.height = nh;
          c.getContext("2d")!.drawImage(bmp, 0, 0);
          const url = c.toDataURL("image/png");
          c.width = 1; c.height = 1;
          if (typeof (bmp as any)?.close === "function") {
            try { (bmp as any).close(); } catch { /* ignore */ }
          }
          return url;
        } catch { /* fall through */ }
      }
    }
    if (w <= maxDim && h <= maxDim) {
      return dataUrl;
    }
    const result = await downscaleImage(img, maxDim);
    if (result.dataUrl) return result.dataUrl;
    // Fallback: manual canvas downscale
    const scale = Math.min(maxDim / w, maxDim / h);
    const nw = Math.round(w * scale);
    const nh = Math.round(h * scale);
    const c = getTempCanvas(nw, nh);
    c.getContext("2d")!.drawImage(img, 0, 0, nw, nh);
    const fallbackResult = c.toDataURL("image/png");
    releaseTempCanvas(c);
    return fallbackResult;
  } catch {
    return dataUrl;
  }
}

/**
 * Trim a masked/clipped image to its opaque bounding box.
 * Returns a new data URL cropped to the opaque bounds plus the offset (dx, dy).
 * Returns null if the image is fully transparent.
 */
export function trimToOpaqueBounds(dataUrl: string): Promise<{ dataUrl: string; dx: number; dy: number; w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const c = getTempCanvas(w, h);
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, w, h).data;
      let minX = w, minY = h, maxX = 0, maxY = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > 10) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < minX || maxY < minY) { releaseTempCanvas(c); resolve(null); return; }
      const cropW = maxX - minX + 1;
      const cropH = maxY - minY + 1;
      const cropped = getTempCanvas(cropW, cropH);
      cropped.getContext("2d")!.drawImage(c, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
      const result = cropped.toDataURL("image/png");
      releaseTempCanvas(c);
      releaseTempCanvas(cropped);
      resolve({ dataUrl: result, dx: minX, dy: minY, w: cropW, h: cropH });
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/**
 * Calculate the correct canvas position for a trimmed image,
 * accounting for rotation and any originX/originY.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getTrimmedPosition(sourceObj: any, dx: number, dy: number, sx: number, sy: number): { left: number; top: number } {
  const angle = (sourceObj.angle || 0) * Math.PI / 180;
  const ox = dx * sx;
  const oy = dy * sy;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rotX = ox * cos - oy * sin;
  const rotY = ox * sin + oy * cos;
  const br = sourceObj.getBoundingRect();
  return { left: br.left + rotX, top: br.top + rotY };
}

/**
 * Ensure an image object's source is a stable data URL (not a blob URL) before cloning.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function stabilizeBlobSrc(obj: any): void {
  if (!obj) return;
  if (obj._objects) {
    for (const child of obj._objects) stabilizeBlobSrc(child);
    return;
  }
  if (obj.type !== "image") return;
  try {
    const el = obj.getElement?.() || obj._element;
    if (el && el.src && el.src.startsWith("blob:")) {
      // Bail if the element isn't loaded yet — a 100×100 fallback would
      // silently distort the image. Better to leave the blob URL alone and
      // let the caller retry later.
      const w = el.naturalWidth || el.width;
      const h = el.naturalHeight || el.height;
      if (!w || !h) return;
      const tmp = getTempCanvas(w, h);
      const ctx = tmp.getContext("2d");
      if (ctx) {
        ctx.drawImage(el, 0, 0);
        const dataUrl = tmp.toDataURL("image/png");
        el.src = dataUrl;
        if (obj._originalElement) obj._originalElement.src = dataUrl;
      }
      releaseTempCanvas(tmp);
    }
  } catch { /* skip */ }
}

/**
 * Ensure a Fabric image element is non-tainted for canvas export operations.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensureCleanElement(targetImg: any): Promise<HTMLImageElement> {
  stabilizeBlobSrc(targetImg);
  const el = targetImg.getElement();
  // Quick taint test
  try {
    const tc = getTempCanvas(1, 1);
    const tctx = tc.getContext("2d")!;
    tctx.drawImage(el, 0, 0, 1, 1);
    tc.toDataURL();
    releaseTempCanvas(tc);
    return el;
  } catch {
    const src = el.src || targetImg.getSrc();
    if (!src) throw new Error("No image source to reload");
    try {
      const resp = await fetchWithTimeout(src, { mode: "cors", timeoutMs: 20000 });
      const blob = await resp.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      await targetImg.setSrc(dataUrl);
      targetImg.dirty = true;
      return targetImg.getElement();
    } catch {
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          const tmp = getTempCanvas(img.naturalWidth || img.width, img.naturalHeight || img.height);
          const ctx = tmp.getContext("2d")!;
          ctx.drawImage(img, 0, 0);
          const dataUrl = tmp.toDataURL("image/png");
          releaseTempCanvas(tmp);
          targetImg.setSrc(dataUrl).then(() => {
            targetImg.dirty = true;
            resolve(targetImg.getElement());
          }).catch(reject);
        };
        img.onerror = reject;
        img.src = src;
      });
    }
  }
}

/**
 * Build a lookup map of blob URL -> data URL from all canvas image elements.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildBlobMap(canvas: any): Map<string, string> {
  const map = new Map<string, string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function scan(objects: any[]) {
    for (const co of objects) {
      if (co.type === "group" && co._objects) { scan(co._objects); continue; }
      try {
        const el = co.getElement?.() || co._element;
        if (el && el.src && el.src.startsWith("blob:") && !map.has(el.src)) {
          const tmp = getTempCanvas(el.naturalWidth || el.width || 100, el.naturalHeight || el.height || 100);
          const ctx = tmp.getContext("2d");
          if (ctx) { ctx.drawImage(el, 0, 0); map.set(el.src, tmp.toDataURL("image/png")); }
          releaseTempCanvas(tmp);
        }
      } catch { /* skip */ }
    }
  }
  scan(canvas.getObjects());
  return map;
}

/**
 * Fix blob URLs in serialized fabric objects using the given map.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fixBlobUrls(obj: any, blobMap: Map<string, string>): void {
  if (!obj) return;
  if (obj.type === "image" && obj.src && obj.src.startsWith("blob:")) {
    const dataUrl = blobMap.get(obj.src);
    if (dataUrl) obj.src = dataUrl;
  }
  if (obj.objects && Array.isArray(obj.objects)) {
    for (const child of obj.objects) fixBlobUrls(child, blobMap);
  }
}

/* ── Checkerboard tile (singleton) ── */
let _checkerCanvas: HTMLCanvasElement | null = null;
export function getCheckerCanvas(): HTMLCanvasElement {
  if (_checkerCanvas) return _checkerCanvas;
  const s = 12;
  const c = document.createElement("canvas");
  c.width = s * 2;
  c.height = s * 2;
  const x = c.getContext("2d")!;
  x.fillStyle = "#ffffff";
  x.fillRect(0, 0, s * 2, s * 2);
  x.fillStyle = "#e0e0e0";
  x.fillRect(0, 0, s, s);
  x.fillRect(s, s, s, s);
  _checkerCanvas = c;
  return c;
}

/* ── CDN library loaders (singletons) ── */

/**
 * Internal helper: cache a CDN library loader promise, but RESET the
 * cached entry when the promise rejects so callers can retry (e.g. the
 * user hits the import button again after reconnecting). Previously a
 * single transient failure locked the feature for the rest of the
 * session.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cachedLoader<T>(
  slot: { current: Promise<T> | null },
  factory: () => Promise<T>,
): Promise<T> {
  if (slot.current) return slot.current;
  const p = factory().catch((err) => {
    if (slot.current === p) slot.current = null;
    throw err;
  });
  slot.current = p;
  return p;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _pdfjsSlot: { current: Promise<any> | null } = { current: null };
export function loadPdfjs() {
  return cachedLoader(_pdfjsSlot, () => new Promise<any>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).pdfjsLib) { resolve((window as any).pdfjsLib); return; }
    let done = false;
    const finish = (fn: () => void) => { if (done) return; done = true; fn(); };
    const moduleScript = document.createElement("script");
    moduleScript.type = "module";
    moduleScript.textContent = `
      import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.min.mjs";
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.worker.min.mjs";
      window.pdfjsLib = pdfjsLib;
      window.dispatchEvent(new Event("pdfjsReady"));
    `;
    // Catch script load/parse errors (CDN down, bad response, etc.)
    moduleScript.onerror = () => finish(() => {
      window.removeEventListener("pdfjsReady", onReady);
      reject(new Error("PDF.js script load failed"));
    });
    document.head.appendChild(moduleScript);
    const onReady = () => finish(() => {
      window.removeEventListener("pdfjsReady", onReady);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolve((window as any).pdfjsLib);
    });
    window.addEventListener("pdfjsReady", onReady);
    setTimeout(() => finish(() => {
      window.removeEventListener("pdfjsReady", onReady);
      reject(new Error("PDF.js load timeout"));
    }), 10000);
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _psdSlot: { current: Promise<any> | null } = { current: null };
export function loadPsd() {
  return cachedLoader(_psdSlot, () => new Promise<any>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).__PSD) { resolve((window as any).__PSD); return; }
    let done = false;
    const finish = (fn: () => void) => { if (done) return; done = true; fn(); };
    const s = document.createElement("script");
    s.type = "module";
    s.textContent = `
      import Psd from "https://esm.sh/@webtoon/psd@0.4.0";
      window.__PSD = Psd;
      window.dispatchEvent(new Event("psdReady"));
    `;
    s.onerror = () => finish(() => {
      window.removeEventListener("psdReady", onReady);
      reject(new Error("PSD lib script load failed"));
    });
    document.head.appendChild(s);
    const onReady = () => finish(() => {
      window.removeEventListener("psdReady", onReady);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolve((window as any).__PSD);
    });
    window.addEventListener("psdReady", onReady);
    setTimeout(() => finish(() => {
      window.removeEventListener("psdReady", onReady);
      reject(new Error("PSD lib load timeout"));
    }), 15000);
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _utifSlot: { current: Promise<any> | null } = { current: null };
export function loadUtif() {
  return cachedLoader(_utifSlot, () => new Promise<any>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).UTIF) { resolve((window as any).UTIF); return; }
    let done = false;
    const finish = (fn: () => void) => { if (done) return; done = true; fn(); };
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/utif2@4.1.0/UTIF.js";
    s.onload = () => finish(() => resolve((window as any).UTIF));
    s.onerror = () => finish(() => reject(new Error("UTIF load failed")));
    document.head.appendChild(s);
    setTimeout(() => finish(() => reject(new Error("UTIF load timeout"))), 10000);
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _heicSlot: { current: Promise<any> | null } = { current: null };
export function loadHeic2any() {
  return cachedLoader(_heicSlot, () => new Promise<any>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).heic2any) { resolve((window as any).heic2any); return; }
    let done = false;
    const finish = (fn: () => void) => { if (done) return; done = true; fn(); };
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
    s.onload = () => finish(() => resolve((window as any).heic2any));
    s.onerror = () => finish(() => reject(new Error("heic2any load failed")));
    document.head.appendChild(s);
    setTimeout(() => finish(() => reject(new Error("heic2any load timeout"))), 10000);
  }));
}

/* ── Dynamic import retry ── */

/**
 * Retry wrapper for dynamic imports — 5 attempts with 1s delay.
 * Canva uses this pattern for all chunk loading.
 */
export async function retryImport<T>(importFn: () => Promise<T>, retries = 5, delay = 1000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try { return await importFn(); } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Import failed after retries');
}

/**
 * fetch with a built-in timeout. Throws an AbortError if the request
 * doesn't complete within `timeoutMs` (default 30s). Pass an external
 * AbortSignal via `opts.signal` to chain cancellation — both signals
 * will be honoured.
 *
 * Use this instead of bare `fetch` for any network call that can
 * realistically hang (slow connection, third-party service down, etc).
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  opts: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 30000, signal: externalSignal, ...rest } = opts;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error("Request timeout")), timeoutMs);
  // Chain external abort into our controller
  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort(externalSignal.reason);
    else externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }
  try {
    return await fetch(input, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal) externalSignal.removeEventListener("abort", onExternalAbort);
  }
}

/* ── Throttled render ── */
let _rafId = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function throttledRender(canvas: any) {
  if (_rafId) return;
  _rafId = requestAnimationFrame(() => {
    canvas.requestRenderAll();
    _rafId = 0;
  });
}

/* ── Group editing helper ── */
/**
 * When in group editing mode, update editingGroupObjsRef to swap an old object
 * reference for a new one. Call this whenever canvas.remove(old) + canvas.add(new)
 * replaces an object that might be part of a group being edited.
 */
/**
 * When in group editing mode, update editingGroupObjsRef to swap an old object
 * reference for a new one. Call this whenever canvas.remove(old) + canvas.add(new)
 * replaces an object that might be part of a group being edited.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _editingGroupObjsRef: { current: any[] } | null = null;
/** Call once at editor init to register the ref for replaceInGroupEditing */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setEditingGroupObjsRef(ref: { current: any[] }): void { _editingGroupObjsRef = ref; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function replaceInGroupEditing(oldObj: any, newObj: any): void {
  if (!_editingGroupObjsRef?.current?.length) return;
  const idx = _editingGroupObjsRef.current.indexOf(oldObj);
  if (idx !== -1) _editingGroupObjsRef.current[idx] = newObj;
}

/* ── Cursor constants ── */
export const CURSOR_PEN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%237c3aed' stroke-width='2'%3E%3Cpath d='M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z'/%3E%3C/svg%3E") 2 22, crosshair`;
export const CURSOR_ERASER = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23ef4444' stroke-width='2'%3E%3Ccircle cx='12' cy='12' r='8'/%3E%3Cline x1='8' y1='12' x2='16' y2='12'/%3E%3C/svg%3E") 12 12, crosshair`;
export function makeEraserCursor(size: number): string {
  const s = Math.max(8, Math.min(size, 80));
  const half = Math.round(s / 2);
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${s}' height='${s}' viewBox='0 0 ${s} ${s}' fill='none'%3E%3Ccircle cx='${half}' cy='${half}' r='${half - 1}' stroke='%23ef4444' stroke-width='2' opacity='0.8'/%3E%3Ccircle cx='${half}' cy='${half}' r='${Math.max(1, half - 2)}' stroke='white' stroke-width='1' opacity='0.4'/%3E%3C/svg%3E") ${half} ${half}, crosshair`;
}
export function makeFreedrawCursor(size: number, color?: string): string {
  const s = Math.max(6, Math.min(size, 80));
  const half = Math.round(s / 2);
  const encoded = encodeURIComponent(color || "#6366f1");
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${s}' height='${s}' viewBox='0 0 ${s} ${s}' fill='none'%3E%3Ccircle cx='${half}' cy='${half}' r='${half - 1}' stroke='${encoded}' stroke-width='1.5' opacity='0.8'/%3E%3Ccircle cx='${half}' cy='${half}' r='1' fill='${encoded}' opacity='0.6'/%3E%3C/svg%3E") ${half} ${half}, crosshair`;
}
export const CURSOR_WAND = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23f59e0b' stroke-width='2'%3E%3Cpath d='M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z'/%3E%3C/svg%3E") 12 12, crosshair`;

/* ── Preset colors ── */
export const PRESET_COLORS = [
  // Vibrant primaries
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#6366f1",
  // Rich saturated
  "#ec4899", "#d946ef", "#8b5cf6", "#7c3aed", "#2563eb", "#0891b2", "#059669", "#16a34a",
  // Deep tones
  "#dc2626", "#ea580c", "#ca8a04", "#15803d", "#0d9488", "#1d4ed8", "#7e22ce", "#be185d",
  // Warm & earthy
  "#fe0154", "#e11d48", "#c2410c", "#b45309", "#a16207", "#d4a574", "#92400e", "#78350f",
  // Neutrals
  "#ffffff", "#f5f5f5", "#d4d4d4", "#a3a3a3", "#737373", "#525252", "#262626", "#000000",
  // Darks
  "#1a1a2e", "#1e3a5f", "#0f766e", "#4c1d95", "#831843", "#7c2d12", "#365314", "#1e293b",
];
