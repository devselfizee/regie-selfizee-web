"use client";

import { useCallback } from "react";
import {
  type PenToolState,
  type EditOverlay,
  createInitialPenState,
  pointsToSvgPath,
  buildEditOverlay,
  hitTestOverlay,
  parsePenPoints,
  rebuildPath,
  removePoint,
  togglePointType,
  mirrorHandle,
  CURSOR_PEN_TOOL,
} from "../tools/PenTool";

/* ═══════════════════════════════════════════════════════════════
   Pen edit mode — double-click existing path to edit points.
   ═══════════════════════════════════════════════════════════════ */

interface UsePenEditModeParams {
  fabricRef: React.MutableRefObject<any>;
  displayScaleRef: React.MutableRefObject<number>;
  penStateRef: React.MutableRefObject<PenToolState>;
  penPreviewRef: React.MutableRefObject<any>;
  penOverlayRef: React.MutableRefObject<any[]>;
  penOverlayHitMapRef: React.MutableRefObject<EditOverlay | null>;
  setPenEditMode: (v: boolean) => void;
  setPenPointCount: (v: number | ((p: number) => number)) => void;
  cleanupTools: () => void;
}

export function usePenEditMode({
  fabricRef, displayScaleRef, penStateRef, penPreviewRef, penOverlayRef,
  penOverlayHitMapRef, setPenEditMode, setPenPointCount, cleanupTools,
}: UsePenEditModeParams) {
  const enterPenEditMode = useCallback(async (pathObj: any) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const fabric = await import("fabric");
    const parsed = parsePenPoints(pathObj);
    if (!parsed) return;

    cleanupTools();
    setPenEditMode(true);
    const pathOffset = { x: pathObj.left || 0, y: pathObj.top || 0 };

    // Adjust points from path-local coords to absolute canvas coords
    // fabric.Path stores path data; we stored points in absolute coords at creation
    // but the path object may have been moved, so we need to apply the offset
    const st = penStateRef.current;
    st.editingPath = pathObj;
    st.points = parsed.points;
    st.closed = parsed.closed;
    st.selectedPointIndex = -1;
    setPenPointCount(parsed.points.length);

    // Hide the actual path while editing
    pathObj.set({ opacity: 0.3 });
    canvas.discardActiveObject();
    canvas.selection = false;
    canvas.defaultCursor = CURSOR_PEN_TOOL;

    const drawOverlay = () => {
      // Remove old overlays
      penOverlayRef.current.forEach((o: any) => canvas.remove(o));
      penOverlayRef.current = [];
      // Draw preview path
      if (penPreviewRef.current) { canvas.remove(penPreviewRef.current); penPreviewRef.current = null; }
      const s = displayScaleRef.current || 1;
      const d = pointsToSvgPath(st.points, st.closed);
      if (d) {
        const preview = new fabric.Path(d, {
          fill: st.closed ? "rgba(59,130,246,0.15)" : "transparent",
          stroke: "#4f46e5",
          strokeWidth: 2 / s,
          selectable: false, evented: false, _isPenOverlay: true,
        });
        penPreviewRef.current = preview;
        canvas.add(preview);
      }
      // Draw edit overlay (points + handles)
      const overlay = buildEditOverlay(fabric, st.points, st.selectedPointIndex, s, { x: 0, y: 0 });
      penOverlayHitMapRef.current = overlay;
      overlay.objects.forEach((o: any) => { penOverlayRef.current.push(o); canvas.add(o); });
      canvas.requestRenderAll();
    };

    drawOverlay();

    let editDragType: "point" | "handleIn" | "handleOut" | null = null;
    let editDragIdx = -1;

    const onMouseDown = (e: any) => {
      if (e.e.button !== 0) return;
      const pointer = canvas.getScenePoint(e.e);
      const s = displayScaleRef.current || 1;

      // Hit test overlay
      if (penOverlayHitMapRef.current) {
        const hit = hitTestOverlay(penOverlayHitMapRef.current, pointer, s);
        if (hit) {
          editDragType = hit.type;
          editDragIdx = hit.pointIndex;
          st.selectedPointIndex = hit.pointIndex;
          setPenPointCount((p: number) => p); // trigger re-render
          drawOverlay();
          return;
        }
      }

      // Clicked on empty space → deselect point
      st.selectedPointIndex = -1;
      drawOverlay();
    };

    const onMouseMove = (e: any) => {
      if (editDragType === null || editDragIdx < 0) return;
      const pointer = canvas.getScenePoint(e.e);
      const pt = st.points[editDragIdx];
      if (!pt) return;

      if (editDragType === "point") {
        const dx = pointer.x - pt.x;
        const dy = pointer.y - pt.y;
        pt.x = pointer.x;
        pt.y = pointer.y;
        // Move handles with the point
        if (pt.handleIn) { pt.handleIn.x += dx; pt.handleIn.y += dy; }
        if (pt.handleOut) { pt.handleOut.x += dx; pt.handleOut.y += dy; }
      } else if (editDragType === "handleIn") {
        pt.handleIn = { x: pointer.x, y: pointer.y };
        // Mirror the other handle unless Alt/Option is held
        if (!e.e.altKey && pt.handleOut) {
          pt.handleOut = mirrorHandle(pt, pt.handleIn);
        }
      } else if (editDragType === "handleOut") {
        pt.handleOut = { x: pointer.x, y: pointer.y };
        if (!e.e.altKey && pt.handleIn) {
          pt.handleIn = mirrorHandle(pt, pt.handleOut);
        }
      }
      drawOverlay();
    };

    const onMouseUp = () => {
      editDragType = null;
      editDragIdx = -1;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (st.selectedPointIndex >= 0 && st.points.length > 2) {
          st.points = removePoint(st.points, st.selectedPointIndex);
          st.selectedPointIndex = Math.min(st.selectedPointIndex, st.points.length - 1);
          setPenPointCount(st.points.length);
          drawOverlay();
          e.preventDefault();
        }
      }
      if (e.key === "Alt" && st.selectedPointIndex >= 0) {
        // Alt+click toggles smooth/corner — handled here for visual feedback
      }
      if (e.key === "Enter" || e.key === "Escape") {
        // Finish editing
        finishEdit();
        e.preventDefault();
      }
    };

    const finishEdit = () => {
      canvas.off("mouse:down", onMouseDown);
      canvas.off("mouse:move", onMouseMove);
      canvas.off("mouse:up", onMouseUp);
      document.removeEventListener("keydown", onKeyDown);

      // Rebuild the path with updated points
      const newPath = rebuildPath(fabric, pathObj, st.points, st.closed);
      canvas.remove(pathObj);
      penOverlayRef.current.forEach((o: any) => canvas.remove(o));
      penOverlayRef.current = [];
      if (penPreviewRef.current) { canvas.remove(penPreviewRef.current); penPreviewRef.current = null; }

      canvas.add(newPath);
      canvas.setActiveObject(newPath);
      penStateRef.current = createInitialPenState();
      setPenEditMode(false);
      setPenPointCount(0);
      canvas.defaultCursor = "default";
      canvas.hoverCursor = "move";
      canvas.selection = true;
      canvas.requestRenderAll();
    };

    // Store finishEdit ref so the toolbar button can call it
    penStateRef.current.editDragType = null;
    (penStateRef.current as any)._finishEdit = finishEdit;
    (penStateRef.current as any)._togglePoint = () => {
      if (st.selectedPointIndex >= 0) {
        st.points = togglePointType(st.points, st.selectedPointIndex);
        drawOverlay();
      }
    };

    canvas.on("mouse:down", onMouseDown);
    canvas.on("mouse:move", onMouseMove);
    (canvas as any)._penMouseMove = onMouseMove;
    canvas.on("mouse:up", onMouseUp);
    document.addEventListener("keydown", onKeyDown);
  }, [cleanupTools]);


  return { enterPenEditMode };
}
