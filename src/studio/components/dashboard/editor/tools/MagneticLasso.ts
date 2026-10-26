/* ═══════════════════════════════════════════════════════════════
   MagneticLasso — Edge-snapping lasso selection for images
   Click to start, trace along edges, click to add anchor points,
   close the path to create a selection mask.
   ═══════════════════════════════════════════════════════════════ */

/* ─── Edge detection (Sobel) ─── */

export interface EdgeMap {
  width: number;
  height: number;
  /** Gradient magnitude for each pixel (0–255) */
  data: Uint8Array;
}

/** Build an edge map from an image element using Sobel operator.
 *  Accepts an optional pre-rendered ImageData to avoid CORS taint issues. */
export function buildEdgeMap(imgEl: HTMLImageElement | HTMLCanvasElement, cleanImageData?: ImageData): EdgeMap {
  const w = (imgEl as HTMLImageElement).naturalWidth || imgEl.width;
  const h = (imgEl as HTMLImageElement).naturalHeight || imgEl.height;
  let imageData: ImageData;
  if (cleanImageData) {
    imageData = cleanImageData;
  } else {
    // Draw image to offscreen canvas
    const cvs = document.createElement("canvas");
    cvs.width = w;
    cvs.height = h;
    const ctx = cvs.getContext("2d")!;
    ctx.drawImage(imgEl, 0, 0, w, h);
    imageData = ctx.getImageData(0, 0, w, h);
  }
  const px = imageData.data;

  // Convert to grayscale
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = px[i * 4];
    const g = px[i * 4 + 1];
    const b = px[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // Sobel operator
  const edges = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      // Gx
      const gx =
        -gray[(y - 1) * w + (x - 1)] + gray[(y - 1) * w + (x + 1)]
        - 2 * gray[y * w + (x - 1)] + 2 * gray[y * w + (x + 1)]
        - gray[(y + 1) * w + (x - 1)] + gray[(y + 1) * w + (x + 1)];
      // Gy
      const gy =
        -gray[(y - 1) * w + (x - 1)] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + (x + 1)]
        + gray[(y + 1) * w + (x - 1)] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + (x + 1)];
      edges[idx] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
    }
  }
  // Copy edge values to boundary pixels from nearest interior pixels
  for (let x = 0; x < w; x++) {
    edges[x] = edges[w + x]; // top row from row 1
    edges[(h - 1) * w + x] = edges[(h - 2) * w + x]; // bottom row
  }
  for (let y = 0; y < h; y++) {
    edges[y * w] = edges[y * w + 1]; // left col from col 1
    edges[y * w + (w - 1)] = edges[y * w + (w - 2)]; // right col
  }
  return { width: w, height: h, data: edges };
}

/* ─── Snap to nearest edge ─── */

/**
 * Given a point in image coordinates, find the nearest high-edge pixel
 * within a search radius. Returns the snapped point.
 */
export function snapToEdge(
  edgeMap: EdgeMap,
  x: number,
  y: number,
  searchRadius: number,
  edgeThreshold: number = 15,
): { x: number; y: number } {
  const { width, height, data } = edgeMap;
  const ix = Math.round(x);
  const iy = Math.round(y);

  let bestX = ix;
  let bestY = iy;
  let bestScore = -1;

  // Respect the caller's search radius. Was floored at 8 which silently
  // ignored slider values below 8 (UI allows 4).
  const r = Math.max(2, Math.ceil(searchRadius));
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const px = ix + dx;
      const py = iy + dy;
      if (px < 0 || px >= width || py < 0 || py >= height) continue;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > r) continue;
      const edgeVal = data[py * width + px];
      if (edgeVal < edgeThreshold) continue;
      // Score: higher edge value + closer distance = better
      const score = edgeVal * (1 - dist / (r * 1.5));
      if (score > bestScore) {
        bestScore = score;
        bestX = px;
        bestY = py;
      }
    }
  }

  return { x: bestX, y: bestY };
}

/* ─── Generate intermediate snapped points between two anchors ─── */

/**
 * Trace a path between two points, snapping each step to nearby edges.
 * Returns an array of points forming the snapped path segment.
 */
export function traceEdgePath(
  edgeMap: EdgeMap,
  from: { x: number; y: number },
  to: { x: number; y: number },
  stepSize: number = 2,
  searchRadius: number = 12,
): { x: number; y: number }[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return [{ x: to.x, y: to.y }];
  // Scale search radius AND step size relative to image dimensions for
  // large images. Previously stepSize stayed at 2 while effectiveRadius
  // scaled up, producing thousands of snap iterations per segment on
  // 4000px images (performance nightmare).
  const imgScale = Math.max(edgeMap.width, edgeMap.height) / 800;
  const effectiveRadius = Math.max(searchRadius, Math.round(searchRadius * imgScale));
  const effectiveStep = Math.max(stepSize, Math.floor(stepSize * imgScale));
  const steps = Math.max(1, Math.ceil(dist / effectiveStep));
  const points: { x: number; y: number }[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const rawX = from.x + dx * t;
    const rawY = from.y + dy * t;
    // Try snapping with increasing radius if no edge found
    let snapped = snapToEdge(edgeMap, rawX, rawY, effectiveRadius);
    // If snap returned the raw point (no edge found), try wider radius with lower threshold
    if (snapped.x === Math.round(rawX) && snapped.y === Math.round(rawY)) {
      snapped = snapToEdge(edgeMap, rawX, rawY, effectiveRadius * 2, 8);
    }
    points.push(snapped);
  }

  return points;
}

/* ─── Convert lasso points to SVG path ─── */

export function lassoPointsToPath(points: { x: number; y: number }[]): string {
  if (points.length < 3) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  d += " Z";
  return d;
}

/* ─── Smooth points (simple moving average) ─── */

export function smoothPoints(
  points: { x: number; y: number }[],
  windowSize: number = 3,
  closed: boolean = true,
): { x: number; y: number }[] {
  if (points.length < windowSize) return points;
  const result: { x: number; y: number }[] = [];
  const half = Math.floor(windowSize / 2);
  for (let i = 0; i < points.length; i++) {
    let sx = 0, sy = 0, count = 0;
    for (let j = -half; j <= half; j++) {
      // For closed curves wrap around (good at seams). For open polylines
      // clamp to endpoints — wrap would average endpoints toward each
      // other, distorting the path shape.
      const raw = i + j;
      const idx = closed
        ? (raw + points.length) % points.length
        : Math.max(0, Math.min(points.length - 1, raw));
      sx += points[idx].x;
      sy += points[idx].y;
      count++;
    }
    result.push({ x: sx / count, y: sy / count });
  }
  return result;
}

/* ─── Cursor for lasso tool ─── */

export const CURSOR_LASSO = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' fill='none' stroke='%23333' stroke-width='1.5'%3E%3Ccircle cx='12' cy='12' r='8' stroke-dasharray='4 2'/%3E%3Cpath d='M12 4V2M12 22v-2M4 12H2M22 12h-2' stroke-width='1'/%3E%3C/svg%3E") 12 12, crosshair`;

export const CURSOR_LASSO_CLOSE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' fill='none' stroke='%23333' stroke-width='1.5'%3E%3Ccircle cx='12' cy='12' r='8' stroke-dasharray='4 2'/%3E%3Ccircle cx='12' cy='12' r='3' fill='%2322c55e' stroke='%23fff'/%3E%3C/svg%3E") 12 12, crosshair`;
