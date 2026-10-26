"use client";

import { useCallback } from "react";
import { getCheckerCanvas, makeFreedrawCursor } from "../canvas/canvasUtils";
import { useEditorStore } from "../store/editorStore";
import {
  type PenPoint,
  type PenToolState,
  createInitialPenState,
  buildPreviewPath,
  createFabricPath,
  isNearFirstPoint,
  mirrorHandle,
  CURSOR_PEN_TOOL,
  CURSOR_PEN_CLOSE,
  CURSOR_PEN_ALT,
} from "../tools/PenTool";

// Parse CSS shadow string to Fabric.Shadow — handles "0 0 15px #color", "2px 2px 4px rgba(...)", etc.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseShadowString(fabric: any, val: string): any {
  // Match: offsetX offsetY blur color (px optional on each value)
  const m = val.match(/([-\d.]+)(?:px)?\s+([-\d.]+)(?:px)?\s+([-\d.]+)(?:px)?\s+(.+)/);
  if (m) {
    return new fabric.Shadow({ offsetX: parseFloat(m[1]), offsetY: parseFloat(m[2]), blur: parseFloat(m[3]), color: m[4].trim() });
  }
  // Fallback: let Fabric try to parse it
  try { return new fabric.Shadow(val); } catch { return null; }
}

/* ═══════════════════════════════════════════════════════════════
   Shape factory hook — addText, addShape, applyGradientBg, addShootZone
   ═══════════════════════════════════════════════════════════════ */

interface UseShapeFactoryParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fabricRef: React.MutableRefObject<any>;
  canvasWidth: number;
  canvasHeight: number;
  BLEED_PX: number;
  displayScaleRef: React.MutableRefObject<number>;
  cleanupTools: () => void;
  setFreedrawActive: (v: boolean) => void;
  freedrawColor: string;
  freedrawWidth: number;
  setPenMode: (v: boolean) => void;
  setPenPointCount: (v: number | ((p: number) => number)) => void;
  penStateRef: React.MutableRefObject<PenToolState>;
  penPreviewRef: React.MutableRefObject<any>;
  penOverlayRef: React.MutableRefObject<any[]>;
  penMousePosRef: React.MutableRefObject<{ x: number; y: number } | null>;
  setBgColor: (v: string) => void;
}

export function useShapeFactory({
  fabricRef, canvasWidth, canvasHeight, BLEED_PX, displayScaleRef,
  cleanupTools, setFreedrawActive, freedrawColor, freedrawWidth,
  setPenMode, setPenPointCount, penStateRef, penPreviewRef, penOverlayRef, penMousePosRef,
  setBgColor,
}: UseShapeFactoryParams) {
  const addText = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (text = "Votre texte", fontSize = 32, fontWeight = "bold", fontFamily = "sans-serif", offsetY = 0, extraProps?: Record<string, any>) => {
      const fabric = await import("fabric");
      const canvas = fabricRef.current;
      if (!canvas) return;
      const baseProps: Record<string, any> = {
        left: BLEED_PX + canvasWidth / 2,
        top: BLEED_PX + canvasHeight / 2 + offsetY,
        originX: "center",
        originY: "center",
        fontSize,
        fontFamily,
        fill: "#1a1a2e",
        fontWeight,
        editable: true,
        width: canvasWidth * 0.6,
        textAlign: "center",
      };
      // Apply extra style props (shadow, stroke, etc.)
      if (extraProps) {
        for (const [key, val] of Object.entries(extraProps)) {
          if (key === "shadow" && typeof val === "string") {
            baseProps.shadow = parseShadowString(fabric, val);
          } else {
            baseProps[key] = val;
          }
        }
      }
      const t = new fabric.Textbox(text, baseProps);
      canvas.add(t);
      canvas.setActiveObject(t);
      canvas.requestRenderAll();
    },
    [canvasWidth, canvasHeight]
  );


  const addShape = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (type: string, options?: any) => {
      const fabric = await import("fabric");
      const canvas = fabricRef.current;
      if (!canvas) return;

      const cx = BLEED_PX + canvasWidth / 2;
      const cy = BLEED_PX + canvasHeight / 2;
      const size = Math.min(canvasWidth, canvasHeight) * 0.15;
      const defaultProps = { left: cx, top: cy, originX: "center" as const, originY: "center" as const, fill: "#3b82f6", stroke: "#1e3a5f", strokeWidth: 0 };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let obj: any;

      switch (type) {
        case "rect":
          obj = new fabric.Rect({ ...defaultProps, width: size * 1.5, height: size });
          obj._ratioLocked = false;
          break;
        case "rounded-rect": {
          const widthRatio = typeof options?.widthRatio === "number" ? Math.max(0.3, Math.min(3, options.widthRatio)) : 1.5;
          const w = size * widthRatio;
          const h = size;
          const radiusRatio = typeof options?.radiusRatio === "number" ? Math.max(0, Math.min(0.5, options.radiusRatio)) : 0.2;
          const r = Math.min(w, h) * radiusRatio;
          obj = new fabric.Rect({
            ...defaultProps,
            width: w, height: h, rx: r, ry: r,
            ...(options?.fill ? { fill: options.fill } : {}),
          });
          obj._ratioLocked = false;
          break;
        }
        case "circle":
          obj = new fabric.Circle({ ...defaultProps, radius: size * 0.7 });
          break;
        case "ellipse":
          obj = new fabric.Ellipse({ ...defaultProps, rx: size * 0.8, ry: size * 0.5 });
          break;
        case "triangle":
          obj = new fabric.Triangle({ ...defaultProps, width: size * 1.3, height: size * 1.2 });
          break;
        case "line":
          obj = new fabric.Line([cx - size, cy, cx + size, cy], { stroke: "#1a1a2e", strokeWidth: 4, originX: "center", originY: "center" });
          break;
        case "arrow": {
          const pts = [
            { x: -size, y: 0 }, { x: size * 0.4, y: 0 },
            { x: size * 0.4, y: -size * 0.25 }, { x: size, y: 0 },
            { x: size * 0.4, y: size * 0.25 }, { x: size * 0.4, y: 0 },
          ];
          obj = new fabric.Polygon(pts, { ...defaultProps, fill: "#1a1a2e", left: cx, top: cy });
          break;
        }
        case "diamond": {
          const d = size * 0.8;
          const pts = [{ x: 0, y: -d }, { x: d, y: 0 }, { x: 0, y: d }, { x: -d, y: 0 }];
          obj = new fabric.Polygon(pts, { ...defaultProps, left: cx, top: cy });
          break;
        }
        case "polygon": {
          const sides = Math.max(3, Math.min(20, options?.sides || 5));
          const rotationRad = ((options?.rotation || 0) * Math.PI) / 180;
          const r = size * 0.7;
          const pts = Array.from({ length: sides }, (_, i) => ({
            x: r * Math.cos((2 * Math.PI / sides) * i - Math.PI / 2 + rotationRad),
            y: r * Math.sin((2 * Math.PI / sides) * i - Math.PI / 2 + rotationRad),
          }));
          obj = new fabric.Polygon(pts, {
            ...defaultProps,
            left: cx, top: cy,
            ...(options?.fill ? { fill: options.fill } : {}),
          });
          break;
        }
        case "hexagon": {
          const r = size * 0.7;
          const pts = Array.from({ length: 6 }, (_, i) => ({
            x: r * Math.cos((Math.PI / 3) * i - Math.PI / 6),
            y: r * Math.sin((Math.PI / 3) * i - Math.PI / 6),
          }));
          obj = new fabric.Polygon(pts, { ...defaultProps, left: cx, top: cy });
          break;
        }
        case "star": {
          const numPoints = Math.max(3, Math.min(20, options?.points || 5));
          const outer = size * 0.8;
          const ratio = typeof options?.innerRatio === "number"
            ? Math.max(0.1, Math.min(0.95, options.innerRatio))
            : 0.4375; // legacy 0.35/0.8
          const inner = outer * ratio;
          const rotationRad = ((options?.rotation || 0) * Math.PI) / 180;
          const pts = Array.from({ length: numPoints * 2 }, (_, i) => {
            const r2 = i % 2 === 0 ? outer : inner;
            const angle = (Math.PI / numPoints) * i - Math.PI / 2 + rotationRad;
            return { x: r2 * Math.cos(angle), y: r2 * Math.sin(angle) };
          });
          obj = new fabric.Polygon(pts, {
            ...defaultProps,
            left: cx, top: cy,
            fill: options?.fill || "#f59e0b",
          });
          break;
        }
        case "cross": {
          const s = size * 0.7;
          const t = s * 0.35;
          const pts = [
            { x: -t, y: -s }, { x: t, y: -s }, { x: t, y: -t }, { x: s, y: -t },
            { x: s, y: t }, { x: t, y: t }, { x: t, y: s }, { x: -t, y: s },
            { x: -t, y: t }, { x: -s, y: t }, { x: -s, y: -t }, { x: -t, y: -t },
          ];
          obj = new fabric.Polygon(pts, { ...defaultProps, left: cx, top: cy });
          break;
        }
        case "cross-thin": {
          const s2 = size * 0.7;
          const t2 = s2 * 0.15;
          const pts = [
            { x: -t2, y: -s2 }, { x: t2, y: -s2 }, { x: t2, y: -t2 }, { x: s2, y: -t2 },
            { x: s2, y: t2 }, { x: t2, y: t2 }, { x: t2, y: s2 }, { x: -t2, y: s2 },
            { x: -t2, y: t2 }, { x: -s2, y: t2 }, { x: -s2, y: -t2 }, { x: -t2, y: -t2 },
          ];
          obj = new fabric.Polygon(pts, { ...defaultProps, left: cx, top: cy });
          break;
        }
        case "triangle-right": {
          const d2 = size * 0.8;
          const pts = [{ x: -d2, y: -d2 }, { x: d2, y: 0 }, { x: -d2, y: d2 }];
          obj = new fabric.Polygon(pts, { ...defaultProps, fill: "#f59e0b", left: cx, top: cy });
          break;
        }
        case "arrow-fat": {
          const a = size * 0.8;
          const pts = [
            { x: -a, y: -a * 0.35 }, { x: a * 0.3, y: -a * 0.35 }, { x: a * 0.3, y: -a * 0.6 },
            { x: a, y: 0 },
            { x: a * 0.3, y: a * 0.6 }, { x: a * 0.3, y: a * 0.35 }, { x: -a, y: a * 0.35 },
          ];
          obj = new fabric.Polygon(pts, { ...defaultProps, fill: "#0891b2", left: cx, top: cy });
          break;
        }
        case "star4": {
          const r4 = size * 0.8;
          const r4i = r4 * 0.3;
          const pts = Array.from({ length: 8 }, (_, i) => {
            const cr = i % 2 === 0 ? r4 : r4i;
            const angle = (Math.PI / 4) * i - Math.PI / 2;
            return { x: cr * Math.cos(angle), y: cr * Math.sin(angle) };
          });
          obj = new fabric.Polygon(pts, { ...defaultProps, fill: "#f59e0b", left: cx, top: cy });
          break;
        }
        case "line-diagonal":
          obj = new fabric.Line([cx - size, cy + size, cx + size, cy - size], { stroke: "#1a1a2e", strokeWidth: 4, originX: "center", originY: "center" });
          break;
        case "freedraw": {
          cleanupTools();
          setFreedrawActive(true);
          const { freedrawBrushType, freedrawPathsRef } = useEditorStore.getState();
          freedrawPathsRef.current = [];
          // Create brush based on type
          let brush: any;
          switch (freedrawBrushType) {
            case "circle":
              brush = new fabric.CircleBrush(canvas);
              brush.color = freedrawColor;
              brush.width = freedrawWidth;
              break;
            case "spray":
              brush = new fabric.SprayBrush(canvas);
              brush.color = freedrawColor;
              brush.width = freedrawWidth * 3;
              brush.density = 15;
              break;
            case "marker": {
              brush = new fabric.PencilBrush(canvas);
              // Marker = semi-transparent wider stroke with round caps.
              // Normalize short hex (#fff) to 6-digit first — slice(5,7)
              // on "#fff" produces "" and parseInt returns NaN → crash.
              let hex = freedrawColor;
              if (/^#[0-9a-f]{3}$/i.test(hex)) {
                hex = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
              }
              const r = parseInt(hex.slice(1, 3), 16) || 0;
              const g = parseInt(hex.slice(3, 5), 16) || 0;
              const b = parseInt(hex.slice(5, 7), 16) || 0;
              brush.color = `rgba(${r},${g},${b},0.4)`;
              brush.width = freedrawWidth * 3;
              brush.strokeLineCap = "round";
              brush.strokeLineJoin = "round";
              break;
            }
            case "calligraphy": {
              brush = new fabric.PencilBrush(canvas);
              brush.color = freedrawColor;
              brush.width = freedrawWidth;
              brush.strokeLineCap = "butt";
              brush.strokeLineJoin = "bevel";
              break;
            }
            case "pencil":
            default:
              brush = new fabric.PencilBrush(canvas);
              brush.color = freedrawColor;
              brush.width = freedrawWidth;
              break;
          }
          canvas.freeDrawingBrush = brush;
          canvas.isDrawingMode = true;
          const cursor = makeFreedrawCursor(freedrawWidth * (freedrawBrushType === "marker" ? 3 : freedrawBrushType === "spray" ? 3 : 1), freedrawColor);
          canvas.defaultCursor = cursor;
          canvas.freeDrawingCursor = cursor;
          // Discard selection so objects don't interfere
          canvas.discardActiveObject();
          canvas.selection = false;
          // Track paths created during this session
          canvas.off("path:created", (canvas as any)._freedrawPathHandler);
          const pathHandler = (e: any) => {
            if (e.path) {
              e.path._isFreedrawPath = true;
              freedrawPathsRef.current.push(e.path);
            }
          };
          (canvas as any)._freedrawPathHandler = pathHandler;
          canvas.on("path:created", pathHandler);
          canvas.requestRenderAll();
          return;
        }
        case "pen":
        case "pen-straight": {
          // Bézier pen tool — Photoshop-style
          // "pen" mode: click+drag ALWAYS creates smooth curves (default)
          // "pen-straight" mode: click creates corners (straight lines only)
          // In both modes: click on first point closes the path
          // Ctrl/Cmd while dragging: break handle symmetry (independent handles)
          const smoothMode = type === "pen";
          // Ensure mutual exclusion: deactivate any other active tool
          cleanupTools();
          setPenMode(true);
          setPenPointCount(0);
          penStateRef.current = { ...createInitialPenState(), active: true };
          penMousePosRef.current = null;
          canvas.defaultCursor = CURSOR_PEN_TOOL;
          canvas.hoverCursor = CURSOR_PEN_TOOL;
          canvas.selection = false;
          canvas.skipTargetFind = true; // Prevent fabric from highlighting/selecting objects on click
          // Disable all objects so clicks don't select them during pen mode
          canvas.discardActiveObject();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          canvas.getObjects().forEach((o: any) => {
            o._penSavedEvented = o.evented;
            o._penSavedSelectable = o.selectable;
            o.evented = false;
            o.selectable = false;
          });
          // Remove any existing preview / overlay
          if (penPreviewRef.current) { canvas.remove(penPreviewRef.current); penPreviewRef.current = null; }
          penOverlayRef.current.forEach((o: any) => canvas.remove(o));
          penOverlayRef.current = [];

          let isDragging = false;
          let dragStartPos: { x: number; y: number } | null = null;
          let hasDragged = false;
          let previewRafId = 0;
          // Track any nested alt-drag listeners attached to document so
          // finishPath can remove them too (they live in a closure inside
          // the mouse:down handler below and would otherwise leak if the
          // user presses Escape mid-drag).
          const altDragInListeners: Array<() => void> = [];

          const updatePreview = () => {
            // Throttle via requestAnimationFrame to avoid 60+ redraws/second
            if (previewRafId) cancelAnimationFrame(previewRafId);
            previewRafId = requestAnimationFrame(_doUpdatePreview);
          };
          const _doUpdatePreview = () => {
            if (penPreviewRef.current) { canvas.remove(penPreviewRef.current); penPreviewRef.current = null; }
            const st = penStateRef.current;
            const preview = buildPreviewPath(fabric, st.points, st.closed, penMousePosRef.current, displayScaleRef.current || 1);
            if (preview) {
              penPreviewRef.current = preview;
              canvas.add(preview);
            }
            // Draw anchor dots + handles for placed points
            penOverlayRef.current.forEach((o: any) => canvas.remove(o));
            penOverlayRef.current = [];
            const s = displayScaleRef.current || 1;
            for (let i = 0; i < st.points.length; i++) {
              const pt = st.points[i];
              const isFirst = i === 0;
              // Draw handle lines + circles
              const drawHandle = (h: { x: number; y: number }) => {
                const hl = new fabric.Line([pt.x, pt.y, h.x, h.y], {
                  stroke: "#4f46e5", strokeWidth: 1.2 / s,
                  selectable: false, evented: false, _isPenOverlay: true,
                });
                const hc = new fabric.Circle({
                  left: h.x, top: h.y, radius: 3.5 / s,
                  fill: "#4f46e5", stroke: "#fff", strokeWidth: 1 / s,
                  originX: "center", originY: "center",
                  selectable: false, evented: false, _isPenOverlay: true,
                });
                penOverlayRef.current.push(hl, hc);
                canvas.add(hl);
                canvas.add(hc);
              };
              if (pt.handleOut) drawHandle(pt.handleOut);
              if (pt.handleIn) drawHandle(pt.handleIn);
              // Anchor: circle for smooth, square for corner
              const isSmooth = pt.handleIn || pt.handleOut;
              const sz = (isFirst ? 10 : 7) / s;
              let dot;
              if (isSmooth) {
                dot = new fabric.Circle({
                  left: pt.x, top: pt.y, radius: sz / 2,
                  fill: isFirst ? "#ffffff" : "#4f46e5",
                  stroke: "#4f46e5", strokeWidth: 2 / s,
                  originX: "center", originY: "center",
                  selectable: false, evented: false, _isPenOverlay: true,
                });
              } else {
                dot = new fabric.Rect({
                  left: pt.x, top: pt.y, width: sz, height: sz,
                  fill: isFirst ? "#ffffff" : "#4f46e5",
                  stroke: "#4f46e5", strokeWidth: 2 / s,
                  originX: "center", originY: "center",
                  selectable: false, evented: false, _isPenOverlay: true,
                });
              }
              penOverlayRef.current.push(dot);
              canvas.add(dot);
            }
            canvas.requestRenderAll();
          };

          const finishPath = (closed: boolean) => {
            // Cancel any pending preview RAF so it can't re-add overlay
            // objects after we've removed them below.
            if (previewRafId) {
              cancelAnimationFrame(previewRafId);
              previewRafId = 0;
            }
            // Remove nested alt-drag listeners that were attached mid-drag
            // (their closures hold their own refs, tracked via
            // altDragInListeners) before they fire after cleanup.
            while (altDragInListeners.length) {
              const off = altDragInListeners.pop();
              try { off?.(); } catch { /* ignore */ }
            }
            // Remove all event listeners (canvas + document)
            canvas.off("mouse:down", onMouseDown);
            canvas.off("mouse:move", onMouseMove);
            canvas.off("mouse:up", onMouseUp);
            canvas.off("mouse:dblclick", onDblClick);
            document.removeEventListener("mousemove", onNativeDragMove);
            document.removeEventListener("mouseup", onNativeDragEnd);
            document.removeEventListener("mousemove", onAltDragMove);
            document.removeEventListener("mouseup", onAltDragEnd);
            if ((canvas as any)._penKeyHandler) {
              document.removeEventListener("keydown", (canvas as any)._penKeyHandler);
              delete (canvas as any)._penKeyHandler;
            }
            // Drop the cancel handle we exposed for external callers
            delete (canvas as any)._penCancel;
            if (penPreviewRef.current) { canvas.remove(penPreviewRef.current); penPreviewRef.current = null; }
            penOverlayRef.current.forEach((o: any) => canvas.remove(o));
            penOverlayRef.current = [];

            const st = penStateRef.current;
            if (st.points.length >= 2) {
              const path = createFabricPath(fabric, st.points, closed);
              if (path) {
                canvas.add(path);
                canvas.setActiveObject(path);
              }
            }
            penStateRef.current = createInitialPenState();
            setPenMode(false);
            setPenPointCount(0);
            canvas.defaultCursor = "default";
            canvas.hoverCursor = "move";
            canvas.selection = true;
            canvas.skipTargetFind = false;
            // Re-enable evented/selectable on all objects
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            canvas.getObjects().forEach((o: any) => {
              if (o._penSavedEvented !== undefined) {
                o.evented = o._penSavedEvented;
                delete o._penSavedEvented;
              }
              if (o._penSavedSelectable !== undefined) {
                o.selectable = o._penSavedSelectable;
                delete o._penSavedSelectable;
              }
            });
            canvas.requestRenderAll();
          };

          // Use native DOM events for drag detection (fabric.js may swallow mouse:move during drag)
          const canvasEl = canvas.upperCanvasEl as HTMLCanvasElement;

          const getPointer = (domEvent: MouseEvent) => {
            return canvas.getScenePoint(domEvent);
          };

          // ── Alt/Option handle adjustment state ──
          let adjustingHandle = false; // true when Alt+dragging a handle post-placement
          let adjustHandleIdx = -1;    // which point's handle we're adjusting

          const HANDLE_HIT_RADIUS = 12;
          const isNearHandle = (pointer: { x: number; y: number }, handle: { x: number; y: number } | null, s: number) => {
            if (!handle) return false;
            const dx = pointer.x - handle.x;
            const dy = pointer.y - handle.y;
            return Math.sqrt(dx * dx + dy * dy) < HANDLE_HIT_RADIUS / s;
          };

          const onNativeDragMove = (domEvent: MouseEvent) => {
            if (!isDragging || !dragStartPos) return;
            const pointer = getPointer(domEvent);
            const st = penStateRef.current;
            if (st.points.length === 0) return;

            const lastIdx = st.points.length - 1;
            const pt = st.points[lastIdx];
            const dx = pointer.x - dragStartPos.x;
            const dy = pointer.y - dragStartPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (smoothMode && dist > 2) {
              hasDragged = true;
              pt.handleOut = { x: pointer.x, y: pointer.y };
              // Always symmetric during initial placement drag
              pt.handleIn = mirrorHandle(pt, pt.handleOut);
            }
            penMousePosRef.current = null;
            updatePreview();
          };

          const onNativeDragEnd = (domEvent: MouseEvent) => {
            if (isDragging) {
              const pointer = getPointer(domEvent);
              penMousePosRef.current = pointer;
            }
            isDragging = false;
            dragStartPos = null;
            hasDragged = false;
            document.removeEventListener("mousemove", onNativeDragMove);
            document.removeEventListener("mouseup", onNativeDragEnd);
            updatePreview();
          };

          // ── Alt+drag handle adjustment (post-placement, like Photoshop) ──
          const onAltDragMove = (domEvent: MouseEvent) => {
            if (!adjustingHandle || adjustHandleIdx < 0) return;
            const pointer = getPointer(domEvent);
            const st = penStateRef.current;
            const pt = st.points[adjustHandleIdx];
            if (!pt) return;
            // Move only handleOut — handleIn stays frozen
            pt.handleOut = { x: pointer.x, y: pointer.y };
            penMousePosRef.current = null;
            updatePreview();
          };

          const onAltDragEnd = () => {
            adjustingHandle = false;
            adjustHandleIdx = -1;
            document.removeEventListener("mousemove", onAltDragMove);
            document.removeEventListener("mouseup", onAltDragEnd);
            updatePreview();
          };

          const onMouseDown = (e: any) => {
            if (e.e.button !== 0) return;
            // Prevent fabric.js from creating a rubber-band selection rectangle
            e.e.stopPropagation?.();
            const pointer = canvas.getScenePoint(e.e);
            const st = penStateRef.current;
            const s = displayScaleRef.current || 1;

            // ── Alt/Option + click on a handle = adjust independently ──
            if (e.e.altKey && st.points.length > 0) {
              // Check if clicking near any handle of the last placed point
              const lastIdx = st.points.length - 1;
              const lastPt = st.points[lastIdx];
              if (isNearHandle(pointer, lastPt.handleOut, s) || isNearHandle(pointer, lastPt.handleIn, s)) {
                adjustingHandle = true;
                adjustHandleIdx = lastIdx;
                // If clicking handleIn, swap: we'll adjust what becomes the "out" direction
                if (isNearHandle(pointer, lastPt.handleIn, s) && !isNearHandle(pointer, lastPt.handleOut, s)) {
                  // User clicked handleIn — adjust handleIn independently
                  const onAltDragMoveIn = (domEvent: MouseEvent) => {
                    const p = getPointer(domEvent);
                    lastPt.handleIn = { x: p.x, y: p.y };
                    penMousePosRef.current = null;
                    updatePreview();
                  };
                  const detachIn = () => {
                    document.removeEventListener("mousemove", onAltDragMoveIn);
                    document.removeEventListener("mouseup", onAltDragEndIn);
                  };
                  const onAltDragEndIn = () => {
                    adjustingHandle = false;
                    adjustHandleIdx = -1;
                    detachIn();
                    // Drop the tracker entry so finishPath doesn't double-off
                    const i = altDragInListeners.indexOf(detachIn);
                    if (i >= 0) altDragInListeners.splice(i, 1);
                    updatePreview();
                  };
                  document.addEventListener("mousemove", onAltDragMoveIn);
                  document.addEventListener("mouseup", onAltDragEndIn);
                  // Track this listener pair so finishPath (Escape etc)
                  // can detach them even if mouseup never fires.
                  altDragInListeners.push(detachIn);
                } else {
                  document.addEventListener("mousemove", onAltDragMove);
                  document.addEventListener("mouseup", onAltDragEnd);
                }
                return; // Don't place a new point
              }
            }

            // ── Close path on first point ──
            if (isNearFirstPoint(st.points, pointer, s)) {
              finishPath(true);
              return;
            }

            // ── Place new point ──
            const newPoint: PenPoint = {
              x: pointer.x, y: pointer.y,
              handleIn: null, handleOut: null,
            };
            st.points.push(newPoint);
            isDragging = true;
            hasDragged = false;
            dragStartPos = { x: pointer.x, y: pointer.y };
            setPenPointCount(st.points.length);
            updatePreview();

            document.addEventListener("mousemove", onNativeDragMove);
            document.addEventListener("mouseup", onNativeDragEnd);
          };

          const onMouseMove = (e: any) => {
            if (isDragging || adjustingHandle) {
              e.e.preventDefault?.();
              return;
            }
            const pointer = canvas.getScenePoint(e.e);
            const st = penStateRef.current;
            const s = displayScaleRef.current || 1;

            // Alt/Option held = show adjust cursor near handles
            if (e.e.altKey && st.points.length > 0) {
              const lastPt = st.points[st.points.length - 1];
              if (isNearHandle(pointer, lastPt.handleOut, s) || isNearHandle(pointer, lastPt.handleIn, s)) {
                canvas.defaultCursor = CURSOR_PEN_ALT;
                penMousePosRef.current = null; // Don't show preview line while hovering handle
                updatePreview();
                return;
              }
            }

            if (st.points.length >= 2 && isNearFirstPoint(st.points, pointer, s)) {
              canvas.defaultCursor = CURSOR_PEN_CLOSE;
            } else {
              canvas.defaultCursor = CURSOR_PEN_TOOL;
            }
            penMousePosRef.current = pointer;
            updatePreview();
          };

          const onMouseUp = () => {
            isDragging = false;
            dragStartPos = null;
            hasDragged = false;
          };

          const onDblClick = () => {
            // Double-click = finish open path
            // Remove the last point added by the double-click's mousedown
            const st = penStateRef.current;
            if (st.points.length > 1) {
              st.points.pop(); // remove duplicate from dblclick
              setPenPointCount(st.points.length);
            }
            finishPath(false);
          };

          // Keyboard: Backspace = undo last point, Escape = cancel
          const penKeyHandler = (e: KeyboardEvent) => {
            if (e.key === "Backspace" || e.key === "Delete") {
              e.preventDefault();
              const st = penStateRef.current;
              if (st.points.length > 0) {
                st.points.pop();
                setPenPointCount(st.points.length);
                updatePreview();
              }
            }
            if (e.key === "Escape") {
              e.preventDefault();
              finishPath(false);
            }
            if (e.key === "Enter") {
              e.preventDefault();
              if (penStateRef.current.points.length >= 2) {
                finishPath(false);
              }
            }
          };
          document.addEventListener("keydown", penKeyHandler);

          canvas.on("mouse:down", onMouseDown);
          canvas.on("mouse:move", onMouseMove);
          (canvas as any)._penMouseMove = onMouseMove;
          canvas.on("mouse:up", onMouseUp);
          canvas.on("mouse:dblclick", onDblClick);

          // Store keyHandler ref for cleanup
          (canvas as any)._penKeyHandler = penKeyHandler;
          // Expose finishPath so external cleanup (e.g. the toolbar
          // Cancel button in ToolModeToolbars.tsx) can tear down cleanly
          // instead of wiping all mouse:*/path:created listeners.
          (canvas as any)._penCancel = () => finishPath(false);
          return;
        }
      }

      if (obj) {
        obj.set({ selectable: true, evented: true });
        canvas.add(obj);
        obj.setCoords();
        canvas.setActiveObject(obj);
        canvas.requestRenderAll();
      }
    },
    [canvasWidth, canvasHeight]
  );


  const applyGradientBg = useCallback(
    async (
      colors: [string, string],
      directionOrAngle: "horizontal" | "vertical" | "diagonal" | number,
      gradientType: "linear" | "radial" = "linear"
    ) => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      const fabric = await import("fabric");

      // Remove legacy _isGradientBg objects (now merged into solidBg)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const legacyGrad = canvas.getObjects().filter((o: any) => o._isGradientBg);
      legacyGrad.forEach((o: any) => canvas.remove(o));

      // Find or create solidBg — gradient is applied as its fill (do NOT touch bgImage)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let solidBg = canvas.getObjects().find((o: any) => o._isSolidBg) as any;
      if (!solidBg) {
        solidBg = new fabric.Rect({
          left: BLEED_PX, top: BLEED_PX,
          width: canvasWidth, height: canvasHeight,
          originX: 'left', originY: 'top',
          selectable: false, evented: false, hoverCursor: "default",
        });
        (solidBg as any)._isSolidBg = true;
        canvas.add(solidBg);
      }
      solidBg.set({ width: canvasWidth, height: canvasHeight, left: BLEED_PX, top: BLEED_PX, scaleX: 1, scaleY: 1 });

      // Build gradient fill
      let gradientFill;
      if (gradientType === "radial") {
        gradientFill = new fabric.Gradient({
          type: "radial",
          coords: { x1: canvasWidth / 2, y1: canvasHeight / 2, r1: 0, x2: canvasWidth / 2, y2: canvasHeight / 2, r2: Math.max(canvasWidth, canvasHeight) / 2 },
          colorStops: [
            { offset: 0, color: colors[0] },
            { offset: 1, color: colors[1] },
          ],
        });
      } else {
        let coords;
        if (typeof directionOrAngle === "number") {
          const rad = (directionOrAngle * Math.PI) / 180;
          const cx = canvasWidth / 2;
          const cy = canvasHeight / 2;
          const len = Math.max(canvasWidth, canvasHeight);
          coords = {
            x1: cx - (Math.cos(rad) * len) / 2,
            y1: cy - (Math.sin(rad) * len) / 2,
            x2: cx + (Math.cos(rad) * len) / 2,
            y2: cy + (Math.sin(rad) * len) / 2,
          };
        } else {
          coords =
            directionOrAngle === "horizontal" ? { x1: 0, y1: 0, x2: canvasWidth, y2: 0 } :
            directionOrAngle === "vertical" ? { x1: 0, y1: 0, x2: 0, y2: canvasHeight } :
            { x1: 0, y1: 0, x2: canvasWidth, y2: canvasHeight };
        }
        gradientFill = new fabric.Gradient({
          type: "linear",
          coords,
          colorStops: [
            { offset: 0, color: colors[0] },
            { offset: 1, color: colors[1] },
          ],
        });
      }

      solidBg.set("fill", gradientFill);
      canvas.sendObjectToBack(solidBg);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dBg = canvas.getObjects().find((o: any) => o._isDesignAreaBg);
      if (dBg) canvas.sendObjectToBack(dBg);
      setBgColor("gradient");
      canvas.requestRenderAll();
      canvas.fire("object:modified", { target: solidBg, _historyLabel: "Dégradé appliqué" });
    },
    [canvasWidth, canvasHeight, BLEED_PX]
  );


  const addShootZone = useCallback(
    async (borderRadius = 0) => {
      const fabric = await import("fabric");
      const canvas = fabricRef.current;
      if (!canvas) return;

      // Count existing shoot zones for numbering
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingShoots = canvas.getObjects().filter((o: any) => o._isShootZone);
      const shootIndex = existingShoots.length + 1;

      const zoneW = canvasWidth * 0.4;
      const zoneH = canvasHeight * 0.5;

      // Offset position if there are already shoots (avoid stacking).
      // Wrap so we don't drift off-canvas after 10 shoots.
      const offsetX = (existingShoots.length % 10) * 30;
      const offsetY = (existingShoots.length % 10) * 30;

      const rect = new fabric.Rect({
        // Place in the design area, not the bleed margin: Fabric canvas
        // coords start at (0,0) of the BUFFER, so design origin is BLEED_PX.
        left: BLEED_PX + (canvasWidth - zoneW) / 2 + offsetX,
        top: BLEED_PX + (canvasHeight - zoneH) / 2 + offsetY,
        width: zoneW,
        height: zoneH,
        originX: 'left',
        originY: 'top',
        fill: new fabric.Pattern({ source: getCheckerCanvas(), repeat: "repeat" }),
        stroke: "",
        strokeWidth: 0,
        strokeUniform: true,
        rx: borderRadius,
        ry: borderRadius,
        selectable: true,
        evented: true,
        padding: 0,
        // Unlocked — user will likely want to reposition
        lockMovementX: false,
        lockMovementY: false,
        lockScalingX: false,
        lockScalingY: false,
        lockRotation: false,
        hasControls: true,
        hoverCursor: "move",
        objectCaching: false,
        noScaleCache: true,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (rect as any)._isShootZone = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (rect as any)._shootBorderRadius = borderRadius;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (rect as any)._shootLocked = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (rect as any)._shootIndex = shootIndex;
      canvas.add(rect);

      // Add shoot label (#1, #2, etc.)
      const label = new fabric.FabricText(`#${shootIndex}`, {
        left: BLEED_PX + (canvasWidth - zoneW) / 2 + offsetX + 8,
        top: BLEED_PX + (canvasHeight - zoneH) / 2 + offsetY + 6,
        originX: 'left',
        originY: 'top',
        fontSize: 16,
        fontFamily: "sans-serif",
        fontWeight: "bold",
        fill: "#4f46e5",
        selectable: false,
        evented: false,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (label as any)._isShootLabel = true;
      // Cross-link shoot ↔ label
      (rect as any)._shootLabel = label;
      (label as any)._shootZone = rect;
      canvas.add(label);

      // Also add labels to existing shoots that don't have them yet
      existingShoots.forEach((shoot: any, i: number) => {
        if (!shoot._shootIndex) shoot._shootIndex = i + 1;
        // Check if a label already exists for this shoot (by cross-reference or position)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hasLabel = shoot._shootLabel || canvas.getObjects().some((o: any) =>
          o._isShootLabel && o._shootZone === shoot
        );
        if (!hasLabel) {
          const existingLabel = new fabric.FabricText(`#${shoot._shootIndex}`, {
            left: (shoot.left || 0) + 8,
            top: (shoot.top || 0) + 6,
            originX: 'left',
            originY: 'top',
            fontSize: 16,
            fontFamily: "sans-serif",
            fontWeight: "bold",
            fill: "#4f46e5",
            selectable: false,
            evented: false,
          });
          (existingLabel as any)._isShootLabel = true;
          shoot._shootLabel = existingLabel;
          (existingLabel as any)._shootZone = shoot;
          canvas.add(existingLabel);
        }
      });

      canvas.setActiveObject(rect);
      canvas.requestRenderAll();
    },
    [canvasWidth, canvasHeight]
  );


  /* ── Curved text (text along a circular arc) ── */
  const addCurvedText = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (text = "Texte incurve", fontSize = 36, fontWeight = "bold", fontFamily = "Montserrat", curveAngle = 180, fill = "#1a1a2e") => {
      const fabric = await import("fabric");
      const canvas = fabricRef.current;
      if (!canvas) return;

      const cx = BLEED_PX + canvasWidth / 2;
      const cy = BLEED_PX + canvasHeight / 2;

      // Calculate radius based on text length and font size
      const totalArcDeg = Math.abs(curveAngle) || 1;
      const totalArcRad = (totalArcDeg * Math.PI) / 180;
      // Approximate total text width
      const approxCharWidth = fontSize * 0.6;
      const totalTextWidth = text.length * approxCharWidth;
      // radius = arcLength / arcAngle
      const radius = Math.max(totalTextWidth / totalArcRad, fontSize * 2);

      const chars = text.split("");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const letterObjects: any[] = [];

      // Measure each character width using a temporary textbox
      const charWidths = chars.map((ch) => {
        const tmp = new fabric.FabricText(ch, { fontSize, fontFamily, fontWeight });
        return tmp.width || approxCharWidth;
      });
      const totalMeasuredWidth = charWidths.reduce((s, w) => s + w, 0);

      // Distribute characters along the arc
      // startAngle: center the text on the arc
      const sign = curveAngle >= 0 ? 1 : -1;
      const arcPerUnit = totalArcRad / totalMeasuredWidth;

      // Starting angle (top of circle = -PI/2, centered)
      let currentAngle = -totalArcRad / 2;

      for (let i = 0; i < chars.length; i++) {
        const halfW = charWidths[i] / 2;
        // Move to center of this character
        const charAngle = currentAngle + halfW * arcPerUnit;

        // Position on circle
        const x = radius * Math.cos(sign * charAngle - Math.PI / 2);
        const y = radius * Math.sin(sign * charAngle - Math.PI / 2);

        // Rotation: tangent to the arc
        const rotDeg = (sign * charAngle * 180) / Math.PI;

        const letter = new fabric.FabricText(chars[i], {
          fontSize,
          fontFamily,
          fontWeight,
          fill,
          left: x,
          top: y,
          originX: "center",
          originY: "center",
          angle: rotDeg,
          selectable: false,
          evented: false,
        });
        letterObjects.push(letter);

        // Advance angle
        currentAngle += charWidths[i] * arcPerUnit;
      }

      const group = new fabric.Group(letterObjects, {
        left: cx,
        top: cy,
        originX: "center",
        originY: "center",
      });

      // Tag with custom props for serialisation & toolbar detection
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (group as any)._isCurvedText = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (group as any)._curveAngle = curveAngle;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (group as any)._curveText = text;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (group as any)._curveFontSize = fontSize;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (group as any)._curveFontFamily = fontFamily;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (group as any)._curveFill = fill;

      canvas.add(group);
      canvas.setActiveObject(group);
      canvas.requestRenderAll();
      canvas.fire("object:modified", { target: group, _historyLabel: "Texte incurvé ajouté" });
    },
    [canvasWidth, canvasHeight]
  );


  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addTextCombo = useCallback(async (layers: { text: string; fontSize: number; fontWeight: string; fontFamily: string; fill: string; offsetY: number; props?: Record<string, any> }[]) => {
    const fabric = await import("fabric");
    const canvas = fabricRef.current;
    if (!canvas) return;
    const cx = BLEED_PX + canvasWidth / 2;
    const cy = BLEED_PX + canvasHeight / 2;

    // 1. Create all textboxes (unpositioned) to measure them
    const textObjects: any[] = [];
    for (const layer of layers) {
      const baseProps: Record<string, any> = {
        left: 0,
        top: 0,
        originX: "center",
        originY: "top",
        fontSize: layer.fontSize,
        fontFamily: layer.fontFamily,
        fill: layer.fill,
        fontWeight: layer.fontWeight,
        editable: false,
        textAlign: "center",
      };
      if (layer.props) {
        for (const [key, val] of Object.entries(layer.props)) {
          if (key === "shadow" && typeof val === "string") {
            baseProps.shadow = parseShadowString(fabric, val);
          } else {
            baseProps[key] = val;
          }
        }
      }
      textObjects.push(new fabric.Textbox(layer.text, baseProps));
    }

    // 2. Stack vertically (like flexbox column) with a small gap
    const gap = 2;
    let totalHeight = 0;
    for (const obj of textObjects) {
      totalHeight += obj.height + gap;
    }
    totalHeight -= gap; // remove last gap

    let yPos = -totalHeight / 2;
    for (const obj of textObjects) {
      obj.set({ top: yPos });
      yPos += obj.height + gap;
    }

    const group = new fabric.Group(textObjects, {
      left: cx, top: cy, originX: "center", originY: "center",
    });
    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.requestRenderAll();
    canvas.fire("object:modified", { target: group, _historyLabel: "Composition texte ajoutée" });
  }, [canvasWidth, canvasHeight]);

  return { addText, addShape, applyGradientBg, addShootZone, addCurvedText, addTextCombo };
}
