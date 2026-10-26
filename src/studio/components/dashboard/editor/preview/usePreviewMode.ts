"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_PREVIEW_BG } from "./previewConstants";
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface PreviewSetting {
  personUrl?: string;
  bgColor?: string;
  /** When set, renders an image as the shoot background (covers the
   *  shoot area, behind the person). Takes precedence over bgColor —
   *  picking an image clears the colour, and vice versa, in the panel UI. */
  bgImageUrl?: string;
  personScale?: number; // 0.5 .. 2
}

export type PreviewSettings = Record<number, PreviewSetting>; // keyed by shoot index

interface Params {
  fabricRef: React.MutableRefObject<any>;
  ready: boolean;
}

const PREVIEW_FLAG = "_isPreviewLayer";

/**
 * Preview mode: fills shoot zones with a bg color + a cut-out person image.
 * Fully ephemeral — no DB persistence. Toggling off restores the canvas
 * exactly as it was.
 */
export function usePreviewMode({ fabricRef, ready }: Params) {
  const [previewMode, setPreviewMode] = useState(false);
  const [linkAll, setLinkAll] = useState(false);
  const [settings, setSettings] = useState<PreviewSettings>({});
  const [activeShootIndex, setActiveShootIndex] = useState<number | null>(null);

  // Cache original shoot fills/strokes so we can restore on exit.
  const savedShootStylesRef = useRef<Map<any, { fill: any; stroke: any; strokeDashArray: any; strokeWidth: number; selectable: boolean; evented: boolean }>>(new Map());

  // Per-shoot person-image offsets, applied on top of the centered position.
  // Stored in a ref (not React state) so arrow-key nudges mutate the fabric
  // image directly without triggering a heavy re-render. Cleared when the
  // person photo or scale changes (full re-render path).
  const offsetsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  // Reference to each rendered preview-person image keyed by shoot index, so
  // the keyboard handler can mutate `left`/`top` in O(1) without rebuilding
  // any fabric layers.
  const previewImgsRef = useRef<Map<number, { img: any; baseLeft: number; baseTop: number }>>(new Map());

  // Returns shoots in stacking order (same order as on canvas).
  const getShootZones = useCallback((): any[] => {
    const canvas = fabricRef.current;
    if (!canvas) return [];
    return canvas.getObjects().filter((o: any) => o._isShootZone);
  }, [fabricRef]);

  const buildClipForShoot = useCallback((fabric: any, shoot: any) => {
    // Build a clipPath matching the shoot's visual rect. absolutePositioned so
    // the clipPath coordinates are canvas-space.
    const w = shoot.width * (shoot.scaleX || 1);
    const h = shoot.height * (shoot.scaleY || 1);
    const clip = new fabric.Rect({
      left: shoot.left,
      top: shoot.top,
      width: w,
      height: h,
      rx: (shoot.rx || 0) * (shoot.scaleX || 1),
      ry: (shoot.ry || 0) * (shoot.scaleY || 1),
      angle: shoot.angle || 0,
      originX: "left",
      originY: "top",
      absolutePositioned: true,
    });
    return clip;
  }, []);

  // Apply settings → add/update preview layers on canvas.
  const renderPreview = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const fabric = (await import("fabric")) as any;
    const shoots = getShootZones();

    // Remove any stale preview layers first.
    const stale = canvas.getObjects().filter((o: any) => o[PREVIEW_FLAG]);
    stale.forEach((o: any) => canvas.remove(o));
    // The cached image refs become stale alongside the layers themselves.
    previewImgsRef.current.clear();

    for (let i = 0; i < shoots.length; i++) {
      const shoot = shoots[i];
      const entry = linkAll ? settings[0] : settings[i];
      if (!entry) continue;

      // Where to insert: just AFTER the shoot in stacking order so the
      // preview covers the shoot but sits below anything the user put
      // above the shoot.
      const shootIdx = canvas.getObjects().indexOf(shoot);
      const insertAt = shootIdx + 1;

      const w = shoot.width * (shoot.scaleX || 1);
      const h = shoot.height * (shoot.scaleY || 1);

      // 1. BG fill — image takes precedence over colour. If an image URL
      // is set, render it as a cover-fit Image clipped to the shoot.
      // Otherwise (and only otherwise) render the colour fill.
      let bgLayerInserted = false;
      if (entry.bgImageUrl) {
        try {
          const bgImg: any = await fabric.FabricImage.fromURL(entry.bgImageUrl, { crossOrigin: "anonymous" });
          const bgScaleBase = Math.max(w / bgImg.width, h / bgImg.height);
          bgImg.set({
            left: shoot.left + w / 2,
            top: shoot.top + h / 2,
            originX: "center",
            originY: "center",
            scaleX: bgScaleBase,
            scaleY: bgScaleBase,
            angle: shoot.angle || 0,
            selectable: false,
            evented: false,
            excludeFromExport: true,
          });
          bgImg.clipPath = buildClipForShoot(fabric, shoot);
          (bgImg as any)[PREVIEW_FLAG] = true;
          canvas.insertAt(insertAt, bgImg);
          bgLayerInserted = true;
        } catch (err) {
          console.error("Preview bg image load failed:", err);
        }
      }
      if (!bgLayerInserted && entry.bgColor) {
        const bgRect = new fabric.Rect({
          left: shoot.left,
          top: shoot.top,
          width: w,
          height: h,
          rx: (shoot.rx || 0) * (shoot.scaleX || 1),
          ry: (shoot.ry || 0) * (shoot.scaleY || 1),
          angle: shoot.angle || 0,
          fill: entry.bgColor,
          stroke: null,
          strokeWidth: 0,
          originX: "left",
          originY: "top",
          selectable: false,
          evented: false,
          // Exclude from toJSON/toDataURL so PNG export and saved canvasState
          // stay pristine. The preview-mode JPEG export draws visible layers
          // via a separate render path that ignores this flag.
          excludeFromExport: true,
        });
        (bgRect as any)[PREVIEW_FLAG] = true;
        canvas.insertAt(insertAt, bgRect);
        bgLayerInserted = true;
      }

      // 2. Person image (cover-fit into shoot, centered)
      if (entry.personUrl) {
        try {
          const img: any = await fabric.FabricImage.fromURL(entry.personUrl, { crossOrigin: "anonymous" });
          const scaleBase = Math.max(w / img.width, h / img.height);
          const userScale = entry.personScale ?? 1;
          const finalScale = scaleBase * userScale;
          const displayW = img.width * finalScale;
          const displayH = img.height * finalScale;
          // Live offset stored in a ref so arrow-key nudges can mutate
          // `img.left`/`top` directly without going through this whole path.
          const offsetKey = linkAll ? 0 : i;
          const offset = offsetsRef.current.get(offsetKey) ?? { x: 0, y: 0 };
          const baseLeft = shoot.left + w / 2;
          const baseTop = shoot.top + h / 2;
          img.set({
            left: baseLeft + offset.x,
            top: baseTop + offset.y,
            originX: "center",
            originY: "center",
            scaleX: finalScale,
            scaleY: finalScale,
            angle: shoot.angle || 0,
            selectable: false,
            evented: false,
            excludeFromExport: true,
          });
          // Clip to shoot shape so the person doesn't bleed out.
          img.clipPath = buildClipForShoot(fabric, shoot);
          (img as any)[PREVIEW_FLAG] = true;
          // Insert AFTER the bg layer we may have added.
          const shootIdx2 = canvas.getObjects().indexOf(shoot);
          const personInsertAt = bgLayerInserted ? shootIdx2 + 2 : shootIdx2 + 1;
          canvas.insertAt(personInsertAt, img);
          // Cache for fast in-place position updates by the arrow-key handler.
          previewImgsRef.current.set(i, { img, baseLeft, baseTop });
          void displayW; void displayH; // reserved for future positioning tools
        } catch (err) {
          console.error("Preview person load failed:", err);
        }
      }
    }

    canvas.requestRenderAll();
  }, [fabricRef, getShootZones, settings, linkAll, buildClipForShoot]);

  // Toggle preview mode — stash / restore shoot visuals + interactivity.
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !ready) return;
    const shoots = getShootZones();

    if (previewMode) {
      // Seed default settings on first entry. The user picks a person
      // from the API-loaded gallery — no hardcoded default.
      setSettings((prev) => {
        if (Object.keys(prev).length > 0) return prev;
        const seed: PreviewSettings = {};
        const defaultEntry: PreviewSetting = {
          bgColor: DEFAULT_PREVIEW_BG,
          personScale: 1,
        };
        for (let i = 0; i < shoots.length; i++) seed[i] = { ...defaultEntry };
        return seed;
      });
      // Stash current shoot styling and hide border/dash.
      savedShootStylesRef.current.clear();
      shoots.forEach((s: any) => {
        savedShootStylesRef.current.set(s, {
          fill: s.fill,
          stroke: s.stroke,
          strokeDashArray: s.strokeDashArray,
          strokeWidth: s.strokeWidth,
          selectable: s.selectable,
          evented: s.evented,
        });
        s.set({
          fill: null,
          stroke: null,
          strokeDashArray: null,
          strokeWidth: 0,
          selectable: false,
          evented: true,
          hoverCursor: "pointer",
        });
      });
      // Lock all non-shoot objects during preview.
      canvas.getObjects().forEach((o: any) => {
        if (o._isShootZone || o[PREVIEW_FLAG]) return;
        o._previewSavedLocks = {
          lockMovementX: o.lockMovementX,
          lockMovementY: o.lockMovementY,
          lockScalingX: o.lockScalingX,
          lockScalingY: o.lockScalingY,
          lockRotation: o.lockRotation,
          hasControls: o.hasControls,
          selectable: o.selectable,
          evented: o.evented,
        };
        o.set({ lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true, hasControls: false, selectable: false, evented: false });
      });
      canvas.discardActiveObject();
      canvas.requestRenderAll();
    } else {
      // Remove preview layers
      const layers = canvas.getObjects().filter((o: any) => o[PREVIEW_FLAG]);
      layers.forEach((o: any) => canvas.remove(o));
      // Drop the cached image refs alongside the actual layers.
      previewImgsRef.current.clear();
      // Restore shoot styling
      shoots.forEach((s: any) => {
        const saved = savedShootStylesRef.current.get(s);
        if (saved) {
          s.set({
            fill: saved.fill,
            stroke: saved.stroke,
            strokeDashArray: saved.strokeDashArray,
            strokeWidth: saved.strokeWidth,
            selectable: saved.selectable,
            evented: saved.evented,
          });
        }
      });
      savedShootStylesRef.current.clear();
      // Restore locks on other objects
      canvas.getObjects().forEach((o: any) => {
        if (o._previewSavedLocks) {
          o.set(o._previewSavedLocks);
          delete o._previewSavedLocks;
        }
      });
      canvas.requestRenderAll();
    }
  }, [previewMode, ready, fabricRef, getShootZones]);

  // Re-render preview layers whenever settings change (while in preview mode).
  useEffect(() => {
    if (!previewMode) return;
    void renderPreview();
  }, [previewMode, settings, linkAll, renderPreview]);

  // Click on a shoot in preview mode → select it for editing.
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !previewMode) return;
    const handler = (e: any) => {
      const tgt = e.target;
      if (!tgt) { setActiveShootIndex(null); return; }
      if (tgt._isShootZone) {
        const shoots = getShootZones();
        const idx = shoots.indexOf(tgt);
        if (idx >= 0) setActiveShootIndex(idx);
        canvas.discardActiveObject();
        canvas.requestRenderAll();
      }
    };
    canvas.on("mouse:down", handler);
    return () => { canvas.off("mouse:down", handler); };
  }, [previewMode, fabricRef, getShootZones]);

  const updateSetting = useCallback((index: number, patch: Partial<PreviewSetting>) => {
    setSettings((prev) => {
      const target = linkAll ? 0 : index;
      const cur = prev[target] || {};
      // Reset the live offset when the underlying photo changes — a stale
      // offset rarely makes sense for a different image. Scale changes leave
      // the offset alone; the user typically wants the framing to persist.
      if (patch.personUrl !== undefined && patch.personUrl !== cur.personUrl) {
        offsetsRef.current.delete(target);
      }
      return { ...prev, [target]: { ...cur, ...patch } };
    });
  }, [linkAll]);

  // Arrow keys nudge the active person photo while in preview mode.
  // Shift = larger step. Mutates the fabric image's position directly so the
  // canvas updates instantly without going through React state or rebuilding
  // any layers.
  useEffect(() => {
    if (!previewMode) return;
    const handler = (e: KeyboardEvent) => {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      const canvas = fabricRef.current;
      if (!canvas) return;

      const shootIdx = linkAll ? 0 : (activeShootIndex ?? 0);
      const offsetKey = linkAll ? 0 : shootIdx;
      // Bail if there's no live person image at all to move.
      if (previewImgsRef.current.size === 0) return;
      // In single-shoot mode the active one must have an image.
      if (!linkAll && !previewImgsRef.current.has(shootIdx)) return;

      e.preventDefault();
      const step = e.shiftKey ? 20 : 5;
      const offset = offsetsRef.current.get(offsetKey) ?? { x: 0, y: 0 };
      if (e.key === "ArrowUp") offset.y -= step;
      else if (e.key === "ArrowDown") offset.y += step;
      else if (e.key === "ArrowLeft") offset.x -= step;
      else if (e.key === "ArrowRight") offset.x += step;
      offsetsRef.current.set(offsetKey, offset);

      const apply = (cached: { img: any; baseLeft: number; baseTop: number }) => {
        cached.img.set({
          left: cached.baseLeft + offset.x,
          top: cached.baseTop + offset.y,
        });
        cached.img.setCoords?.();
      };
      if (linkAll) {
        // All shoots share the same offset — mutate every cached image.
        previewImgsRef.current.forEach(apply);
      } else {
        const cached = previewImgsRef.current.get(shootIdx);
        if (cached) apply(cached);
      }
      canvas.requestRenderAll();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [previewMode, linkAll, activeShootIndex, fabricRef]);

  const resetPreview = useCallback(() => {
    offsetsRef.current.clear();
    setSettings({});
    setActiveShootIndex(null);
  }, []);

  // Ensure we leave preview mode cleanly if the editor unmounts.
  useEffect(() => () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const layers = canvas.getObjects().filter((o: any) => o[PREVIEW_FLAG]);
    layers.forEach((o: any) => canvas.remove(o));
    previewImgsRef.current.clear();
    offsetsRef.current.clear();
  }, [fabricRef]);

  return {
    previewMode, setPreviewMode,
    linkAll, setLinkAll,
    settings, updateSetting, resetPreview,
    activeShootIndex, setActiveShootIndex,
    shootCount: getShootZones().length,
  };
}
