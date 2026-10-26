"use client";
import React, { useRef, useEffect } from "react";
import { ensureCleanElement, trimToOpaqueBounds, getTrimmedPosition, replaceInGroupEditing } from "../canvas/canvasUtils";
import { buildEdgeMap, traceEdgePath, lassoPointsToPath, smoothPoints, CURSOR_LASSO, CURSOR_LASSO_CLOSE } from "./MagneticLasso";
import { toast } from "../../Toast";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function LassoToolActivation(props: any) {
  const {
    selectedObj, fabricRef, isRestoringRef, displayScaleRef,
    lassoActive, setLassoActive, lassoMode, lassoSearchRadius, setLassoSearchRadius,
    setEraserActive, setWandActive,
    showSelectionPopup,
  } = props;

  const lassoActiveRef = useRef(lassoActive);
  const lassoTargetRef = useRef<any>(null);
  const lassoPointsRef = useRef<any[]>([]);
  const lassoAnchorsRef = useRef<any[]>([]);
  const lassoEdgeMapRef = useRef<any>(null);
  const lassoPreviewRef = useRef<any[]>([]);

  // Keep lassoActiveRef in sync with the lassoActive prop
  useEffect(() => {
    lassoActiveRef.current = lassoActive;
  }, [lassoActive]);

  const handleLassoClick = async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (lassoActive) {
      // Deactivate lasso — only remove the specific handlers we attached,
      // don't wipe all mouse:down/mouse:move listeners (was silently
      // breaking other tools). Also clean up native document listeners
      // and canvas-level refs (was leaking them on every toggle).
      if ((canvas as any)._lassoMouseDown) {
        canvas.off("mouse:down", (canvas as any)._lassoMouseDown);
        (canvas as any)._lassoMouseDown = null;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((canvas as any)._lassoCanvasMove) { canvas.off("mouse:move", (canvas as any)._lassoCanvasMove); (canvas as any)._lassoCanvasMove = null; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((canvas as any)._lassoKeyHandler) {
        document.removeEventListener("keydown", (canvas as any)._lassoKeyHandler);
        (canvas as any)._lassoKeyHandler = null;
      }
      // Native mousedown on upperCanvas (if any)
      const uc = canvas.upperCanvasEl as HTMLCanvasElement | undefined;
      if (uc && (canvas as any)._lassoNativeClick) {
        uc.removeEventListener("mousedown", (canvas as any)._lassoNativeClick, true);
        (canvas as any)._lassoNativeClick = null;
      }
      canvas.defaultCursor = "default";
      canvas.hoverCursor = "move";
      lassoPreviewRef.current.forEach((o: any) => canvas.remove(o));
      lassoPreviewRef.current = [];
      lassoPointsRef.current = [];
      lassoAnchorsRef.current = [];
      lassoEdgeMapRef.current = null;
      // Restore evented/selectable on all objects
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      canvas.getObjects().forEach((o: any) => {
        if (o._lassoSavedEvented !== undefined) { o.evented = o._lassoSavedEvented; delete o._lassoSavedEvented; }
        if (o._lassoSavedSelectable !== undefined) { o.selectable = o._lassoSavedSelectable; delete o._lassoSavedSelectable; }
      });
      if (lassoTargetRef.current) canvas.setActiveObject(lassoTargetRef.current);
      lassoTargetRef.current = null;
      setLassoActive(false);
      // Only clear isRestoringRef if we set it — preserve any in-flight
      // restore operation (lasso was clobbering it unconditionally before)
      if ((canvas as any)._lassoOrigRestoring !== undefined) {
        isRestoringRef.current = (canvas as any)._lassoOrigRestoring;
        delete (canvas as any)._lassoOrigRestoring;
      }
      canvas.selection = true;
      canvas.requestRenderAll();
      return;
    }
    if (!selectedObj || selectedObj.type !== "image") return;
    if (selectedObj.lockMovementX) { toast("Objet verrouillé — déverrouillez-le d'abord", "info"); return; }
    const fabric = await import("fabric");
    setLassoActive(true);
    setEraserActive(false);
    setWandActive(false);
    canvas.isDrawingMode = false;
    // Save the real isRestoringRef so deactivation can restore it instead
    // of clobbering a genuine restore in progress.
    (canvas as any)._lassoOrigRestoring = isRestoringRef.current;

    const targetImg = selectedObj;
    lassoTargetRef.current = targetImg;
    lassoPointsRef.current = [];
    lassoAnchorsRef.current = [];

    // Build edge map from image
    let imgEl: HTMLImageElement;
    try {
      imgEl = await ensureCleanElement(targetImg);
    } catch {
      console.warn("Lasso: could not get clean image element");
      return;
    }
    const _edgeCvs = document.createElement("canvas");
    const _edgeW = imgEl.naturalWidth || imgEl.width;
    const _edgeH = imgEl.naturalHeight || imgEl.height;
    _edgeCvs.width = _edgeW; _edgeCvs.height = _edgeH;
    const _edgeCtx = _edgeCvs.getContext("2d")!;
    _edgeCtx.drawImage(imgEl, 0, 0, _edgeW, _edgeH);
    const _edgeData = _edgeCtx.getImageData(0, 0, _edgeW, _edgeH);
    lassoEdgeMapRef.current = buildEdgeMap(imgEl, _edgeData);
    // Memory leak fix: release the temp edge detection canvas (data already extracted)
    _edgeCvs.width = 0; _edgeCvs.height = 0;

    // Disable all objects so clicks don't move/select them
    canvas.discardActiveObject();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    canvas.getObjects().forEach((o: any) => {
      o._lassoSavedEvented = o.evented;
      o._lassoSavedSelectable = o.selectable;
      o.evented = false;
      o.selectable = false;
    });

    canvas.defaultCursor = CURSOR_LASSO;
    canvas.hoverCursor = CURSOR_LASSO;
    canvas.selection = false;
    isRestoringRef.current = true;

    const imgW = imgEl.naturalWidth || imgEl.width;
    const imgH = imgEl.naturalHeight || imgEl.height;

    // Convert canvas (scene) coords to image coords
    const toImageCoords = (canvasX: number, canvasY: number) => {
      const bound = targetImg.getBoundingRect();
      return {
        x: (canvasX - bound.left) * (imgW / bound.width),
        y: (canvasY - bound.top) * (imgH / bound.height),
      };
    };

    // Convert image coords back to canvas (scene) coords
    const toCanvasCoords = (imgX: number, imgY: number) => {
      const bound = targetImg.getBoundingRect();
      return {
        x: bound.left + (imgX / imgW) * bound.width,
        y: bound.top + (imgY / imgH) * bound.height,
      };
    };

    const CLOSE_DIST = 12;
    const s = displayScaleRef.current || 1;

    // Shared helper: draw anchor dots on the canvas for lasso preview
    const drawAnchorDots = (dotColor: string) => {
      lassoAnchorsRef.current.forEach((a: any, i: number) => {
        const cp = toCanvasCoords(a.x, a.y);
        if (i === 0) {
          const outerRing = new fabric.Circle({ left: cp.x, top: cp.y, radius: 14 / s, fill: "transparent", stroke: dotColor, strokeWidth: 2.5 / s, originX: "center", originY: "center", selectable: false, evented: false });
          const innerDot = new fabric.Circle({ left: cp.x, top: cp.y, radius: 5 / s, fill: dotColor, stroke: "#ffffff", strokeWidth: 1.5 / s, originX: "center", originY: "center", selectable: false, evented: false });
          lassoPreviewRef.current.push(outerRing, innerDot);
          canvas.add(outerRing); canvas.add(innerDot);
        } else {
          const dot = new fabric.Circle({ left: cp.x, top: cp.y, radius: 4 / s, fill: "#ffffff", stroke: dotColor, strokeWidth: 1.5 / s, originX: "center", originY: "center", selectable: false, evented: false });
          lassoPreviewRef.current.push(dot); canvas.add(dot);
        }
      });
    };

    // Shared helper: build SVG path string from points array
    const buildPathD = (pts: { x: number; y: number }[]) => {
      const canvasPts = pts.map(p => toCanvasCoords(p.x, p.y));
      let d = `M ${canvasPts[0].x} ${canvasPts[0].y}`;
      for (let i = 1; i < canvasPts.length; i++) d += ` L ${canvasPts[i].x} ${canvasPts[i].y}`;
      return d;
    };

    const drawLassoPreview = () => {
      lassoPreviewRef.current.forEach((o: any) => canvas.remove(o));
      lassoPreviewRef.current = [];
      const allPts = lassoPointsRef.current;
      if (allPts.length < 2) return;
      const fillColor = lassoMode === "subtract" ? "rgba(239,68,68,0.18)" : "rgba(124,58,237,0.18)";
      const fillPath = new fabric.Path(buildPathD(allPts), { fill: fillColor, stroke: "", strokeWidth: 0, selectable: false, evented: false });
      lassoPreviewRef.current.push(fillPath);
      canvas.add(fillPath);
      drawAnchorDots(lassoMode === "subtract" ? "#ef4444" : "#22c55e");
      canvas.requestRenderAll();
    };

    // Forward refs for cleanup
    let _lassoNativeMove: ((e: MouseEvent) => void) | null = null;
    let _lassoNativeUp: (() => void) | null = null;
    let _lassoKeyHandler: ((e: KeyboardEvent) => void) | null = null;

    const cleanupLasso = () => {
      lassoFreeDrawing = false;
      const uc = canvas.upperCanvasEl as HTMLCanvasElement;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((canvas as any)._lassoNativeClick) uc.removeEventListener("mousedown", (canvas as any)._lassoNativeClick, true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((canvas as any)._lassoCanvasMove) { canvas.off("mouse:move", (canvas as any)._lassoCanvasMove); delete (canvas as any)._lassoCanvasMove; }
      // No wild-off fallback: if no _lassoCanvasMove ref exists, there's
      // no lasso mouse:move handler to remove. Wiping all mouse:move
      // listeners would break unrelated tools.
      if (_lassoKeyHandler) document.removeEventListener("keydown", _lassoKeyHandler);
      if (_lassoNativeMove) document.removeEventListener("mousemove", _lassoNativeMove);
      if (_lassoNativeUp) document.removeEventListener("mouseup", _lassoNativeUp);
      lassoPreviewRef.current.forEach((o: any) => canvas.remove(o));
      lassoPreviewRef.current = [];
      lassoPointsRef.current = [];
      lassoAnchorsRef.current = [];
      lassoEdgeMapRef.current = null;
      lassoTargetRef.current = null;
      setLassoActive(false);
      canvas.defaultCursor = "default";
      canvas.hoverCursor = "move";
      canvas.selection = true;
      isRestoringRef.current = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      canvas.getObjects().forEach((o: any) => {
        if (o._lassoSavedEvented !== undefined) { o.evented = o._lassoSavedEvented; delete o._lassoSavedEvented; }
        if (o._lassoSavedSelectable !== undefined) { o.selectable = o._lassoSavedSelectable; delete o._lassoSavedSelectable; }
      });
    };

    const finishLasso = async () => {
      const allPts = lassoPointsRef.current;
      if (allPts.length < 10) {
        cleanupLasso();
        canvas.setActiveObject(targetImg);
        canvas.requestRenderAll();
        return;
      }

      const smoothed = smoothPoints(smoothPoints(smoothPoints(allPts, 5), 7), 5);
      const centered = smoothed.map((p: any) => ({
        x: p.x - imgW / 2,
        y: p.y - imgH / 2,
      }));

      const newPathD = lassoPointsToPath(centered);
      const currentMode = lassoMode;

      if (currentMode === "subtract" && targetImg.clipPath?.path) {
        const existingClip = targetImg.clipPath;
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = imgW; maskCanvas.height = imgH;
        const maskCtx = maskCanvas.getContext("2d")!;

        const existingPath2D = new Path2D();
        for (const seg of existingClip.path) {
          if (seg[0] === "M") existingPath2D.moveTo(seg[1] + imgW / 2, seg[2] + imgH / 2);
          else if (seg[0] === "L") existingPath2D.lineTo(seg[1] + imgW / 2, seg[2] + imgH / 2);
          else if (seg[0] === "C") existingPath2D.bezierCurveTo(seg[1] + imgW / 2, seg[2] + imgH / 2, seg[3] + imgW / 2, seg[4] + imgH / 2, seg[5] + imgW / 2, seg[6] + imgH / 2);
          else if (seg[0] === "Q") existingPath2D.quadraticCurveTo(seg[1] + imgW / 2, seg[2] + imgH / 2, seg[3] + imgW / 2, seg[4] + imgH / 2);
          else if (seg[0] === "Z" || seg[0] === "z") existingPath2D.closePath();
        }
        maskCtx.fillStyle = "white";
        maskCtx.fill(existingPath2D);

        maskCtx.globalCompositeOperation = "destination-out";
        const subtractPath = new Path2D(newPathD);
        const offsetPath = new Path2D();
        const m = new DOMMatrix().translate(imgW / 2, imgH / 2);
        offsetPath.addPath(subtractPath, m);
        maskCtx.fill(offsetPath);

        const imgEl2 = targetImg.getElement();
        const off = document.createElement("canvas");
        off.width = imgW; off.height = imgH;
        const ctx2 = off.getContext("2d")!;
        ctx2.drawImage(imgEl2, 0, 0);
        ctx2.globalCompositeOperation = "destination-in";
        ctx2.drawImage(maskCanvas, 0, 0);
        const fullDataUrl = off.toDataURL("image/png");
        // Memory leak fix: release temp canvases used for lasso subtract compositing
        maskCanvas.width = 0; maskCanvas.height = 0;
        off.width = 0; off.height = 0;

        const trimmed = await trimToOpaqueBounds(fullDataUrl);
        const finalUrl = trimmed ? trimmed.dataUrl : fullDataUrl;

        const newImg = await fabric.FabricImage.fromURL(finalUrl);
        const sx = targetImg.scaleX || 1;
        const sy = targetImg.scaleY || 1;
        if (trimmed) {
          const tPos = getTrimmedPosition(targetImg, trimmed.dx, trimmed.dy, sx, sy);
          newImg.set({
            left: tPos.left,
            top: tPos.top,
            scaleX: sx, scaleY: sy,
            angle: targetImg.angle, flipX: targetImg.flipX, flipY: targetImg.flipY,
            originX: "left", originY: "top",
            opacity: targetImg.opacity,
          });
        } else {
          const imgBr = targetImg.getBoundingRect();
          newImg.set({
            left: imgBr.left, top: imgBr.top,
            scaleX: sx, scaleY: sy,
            angle: targetImg.angle, flipX: targetImg.flipX, flipY: targetImg.flipY,
            originX: "left", originY: "top",
            opacity: targetImg.opacity,
          });
        }
        canvas.remove(targetImg);
        canvas.add(newImg);
        replaceInGroupEditing(targetImg, newImg);
        canvas.setActiveObject(newImg);
      } else {
        showSelectionPopup(targetImg, newPathD, window.innerWidth / 2, window.innerHeight / 2);
      }

      cleanupLasso();
      canvas.requestRenderAll();
    };

    // Keyboard: Backspace = undo last point, Escape = cancel
    let lassoFreeDrawing = false;
    const lassoKeyHandler = (e: KeyboardEvent) => {
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        if (lassoAnchorsRef.current.length > 0) {
          lassoAnchorsRef.current.pop();
          lassoFreeDrawing = false;
          const edgeMap = lassoEdgeMapRef.current;
          lassoPointsRef.current = [];
          if (edgeMap && lassoAnchorsRef.current.length > 0) {
            lassoPointsRef.current.push(lassoAnchorsRef.current[0]);
            for (let i = 1; i < lassoAnchorsRef.current.length; i++) {
              const seg = traceEdgePath(edgeMap, lassoAnchorsRef.current[i - 1], lassoAnchorsRef.current[i], 2, lassoSearchRadius);
              lassoPointsRef.current.push(...seg);
            }
          }
          drawLassoPreview();
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cleanupLasso();
        canvas.setActiveObject(targetImg);
        canvas.requestRenderAll();
      }
    };
    document.addEventListener("keydown", lassoKeyHandler);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (canvas as any)._lassoKeyHandler = lassoKeyHandler;

    // Mouse handlers
    const onLassoNativeClick = (domEvent: MouseEvent) => {
      if (domEvent.button !== 0) return;
      if (!lassoActiveRef.current) return;
      domEvent.stopPropagation();
      domEvent.preventDefault();
      lassoFreeDrawing = false;

      const pointer = canvas.getScenePoint(domEvent);
      const imgPt = toImageCoords(pointer.x, pointer.y);
      imgPt.x = Math.max(0, Math.min(imgW - 1, imgPt.x));
      imgPt.y = Math.max(0, Math.min(imgH - 1, imgPt.y));

      if (lassoAnchorsRef.current.length >= 3) {
        const first = lassoAnchorsRef.current[0];
        const firstCanvas = toCanvasCoords(first.x, first.y);
        const dx = pointer.x - firstCanvas.x;
        const dy = pointer.y - firstCanvas.y;
        if (Math.sqrt(dx * dx + dy * dy) < CLOSE_DIST / s) {
          const lastAnchor = lassoAnchorsRef.current[lassoAnchorsRef.current.length - 1];
          const edgeMap = lassoEdgeMapRef.current;
          if (edgeMap && lastAnchor) {
            const segment = traceEdgePath(edgeMap, lastAnchor, first, 2, lassoSearchRadius);
            lassoPointsRef.current.push(...segment);
          }
          finishLasso();
          return;
        }
      }

      const edgeMap = lassoEdgeMapRef.current;
      const snapped = edgeMap ? (traceEdgePath(edgeMap, imgPt, imgPt, 1, lassoSearchRadius)[0] || imgPt) : imgPt;

      if (lassoAnchorsRef.current.length > 0) {
        const lastAnchor = lassoAnchorsRef.current[lassoAnchorsRef.current.length - 1];
        if (edgeMap && lastAnchor) {
          const segment = traceEdgePath(edgeMap, lastAnchor, snapped, 2, lassoSearchRadius);
          lassoPointsRef.current.push(...segment);
        }
      } else {
        lassoPointsRef.current.push(snapped);
      }

      lassoAnchorsRef.current.push(snapped);
      lassoFreeDrawing = true;
      drawLassoPreview();
    };
    const upperCanvas = canvas.upperCanvasEl as HTMLCanvasElement;
    upperCanvas.addEventListener("mousedown", onLassoNativeClick, true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (canvas as any)._lassoNativeClick = onLassoNativeClick;

    // Native mousemove for free-draw
    const onLassoNativeMove = (domEvent: MouseEvent) => {
      if (!lassoFreeDrawing || lassoAnchorsRef.current.length === 0 || lassoPointsRef.current.length === 0) return;
      const pointer = canvas.getScenePoint(domEvent);
      const imgPt = toImageCoords(pointer.x, pointer.y);
      imgPt.x = Math.max(0, Math.min(imgW - 1, imgPt.x));
      imgPt.y = Math.max(0, Math.min(imgH - 1, imgPt.y));

      const lastPt = lassoPointsRef.current[lassoPointsRef.current.length - 1];
      if (!lastPt) return;
      const dx = imgPt.x - lastPt.x;
      const dy = imgPt.y - lastPt.y;
      if (Math.sqrt(dx * dx + dy * dy) < 3) return;

      const edgeMap = lassoEdgeMapRef.current;
      const snapped = edgeMap ? traceEdgePath(edgeMap, lastPt, imgPt, 2, lassoSearchRadius) : [imgPt];
      lassoPointsRef.current.push(...snapped);
      drawLassoPreview();
    };
    const onLassoNativeUp = () => {
      if (lassoFreeDrawing && lassoPointsRef.current.length > 0) {
        const lastPt = lassoPointsRef.current[lassoPointsRef.current.length - 1];
        const lastAnchor = lassoAnchorsRef.current[lassoAnchorsRef.current.length - 1];
        if (lastAnchor) {
          const dx = lastPt.x - lastAnchor.x;
          const dy = lastPt.y - lastAnchor.y;
          if (Math.sqrt(dx * dx + dy * dy) > 5) {
            lassoAnchorsRef.current.push(lastPt);
          }
        }
      }
      lassoFreeDrawing = false;
    };
    document.addEventListener("mousemove", onLassoNativeMove);
    document.addEventListener("mouseup", onLassoNativeUp);
    _lassoNativeMove = onLassoNativeMove;
    _lassoNativeUp = onLassoNativeUp;
    _lassoKeyHandler = lassoKeyHandler;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onLassoCanvasMove = (e: any) => {
      if (lassoFreeDrawing) return;
      if (lassoAnchorsRef.current.length === 0) return;
      const pointer = canvas.getScenePoint(e.e);

      if (lassoAnchorsRef.current.length >= 3) {
        const first = lassoAnchorsRef.current[0];
        const firstCanvas = toCanvasCoords(first.x, first.y);
        const dx = pointer.x - firstCanvas.x;
        const dy = pointer.y - firstCanvas.y;
        if (Math.sqrt(dx * dx + dy * dy) < CLOSE_DIST / s) {
          canvas.defaultCursor = CURSOR_LASSO_CLOSE;
        } else {
          canvas.defaultCursor = CURSOR_LASSO;
        }
      }

      const imgPt = toImageCoords(pointer.x, pointer.y);
      imgPt.x = Math.max(0, Math.min(imgW - 1, imgPt.x));
      imgPt.y = Math.max(0, Math.min(imgH - 1, imgPt.y));

      const lastAnchor = lassoAnchorsRef.current[lassoAnchorsRef.current.length - 1];
      const edgeMap = lassoEdgeMapRef.current;
      if (!edgeMap) return;

      const liveSegment = traceEdgePath(edgeMap, lastAnchor, imgPt, 3, lassoSearchRadius);
      const allPts = [...lassoPointsRef.current, ...liveSegment];

      lassoPreviewRef.current.forEach((o: any) => canvas.remove(o));
      lassoPreviewRef.current = [];
      if (allPts.length >= 2) {
        const pathObj = new fabric.Path(buildPathD(allPts), {
          fill: "rgba(34,197,94,0.08)", stroke: "#22c55e",
          strokeWidth: 1.5 / s, strokeDashArray: [5 / s, 3 / s],
          selectable: false, evented: false,
        });
        lassoPreviewRef.current.push(pathObj);
        canvas.add(pathObj);
        drawAnchorDots("#22c55e");
      }
      canvas.requestRenderAll();
    };
    canvas.on("mouse:move", onLassoCanvasMove);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (canvas as any)._lassoCanvasMove = onLassoCanvasMove;
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleLassoClick}
        className={`flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-sm font-medium transition-colors ${
          lassoActive ? "bg-green-100 text-green-700" : "hover:bg-gray-100 text-gray-600"
        }`}
        title={lassoActive ? "Désactiver le lasso" : "Lasso magnétique — sélection manuelle qui suit les contours"}
        data-sel-tool="lasso"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10" strokeDasharray="4 3" />
          <circle cx="12" cy="2" r="2" fill="currentColor" />
        </svg>
        {lassoActive ? "Lasso actif" : "Lasso"}
      </button>
      {lassoActive && (
        <>
          <span className="text-[10px] text-gray-400">Rayon</span>
          <input
            type="range"
            min={4}
            max={25}
            value={lassoSearchRadius}
            onChange={(e) => setLassoSearchRadius(parseInt(e.target.value))}
            className="w-14 h-1.5 accent-[#22c55e]"
            title={`Rayon de recherche: ${lassoSearchRadius}px`}
          />
          <span className="text-[10px] text-gray-500 w-5 tabular-nums">{lassoSearchRadius}</span>
        </>
      )}
    </div>
  );
}

export default LassoToolActivation;
