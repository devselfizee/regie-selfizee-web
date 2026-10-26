"use client";
import React, { useEffect } from "react";
import { makeEraserCursor, replaceInGroupEditing } from "../canvas/canvasUtils";
import { toast } from "../../Toast";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function EraserToolActivation(props: any) {
  const {
    selectedObj, fabricRef, isRestoringRef,
    eraserActive, setEraserActive, eraserBrushSize, eraserBrushSizeRef,
    eraserOpacity, eraserOpacityRef, eraserTargetRef,
    setWandActive, setSelectedObj,
  } = props;

  // Keep the brush width in sync with the slider while the eraser is active.
  // Previously, brush.width was captured once at activation time and the
  // slider had no effect until the user toggled the eraser off/on.
  useEffect(() => {
    if (!eraserActive) return;
    const canvas = fabricRef.current;
    if (canvas?.freeDrawingBrush) {
      canvas.freeDrawingBrush.width = eraserBrushSize;
      canvas.freeDrawingCursor = makeEraserCursor(eraserBrushSize);
    }
  }, [eraserActive, eraserBrushSize, fabricRef]);

  const handleEraserClick = async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (eraserActive) {
      // Deactivate eraser — only remove the specific path:created handler
      // we attached, not all handlers (which would break freedraw etc).
      canvas.isDrawingMode = false;
      if ((canvas as any)._eraserPathHandler) {
        canvas.off("path:created", (canvas as any)._eraserPathHandler);
        delete (canvas as any)._eraserPathHandler;
      }
      canvas.defaultCursor = "default";
      canvas.hoverCursor = "move";
      isRestoringRef.current = false;
      setEraserActive(false);
      eraserTargetRef.current = null;
      return;
    }
    if (!selectedObj || selectedObj.type !== "image") return;
    if (selectedObj.lockMovementX) { toast("Objet verrouillé — déverrouillez-le d'abord", "info"); return; }
    const fabric = await import("fabric");
    setEraserActive(true);
    setWandActive(false);
    // Don't wipe all mouse:down handlers — Fabric and other tools need them.
    eraserTargetRef.current = selectedObj;

    const cursor = makeEraserCursor(eraserBrushSize);
    canvas.isDrawingMode = true;
    canvas.freeDrawingCursor = cursor;
    const brush = new fabric.PencilBrush(canvas);
    brush.color = `rgba(255,68,68,${eraserOpacity / 100 * 0.4})`;
    brush.width = eraserBrushSize;
    canvas.freeDrawingBrush = brush;

    // Persistent path handler. Track the specific handler on the canvas
    // so deactivation can remove it without wiping unrelated listeners.
    isRestoringRef.current = true;
    if ((canvas as any)._eraserPathHandler) {
      canvas.off("path:created", (canvas as any)._eraserPathHandler);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eraserPathHandler = (e: any) => {
      const targetImg = eraserTargetRef.current;
      if (!targetImg) return;
      const path = e.path;
      if (!path) return;

      // Remove the red preview path immediately
      canvas.remove(path);
      canvas.requestRenderAll();

      const imgEl = targetImg.getElement();
      const imgW = imgEl.naturalWidth || imgEl.width;
      const imgH = imgEl.naturalHeight || imgEl.height;
      const savedProps = {
        left: targetImg.left, top: targetImg.top,
        scaleX: targetImg.scaleX || 1, scaleY: targetImg.scaleY || 1,
        originX: targetImg.originX, originY: targetImg.originY,
        angle: targetImg.angle,
      };

      const offscreen = document.createElement("canvas");
      offscreen.width = imgW;
      offscreen.height = imgH;
      const ctx = offscreen.getContext("2d")!;
      ctx.drawImage(imgEl, 0, 0);

      const pLeft = path.left || 0;
      const pTop = path.top || 0;
      const poX = path.pathOffset?.x || 0;
      const poY = path.pathOffset?.y || 0;
      const bound = targetImg.getBoundingRect();

      const pathCanvas2 = document.createElement("canvas");
      pathCanvas2.width = imgW;
      pathCanvas2.height = imgH;
      const pathCtx = pathCanvas2.getContext("2d")!;
      const scaleToImgX = imgW / bound.width;
      const scaleToImgY = imgH / bound.height;
      pathCtx.setTransform(
        scaleToImgX, 0, 0, scaleToImgY,
        (pLeft - poX - bound.left) * scaleToImgX,
        (pTop - poY - bound.top) * scaleToImgY
      );
      pathCtx.lineWidth = (path.strokeWidth || 20);
      pathCtx.lineCap = "round";
      pathCtx.lineJoin = "round";
      pathCtx.strokeStyle = "white";
      pathCtx.beginPath();
      for (const cmd of path.path) {
        if (cmd[0] === "M") pathCtx.moveTo(cmd[1], cmd[2]);
        else if (cmd[0] === "Q") pathCtx.quadraticCurveTo(cmd[1], cmd[2], cmd[3], cmd[4]);
        else if (cmd[0] === "L") pathCtx.lineTo(cmd[1], cmd[2]);
      }
      pathCtx.stroke();

      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = eraserOpacityRef.current / 100;
      ctx.drawImage(pathCanvas2, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      const newDataUrl = offscreen.toDataURL("image/png");
      // Memory leak fix: release temp canvases used for eraser compositing
      offscreen.width = 0; offscreen.height = 0;
      pathCanvas2.width = 0; pathCanvas2.height = 0;
      const newImgEl = new Image();
      newImgEl.crossOrigin = "anonymous";
      newImgEl.onerror = () => {
        // Restore canvas state on load failure (not stuck in drawing mode
        // with isRestoringRef pinned true forever)
        isRestoringRef.current = false;
        canvas.isDrawingMode = false;
        toast("Erreur lors de l'application de la gomme", "error");
      };
      newImgEl.onload = async () => {
        try {
          const fabr = await import("fabric");
          const newFabricImg = new fabr.FabricImage(newImgEl);
          newFabricImg.set(savedProps);
          // replaceInGroupEditing BEFORE remove so the swap can find the
          // old object in its parent editing-group refs.
          replaceInGroupEditing(targetImg, newFabricImg);
          canvas.remove(targetImg);
          canvas.add(newFabricImg);
          eraserTargetRef.current = newFabricImg;
          canvas.isDrawingMode = true;
          canvas.freeDrawingCursor = makeEraserCursor(eraserBrushSizeRef.current);
          canvas.requestRenderAll();
          setSelectedObj(newFabricImg);
          canvas.fire("object:modified", { target: newFabricImg, _historyLabel: "Gomme appliquée" });
        } finally {
          // CRITICAL: reset isRestoringRef on success too — was only reset
          // in onerror, leaving history blocked forever after a successful
          // erase until the user deactivated the tool.
          isRestoringRef.current = false;
        }
      };
      newImgEl.src = newDataUrl;
    };
    (canvas as any)._eraserPathHandler = eraserPathHandler;
    canvas.on("path:created", eraserPathHandler);
  };

  return (
    <button
      onClick={handleEraserClick}
      className={`flex items-center gap-1 h-8 px-2 rounded-lg text-xs font-medium transition-colors ${
        eraserActive ? "bg-red-100 text-red-700" : "text-gray-600 hover:bg-gray-100"
      }`}
      title={eraserActive ? "Désactiver la gomme" : "Gommer des parties de l'image"}
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 20H7L3 16c-.8-.8-.8-2 0-2.8l10-10c.8-.8 2-.8 2.8 0l5.6 5.6c.8.8.8 2 0 2.8L14 19" />
        <path d="M7 20l-4-4" />
      </svg>
      {eraserActive ? "Gomme ✓" : "Gomme"}
    </button>
  );
}

export default EraserToolActivation;
