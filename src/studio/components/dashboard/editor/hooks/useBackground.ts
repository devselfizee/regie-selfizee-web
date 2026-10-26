"use client";

import { useCallback, useState } from "react";
import { toast } from "../../Toast";
import { apiUrl } from "@/studio/lib/api";
import { replaceInGroupEditing } from "../canvas/canvasUtils";

/* ═══════════════════════════════════════════════════════════════
   Background hook — update background color + AI remove background.
   ═══════════════════════════════════════════════════════════════ */

interface UseBackgroundParams {
  fabricRef: React.MutableRefObject<any>;
  canvasWidth: number;
  canvasHeight: number;
  BLEED_PX: number;
  setBgColor: (v: string) => void;
  setSelectedObj: (v: any) => void;
}

export function useBackground({ fabricRef, canvasWidth, canvasHeight, BLEED_PX, setBgColor, setSelectedObj }: UseBackgroundParams) {
  const [removingBg, setRemovingBg] = useState(false);

  const updateBgColor = useCallback(async (color: string) => {
    setBgColor(color);
    const canvas = fabricRef.current;
    if (!canvas) return;
    // Single store import (was duplicated before)
    const { useEditorStore } = await import("../store/editorStore");
    // Force-reset isRestoring in case it was stuck (safety net after failed undo/redo)
    useEditorStore.getState().isRestoringRef.current = false;
    const fabric = await import("fabric");
    // Read dimensions fresh from the store
    const { canvasWidth: cw, canvasHeight: ch, BLEED_PX: bp } = useEditorStore.getState();
    const _cw = cw || canvasWidth;
    const _ch = ch || canvasHeight;
    const _bp = bp || BLEED_PX;

    // Ensure canvas clipPath is correctly set (may be missing after undo/redo)
    if (!canvas.clipPath || canvas.clipPath.width !== _cw || canvas.clipPath.height !== _ch) {
      canvas.clipPath = new fabric.Rect({
        left: _bp, top: _bp, width: _cw, height: _ch,
        originX: "left", originY: "top", absolutePositioned: true,
      });
    }

    // Remove legacy gradient bg objects (merged into solidBg now)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const legacyGrad = canvas.getObjects().filter((o: any) => o._isGradientBg);
    legacyGrad.forEach((o: any) => canvas.remove(o));

    // Find existing solidBg and update its fill (do NOT remove bgImage — it stays on top)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let solidBg = canvas.getObjects().find((o: any) => o._isSolidBg);
    if (solidBg) {
      solidBg.set({ fill: color, width: _cw, height: _ch, left: _bp, top: _bp, scaleX: 1, scaleY: 1 });
    } else {
      // Create fresh solidBg if missing
      solidBg = new fabric.Rect({
        left: _bp, top: _bp,
        width: _cw, height: _ch,
        fill: color,
        scaleX: 1, scaleY: 1,
        originX: "left", originY: "top",
        selectable: false, evented: false, hoverCursor: "default",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (solidBg as any)._isSolidBg = true;
      canvas.add(solidBg);
    }
    // Ensure solidBg is behind bgImage, and designAreaBg behind solidBg
    canvas.sendObjectToBack(solidBg);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dBg = canvas.getObjects().find((o: any) => o._isDesignAreaBg);
    if (dBg) canvas.sendObjectToBack(dBg);
    canvas.requestRenderAll();
    canvas.fire("object:modified", { target: solidBg, _historyLabel: "Fond modifié" });
  }, [canvasWidth, canvasHeight]);


  const removeBackground = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (!active || active.type !== "image") return;

    setRemovingBg(true);
    try {
      // Export the fabric image as a blob
      const dataUrl = active.toDataURL({ format: "png" });
      const base64 = dataUrl.split(",")[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "image/png" });

      const form = new FormData();
      form.append("file", blob, "image.png");
      form.append("model_type", "hr");

      const { fetchWithTimeout } = await import("../canvas/canvasUtils");
      const res = await fetchWithTimeout(apiUrl("/api/remove-bg"), { method: "POST", body: form, timeoutMs: 90000 });
      if (!res.ok) throw new Error("Erreur détourage");

      const pngBlob = await res.blob();
      // Convert to data URL (not blob URL) so fabric can re-read the src
      // later during undo/redo/preview without hitting ERR_FILE_NOT_FOUND.
      const pngDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Erreur lecture image"));
        reader.readAsDataURL(pngBlob);
      });

      const fabric = await import("fabric");

      // Wait for the image to load before swapping
      await new Promise<void>((resolve, reject) => {
        const imgEl = document.createElement("img");
        imgEl.crossOrigin = "anonymous";
        imgEl.onload = () => {
          try {
            const newImg = new fabric.FabricImage(imgEl);
            // Compute scale so the new image matches the original visual size
            const origVisualW = (active.width || 1) * (active.scaleX || 1);
            const origVisualH = (active.height || 1) * (active.scaleY || 1);
            const newScaleX = origVisualW / (newImg.width || 1);
            const newScaleY = origVisualH / (newImg.height || 1);
            newImg.set({
              left: active.left,
              top: active.top,
              scaleX: newScaleX,
              scaleY: newScaleY,
              angle: active.angle,
              originX: active.originX,
              originY: active.originY,
              opacity: active.opacity,
            });
            // replaceInGroupEditing MUST run BEFORE canvas.remove(active) —
            // once active is removed from the canvas it's detached from any
            // parent editing group and the swap can't find it.
            replaceInGroupEditing(active, newImg);
            // Guard removal in case active was already evicted by a parallel
            // undo/redo between the API call and this onload.
            if (canvas.contains(active)) canvas.remove(active);
            canvas.add(newImg);
            canvas.setActiveObject(newImg);
            canvas.requestRenderAll();
            setSelectedObj(newImg);
            resolve();
          } catch (err) {
            reject(err);
          }
        };
        imgEl.onerror = () => reject(new Error("Erreur chargement image"));
        imgEl.src = pngDataUrl;
      });
    } catch {
      toast("Erreur lors du détourage. Réessayez.", "error");
    } finally {
      setRemovingBg(false);
    }
  }, []);


  return { updateBgColor, removeBackground, removingBg, setRemovingBg };
}
