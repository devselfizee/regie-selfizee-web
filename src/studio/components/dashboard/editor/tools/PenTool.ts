/* ═══════════════════════════════════════════════════════════════
   PenTool — Bézier Pen Tool for Fabric.js Canvas
   Photoshop-style pen tool: click = corner, click+drag = curve
   ═══════════════════════════════════════════════════════════════ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FabricCanvas = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FabricObject = any;

/* ─── Data structures ─── */

export interface PenPoint {
  x: number;
  y: number;
  /** Incoming control handle (absolute coords). null = sharp corner on in-side */
  handleIn: { x: number; y: number } | null;
  /** Outgoing control handle (absolute coords). null = sharp corner on out-side */
  handleOut: { x: number; y: number } | null;
}

export interface PenToolState {
  active: boolean;
  points: PenPoint[];
  closed: boolean;
  /** Index of point being dragged (during creation) */
  draggingHandle: boolean;
  /** The path object being edited (null during creation) */
  editingPath: FabricObject | null;
  /** Index of selected point in edit mode */
  selectedPointIndex: number;
  /** What part is being dragged in edit mode: 'point' | 'handleIn' | 'handleOut' | null */
  editDragType: "point" | "handleIn" | "handleOut" | null;
}

export function createInitialPenState(): PenToolState {
  return {
    active: false,
    points: [],
    closed: false,
    draggingHandle: false,
    editingPath: null,
    selectedPointIndex: -1,
    editDragType: null,
  };
}

/* ─── SVG Path generation ─── */

export function pointsToSvgPath(points: PenPoint[], closed: boolean): string {
  if (points.length === 0) return "";
  const p0 = points[0];
  let d = `M ${p0.x} ${p0.y}`;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cp1 = prev.handleOut;
    const cp2 = curr.handleIn;

    if (cp1 || cp2) {
      // Cubic Bézier: C cp1x,cp1y cp2x,cp2y x,y
      const c1x = cp1 ? cp1.x : prev.x;
      const c1y = cp1 ? cp1.y : prev.y;
      const c2x = cp2 ? cp2.x : curr.x;
      const c2y = cp2 ? cp2.y : curr.y;
      d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${curr.x} ${curr.y}`;
    } else {
      // Straight line
      d += ` L ${curr.x} ${curr.y}`;
    }
  }

  if (closed && points.length >= 2) {
    const last = points[points.length - 1];
    const first = points[0];
    const cp1 = last.handleOut;
    const cp2 = first.handleIn;
    if (cp1 || cp2) {
      const c1x = cp1 ? cp1.x : last.x;
      const c1y = cp1 ? cp1.y : last.y;
      const c2x = cp2 ? cp2.x : first.x;
      const c2y = cp2 ? cp2.y : first.y;
      d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${first.x} ${first.y}`;
    }
    d += " Z";
  }

  return d;
}

/* ─── Preview path (dashed, during creation) ─── */

export function buildPreviewPath(
  fabric: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  points: PenPoint[],
  closed: boolean,
  mousePos: { x: number; y: number } | null,
  scale: number,
): FabricObject | null {
  // Build path including a tentative segment to the mouse.
  // The tentative point has no handles of its own — the preview curve
  // flows from the last anchor's handleOut (honoured by pointsToSvgPath).
  const allPoints = [...points];
  if (mousePos && !closed && points.length > 0) {
    allPoints.push({ x: mousePos.x, y: mousePos.y, handleIn: null, handleOut: null });
  }
  if (allPoints.length < 2) return null;

  const d = pointsToSvgPath(allPoints, false);
  if (!d) return null;

  const path = new fabric.Path(d, {
    fill: "transparent",
    stroke: "#4f46e5",
    strokeWidth: 2 / scale,
    strokeDashArray: [8 / scale, 4 / scale],
    selectable: false,
    evented: false,
    _isPenPreview: true,
  });
  return path;
}

/* ─── Create the final fabric.Path ─── */

export function createFabricPath(
  fabric: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  points: PenPoint[],
  closed: boolean,
): FabricObject | null {
  if (points.length < 2) return null;
  const d = pointsToSvgPath(points, closed);
  if (!d) return null;

  const path = new fabric.Path(d, {
    fill: closed ? "#3b82f6" : "transparent",
    stroke: closed ? "#1e3a5f" : "#1a1a2e",
    strokeWidth: closed ? 0 : 3,
    strokeLineCap: "round",
    strokeLineJoin: "round",
    originX: "left",
    originY: "top",
    _isPenPath: true,
    _penPoints: JSON.stringify(points),
    _penClosed: closed,
  });

  return path;
}

/* ─── Edit overlay: anchor points + handles ─── */

const ANCHOR_SIZE = 8;
const HANDLE_SIZE = 6;
const HANDLE_LINE_COLOR = "#4f46e5";
const ANCHOR_COLOR = "#ffffff";
const ANCHOR_STROKE = "#4f46e5";
const ANCHOR_SELECTED_COLOR = "#4f46e5";
const CLOSE_THRESHOLD = 12;

export interface EditOverlay {
  objects: FabricObject[];
  /** Map from overlay object to { pointIndex, type } */
  hitMap: Map<FabricObject, { pointIndex: number; type: "point" | "handleIn" | "handleOut" }>;
}

export function buildEditOverlay(
  fabric: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  points: PenPoint[],
  selectedIndex: number,
  scale: number,
  pathOffset: { x: number; y: number },
): EditOverlay {
  const objects: FabricObject[] = [];
  const hitMap = new Map<FabricObject, { pointIndex: number; type: "point" | "handleIn" | "handleOut" }>();
  const sz = ANCHOR_SIZE / scale;
  const hsz = HANDLE_SIZE / scale;
  const lw = 1.5 / scale;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const px = pt.x + pathOffset.x;
    const py = pt.y + pathOffset.y;
    const isSelected = i === selectedIndex;

    // Handle lines + circles
    if (pt.handleIn) {
      const hx = pt.handleIn.x + pathOffset.x;
      const hy = pt.handleIn.y + pathOffset.y;
      // Line from handle to point
      const line = new fabric.Line([hx, hy, px, py], {
        stroke: HANDLE_LINE_COLOR,
        strokeWidth: lw,
        selectable: false,
        evented: false,
        _isPenOverlay: true,
      });
      objects.push(line);
      // Handle circle
      const hCircle = new fabric.Circle({
        left: hx,
        top: hy,
        radius: hsz / 2,
        fill: HANDLE_LINE_COLOR,
        stroke: "#ffffff",
        strokeWidth: lw * 0.7,
        originX: "center",
        originY: "center",
        selectable: false,
        evented: false,
        _isPenOverlay: true,
        _penHitTarget: true,
      });
      objects.push(hCircle);
      hitMap.set(hCircle, { pointIndex: i, type: "handleIn" });
    }

    if (pt.handleOut) {
      const hx = pt.handleOut.x + pathOffset.x;
      const hy = pt.handleOut.y + pathOffset.y;
      const line = new fabric.Line([hx, hy, px, py], {
        stroke: HANDLE_LINE_COLOR,
        strokeWidth: lw,
        selectable: false,
        evented: false,
        _isPenOverlay: true,
      });
      objects.push(line);
      const hCircle = new fabric.Circle({
        left: hx,
        top: hy,
        radius: hsz / 2,
        fill: HANDLE_LINE_COLOR,
        stroke: "#ffffff",
        strokeWidth: lw * 0.7,
        originX: "center",
        originY: "center",
        selectable: false,
        evented: false,
        _isPenOverlay: true,
        _penHitTarget: true,
      });
      objects.push(hCircle);
      hitMap.set(hCircle, { pointIndex: i, type: "handleOut" });
    }

    // Anchor point (square for corner, circle for smooth).
    // Require BOTH handles — asymmetric cusps (one side sharp) now render
    // as squares (corners) instead of circles to match their actual type.
    const isSmooth = pt.handleIn && pt.handleOut;
    let anchor: FabricObject;
    if (isSmooth) {
      anchor = new fabric.Circle({
        left: px,
        top: py,
        radius: sz / 2,
        fill: isSelected ? ANCHOR_SELECTED_COLOR : ANCHOR_COLOR,
        stroke: ANCHOR_STROKE,
        strokeWidth: lw * 1.3,
        originX: "center",
        originY: "center",
        selectable: false,
        evented: false,
        _isPenOverlay: true,
        _penHitTarget: true,
      });
    } else {
      anchor = new fabric.Rect({
        left: px,
        top: py,
        width: sz,
        height: sz,
        fill: isSelected ? ANCHOR_SELECTED_COLOR : ANCHOR_COLOR,
        stroke: ANCHOR_STROKE,
        strokeWidth: lw * 1.3,
        originX: "center",
        originY: "center",
        selectable: false,
        evented: false,
        _isPenOverlay: true,
        _penHitTarget: true,
      });
    }
    objects.push(anchor);
    hitMap.set(anchor, { pointIndex: i, type: "point" });
  }

  return { objects, hitMap };
}

/* ─── Hit testing for edit overlays ─── */

export function hitTestOverlay(
  overlay: EditOverlay,
  pointer: { x: number; y: number },
  scale: number,
): { pointIndex: number; type: "point" | "handleIn" | "handleOut" } | null {
  const threshold = 10 / scale;
  // Test in reverse order (anchors drawn last = on top)
  const entries = Array.from(overlay.hitMap.entries()).reverse();
  for (const [obj, info] of entries) {
    const cx = obj.left as number;
    const cy = obj.top as number;
    const dx = pointer.x - cx;
    const dy = pointer.y - cy;
    if (Math.sqrt(dx * dx + dy * dy) < threshold) {
      return info;
    }
  }
  return null;
}

/* ─── Check if pointer is near first point (for closing) ─── */

export function isNearFirstPoint(
  points: PenPoint[],
  pointer: { x: number; y: number },
  scale: number,
): boolean {
  if (points.length < 2) return false;
  const first = points[0];
  const dx = pointer.x - first.x;
  const dy = pointer.y - first.y;
  return Math.sqrt(dx * dx + dy * dy) < CLOSE_THRESHOLD / scale;
}

/* ─── Mirror a handle around a point ─── */

export function mirrorHandle(
  anchor: { x: number; y: number },
  handle: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: 2 * anchor.x - handle.x,
    y: 2 * anchor.y - handle.y,
  };
}

/* ─── Parse pen points from a stored path object ─── */

export function parsePenPoints(pathObj: FabricObject): { points: PenPoint[]; closed: boolean } | null {
  try {
    if (pathObj._penPoints) {
      return {
        points: JSON.parse(pathObj._penPoints),
        closed: !!pathObj._penClosed,
      };
    }
  } catch { /* skip */ }
  return null;
}

/* ─── Rebuild path from modified points ─── */

export function rebuildPath(
  fabric: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  pathObj: FabricObject,
  points: PenPoint[],
  closed: boolean,
): FabricObject {
  const d = pointsToSvgPath(points, closed);
  const newPath = new fabric.Path(d, {
    fill: pathObj.fill,
    stroke: pathObj.stroke,
    strokeWidth: pathObj.strokeWidth,
    strokeLineCap: pathObj.strokeLineCap || "round",
    strokeLineJoin: pathObj.strokeLineJoin || "round",
    originX: "left",
    originY: "top",
    _isPenPath: true,
    _penPoints: JSON.stringify(points),
    _penClosed: closed,
    shadow: pathObj.shadow,
    opacity: pathObj.opacity,
  });
  return newPath;
}

/* ─── Add point on segment (for future edit mode — not yet used) ─── */

export function addPointOnSegment(
  points: PenPoint[],
  segmentIndex: number,
  t: number,
  closed: boolean = true,
): PenPoint[] {
  // On an open path, inserting past the last segment would wrap to the
  // first point via the modulo — that would silently corrupt the path.
  if (!closed && segmentIndex >= points.length - 1) return points;
  // segmentIndex = index of the starting point of the segment
  const p1 = points[segmentIndex];
  const p2 = points[(segmentIndex + 1) % points.length];
  const cp1 = p1.handleOut || { x: p1.x, y: p1.y };
  const cp2 = p2.handleIn || { x: p2.x, y: p2.y };

  // De Casteljau's algorithm to split cubic bezier at t
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const lerpPt = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
  });

  const a = lerpPt(p1, cp1, t);
  const b = lerpPt(cp1, cp2, t);
  const c = lerpPt(cp2, p2, t);
  const d = lerpPt(a, b, t);
  const e = lerpPt(b, c, t);
  const newPt = lerpPt(d, e, t);

  // Update handles
  const newPoints = [...points];
  newPoints[segmentIndex] = {
    ...p1,
    handleOut: (a.x !== p1.x || a.y !== p1.y) ? a : null,
  };
  const newPoint: PenPoint = {
    x: newPt.x,
    y: newPt.y,
    handleIn: (d.x !== newPt.x || d.y !== newPt.y) ? d : null,
    handleOut: (e.x !== newPt.x || e.y !== newPt.y) ? e : null,
  };
  const nextIdx = (segmentIndex + 1) % points.length;
  newPoints[nextIdx] = {
    ...p2,
    handleIn: (c.x !== p2.x || c.y !== p2.y) ? c : null,
  };

  // Insert new point
  newPoints.splice(segmentIndex + 1, 0, newPoint);
  return newPoints;
}

/* ─── Remove a point ─── */

export function removePoint(points: PenPoint[], index: number): PenPoint[] {
  if (points.length <= 2) return points; // Don't allow less than 2 points
  const newPoints = [...points];
  newPoints.splice(index, 1);
  return newPoints;
}

/* ─── Toggle point between smooth and corner ─── */

export function togglePointType(points: PenPoint[], index: number, closed: boolean = true): PenPoint[] {
  const pt = points[index];
  const newPoints = [...points];
  if (pt.handleIn || pt.handleOut) {
    // Has handles → make corner (remove handles)
    newPoints[index] = { ...pt, handleIn: null, handleOut: null };
  } else {
    // Corner → make smooth (add handles based on neighbors).
    // On an open path at an endpoint, wrapping the modulo would pull
    // the handle vector from the opposite end of the path — use a
    // reflection of the single neighbor instead.
    let prev: PenPoint;
    let next: PenPoint;
    if (!closed && index === 0) {
      next = points[1];
      prev = { x: 2 * pt.x - next.x, y: 2 * pt.y - next.y, handleIn: null, handleOut: null };
    } else if (!closed && index === points.length - 1) {
      prev = points[points.length - 2];
      next = { x: 2 * pt.x - prev.x, y: 2 * pt.y - prev.y, handleIn: null, handleOut: null };
    } else {
      prev = points[(index - 1 + points.length) % points.length];
      next = points[(index + 1) % points.length];
    }
    const dx = (next.x - prev.x) * 0.25;
    const dy = (next.y - prev.y) * 0.25;
    newPoints[index] = {
      ...pt,
      handleIn: { x: pt.x - dx, y: pt.y - dy },
      handleOut: { x: pt.x + dx, y: pt.y + dy },
    };
  }
  return newPoints;
}

/* ─── Custom cursor SVGs — Photoshop-style pen tool ─── */
// URL-encoded SVG format (same format as existing working cursors in FrameEditor)

// Pen nib (normal mode — placing points)
export const CURSOR_PEN_TOOL = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' fill='none' stroke='%23333' stroke-width='1.5'%3E%3Cpath d='M13.5 3.5L10.5 1 2 18l-1 5 3-1L16 5.5z' fill='white' stroke-linejoin='round'/%3E%3Cpath d='M13.5 3.5L16 5.5' stroke-linecap='round'/%3E%3Cpath d='M2 18l2.5 2' stroke-linecap='round'/%3E%3C/svg%3E") 1 23, crosshair`;

// Pen nib + small circle (close path — near first point)
export const CURSOR_PEN_CLOSE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' fill='none' stroke='%23333' stroke-width='1.5'%3E%3Cpath d='M13.5 3.5L10.5 1 2 18l-1 5 3-1L16 5.5z' fill='white' stroke-linejoin='round'/%3E%3Ccircle cx='19' cy='19' r='4' fill='white' stroke='%23333' stroke-width='1.2'/%3E%3C/svg%3E") 1 23, crosshair`;

// Pen nib + plus sign (add point)
export const CURSOR_PEN_ADD = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' fill='none' stroke='%23333' stroke-width='1.5'%3E%3Cpath d='M13.5 3.5L10.5 1 2 18l-1 5 3-1L16 5.5z' fill='white' stroke-linejoin='round'/%3E%3Cline x1='19' y1='15' x2='19' y2='23' stroke='%23333' stroke-width='1.5'/%3E%3Cline x1='15' y1='19' x2='23' y2='19' stroke='%23333' stroke-width='1.5'/%3E%3C/svg%3E") 1 23, crosshair`;

// Arrow pointer (Alt/Option — adjust handle)
export const CURSOR_PEN_ALT = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' fill='none'%3E%3Cpath d='M5 2L5 18l3.5-3.5 4 7 2.5-1.5-4-7H16z' fill='white' stroke='%23333' stroke-width='1.3' stroke-linejoin='round'/%3E%3C/svg%3E") 5 2, default`;

/* ─── Constants ─── */
export const PEN_CUSTOM_PROPS = ["_isPenPath", "_penPoints", "_penClosed"];
