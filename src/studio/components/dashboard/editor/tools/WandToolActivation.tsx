"use client";
import React from "react";
import { CURSOR_WAND, ensureCleanElement } from "../canvas/canvasUtils";
import { useEditorStore } from "../store/editorStore";
import { toast } from "../../Toast";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function WandToolActivation(props: any) {
  const {
    selectedObj, fabricRef, isRestoringRef,
    wandActive, setWandActive, wandTolerance, setWandTolerance, wandToleranceRef,
    setEraserActive, eraserTargetRef,
    setWandPopup,
  } = props;

  const handleWandClick = async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (wandActive) {
      // Deactivate wand — only remove OUR specific mouse:down handler,
      // not all listeners (which would break Fabric selection, pan, etc).
      setWandActive(false);
      canvas.defaultCursor = "default";
      canvas.hoverCursor = "move";
      if ((canvas as any)._wandMouseDown) {
        canvas.off("mouse:down", (canvas as any)._wandMouseDown);
        delete (canvas as any)._wandMouseDown;
      }
      // Restore all object cursors
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      canvas.getObjects().forEach((o: any) => {
        if (o._origCursor !== undefined) { o.hoverCursor = o._origCursor; delete o._origCursor; }
        else if (o.hoverCursor === CURSOR_WAND) { o.hoverCursor = "move"; }
      });
      isRestoringRef.current = false;
      canvas.requestRenderAll();
      return;
    }
    if (!selectedObj || selectedObj.type !== "image") return;
    if (selectedObj.lockMovementX) { toast("Objet verrouillé — déverrouillez-le d'abord", "info"); return; }
    setWandActive(true);
    setEraserActive(false);
    canvas.isDrawingMode = false;
    eraserTargetRef.current = null;

    // Set wand cursor
    canvas.defaultCursor = CURSOR_WAND;
    canvas.hoverCursor = CURSOR_WAND;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    canvas.getObjects().forEach((o: any) => { o._origCursor = o.hoverCursor; o.hoverCursor = CURSOR_WAND; });
    isRestoringRef.current = true;

    // Persistent mouse:down handler — stored on canvas so deactivation can
    // remove only this specific handler
    if ((canvas as any)._wandMouseDown) {
      canvas.off("mouse:down", (canvas as any)._wandMouseDown);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wandMouseDown = async (e: any) => {
      const targetImg = canvas.getActiveObject();
      if (!targetImg || targetImg.type !== "image") return;
      // Guard against concurrent clicks while a wand popup is already
      // open — read from the store, which has the actual wand popup state
      // (previously a local ref was checked but never written).
      if (useEditorStore.getState().wandPopup !== null) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const imgEl = (targetImg as any).getElement();
      const w = imgEl.naturalWidth || imgEl.width;
      const h = imgEl.naturalHeight || imgEl.height;

      const pointer = canvas.getScenePoint(e.e);
      // Convert scene coords -> image local pixel coords using Fabric's
      // built-in matrix invert/transform. This works for any combination
      // of scale/rotation/flip/origin — previously the code manually
      // inverted the affine but assumed originX/Y === "center", so wand
      // picked the wrong pixel on images with "left"/"top" origin
      // (which is what eraser leaves behind).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fabricMod: any = await import("fabric");
      const matrix = targetImg.calcTransformMatrix();
      const invMatrix = fabricMod.util.invertTransform(matrix);
      const localPt = fabricMod.util.transformPoint({ x: pointer.x, y: pointer.y }, invMatrix);
      // The origin-relative local point needs an offset into image pixel
      // space (top-left = 0,0). Fabric's local origin is at the object's
      // origin point, so for center origin we shift by (w/2, h/2).
      const originOffsetX = targetImg.originX === "center" ? w / 2 : 0;
      const originOffsetY = targetImg.originY === "center" ? h / 2 : 0;
      const px = Math.round(localPt.x + originOffsetX);
      const py = Math.round(localPt.y + originOffsetY);

      if (px < 0 || py < 0 || px >= w || py >= h) return;

      let cleanEl: HTMLImageElement;
      try {
        cleanEl = await ensureCleanElement(targetImg);
      } catch {
        console.warn("Magic wand: could not get clean image element");
        return;
      }

      // Capture ALL transform props, not just scale/translate — was
      // dropping flipX/flipY/skew/opacity on wand apply.
      const savedProps = {
        left: targetImg.left, top: targetImg.top,
        scaleX: targetImg.scaleX, scaleY: targetImg.scaleY,
        originX: targetImg.originX, originY: targetImg.originY,
        angle: targetImg.angle,
        flipX: targetImg.flipX, flipY: targetImg.flipY,
        skewX: targetImg.skewX, skewY: targetImg.skewY,
        opacity: targetImg.opacity,
      };

      // Cap working resolution
      const MAX_WAND_DIM = 1500;
      const ratio = Math.min(1, MAX_WAND_DIM / Math.max(w, h));
      const sw = Math.round(w * ratio);
      const sh = Math.round(h * ratio);
      const spx = Math.round(px * ratio);
      const spy = Math.round(py * ratio);

      // Downscaled canvas for flood fill
      const smallCvs = document.createElement("canvas");
      smallCvs.width = sw; smallCvs.height = sh;
      const sctx = smallCvs.getContext("2d")!;
      sctx.drawImage(cleanEl, 0, 0, sw, sh);
      let smallData: ImageData;
      try {
        smallData = sctx.getImageData(0, 0, sw, sh);
      } catch (err) {
        // SecurityError on tainted canvas — ensureCleanElement should have
        // prevented this, but guard anyway so we don't crash silently.
        console.warn("Magic wand: image is tainted, cannot read pixels", err);
        toast("Image cross-origine — impossible d'utiliser la baguette", "error");
        return;
      }
      const sd = smallData.data;

      const sIdx = (spy * sw + spx) * 4;
      const targetR = sd[sIdx], targetG = sd[sIdx + 1], targetB = sd[sIdx + 2];
      const tol = wandToleranceRef.current;

      // Flood fill on downscaled image — offloaded to Web Worker.
      // Use a requestId echoed back by the worker so if the user clicks
      // rapidly we only accept the newest response; older responses
      // would otherwise arrive out of order and apply a stale mask.
      const requestId = Date.now() + Math.random();
      const mask = await new Promise<Uint8Array>((resolve, reject) => {
        try {
          const worker = new Worker('/workers/floodFillWorker.js');
          const imageDataCopy = new Uint8ClampedArray(sd.buffer.slice(0));
          worker.onmessage = (evt: MessageEvent) => {
            // Ignore late responses whose id doesn't match
            if (evt.data?.requestId !== requestId) return;
            resolve(new Uint8Array(evt.data.mask));
            worker.terminate();
          };
          worker.onerror = (err: ErrorEvent) => {
            console.warn("Flood fill worker error, falling back to main thread", err);
            worker.terminate();
            // Fallback: run on main thread
            const fallbackMask = new Uint8Array(sw * sh);
            const stack = [spx + spy * sw];
            fallbackMask[spx + spy * sw] = 1;
            while (stack.length > 0) {
              const pos = stack.pop()!;
              const i = pos * 4;
              const dr = Math.abs(sd[i] - targetR);
              const dg = Math.abs(sd[i + 1] - targetG);
              const db = Math.abs(sd[i + 2] - targetB);
              const dist = (dr + dg + db) / 3;
              if (dist < tol && sd[i + 3] > 10) {
                fallbackMask[pos] = dist < tol * 0.7 ? 2 : 1;
                const x = pos % sw, y = (pos - x) / sw;
                if (x > 0 && !fallbackMask[pos - 1]) { fallbackMask[pos - 1] = 1; stack.push(pos - 1); }
                if (x < sw - 1 && !fallbackMask[pos + 1]) { fallbackMask[pos + 1] = 1; stack.push(pos + 1); }
                if (y > 0 && !fallbackMask[pos - sw]) { fallbackMask[pos - sw] = 1; stack.push(pos - sw); }
                if (y < sh - 1 && !fallbackMask[pos + sw]) { fallbackMask[pos + sw] = 1; stack.push(pos + sw); }
              } else {
                fallbackMask[pos] = 0;
              }
            }
            resolve(fallbackMask);
          };
          worker.postMessage({
            imageData: imageDataCopy.buffer,
            startX: spx,
            startY: spy,
            tolerance: tol,
            width: sw,
            height: sh,
            requestId,
          }, [imageDataCopy.buffer]);
        } catch (err) {
          reject(err);
        }
      });

      // Upscale mask to full resolution
      const fullCvs = document.createElement("canvas");
      fullCvs.width = w; fullCvs.height = h;
      const fctx = fullCvs.getContext("2d")!;
      fctx.drawImage(cleanEl, 0, 0, w, h);
      const fullData = fctx.getImageData(0, 0, w, h);
      const fd = fullData.data;

      for (let fy = 0; fy < h; fy++) {
        const my = Math.min(sh - 1, Math.round(fy / h * sh));
        for (let fx = 0; fx < w; fx++) {
          const mx = Math.min(sw - 1, Math.round(fx / w * sw));
          const mVal = mask[my * sw + mx];
          if (mVal >= 1) {
            const fi = (fy * w + fx) * 4;
            const dr2 = Math.abs(fd[fi] - targetR);
            const dg2 = Math.abs(fd[fi + 1] - targetG);
            const db2 = Math.abs(fd[fi + 2] - targetB);
            const dist2 = (dr2 + dg2 + db2) / 3;
            if (dist2 < tol && fd[fi + 3] > 10) {
              const fade = dist2 < tol * 0.7 ? 0 : Math.round((dist2 - tol * 0.7) / (tol * 0.3) * fd[fi + 3]);
              fd[fi + 3] = fade;
            }
          }
        }
      }

      // Modified image: selected pixels removed
      fctx.putImageData(fullData, 0, 0);
      const modifiedDataUrl = fullCvs.toDataURL("image/png");

      // Extracted image: keep only removed pixels
      fctx.drawImage(cleanEl, 0, 0, w, h);
      const origFull = fctx.getImageData(0, 0, w, h);
      const od = origFull.data;
      for (let i = 0; i < od.length; i += 4) {
        const removedAlpha = od[i + 3] - fd[i + 3];
        if (removedAlpha > 0) {
          od[i + 3] = removedAlpha;
        } else {
          od[i + 3] = 0;
        }
      }
      fctx.putImageData(origFull, 0, 0);
      const extractedDataUrl = fullCvs.toDataURL("image/png");

      // Highlight: original image + pink overlay on selected pixels
      fctx.drawImage(cleanEl, 0, 0, w, h);
      const hlOverlay = fctx.createImageData(w, h);
      for (let fy = 0; fy < h; fy++) {
        const my = Math.min(sh - 1, Math.round(fy / h * sh));
        for (let fx = 0; fx < w; fx++) {
          const mx = Math.min(sw - 1, Math.round(fx / w * sw));
          if (mask[my * sw + mx] >= 1) {
            const fi = (fy * w + fx) * 4;
            if (fd[fi + 3] < 255) {
              hlOverlay.data[fi] = 254;
              hlOverlay.data[fi + 1] = 1;
              hlOverlay.data[fi + 2] = 84;
              hlOverlay.data[fi + 3] = 80;
            }
          }
        }
      }
      smallCvs.width = w; smallCvs.height = h;
      const olCtx = smallCvs.getContext("2d")!;
      olCtx.putImageData(hlOverlay, 0, 0);
      fctx.drawImage(smallCvs, 0, 0);
      const highlightDataUrl = fullCvs.toDataURL("image/png");

      // Show highlight preview
      const origSrc = targetImg.getSrc();
      targetImg.setSrc(highlightDataUrl).then(() => {
        targetImg.dirty = true;
        canvas.requestRenderAll();
      });

      // Memory leak fix: release temp canvases used for wand processing
      smallCvs.width = 0; smallCvs.height = 0;
      fullCvs.width = 0; fullCvs.height = 0;

      // Show action popup
      setWandPopup({ targetImg, savedProps, modifiedDataUrl, extractedDataUrl, origSrc, clickX: e.e.clientX, clickY: e.e.clientY });
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (canvas as any)._wandMouseDown = wandMouseDown;
    canvas.on("mouse:down", wandMouseDown);
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleWandClick}
        className={`flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium transition-colors ${
          wandActive ? "bg-amber-100 text-amber-700" : "text-gray-600 hover:bg-gray-100"
        }`}
        title={wandActive ? "Désactiver la baguette" : "Baguette magique — cliquez sur une couleur pour la supprimer"}
        data-sel-tool="wand"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
        {wandActive ? "Baguette active" : "Baguette"}
      </button>
      {wandActive && (
        <>
          <span className="text-[10px] text-gray-500 font-medium">Tolérance :</span>
          <input
            type="range"
            min={10}
            max={80}
            value={wandTolerance}
            onChange={(e) => { const v = parseInt(e.target.value); setWandTolerance(v); wandToleranceRef.current = v; }}
            className="w-16 h-1.5 accent-[#f59e0b]"
            title={`Tolérance: ${wandTolerance}`}
          />
          <span className="text-[10px] text-gray-500 w-5 tabular-nums">{wandTolerance}</span>
        </>
      )}
    </div>
  );
}

export default WandToolActivation;
