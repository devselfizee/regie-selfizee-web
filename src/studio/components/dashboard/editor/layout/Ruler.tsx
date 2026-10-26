"use client";

import { useRef, useEffect, useState } from "react";
import { RULER_SIZE } from "../types";

/* ═══════════════════════════════════════════════════════════════
   Ruler — pixel ruler for top and left sides of the canvas.
   Supports drag-to-create custom guides.
   ═══════════════════════════════════════════════════════════════ */

interface RulerProps {
  axis: "x" | "y";
  canvasLength: number;
  scale: number;
  offset: number;
  /** Offset along the perpendicular axis — used to convert mouse position to canvas coords when creating guides. */
  guideOffset: number;
  totalSize: number;
  /** Multiplier applied to displayed tick values so the ruler reflects the
   *  final export resolution (e.g. 1844 px) instead of the internal CANVAS_BASE. */
  valueScale?: number;
  /** Custom guide positions (in canvas-space pixels) on this ruler's axis.
   *  Each one gets a red label on the ruler graduation at its position. */
  guidePositions?: number[];
  onAddGuide: (pos: number, setIndex?: (idx: number) => void) => void;
  onUpdateGuide: (index: number, pos: number) => void;
  onRemoveGuide: (index: number) => void;
}

export function Ruler({ axis, canvasLength, scale, offset, guideOffset, totalSize, valueScale = 1, guidePositions, onAddGuide, onUpdateGuide, onRemoveGuide }: RulerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Track DPR so the ruler re-renders when the window moves between
  // retina and non-retina screens (otherwise ticks stay blurry until
  // the next canvas dimension change).
  const [dpr, setDpr] = useState<number>(() => (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1));

  useEffect(() => {
    if (typeof window === "undefined") return;
    // matchMedia with a fractional resolution query is the reliable way
    // to observe DPR changes (e.g. dragging between monitors).
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const listener = () => setDpr(window.devicePixelRatio || 1);
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", listener);
      return () => mq.removeEventListener("change", listener);
    } else if (typeof (mq as any).addListener === "function") {
      // Legacy Safari (<14)
      (mq as any).addListener(listener);
      return () => (mq as any).removeListener(listener);
    }
  }, []);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const w = axis === "x" ? totalSize : RULER_SIZE;
    const h = axis === "x" ? RULER_SIZE : totalSize;
    cvs.width = w * dpr;
    cvs.height = h * dpr;
    cvs.style.width = `${w}px`;
    cvs.style.height = `${h}px`;
    const ctx = cvs.getContext("2d")!;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(0, 0, w, h);

    ctx.font = "9px system-ui, sans-serif";

    // Target tick steps in DISPLAYED units (so 100/200/500 read the same
    // regardless of valueScale). We divide by valueScale to get canvas-space
    // spacing used for positioning.
    let majorDisplayStep = 100;
    if (scale < 0.3) majorDisplayStep = 500;
    else if (scale < 0.6) majorDisplayStep = 200;
    else if (scale > 2) majorDisplayStep = 50;
    if (valueScale > 1.5) majorDisplayStep *= 2;
    const majorStep = majorDisplayStep / valueScale;
    const minorStep = majorStep / 5;

    const startPx = -Math.ceil(offset / (minorStep * scale)) * minorStep;
    const endPx = canvasLength + Math.ceil((totalSize - offset - canvasLength * scale) / (minorStep * scale)) * minorStep;

    for (let px = startPx; px <= endPx; px += minorStep) {
      const screenPos = offset + px * scale;
      if (screenPos < -1 || screenPos > totalSize + 1) continue;

      // Use small epsilon comparison since majorStep may be fractional when valueScale != 1.
      const isMajor = Math.abs((px / majorStep) - Math.round(px / majorStep)) < 0.001 && px >= -0.001;
      const isMid = Math.abs((px / (majorStep / 2)) - Math.round(px / (majorStep / 2))) < 0.001;
      const tickLen = (isMajor && px >= 0) ? RULER_SIZE * 0.6 : isMid ? RULER_SIZE * 0.35 : RULER_SIZE * 0.18;

      ctx.beginPath();
      if (axis === "x") {
        ctx.moveTo(screenPos, RULER_SIZE);
        ctx.lineTo(screenPos, RULER_SIZE - tickLen);
      } else {
        ctx.moveTo(RULER_SIZE, screenPos);
        ctx.lineTo(RULER_SIZE - tickLen, screenPos);
      }
      ctx.strokeStyle = (isMajor && px >= 0) ? "#888" : "#ccc";
      ctx.lineWidth = (isMajor && px >= 0) ? 1 : 0.5;
      ctx.stroke();

      if (isMajor && px >= 0) {
        ctx.fillStyle = "#555";
        const label = String(Math.round(px * valueScale));
        if (axis === "x") {
          ctx.textAlign = "center";
          ctx.fillText(label, screenPos, 9);
        } else {
          ctx.save();
          ctx.translate(9, screenPos);
          ctx.rotate(-Math.PI / 2);
          ctx.textAlign = "center";
          ctx.fillText(label, 0, 0);
          ctx.restore();
        }
      }
    }

    ctx.strokeStyle = "#ddd";
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (axis === "x") {
      ctx.moveTo(0, RULER_SIZE - 0.5);
      ctx.lineTo(w, RULER_SIZE - 0.5);
    } else {
      ctx.moveTo(RULER_SIZE - 0.5, 0);
      ctx.lineTo(RULER_SIZE - 0.5, h);
    }
    ctx.stroke();

    // ── Custom guide markers ──
    // For every custom guide on this axis, draw a short red tick + the
    // guide's pixel position label IN RED on the corresponding ruler
    // graduation. Mirrors a Photoshop/Illustrator-style guide readout so
    // users can see precisely where each guide sits without hunting for
    // a chip floating in the canvas.
    if (Array.isArray(guidePositions) && guidePositions.length > 0) {
      ctx.font = "bold 10px system-ui, sans-serif";
      for (const guidePos of guidePositions) {
        const screenPos = offset + guidePos * scale;
        if (screenPos < -1 || screenPos > totalSize + 1) continue;
        ctx.strokeStyle = "#4f46e5";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (axis === "x") {
          ctx.moveTo(screenPos, RULER_SIZE);
          ctx.lineTo(screenPos, 0);
        } else {
          ctx.moveTo(RULER_SIZE, screenPos);
          ctx.lineTo(0, screenPos);
        }
        ctx.stroke();
        const label = `${Math.round(guidePos * valueScale)}px`;
        ctx.fillStyle = "#4f46e5";
        if (axis === "x") {
          // Background plate for legibility against the tick noise
          const labelW = ctx.measureText(label).width + 4;
          ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
          ctx.fillRect(screenPos - labelW / 2, 0, labelW, RULER_SIZE - 2);
          ctx.fillStyle = "#4f46e5";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(label, screenPos, RULER_SIZE / 2);
        } else {
          ctx.save();
          ctx.translate(RULER_SIZE / 2, screenPos);
          ctx.rotate(-Math.PI / 2);
          const labelW = ctx.measureText(label).width + 4;
          ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
          ctx.fillRect(-labelW / 2, -RULER_SIZE / 2 + 1, labelW, RULER_SIZE - 2);
          ctx.fillStyle = "#4f46e5";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(label, 0, 0);
          ctx.restore();
        }
      }
    }
  }, [axis, canvasLength, scale, offset, totalSize, dpr, valueScale, guidePositions]);

  return (
    <canvas
      ref={canvasRef}
      className="flex-shrink-0 select-none block"
      style={{ cursor: axis === "x" ? "row-resize" : "col-resize" }}
      title={axis === "x" ? "Glisser pour créer un repère horizontal" : "Glisser pour créer un repère vertical"}
      onMouseDown={(e) => {
        e.preventDefault();
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        // Convert mouse position into design-area coordinates.
        // `offset` is the CSS-space distance from the ruler's inner edge
        // to the top-left of the design area (canvas minus bleed). It
        // already includes `BLEED_PX * scale`. Subtracting it lands the
        // guide on the pixel the user actually clicked, regardless of
        // where the canvas is positioned in the container (flex centring
        // means offset is almost never zero).
        const toCanvasPos = (clientX: number, clientY: number) =>
          axis === "x"
            ? Math.round((clientY - rect.bottom - guideOffset) / scale)
            : Math.round((clientX - rect.right - guideOffset) / scale);
        const canvasPos = toCanvasPos(e.clientX, e.clientY);
        const guideIndex = { current: -1 };
        onAddGuide(canvasPos, (idx: number) => { guideIndex.current = idx; });

        const onMouseMove = (ev: MouseEvent) => {
          onUpdateGuide(guideIndex.current, toCanvasPos(ev.clientX, ev.clientY));
        };
        const onMouseUp = () => {
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
        };
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      }}
    />
  );
}
