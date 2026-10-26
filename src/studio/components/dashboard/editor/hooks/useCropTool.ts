"use client";

import { useCallback } from "react";
import { toast } from "../../Toast";
import { getTempCanvas, releaseTempCanvas } from "../canvas/canvasUtils";

/* ═══════════════════════════════════════════════════════════════
   Crop tool hook — start, apply, cancel crop operations.
   ═══════════════════════════════════════════════════════════════ */

interface UseCropToolParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fabricRef: React.MutableRefObject<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectedObj: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSelectedObj: (v: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cropTargetRef: React.MutableRefObject<any>;
  setCropping: (v: boolean) => void;
  isRestoringRef: React.MutableRefObject<boolean>;
  BLEED_PX: number;
  canvasWidth: number;
  canvasHeight: number;
  bufferWidth: number;
  bufferHeight: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cleanupCropElements(canvas: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  canvas.getObjects().filter((o: any) => o._isCropRect || o._isCropOverlay || o._isCropPreview).forEach((o: any) => canvas.remove(o));
  // Restore uniform scaling after crop
  canvas.uniformScaling = true;
}

export function useCropTool({
  fabricRef, selectedObj, setSelectedObj, cropTargetRef, setCropping, isRestoringRef, BLEED_PX,
  canvasWidth, canvasHeight, bufferWidth, bufferHeight,
}: UseCropToolParams) {
  const startCrop = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (!active || active.type !== "image") return;

    const fabric = await import("fabric");

    cropTargetRef.current = active;

    // Get the image's bounding rect in canvas coords (works regardless of origin)
    const bound = active.getBoundingRect();
    const imgLeft = bound.left;
    const imgTop = bound.top;
    const visualW = bound.width;
    const visualH = bound.height;

    // Snapshot original interactive state so we can restore it on any exit
    // path (cancel, error, early return). Without this, an early return leaves
    // the image stuck at opacity 0.4 / non-selectable.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (active as any)._cropSavedOpacity = active.opacity;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (active as any)._cropSavedSelectable = active.selectable;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (active as any)._cropSavedEvented = active.evented;

    // Make the image semi-transparent during crop
    active.set({ opacity: 0.4, selectable: false, evented: false });

    // Dark overlay covering the whole canvas (including bleed area)
    const overlay = new fabric.Rect({
      left: 0, top: 0,
      width: bufferWidth, height: bufferHeight,
      originX: 'left', originY: 'top',
      fill: "rgba(0,0,0,0.4)",
      selectable: false, evented: false,
      excludeFromExport: true,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (overlay as any)._isCropOverlay = true;
    canvas.add(overlay);

    // Crop selection rectangle (bright area the user resizes)
    // Disable uniform scaling so crop rect can be freely resized
    canvas.uniformScaling = false;
    const cropRect = new fabric.Rect({
      left: imgLeft,
      top: imgTop,
      width: visualW,
      height: visualH,
      originX: 'left',
      originY: 'top',
      fill: "transparent",
      stroke: "#ff3366",
      strokeWidth: 2,
      strokeDashArray: [6, 3],
      strokeUniform: true,
      cornerColor: "#ff3366",
      cornerStrokeColor: "#fff",
      cornerSize: 10,
      transparentCorners: false,
      hasRotatingPoint: false,
      lockRotation: true,
      lockUniScaling: false,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cropRect as any)._isCropRect = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cropRect as any)._ratioLocked = false;

    // Show a full-opacity copy of the image clipped to the crop rect (live preview)
    const previewImg = new fabric.FabricImage(active.getElement(), {
      left: active.left,
      top: active.top,
      scaleX: active.scaleX,
      scaleY: active.scaleY,
      originX: active.originX,
      originY: active.originY,
      angle: active.angle,
      selectable: false,
      evented: false,
      excludeFromExport: true,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (previewImg as any)._isCropPreview = true;
    // Clip the preview to the crop rect bounds
    const clipForPreview = new fabric.Rect({
      left: imgLeft, top: imgTop,
      width: visualW, height: visualH,
      originX: 'left', originY: 'top',
      absolutePositioned: true,
    });
    previewImg.clipPath = clipForPreview;
    canvas.add(previewImg);
    canvas.add(cropRect);

    // Update the preview clip as the crop rect moves/resizes
    const updateClip = () => {
      const cl = cropRect.left || 0;
      const ct = cropRect.top || 0;
      const cw = (cropRect.width || 0) * (cropRect.scaleX || 1);
      const ch = (cropRect.height || 0) * (cropRect.scaleY || 1);
      clipForPreview.set({ left: cl, top: ct, width: cw, height: ch });
      canvas.requestRenderAll();
    };
    cropRect.on("moving", updateClip);
    cropRect.on("scaling", updateClip);

    canvas.setActiveObject(cropRect);
    canvas.requestRenderAll();
    setCropping(true);
  }, [canvasWidth, canvasHeight, bufferWidth, bufferHeight, BLEED_PX, fabricRef, cropTargetRef, setCropping]);


  const applyCrop = useCallback(async () => {
    const canvas = fabricRef.current;
    const target = cropTargetRef.current;
    if (!canvas || !target) return;

    const fabric = await import("fabric");

    // Helper to restore a target image's interactive state after an early
    // return or error path. Uses the snapshot taken in startCrop.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const restoreTarget = (t: any) => {
      if (!t) return;
      t.set({
        opacity: t._cropSavedOpacity ?? 1,
        selectable: t._cropSavedSelectable ?? true,
        evented: t._cropSavedEvented ?? true,
      });
      delete t._cropSavedOpacity;
      delete t._cropSavedSelectable;
      delete t._cropSavedEvented;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cropRect = canvas.getObjects().find((o: any) => o._isCropRect);
    if (!cropRect) {
      cleanupCropElements(canvas);
      restoreTarget(target);
      canvas.requestRenderAll();
      cropTargetRef.current = null;
      setCropping(false);
      return;
    }

    // ─── Coordinate spaces used below ───────────────────────────────────
    //
    //   canvas space   — Fabric canvas pixel coords (what getBoundingRect,
    //                    cropRect.left/top use). Includes pan/zoom.
    //
    //   object-local   — coords relative to the target image's origin
    //                    (originX/originY), AFTER undoing translate/rotate/
    //                    scale/flip. If originX/originY is "center", local
    //                    (0,0) is the image's center and corners range
    //                    from (-w/2, -h/2) to (+w/2, +h/2). If origin is
    //                    "left"/"top", local (0,0) is the top-left.
    //
    //   image-pixel    — coords in the underlying HTMLImageElement's
    //                    natural pixel grid, top-left = (0,0). This is
    //                    what ctx.drawImage(sx, sy, sw, sh, ...) expects.
    //
    // To get from canvas space → object-local we apply the inverse of the
    // target's transform matrix. To get from object-local → image-pixel
    // we add the origin offset (w/2 or h/2 if origin is "center"/etc.) and
    // account for any existing cropX/cropY (double-crop case).
    // ────────────────────────────────────────────────────────────────────

    // Crop rect corners in canvas space
    const cropLeft = cropRect.left || 0;
    const cropTop = cropRect.top || 0;
    const cropW = (cropRect.width || 0) * (cropRect.scaleX || 1);
    const cropH = (cropRect.height || 0) * (cropRect.scaleY || 1);

    // Get target's canvas→object matrix and invert it so we can map the
    // crop rect's four canvas-space corners into the target's local space.
    // This correctly handles rotation, flipX/flipY, non-uniform scale, and
    // arbitrary origin — which the old (sx = target.scaleX) math did not.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matrix = target.calcTransformMatrix();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invMatrix = (fabric as any).util.invertTransform(matrix);

    const canvasCorners = [
      { x: cropLeft, y: cropTop },
      { x: cropLeft + cropW, y: cropTop },
      { x: cropLeft + cropW, y: cropTop + cropH },
      { x: cropLeft, y: cropTop + cropH },
    ];
    const localCorners = canvasCorners.map((p) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fabric as any).util.transformPoint(p, invMatrix)
    );

    // Object-local → image-pixel: if origin is "center", local (0,0) is
    // the centre so we must shift by +w/2, +h/2 to get top-left pixel
    // coords. For "left"/"top" origin no shift is needed. ("right"/
    // "bottom" origins shift by the full width/height.)
    const w = target.width || 0;
    const h = target.height || 0;
    const originOffsetX =
      target.originX === "center" ? w / 2 :
      target.originX === "right" ? w : 0;
    const originOffsetY =
      target.originY === "center" ? h / 2 :
      target.originY === "bottom" ? h : 0;

    const localXs = localCorners.map((c) => c.x);
    const localYs = localCorners.map((c) => c.y);
    const localMinX = Math.min(...localXs) + originOffsetX;
    const localMinY = Math.min(...localYs) + originOffsetY;
    const localMaxX = Math.max(...localXs) + originOffsetX;
    const localMaxY = Math.max(...localYs) + originOffsetY;

    // Double-crop: if the target already has a cropX/cropY, the visible
    // image starts at (cropX, cropY) in the source element. Shift our
    // pixel-space coords so they map into the original (uncropped) source
    // element that getElement() returns.
    const existingCropX = target.cropX || 0;
    const existingCropY = target.cropY || 0;

    // Source rectangle to pull from the full source element, clamped to
    // the currently visible cropped region of the target. The element
    // may be an HTMLImageElement (has naturalWidth) or an HTMLCanvasElement
    // (has only width) — use `any` to read both shapes uniformly.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const srcEl: any = target.getElement?.();
    const srcElW = srcEl?.naturalWidth || srcEl?.width || (w + existingCropX);
    const srcElH = srcEl?.naturalHeight || srcEl?.height || (h + existingCropY);

    const visibleLeft = existingCropX;
    const visibleTop = existingCropY;
    const visibleRight = Math.min(srcElW, existingCropX + w);
    const visibleBottom = Math.min(srcElH, existingCropY + h);

    const srcX = Math.max(visibleLeft, Math.min(visibleRight, localMinX + existingCropX));
    const srcY = Math.max(visibleTop, Math.min(visibleBottom, localMinY + existingCropY));
    const srcRight = Math.max(visibleLeft, Math.min(visibleRight, localMaxX + existingCropX));
    const srcBottom = Math.max(visibleTop, Math.min(visibleBottom, localMaxY + existingCropY));
    const srcW = Math.max(1, srcRight - srcX);
    const srcH = Math.max(1, srcBottom - srcY);

    // For placement of the resulting image, use the actual canvas-space
    // bounding box of the crop rect (clamped to the visible image). This
    // keeps the crop visually where the user placed it.
    const cropBound = cropRect.getBoundingRect();
    const clampedCropLeft = cropBound.left;
    const clampedCropTop = cropBound.top;
    const clampedCropW = cropBound.width;
    const clampedCropH = cropBound.height;

    // Get a drawable source for the crop. For an already-cropped Fabric
    // image, getElement() still returns the full natural-source element
    // (Fabric stores cropX/cropY separately), which is exactly what we
    // want for source-pixel math above.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let drawSource: HTMLImageElement | HTMLCanvasElement | null =
      target.getElement?.() || target._element || target._originalElement || null;

    if (!drawSource) {
      // Fallback: export via Fabric's toDataURL and load as new Image.
      // Note: this loses rotation fidelity but is only hit when we can't
      // reach the underlying element at all.
      try {
        const dataUrl = target.toDataURL({ format: "png" });
        const tmpImg = new Image();
        await new Promise<void>((resolve, reject) => {
          tmpImg.onload = () => resolve();
          tmpImg.onerror = reject;
          tmpImg.src = dataUrl;
        });
        drawSource = tmpImg;
      } catch {
        // Can't get image data — cancel crop silently
        cleanupCropElements(canvas);
        restoreTarget(target);
        canvas.requestRenderAll();
        cropTargetRef.current = null;
        setCropping(false);
        return;
      }
    }

    // Offscreen canvas is sized to the SOURCE rectangle (srcW × srcH)
    // so we copy at native resolution — not to clipW × clipH (the
    // canvas-space size), which would resample and lose quality.
    const roundW = Math.max(1, Math.round(srcW));
    const roundH = Math.max(1, Math.round(srcH));
    const offscreen = document.createElement("canvas");
    offscreen.width = roundW;
    offscreen.height = roundH;
    const ctx = offscreen.getContext("2d");
    if (!ctx) {
      // Should never happen with a fresh canvas, but just in case
      cleanupCropElements(canvas);
      restoreTarget(target);
      canvas.requestRenderAll();
      cropTargetRef.current = null;
      setCropping(false);
      return;
    }
    // Copy the source rectangle from the full natural element into the
    // offscreen at 1:1 pixel ratio.
    ctx.drawImage(drawSource, srcX, srcY, srcW, srcH, 0, 0, roundW, roundH);
    const croppedDataUrl = offscreen.toDataURL("image/png");

    // Prevent history from saving intermediate states
    isRestoringRef.current = true;

    const newImgEl = new Image();
    newImgEl.onerror = () => {
      isRestoringRef.current = false;
      // Restore the target on error so it isn't left stuck semi-transparent
      restoreTarget(target);
      cleanupCropElements(canvas);
      canvas.requestRenderAll();
      cropTargetRef.current = null;
      setCropping(false);
      toast("Erreur lors du rognage", "error");
    };
    newImgEl.onload = () => {
      const newImg = new fabric.FabricImage(newImgEl);
      // Position the new image at the clamped crop rect's visual location.
      // Scale is chosen so the new image's displayed size matches the
      // crop rect's canvas-space size. Rotation is preserved from the
      // original target.
      const displayScaleX = clampedCropW / roundW;
      const displayScaleY = clampedCropH / roundH;
      newImg.set({
        left: clampedCropLeft + clampedCropW / 2,
        top: clampedCropTop + clampedCropH / 2,
        scaleX: displayScaleX,
        scaleY: displayScaleY,
        originX: "center",
        originY: "center",
        angle: target.angle || 0,
      });
      cleanupCropElements(canvas);
      canvas.remove(target);
      canvas.add(newImg);
      canvas.setActiveObject(newImg);
      canvas.requestRenderAll();
      // Re-enable history
      isRestoringRef.current = false;
      canvas.fire("object:modified", { target: newImg, _historyLabel: "Image recadrée" });
      // Clear refs only AFTER swap is complete — clearing them synchronously
      // (before onload) caused a race where cancelCrop/other handlers would
      // see a null target while the crop was still in flight.
      cropTargetRef.current = null;
      setCropping(false);
    };
    newImgEl.src = croppedDataUrl;
  }, [fabricRef, cropTargetRef, setCropping, isRestoringRef]);


  const cancelCrop = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const target = cropTargetRef.current;
    cleanupCropElements(canvas);
    if (target) {
      // Restore using the snapshot taken in startCrop so we don't clobber
      // any pre-existing non-default values (e.g. a locked image).
      target.set({
        opacity: target._cropSavedOpacity ?? 1,
        selectable: target._cropSavedSelectable ?? true,
        evented: target._cropSavedEvented ?? true,
      });
      delete target._cropSavedOpacity;
      delete target._cropSavedSelectable;
      delete target._cropSavedEvented;
    }
    canvas.requestRenderAll();
    cropTargetRef.current = null;
    setCropping(false);
  }, [fabricRef, cropTargetRef, setCropping]);


  return { startCrop, applyCrop, cancelCrop };
}
