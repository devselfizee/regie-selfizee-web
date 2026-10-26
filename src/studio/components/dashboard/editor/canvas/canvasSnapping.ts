// @ts-nocheck — extracted from useCanvasInit, implicit any types throughout
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEditorStore } from "../store/editorStore";

/**
 * Unified snap-to-guide system — nearest-wins per axis, zoom-aware, with hysteresis.
 *
 * Features:
 * 1. Guide-render optimisation  — skip redraw when guide positions haven't changed
 * 2. Snap during object:scaling — edge snap for every resize handle
 * 3. Snap to dot grid          — reads snapToGrid/gridSize from store, takes priority
 * 4. Equal-spacing snap        — detects equal-gap positions, shown with orange guides + ticks
 * 5. Drag threshold            — 9 CSS px of pointer travel before snap activates
 *                                (prevents accidental micro-moves on clicks)
 * 6. Shift+drag axis constraint— horizontal OR vertical, locks on first clear direction
 *
 * Pre-existing guarantees:
 * · NEAREST-WINS per axis — all candidates collected, only closest applied → no jumping
 * · ZOOM-AWARE THRESHOLD  — thresholds in CSS pixels, scaled by displayScaleRef
 * · HYSTERESIS            — 8px enter / 14px exit prevents snap oscillation
 * · 10 ALIGNMENT CASES    — center↔center + 4 edge alignments per axis + 2 adjacents
 * · BACKGROUND EXCLUSION  — _isSolidBg, _isDesignAreaBg, _isBgImage skipped
 */

/** Threshold to ENTER a snap zone, in CSS pixels. */
const SNAP_ENTER_CSS = 5;
/** Threshold to EXIT a snap zone once snapped, in CSS pixels.
 *  With transform-offset approach, this only needs to be slightly above enter. */
const SNAP_EXIT_CSS  = 6;
/** Minimum pointer travel (CSS px) before snap guides appear (anti-accidental-move).
 *  Object still moves freely during this phase — only guides are suppressed. */
const DRAG_THRESHOLD_CSS = 3;

interface GuideSpec { x1: number; y1: number; x2: number; y2: number; color?: string; }

/** No-op — kept for import compatibility with useCanvasInit. */
export function handleSnapGuides() {}

/** Clears legacy snapGuidesRef (kept for import compatibility). */
export function clearSnapGuides(canvas: any, snapGuidesRef: any) {
  snapGuidesRef.current.forEach((g: any) => canvas.remove(g));
  snapGuidesRef.current = [];
}

export function setupAlignmentSnapping(
  canvas: any,
  BLEED_PX: number,
  canvasWidth: number,
  canvasHeight: number,
  fabric: any,
  displayScaleRef?: { current: number },
) {
  const guidelines: any[] = [];
  let snappedX: number | null = null; // hysteresis: current snapped X centre (canvas px)
  let snappedY: number | null = null;
  let lastGuideKey = "";             // skip unchanged guide redraws

  // Drag threshold + Shift-constraint state — reset on every mouse:down
  let dragState: {
    startPointer: { x: number; y: number };
    lockLeft: number;
    lockTop: number;
    thresholdPassed: boolean;
    constrainAxis: "x" | "y" | null;
  } | null = null;

  // Pre-computed canvas bounds (constant for the lifetime of this canvas)
  const cL  = BLEED_PX;
  const cR  = BLEED_PX + canvasWidth;
  const cT  = BLEED_PX;
  const cB  = BLEED_PX + canvasHeight;
  const cCx = BLEED_PX + canvasWidth  / 2;
  const cCy = BLEED_PX + canvasHeight / 2;

  // ─────────────────── helpers ───────────────────

  function clearGuidelines() {
    guidelines.forEach((l: any) => canvas.remove(l));
    guidelines.length = 0;
    lastGuideKey = "";
  }

  function addGuideline(spec: GuideSpec) {
    const { x1, y1, x2, y2, color = "#4f46e5" } = spec;
    const line = new fabric.Line([x1, y1, x2, y2], {
      stroke: color,
      strokeWidth: 1,
      strokeDashArray: [4, 3],
      selectable: false,
      evented: false,
      excludeFromExport: true,
    });
    (line as any)._isGuideline = true;
    canvas.add(line);
    guidelines.push(line);
  }

  /** Redraw guide lines only when the set of guides has changed (feature 1 optimisation). */
  function renderGuides(guides: GuideSpec[]) {
    const key = guides
      .map(g => `${g.x1.toFixed(1)},${g.y1.toFixed(1)},${g.x2.toFixed(1)},${g.y2.toFixed(1)},${g.color ?? ""}`)
      .join("|");
    if (key === lastGuideKey) return; // nothing changed — skip expensive remove/add cycle
    // Clear old lines (resets lastGuideKey to "")
    guidelines.forEach((l: any) => canvas.remove(l));
    guidelines.length = 0;
    lastGuideKey = key;
    guides.forEach(g => addGuideline(g));
  }

  function isExcluded(obj: any, target: any): boolean {
    return (
      obj === target ||
      obj._isGuideline || obj._isTextGuide || obj._isShootLabel ||
      obj._isSolidBg    || obj._isDesignAreaBg || obj._isBgImage ||
      !obj.visible
    );
  }

  // ─────────────────── drag state init ───────────────────

  canvas.on("mouse:down", (e: any) => {
    const active = canvas.getActiveObject() || e.target;
    if (
      active &&
      active.selectable !== false &&
      !active._isGuideline &&
      !active._isSolidBg &&
      !active._isDesignAreaBg
    ) {
      dragState = {
        startPointer: e.absolutePointer
          ? { x: e.absolutePointer.x, y: e.absolutePointer.y }
          : { x: 0, y: 0 },
        lockLeft: active.left ?? 0,
        lockTop:  active.top  ?? 0,
        thresholdPassed: false,
        constrainAxis: null,
      };
    } else {
      dragState = null;
    }
  });

  // ─────────────────── object:moving ───────────────────

  canvas.on("object:moving", (e: any) => {
    const target = e.target;
    if (!target) return;

    const scale = displayScaleRef?.current ?? 1;

    // ── Feature 5: drag threshold — suppress snapping until pointer has moved enough ──
    if (dragState && !dragState.thresholdPassed) {
      const ptr = e.absolutePointer || e.pointer || { x: 0, y: 0 };
      const dxCss = (ptr.x - dragState.startPointer.x) * scale;
      const dyCss = (ptr.y - dragState.startPointer.y) * scale;
      if (dxCss * dxCss + dyCss * dyCss < DRAG_THRESHOLD_CSS * DRAG_THRESHOLD_CSS) {
        // Object moves freely — just skip snap/guides for now
        renderGuides([]);
        return;
      }
      dragState.thresholdPassed = true;
    }

    // ── Feature 6: Shift+drag axis constraint ──
    if (e.e?.shiftKey && dragState) {
      const ptr = e.absolutePointer || e.pointer || { x: 0, y: 0 };
      const pdx = Math.abs(ptr.x - dragState.startPointer.x);
      const pdy = Math.abs(ptr.y - dragState.startPointer.y);
      if (!dragState.constrainAxis && (pdx > 3 / scale || pdy > 3 / scale)) {
        dragState.constrainAxis = pdx >= pdy ? "x" : "y";
      }
      if      (dragState.constrainAxis === "x") target.set("top",  dragState.lockTop);
      else if (dragState.constrainAxis === "y") target.set("left", dragState.lockLeft);
    } else if (!e.e?.shiftKey && dragState) {
      dragState.constrainAxis = null; // release axis if Shift was lifted mid-drag
    }

    // ── Feature 3: snap to dot grid (takes priority over alignment snap) ──
    const { snapToGrid, gridSize } = useEditorStore.getState();
    if (snapToGrid && gridSize > 0) {
      // Snap to a grid anchored at (BLEED_PX, BLEED_PX) — the design area
      // origin — rather than the raw canvas (0, 0). Also snap the object's
      // visual top-left (via bounding rect) rather than target.left which
      // depends on originX and produces off-by-half-size errors on
      // center-origin objects.
      const br = target.getBoundingRect();
      const snappedBrLeft = Math.round((br.left - BLEED_PX) / gridSize) * gridSize + BLEED_PX;
      const snappedBrTop  = Math.round((br.top  - BLEED_PX) / gridSize) * gridSize + BLEED_PX;
      target.set({
        left: (target.left || 0) + (snappedBrLeft - br.left),
        top:  (target.top  || 0) + (snappedBrTop  - br.top),
      });
      target.setCoords();
      renderGuides([]);
      if (target._isShootZone && target._shootLabel) {
        target._shootLabel.set({ left: (target.left || 0) + 8, top: (target.top || 0) + 6 });
        target._shootLabel.setCoords();
      }
      return; // grid snap wins — skip alignment snap
    }

    // ─────────────────── alignment + equal-spacing snap ───────────────────

    const enterThresh = SNAP_ENTER_CSS / scale;
    const exitThresh  = SNAP_EXIT_CSS  / scale;

    const tb  = target.getBoundingRect();
    const tL  = tb.left;
    const tR  = tb.left + tb.width;
    const tT  = tb.top;
    const tB  = tb.top  + tb.height;
    const tCx = tL + tb.width  / 2;
    const tCy = tT + tb.height / 2;
    const tW  = tb.width;
    const tH  = tb.height;

    const thX = snappedX !== null ? exitThresh : enterThresh;
    const thY = snappedY !== null ? exitThresh : enterThresh;

    let bestDX: number | null = null, bestDXAbs = thX, bestDXGuides: GuideSpec[] = [];
    let bestDY: number | null = null, bestDYAbs = thY, bestDYGuides: GuideSpec[] = [];

    function tryX(delta: number, guides: GuideSpec[]) {
      const a = Math.abs(delta);
      if (a < bestDXAbs) { bestDXAbs = a; bestDX = delta; bestDXGuides = guides; }
    }
    function tryY(delta: number, guides: GuideSpec[]) {
      const a = Math.abs(delta);
      if (a < bestDYAbs) { bestDYAbs = a; bestDY = delta; bestDYGuides = guides; }
    }

    // Canvas centre + edges
    tryX(cCx - tCx, [{ x1: cCx, y1: cT, x2: cCx, y2: cB }]);
    tryY(cCy - tCy, [{ x1: cL,  y1: cCy, x2: cR,  y2: cCy }]);
    tryX(cL  - tL,  [{ x1: cL,  y1: cT, x2: cL,  y2: cB }]);
    tryX(cR  - tR,  [{ x1: cR,  y1: cT, x2: cR,  y2: cB }]);
    tryY(cT  - tT,  [{ x1: cL,  y1: cT, x2: cR,  y2: cT }]);
    tryY(cB  - tB,  [{ x1: cL,  y1: cB, x2: cR,  y2: cB }]);

    // Collect bounding rects of all candidate objects
    interface ObjRect {
      oL: number; oR: number; oT: number; oB: number; oCx: number; oCy: number;
    }
    const otherRects: ObjRect[] = [];
    canvas.getObjects().forEach((obj: any) => {
      if (isExcluded(obj, target)) return;
      const ob = obj.getBoundingRect();
      otherRects.push({
        oL: ob.left, oR: ob.left + ob.width,
        oT: ob.top,  oB: ob.top  + ob.height,
        oCx: ob.left + ob.width  / 2,
        oCy: ob.top  + ob.height / 2,
      });
    });

    // ── Object-to-object alignment (5 cases per axis) ──
    otherRects.forEach(({ oL, oR, oT, oB, oCx, oCy }) => {
      const sY1 = Math.min(tT, oT), sY2 = Math.max(tB, oB);
      const sX1 = Math.min(tL, oL), sX2 = Math.max(tR, oR);
      tryX(oCx - tCx, [{ x1: oCx, y1: sY1, x2: oCx, y2: sY2 }]);
      tryX(oL  - tL,  [{ x1: oL,  y1: sY1, x2: oL,  y2: sY2 }]);
      tryX(oR  - tR,  [{ x1: oR,  y1: sY1, x2: oR,  y2: sY2 }]);
      tryX(oR  - tL,  [{ x1: oR,  y1: sY1, x2: oR,  y2: sY2 }]); // adjacent →
      tryX(oL  - tR,  [{ x1: oL,  y1: sY1, x2: oL,  y2: sY2 }]); // adjacent ←
      tryY(oCy - tCy, [{ x1: sX1, y1: oCy, x2: sX2, y2: oCy }]);
      tryY(oT  - tT,  [{ x1: sX1, y1: oT,  x2: sX2, y2: oT  }]);
      tryY(oB  - tB,  [{ x1: sX1, y1: oB,  x2: sX2, y2: oB  }]);
      tryY(oB  - tT,  [{ x1: sX1, y1: oB,  x2: sX2, y2: oB  }]); // adjacent ↓
      tryY(oT  - tB,  [{ x1: sX1, y1: oT,  x2: sX2, y2: oT  }]); // adjacent ↑
    });

    // ── Feature 4: equal-spacing snap ──
    // Orange horizontal/vertical lines with tick marks at the gap boundaries.
    // Only consider objects within a reasonable distance (500 canvas px) to reduce jumps.
    const MAX_SPACING_DIST = 500;
    const nearbyX = otherRects.filter(r => Math.abs(r.oCx - tCx) < MAX_SPACING_DIST);
    const nearbyY = otherRects.filter(r => Math.abs(r.oCy - tCy) < MAX_SPACING_DIST);
    const sortedX = [...nearbyX].sort((a, b) => a.oL - b.oL);
    const sortedY = [...nearbyY].sort((a, b) => a.oT - b.oT);

    // Helper: build X-spacing guides (two horizontal segments, one per gap, with end ticks)
    function xSpacingGuides(
      gap1L: number, gap1R: number,
      gap2L: number, gap2R: number,
      topY: number, botY: number,
    ): GuideSpec[] {
      const midY = (topY + botY) / 2;
      const g: GuideSpec[] = [];
      if (gap1R > gap1L) {
        g.push(
          { x1: gap1L, y1: midY,   x2: gap1R, y2: midY,   color: "#f97316" },
          { x1: gap1L, y1: midY-4, x2: gap1L, y2: midY+4, color: "#f97316" },
          { x1: gap1R, y1: midY-4, x2: gap1R, y2: midY+4, color: "#f97316" },
        );
      }
      if (gap2R > gap2L) {
        g.push(
          { x1: gap2L, y1: midY,   x2: gap2R, y2: midY,   color: "#f97316" },
          { x1: gap2L, y1: midY-4, x2: gap2L, y2: midY+4, color: "#f97316" },
          { x1: gap2R, y1: midY-4, x2: gap2R, y2: midY+4, color: "#f97316" },
        );
      }
      return g;
    }

    function ySpacingGuides(
      gap1T: number, gap1B: number,
      gap2T: number, gap2B: number,
      leftX: number, rightX: number,
    ): GuideSpec[] {
      const midX = (leftX + rightX) / 2;
      const g: GuideSpec[] = [];
      if (gap1B > gap1T) {
        g.push(
          { x1: midX,   y1: gap1T, x2: midX,   y2: gap1B, color: "#f97316" },
          { x1: midX-4, y1: gap1T, x2: midX+4, y2: gap1T, color: "#f97316" },
          { x1: midX-4, y1: gap1B, x2: midX+4, y2: gap1B, color: "#f97316" },
        );
      }
      if (gap2B > gap2T) {
        g.push(
          { x1: midX,   y1: gap2T, x2: midX,   y2: gap2B, color: "#f97316" },
          { x1: midX-4, y1: gap2T, x2: midX+4, y2: gap2T, color: "#f97316" },
          { x1: midX-4, y1: gap2B, x2: midX+4, y2: gap2B, color: "#f97316" },
        );
      }
      return g;
    }

    // X-axis equal spacing — between consecutive pairs
    for (let i = 0; i < sortedX.length - 1; i++) {
      const A = sortedX[i], B = sortedX[i + 1];
      if (B.oL <= A.oR) continue; // objects overlap on X — no gap
      const totalGap = B.oL - A.oR - tW;
      if (totalGap < -enterThresh) continue; // target doesn't fit
      const gap     = Math.max(0, totalGap) / 2;
      const snapL   = A.oR + gap;
      const snapR   = snapL + tW;
      const topY    = Math.min(A.oT, B.oT, tT);
      const botY    = Math.max(A.oB, B.oB, tB);
      tryX(snapL - tL, xSpacingGuides(A.oR, snapL, snapR, B.oL, topY, botY));
    }
    // X-axis — target to the right of all objects (gap equals gap between last two)
    if (sortedX.length >= 2) {
      const A = sortedX[sortedX.length - 2], B = sortedX[sortedX.length - 1];
      const gapAB = B.oL - A.oR;
      if (gapAB > 0) {
        const snapL = B.oR + gapAB;
        const topY  = Math.min(B.oT, tT);
        const botY  = Math.max(B.oB, tB);
        tryX(snapL - tL, xSpacingGuides(B.oR, snapL, 0, 0, topY, botY));
      }
    }
    // X-axis — target to the left of all objects (gap equals gap between first two)
    if (sortedX.length >= 2) {
      const A = sortedX[0], B = sortedX[1];
      const gapAB = B.oL - A.oR;
      if (gapAB > 0) {
        const snapR = A.oL - gapAB;
        const snapL = snapR - tW;
        const topY  = Math.min(A.oT, tT);
        const botY  = Math.max(A.oB, tB);
        tryX(snapL - tL, xSpacingGuides(snapR, A.oL, 0, 0, topY, botY));
      }
    }

    // Y-axis equal spacing — between consecutive pairs
    for (let i = 0; i < sortedY.length - 1; i++) {
      const A = sortedY[i], B = sortedY[i + 1];
      if (B.oT <= A.oB) continue;
      const totalGap = B.oT - A.oB - tH;
      if (totalGap < -enterThresh) continue;
      const gap   = Math.max(0, totalGap) / 2;
      const snapT = A.oB + gap;
      const snapB = snapT + tH;
      const leftX  = Math.min(A.oL, B.oL, tL);
      const rightX = Math.max(A.oR, B.oR, tR);
      tryY(snapT - tT, ySpacingGuides(A.oB, snapT, snapB, B.oT, leftX, rightX));
    }
    // Y-axis — target below all objects
    if (sortedY.length >= 2) {
      const A = sortedY[sortedY.length - 2], B = sortedY[sortedY.length - 1];
      const gapAB = B.oT - A.oB;
      if (gapAB > 0) {
        const snapT  = B.oB + gapAB;
        const leftX  = Math.min(B.oL, tL);
        const rightX = Math.max(B.oR, tR);
        tryY(snapT - tT, ySpacingGuides(B.oB, snapT, 0, 0, leftX, rightX));
      }
    }
    // Y-axis — target above all objects
    if (sortedY.length >= 2) {
      const A = sortedY[0], B = sortedY[1];
      const gapAB = B.oT - A.oB;
      if (gapAB > 0) {
        const snapB = A.oT - gapAB;
        const snapT = snapB - tH;
        const leftX  = Math.min(A.oL, tL);
        const rightX = Math.max(A.oR, tR);
        tryY(snapT - tT, ySpacingGuides(snapB, A.oT, 0, 0, leftX, rightX));
      }
    }

    // ── Apply — at most one correction per axis ──
    // On FIRST snap entry: adjust Fabric's transform offset so the next
    // frame naturally lands on the snap point (eliminates trembling).
    // On RE-SNAP (same point): just set position, do NOT adjust offset.
    // This lets the pointer accumulate natural distance so the user can
    // eventually break free when the distance exceeds the exit threshold.
    if (bestDX !== null) {
      target.set("left", target.left + bestDX);
      const wasSnapped = snappedX !== null;
      snappedX = tCx + bestDX;
      // Only absorb into offset on FIRST entry — not when re-snapping
      if (!wasSnapped && e.transform) e.transform.offsetX -= bestDX;
    } else {
      snappedX = null;
    }
    if (bestDY !== null) {
      target.set("top", target.top + bestDY);
      const wasSnapped = snappedY !== null;
      snappedY = tCy + bestDY;
      if (!wasSnapped && e.transform) e.transform.offsetY -= bestDY;
    } else {
      snappedY = null;
    }
    target.setCoords();

    // ── Render guides (feature 1: skips redraw if unchanged) ──
    const allGuides: GuideSpec[] = [
      ...(bestDX !== null ? bestDXGuides : []),
      ...(bestDY !== null ? bestDYGuides : []),
    ];
    renderGuides(allGuides);

    // Keep shoot-zone label attached
    if (target._isShootZone && target._shootLabel) {
      target._shootLabel.set({ left: (target.left || 0) + 8, top: (target.top || 0) + 6 });
      target._shootLabel.setCoords();
    }
  });

  // ─────────────────── Feature 2: snap during object:scaling ───────────────────

  canvas.on("object:scaling", (e: any) => {
    const target = e.target;
    if (!target) return;

    // Keep shoot-zone label attached during resize
    if (target._isShootZone && target._shootLabel) {
      target._shootLabel.set({ left: (target.left || 0) + 8, top: (target.top || 0) + 6 });
      target._shootLabel.setCoords();
    }

    // Only snap for unrotated or perfectly axis-aligned (0/90/180/270°) objects.
    // For rotated objects the bounding-rect maths become ambiguous.
    const angle = ((target.angle || 0) % 360 + 360) % 360;
    if (angle !== 0 && angle !== 90 && angle !== 180 && angle !== 270) return;

    const corner = e.transform?.corner;
    if (!corner) return;

    const scale  = displayScaleRef?.current ?? 1;
    const thresh = SNAP_ENTER_CSS / scale;

    target.setCoords();
    const tb = target.getBoundingRect();
    const tL = tb.left;
    const tR = tb.left + tb.width;
    const tT = tb.top;
    const tB = tb.top  + tb.height;

    const movingLeft   = ["tl", "bl", "ml"].includes(corner);
    const movingRight  = ["tr", "br", "mr"].includes(corner);
    const movingTop    = ["tl", "tr", "mt"].includes(corner);
    const movingBottom = ["bl", "br", "mb"].includes(corner);

    let bestL: number | null = null, bestLAbs = thresh;
    let bestR: number | null = null, bestRAbs = thresh;
    let bestT: number | null = null, bestTAbs = thresh;
    let bestB: number | null = null, bestBAbs = thresh;

    // Each try function checks distance from the MOVING edge only —
    // prevents a snap point near the LEFT edge from being assigned
    // to bestR, which would cause scaleX to collapse to near-zero.
    function trySnapLeft(snapX: number) {
      const d = Math.abs(snapX - tL);
      if (d < bestLAbs) { bestLAbs = d; bestL = snapX; }
    }
    function trySnapRight(snapX: number) {
      const d = Math.abs(snapX - tR);
      if (d < bestRAbs) { bestRAbs = d; bestR = snapX; }
    }
    function trySnapTop(snapY: number) {
      const d = Math.abs(snapY - tT);
      if (d < bestTAbs) { bestTAbs = d; bestT = snapY; }
    }
    function trySnapBottom(snapY: number) {
      const d = Math.abs(snapY - tB);
      if (d < bestBAbs) { bestBAbs = d; bestB = snapY; }
    }

    // Canvas edges + centre
    const snapXs = [cL, cR, cCx];
    const snapYs = [cT, cB, cCy];
    if (movingLeft)   snapXs.forEach(x => trySnapLeft(x));
    if (movingRight)  snapXs.forEach(x => trySnapRight(x));
    if (movingTop)    snapYs.forEach(y => trySnapTop(y));
    if (movingBottom) snapYs.forEach(y => trySnapBottom(y));

    // Object edges + centres
    canvas.getObjects().forEach((obj: any) => {
      if (isExcluded(obj, target)) return;
      const ob = obj.getBoundingRect();
      const xs = [ob.left, ob.left + ob.width, ob.left + ob.width / 2];
      const ys = [ob.top,  ob.top  + ob.height, ob.top  + ob.height / 2];
      if (movingLeft)   xs.forEach(x => trySnapLeft(x));
      if (movingRight)  xs.forEach(x => trySnapRight(x));
      if (movingTop)    ys.forEach(y => trySnapTop(y));
      if (movingBottom) ys.forEach(y => trySnapBottom(y));
    });

    // Apply scale corrections (adjust scaleX/scaleY + left/top for anchor-opposite handles)
    // Safety: minimum visual size = 10px to prevent collapse/flip
    const MIN_VIS = 10;
    if (bestR !== null && movingRight) {
      const newW = bestR - tL;
      if (newW >= MIN_VIS) target.set("scaleX", newW / (target.width || 1));
    } else if (bestL !== null && movingLeft) {
      const newW = tR - bestL;
      if (newW >= MIN_VIS) target.set({ left: target.left + (bestL - tL), scaleX: newW / (target.width || 1) });
    }
    if (bestB !== null && movingBottom) {
      const newH = bestB - tT;
      if (newH >= MIN_VIS) target.set("scaleY", newH / (target.height || 1));
    } else if (bestT !== null && movingTop) {
      const newH = tB - bestT;
      if (newH >= MIN_VIS) target.set({ top: target.top + (bestT - tT), scaleY: newH / (target.height || 1) });
    }
    target.setCoords();

    // Draw guide lines for snapped edges
    const scaleGuides: GuideSpec[] = [];
    if (bestR !== null && movingRight)  scaleGuides.push({ x1: bestR, y1: cT, x2: bestR, y2: cB });
    if (bestL !== null && movingLeft)   scaleGuides.push({ x1: bestL, y1: cT, x2: bestL, y2: cB });
    if (bestB !== null && movingBottom) scaleGuides.push({ x1: cL,    y1: bestB, x2: cR, y2: bestB });
    if (bestT !== null && movingTop)    scaleGuides.push({ x1: cL,    y1: bestT, x2: cR, y2: bestT });
    renderGuides(scaleGuides);
  });

  // ─────────────────── Rotation snap (Shift = 15° increments) ───────────────────

  canvas.on("object:rotating", (e: any) => {
    if (!e.e?.shiftKey) return;
    const target = e.target;
    if (!target) return;
    const SNAP_DEG = 15;
    target.set("angle", Math.round((target.angle || 0) / SNAP_DEG) * SNAP_DEG);
  });

  // ─────────────────── cleanup ───────────────────

  canvas.on("object:modified", () => {
    clearGuidelines();
    snappedX = null;
    snappedY = null;
  });

  canvas.on("mouse:up", () => {
    clearGuidelines();
    snappedX = null;
    snappedY = null;
    dragState = null;
  });
}
