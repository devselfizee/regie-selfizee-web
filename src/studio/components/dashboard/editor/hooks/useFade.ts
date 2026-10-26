"use client";

import { useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════
   Fade effect hook — applies directional fade to images.
   ═══════════════════════════════════════════════════════════════ */

interface UseFadeParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fabricRef: React.MutableRefObject<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectedObj: any;
  fadeOrigImgRef: React.MutableRefObject<HTMLImageElement | null>;
  fadeOffscreenRef: React.MutableRefObject<HTMLCanvasElement | null>;
  fadeMaskRef: React.MutableRefObject<HTMLCanvasElement | null>;
  forceRender: (fn: (n: number) => number) => void;
  isRestoringRef: React.MutableRefObject<boolean>;
}

export function useFade({ fabricRef, selectedObj, fadeOrigImgRef, fadeOffscreenRef, fadeMaskRef, forceRender, isRestoringRef }: UseFadeParams) {
  const applyFade = useCallback((obj: any, dir: string | null, fadePercent: number, fadeOpacity: number = 0, fadeOffset: number = 0, preview = false) => {
    const canvas = fabricRef.current;
    if (!canvas || !obj) return;
    const origSrc = obj._fadeOriginalSrc;
    if (!origSrc) return;

    if (!dir) {
      fadeOrigImgRef.current = null; // invalidate cache
      if (obj.setSrc) {
        obj.setSrc(origSrc).then(() => { obj.dirty = true; canvas.requestRenderAll(); canvas.fire("object:modified", { target: obj, _historyLabel: "Fondu supprimé" }); forceRender((n: number) => n + 1); });
      } else {
        const el = obj.getElement(); el.src = origSrc; obj.dirty = true; canvas.requestRenderAll(); canvas.fire("object:modified", { target: obj, _historyLabel: "Fondu supprimé" }); forceRender((n: number) => n + 1);
      }
      return;
    }

    // Core render logic — shared between preview and final modes
    const doRender = (applyImg: HTMLImageElement) => {
      const w = applyImg.width;
      const h = applyImg.height;
      const fadeSize = fadePercent / 100;
      const endAlpha = fadeOpacity / 100;
      const startOffset = fadeOffset / 100;

      // Reuse canvases in preview mode to avoid GC pressure
      let offscreen: HTMLCanvasElement;
      let mask: HTMLCanvasElement;
      if (preview) {
        if (!fadeOffscreenRef.current) fadeOffscreenRef.current = document.createElement("canvas");
        if (!fadeMaskRef.current) fadeMaskRef.current = document.createElement("canvas");
        offscreen = fadeOffscreenRef.current;
        mask = fadeMaskRef.current;
        if (offscreen.width !== w || offscreen.height !== h) { offscreen.width = w; offscreen.height = h; }
        if (mask.width !== w || mask.height !== h) { mask.width = w; mask.height = h; }
      } else {
        offscreen = document.createElement("canvas");
        offscreen.width = w; offscreen.height = h;
        mask = document.createElement("canvas");
        mask.width = w; mask.height = h;
      }

      const ctx = offscreen.getContext("2d")!;
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(applyImg, 0, 0);

      const mCtx = mask.getContext("2d")!;
      mCtx.clearRect(0, 0, w, h);

      // Power-curve gradient: makes the transparent side dramatically transparent
      // Forward (transparent→opaque): ease-in, stays transparent longer
      // Reverse (opaque→transparent): ease-out, drops to transparent faster
      const CURVE_POWER = 2.2;
      const CURVE_STEPS = 10;
      const addCurveStops = (grad: CanvasGradient, fromAlpha: number, toAlpha: number) => {
        for (let i = 0; i <= CURVE_STEPS; i++) {
          const t = i / CURVE_STEPS;
          let alpha;
          if (fromAlpha <= toAlpha) {
            // transparent→opaque: ease-in (hold transparent, ramp up at end)
            alpha = fromAlpha + (toAlpha - fromAlpha) * Math.pow(t, CURVE_POWER);
          } else {
            // opaque→transparent: ease-out (drop fast, hold transparent)
            alpha = toAlpha + (fromAlpha - toAlpha) * Math.pow(1 - t, CURVE_POWER);
          }
          grad.addColorStop(t, `rgba(0,0,0,${alpha})`);
        }
      };

      if (dir === "radial") {
        const r = Math.min(w, h) / 2;
        const innerR = r * (1 - startOffset - fadeSize);
        const outerR = r * (1 - startOffset);
        mCtx.fillStyle = `rgba(0,0,0,${endAlpha})`;
        mCtx.fillRect(0, 0, w, h);
        const grad = mCtx.createRadialGradient(w/2, h/2, Math.max(0, innerR), w/2, h/2, Math.max(0, outerR));
        addCurveStops(grad, 1, endAlpha); // opaque center → transparent edge
        mCtx.fillStyle = "rgba(0,0,0,1)";
        mCtx.beginPath(); mCtx.arc(w/2, h/2, Math.max(0, innerR), 0, Math.PI*2); mCtx.fill();
        mCtx.fillStyle = grad;
        mCtx.fillRect(0, 0, w, h);
      } else {
        const isVert = dir === "top" || dir === "bottom";
        const dim = isVert ? h : w;
        const startPx = Math.round(dim * startOffset);
        const endPx = Math.min(dim, Math.round(startPx + dim * fadeSize));

        if (dir === "top") {
          mCtx.fillStyle = `rgba(0,0,0,${endAlpha})`;
          mCtx.fillRect(0, 0, w, startPx);
          const grad = mCtx.createLinearGradient(0, startPx, 0, endPx);
          addCurveStops(grad, endAlpha, 1); // transparent→opaque
          mCtx.fillStyle = grad;
          mCtx.fillRect(0, startPx, w, endPx - startPx);
          mCtx.fillStyle = "rgba(0,0,0,1)";
          mCtx.fillRect(0, endPx, w, h - endPx);
        } else if (dir === "bottom") {
          const bOpaque = h - endPx;
          const bGradEnd = h - startPx;
          mCtx.fillStyle = "rgba(0,0,0,1)";
          mCtx.fillRect(0, 0, w, Math.max(0, bOpaque));
          const grad = mCtx.createLinearGradient(0, Math.max(0, bOpaque), 0, bGradEnd);
          addCurveStops(grad, 1, endAlpha); // opaque→transparent
          mCtx.fillStyle = grad;
          mCtx.fillRect(0, Math.max(0, bOpaque), w, bGradEnd - Math.max(0, bOpaque));
          mCtx.fillStyle = `rgba(0,0,0,${endAlpha})`;
          mCtx.fillRect(0, bGradEnd, w, h - bGradEnd);
        } else if (dir === "left") {
          mCtx.fillStyle = `rgba(0,0,0,${endAlpha})`;
          mCtx.fillRect(0, 0, startPx, h);
          const grad = mCtx.createLinearGradient(startPx, 0, endPx, 0);
          addCurveStops(grad, endAlpha, 1); // transparent→opaque
          mCtx.fillStyle = grad;
          mCtx.fillRect(startPx, 0, endPx - startPx, h);
          mCtx.fillStyle = "rgba(0,0,0,1)";
          mCtx.fillRect(endPx, 0, w - endPx, h);
        } else if (dir === "right") {
          const rOpaque = w - endPx;
          const rGradEnd = w - startPx;
          mCtx.fillStyle = "rgba(0,0,0,1)";
          mCtx.fillRect(0, 0, Math.max(0, rOpaque), h);
          const grad = mCtx.createLinearGradient(Math.max(0, rOpaque), 0, rGradEnd, 0);
          addCurveStops(grad, 1, endAlpha); // opaque→transparent
          mCtx.fillStyle = grad;
          mCtx.fillRect(Math.max(0, rOpaque), 0, rGradEnd - Math.max(0, rOpaque), h);
          mCtx.fillStyle = `rgba(0,0,0,${endAlpha})`;
          mCtx.fillRect(rGradEnd, 0, w - rGradEnd, h);
        } else if (dir.includes("-")) {
          const diag = Math.sqrt(w * w + h * h);
          const diagStart = diag * startOffset;
          const diagEnd = Math.min(diag, diagStart + diag * fadeSize);
          let gx1 = 0, gy1 = 0, gx2 = w, gy2 = h;
          if (dir === "top-left") { gx1 = 0; gy1 = 0; gx2 = w; gy2 = h; }
          else if (dir === "top-right") { gx1 = w; gy1 = 0; gx2 = 0; gy2 = h; }
          else if (dir === "bottom-left") { gx1 = 0; gy1 = h; gx2 = w; gy2 = 0; }
          else if (dir === "bottom-right") { gx1 = w; gy1 = h; gx2 = 0; gy2 = 0; }
          const grad = mCtx.createLinearGradient(gx1, gy1, gx2, gy2);
          const t1 = diagStart / diag;
          const t2 = Math.min(1, diagEnd / diag);
          // Flat zone before gradient
          if (t1 > 0.001) grad.addColorStop(0, `rgba(0,0,0,${endAlpha})`);
          // Build curved gradient between t1 and t2
          for (let i = 0; i <= CURVE_STEPS; i++) {
            const t = i / CURVE_STEPS;
            const curved = Math.pow(t, CURVE_POWER);
            const alpha = endAlpha + (1 - endAlpha) * curved;
            const pos = t1 + (t2 - t1) * t;
            grad.addColorStop(Math.min(1, pos), `rgba(0,0,0,${alpha})`);
          }
          // Flat zone after gradient
          if (t2 < 0.999) grad.addColorStop(1, "rgba(0,0,0,1)");
          mCtx.fillStyle = grad;
          mCtx.fillRect(0, 0, w, h);
        }
      }

      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(mask, 0, 0);
      ctx.globalCompositeOperation = "source-over";

      if (preview) {
        // Preview mode: directly swap the fabric element to avoid toDataURL + setSrc overhead
        // Use a dedicated canvas clone so the reusable offscreen stays independent
        const previewCanvas = document.createElement("canvas");
        previewCanvas.width = w; previewCanvas.height = h;
        previewCanvas.getContext("2d")!.drawImage(offscreen, 0, 0);
        obj._element = previewCanvas;
        obj._originalElement = previewCanvas;
        obj.dirty = true;
        canvas.requestRenderAll();
      } else {
        // Final mode: full toDataURL + setSrc for proper serialization
        const newSrc = offscreen.toDataURL("image/png");
        // Memory leak fix: release temp canvases created in non-preview (final) mode
        offscreen.width = 0; offscreen.height = 0;
        mask.width = 0; mask.height = 0;
        if (obj.setSrc) {
          obj.setSrc(newSrc).then(() => {
            obj.dirty = true;
            canvas.requestRenderAll();
            canvas.fire("object:modified", { target: obj, _historyLabel: "Fondu appliqué" });
            forceRender((n: number) => n + 1);
          });
        } else {
          const el = obj.getElement();
          el.src = newSrc;
          obj.dirty = true;
          canvas.requestRenderAll();
          canvas.fire("object:modified", { target: obj, _historyLabel: "Fondu appliqué" });
          forceRender((n: number) => n + 1);
        }
      }
    };

    // In preview mode, try to use cached original image for synchronous rendering
    if (preview && fadeOrigImgRef.current && fadeOrigImgRef.current.src === origSrc && fadeOrigImgRef.current.complete) {
      doRender(fadeOrigImgRef.current);
    } else {
      const applyImg = new Image();
      applyImg.onerror = () => { isRestoringRef.current = false; };
      applyImg.onload = () => {
        fadeOrigImgRef.current = applyImg; // cache for subsequent preview calls
        doRender(applyImg);
      };
      applyImg.src = origSrc;
    }
  }, []);

  return { applyFade };
}
