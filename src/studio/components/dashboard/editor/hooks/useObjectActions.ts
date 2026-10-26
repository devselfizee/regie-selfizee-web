"use client";

import { useCallback, useRef, useState } from "react";
import { stabilizeBlobSrc, getCheckerCanvas } from "../canvas/canvasUtils";
import { CUSTOM_PROPS } from "../types";
import { useEditorStore } from "../store/editorStore";

/* ═══════════════════════════════════════════════════════════════
   Object manipulation hook — delete, duplicate, copy/paste,
   lock, z-order, align, group/ungroup.
   ═══════════════════════════════════════════════════════════════ */

interface UseObjectActionsParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fabricRef: React.MutableRefObject<any>;
  canvasWidth: number;
  canvasHeight: number;
  BLEED_PX: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectedObj: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSelectedObj: (v: any) => void;
  cleanupTools: () => void;
}

export function useObjectActions({
  fabricRef, canvasWidth, canvasHeight, BLEED_PX,
  selectedObj, setSelectedObj, cleanupTools,
}: UseObjectActionsParams) {
  const [showShootDeleteAlert, setShowShootDeleteAlert] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clipboardRef = useRef<any>(null);
  // Paste offset: each successive paste shifts +10px; resets on new copy
  const pasteCountRef = useRef(0);
  // Style clipboard: stores visual properties to paste onto other objects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const styleClipboardRef = useRef<Record<string, any> | null>(null);

  const deleteSelected = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const { editingGroupObjsRef } = useEditorStore.getState();
    // During group editing, skip cleanupTools (would scatter remaining children).
    // Instead, delete the selected child and remove it from the editing refs.
    if (editingGroupObjsRef.current.length > 0) {
      const active = canvas.getActiveObjects();
      if (!active?.length) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      active.forEach((obj: any) => {
        canvas.remove(obj);
        editingGroupObjsRef.current = editingGroupObjsRef.current.filter((o: any) => o !== obj);
      });
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      setSelectedObj(null);
      return;
    }
    cleanupTools();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const active = canvas.getActiveObjects();
    if (active?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const shootsToDelete = active.filter((o: any) => o._isShootZone);
      if (shootsToDelete.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allShoots = canvas.getObjects().filter((o: any) => o._isShootZone);
        if (allShoots.length - shootsToDelete.length < 1) {
          setShowShootDeleteAlert(true);
          return;
        }
      }
      let shootDeleted = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      active.forEach((obj: any) => {
        if (obj.selectable === false) return;
        if (obj._isShootZone) { shootDeleted = true; if (obj._shootLabel) canvas.remove(obj._shootLabel); }
        canvas.remove(obj);
      });
      // No need to recreate bg when bgImage is deleted — solidBg is always present underneath
      canvas.discardActiveObject();
      if (shootDeleted) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const remaining = canvas.getObjects().filter((o: any) => o._isShootZone);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        remaining.forEach((shoot: any, i: number) => {
          shoot._shootIndex = i + 1;
          if (shoot._shootLabel) shoot._shootLabel.set({ text: `#${i + 1}` });
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        canvas.getObjects().filter((o: any) => o._isShootLabel).forEach((lbl: any) => {
          if (!remaining.includes(lbl._shootZone)) canvas.remove(lbl);
        });
        if (remaining.length === 1 && remaining[0]._shootLabel) {
          canvas.remove(remaining[0]._shootLabel);
          remaining[0]._shootLabel = null;
        }
      }
      canvas.requestRenderAll();
      setSelectedObj(null);
    }
  }, [fabricRef, cleanupTools, setSelectedObj]);

  const duplicateSelected = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas || !selectedObj) return;
    // Multi-selection: clone each child individually instead of cloning the
    // ActiveSelection as one object (which Fabric would re-add as an
    // ActiveSelection child on the canvas and corrupt the scene).
    const isMulti = selectedObj.type === "activeselection" || selectedObj.type === "activeSelection";
    if (isMulti && selectedObj._objects?.length) {
      const fabricMod = await import("fabric");
      const newChildren: any[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const orig of (selectedObj._objects as any[])) {
        stabilizeBlobSrc(orig);
        const clonedChild = await orig.clone();
        clonedChild.set({ left: (clonedChild.left || 0) + 20, top: (clonedChild.top || 0) + 20 });
        for (const k of Object.keys(orig)) {
          if (k.startsWith("_") && k !== "_shootLabel" && k !== "_objects") clonedChild[k] = orig[k];
        }
        clonedChild._shootLabel = null;
        canvas.add(clonedChild);
        newChildren.push(clonedChild);
      }
      if (newChildren.length > 0) {
        const sel = new fabricMod.ActiveSelection(newChildren, { canvas });
        canvas.setActiveObject(sel);
      }
      canvas.requestRenderAll();
      return;
    }

    stabilizeBlobSrc(selectedObj);
    const cloned = await selectedObj.clone();
    cloned.set({ left: (cloned.left || 0) + 20, top: (cloned.top || 0) + 20 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const k of Object.keys(selectedObj as any)) { if (k.startsWith("_") && k !== "_shootLabel" && k !== "_objects") cloned[k] = (selectedObj as any)[k]; }
    cloned._shootLabel = null;
    if (cloned._isShootZone || cloned._shootIndex) {
      const fabricMod = await import("fabric");
      cloned._shootLocked = false; cloned._locked = false; cloned._ratioLocked = false;
      cloned.set({
        fill: new fabricMod.Pattern({ source: getCheckerCanvas(), repeat: "repeat" }),
        lockMovementX: false, lockMovementY: false, lockScalingX: false, lockScalingY: false,
        lockRotation: false, hasControls: true, selectable: true, evented: true, hoverCursor: "move",
        noScaleCache: true,
      });
    }
    canvas.add(cloned);
    if (cloned._isShootZone || cloned._shootIndex) {
      const fabric = await import("fabric");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allShoots = canvas.getObjects().filter((o: any) => o._isShootZone || o._shootIndex);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      allShoots.forEach((shoot: any, idx: number) => {
        shoot._shootIndex = idx + 1;
        if (shoot._shootLabel) shoot._shootLabel.set({ text: `#${idx + 1}` });
      });
      if (allShoots.length > 1) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const shoot of allShoots) {
          if (!shoot._shootLabel) {
            const lbl = new fabric.FabricText(`#${shoot._shootIndex}`, {
              left: (shoot.left || 0) + 8, top: (shoot.top || 0) + 6,
              originX: "left", originY: "top", fontSize: 16, fontFamily: "sans-serif",
              fontWeight: "bold", fill: "#4f46e5", selectable: false, evented: false,
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (lbl as any)._isShootLabel = true; (lbl as any)._shootZone = shoot;
            shoot._shootLabel = lbl; canvas.add(lbl);
          }
        }
      }
    }
    canvas.setActiveObject(cloned);
    canvas.requestRenderAll();
  }, [fabricRef, selectedObj]);

  const bringForward = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || !selectedObj) return;
    canvas.bringObjectForward(selectedObj);
    canvas.requestRenderAll();
    canvas.fire("object:modified", { target: selectedObj });
  }, [fabricRef, selectedObj]);

  const sendBackward = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || !selectedObj) return;
    canvas.sendObjectBackwards(selectedObj);
    // Ensure background objects stay behind everything.
    // Iterate in REVERSE and sendObjectToBack so the relative order of
    // bg objects themselves is preserved (a forward forEach + sendToBack
    // would flip them each call since each sendToBack pushes to index 0).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bgs = canvas.getObjects().filter((o: any) => o._isSolidBg || o._isDesignAreaBg);
    [...bgs].reverse().forEach((o: any) => canvas.sendObjectToBack(o));
    canvas.requestRenderAll();
    canvas.fire("object:modified", { target: selectedObj });
  }, [fabricRef, selectedObj]);

  const bringToFront = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || !selectedObj) return;
    canvas.bringObjectToFront(selectedObj);
    canvas.requestRenderAll();
    canvas.fire("object:modified", { target: selectedObj });
  }, [fabricRef, selectedObj]);

  const sendToBack = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || !selectedObj) return;
    canvas.sendObjectToBack(selectedObj);
    // Keep bg objects behind — reverse-iterate to preserve their order.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bgs = canvas.getObjects().filter((o: any) => o._isSolidBg || o._isDesignAreaBg);
    [...bgs].reverse().forEach((o: any) => canvas.sendObjectToBack(o));
    canvas.requestRenderAll();
    canvas.fire("object:modified", { target: selectedObj });
  }, [fabricRef, selectedObj]);

  const toggleLock = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const obj = canvas.getActiveObject();
    if (!obj) return;
    // Determine current lock state from the actual Fabric property (not _locked which may be undefined)
    const isCurrentlyLocked = !!obj.lockMovementX;
    const locked = !isCurrentlyLocked;
    obj._locked = locked;
    if (obj._isShootZone) obj._shootLocked = locked;
    obj.set({
      lockMovementX: locked, lockMovementY: locked,
      lockScalingX: locked, lockScalingY: locked,
      lockRotation: locked, hasControls: !locked,
      hoverCursor: locked ? "default" : "move",
    });
    obj.setCoords();
    canvas.discardActiveObject();
    canvas.setActiveObject(obj);
    canvas.requestRenderAll();
    canvas.fire("object:modified", { target: obj });
    setSelectedObj(obj);
    useEditorStore.getState().forceRender((n: number) => n + 1);
  }, [fabricRef, setSelectedObj]);

  const copyStyle = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const obj = canvas.getActiveObject();
    if (!obj) return;
    const style: Record<string, any> = {};
    // Visual properties common to all objects
    const keys = ["fill", "stroke", "strokeWidth", "opacity", "shadow",
                  "globalCompositeOperation", "paintFirst"];
    keys.forEach((k) => { if ((obj as any)[k] !== undefined) style[k] = (obj as any)[k]; });
    // Text-specific
    if (obj.type === "textbox" || obj.type === "i-text") {
      ["fontSize", "fontFamily", "fontWeight", "fontStyle", "underline",
       "linethrough", "lineHeight", "charSpacing", "textAlign"].forEach((k) => {
        if ((obj as any)[k] !== undefined) style[k] = (obj as any)[k];
      });
    }
    styleClipboardRef.current = style;
    useEditorStore.getState().forceRender((n: number) => n + 1);
  }, [fabricRef]);

  const pasteStyle = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || !styleClipboardRef.current) return;
    const objs = canvas.getActiveObjects();
    if (!objs?.length) return;
    objs.forEach((obj: any) => {
      obj.set(styleClipboardRef.current as any);
      obj.setCoords();
    });
    canvas.requestRenderAll();
    canvas.fire("object:modified", { target: canvas.getActiveObject(), _historyLabel: "Style copié-collé" });
    useEditorStore.getState().forceRender((n: number) => n + 1);
  }, [fabricRef]);

  const copySelected = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas || !selectedObj) return;
    pasteCountRef.current = 0; // reset offset on every new copy
    // For multi-selection (ActiveSelection), copy each object individually
    const isMulti = selectedObj.type === "activeselection" || selectedObj.type === "activeSelection";
    if (isMulti && selectedObj._objects?.length) {
      const objects = selectedObj._objects as any[];
      objects.forEach((o: any) => stabilizeBlobSrc(o));
      clipboardRef.current = { _isMultiCopy: true, objects };
    } else {
      stabilizeBlobSrc(selectedObj);
      clipboardRef.current = selectedObj;
    }
    try {
      if (!isMulti) {
        const json = JSON.stringify(selectedObj.toObject(CUSTOM_PROPS));
        sessionStorage.setItem("selfizee_clipboard", json);
      }
    } catch { /* ignore */ }
  }, [fabricRef, selectedObj]);

  const pasteClipboard = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (clipboardRef.current) {
      pasteCountRef.current += 1;
      const pasteOffset = 10 + pasteCountRef.current * 10; // 20, 30, 40 … px
      // Helper: clamp position inside design area
      const clampToDesign = (obj: any) => {
        const br = obj.getBoundingRect(true);
        const minX = BLEED_PX;
        const minY = BLEED_PX;
        const maxX = BLEED_PX + canvasWidth;
        const maxY = BLEED_PX + canvasHeight;
        // If object is completely outside, move to center of design area
        if (br.left + br.width < minX || br.left > maxX || br.top + br.height < minY || br.top > maxY) {
          obj.set({ left: BLEED_PX + canvasWidth / 2, top: BLEED_PX + canvasHeight / 2, originX: "center", originY: "center" });
          obj.setCoords();
        }
      };

      // Handle multi-object paste
      if (clipboardRef.current._isMultiCopy && clipboardRef.current.objects?.length) {
        const fabric = await import("fabric");
        const newObjects: any[] = [];
        for (const orig of clipboardRef.current.objects) {
          stabilizeBlobSrc(orig);
          const cloned = await orig.clone();
          cloned.set({ left: (cloned.left || 0) + pasteOffset, top: (cloned.top || 0) + pasteOffset });
          for (const k of Object.keys(orig)) { if (k.startsWith("_") && k !== "_shootLabel" && k !== "_objects") cloned[k] = orig[k]; }
          cloned._shootLabel = null;
          cloned.setCoords();
          clampToDesign(cloned);
          canvas.add(cloned);
          newObjects.push(cloned);
        }
        if (newObjects.length > 0) {
          const sel = new fabric.ActiveSelection(newObjects, { canvas });
          canvas.setActiveObject(sel);
          setSelectedObj(sel);
        }
        canvas.requestRenderAll();
        return;
      }
      stabilizeBlobSrc(clipboardRef.current);
      const cloned = await clipboardRef.current.clone();
      cloned.set({ left: (cloned.left || 0) + pasteOffset, top: (cloned.top || 0) + pasteOffset });
      cloned.setCoords();
      clampToDesign(cloned);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const k of Object.keys(clipboardRef.current as any)) { if (k.startsWith("_") && k !== "_shootLabel" && k !== "_objects") cloned[k] = (clipboardRef.current as any)[k]; }
      cloned._shootLabel = null;
      if (cloned._isShootZone || cloned._shootIndex) {
        const fabricMod = await import("fabric");
        cloned._shootLocked = false; cloned._locked = false; cloned._ratioLocked = false;
        cloned.set({
          fill: new fabricMod.Pattern({ source: getCheckerCanvas(), repeat: "repeat" }),
          lockMovementX: false, lockMovementY: false, lockScalingX: false, lockScalingY: false,
          lockRotation: false, hasControls: true, selectable: true, evented: true, hoverCursor: "move",
          noScaleCache: true,
        });
      }
      canvas.add(cloned);
      if (cloned._isShootZone || cloned._shootIndex) {
        const fabric = await import("fabric");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allShoots = canvas.getObjects().filter((o: any) => o._isShootZone || o._shootIndex);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        allShoots.forEach((shoot: any, idx: number) => {
          shoot._shootIndex = idx + 1;
          if (shoot._shootLabel) shoot._shootLabel.set({ text: `#${idx + 1}` });
        });
        if (allShoots.length > 1) {
          for (const shoot of allShoots) {
            if (!shoot._shootLabel) {
              const lbl = new fabric.FabricText(`#${shoot._shootIndex}`, {
                left: (shoot.left || 0) + 8, top: (shoot.top || 0) + 6,
                originX: "left", originY: "top", fontSize: 16, fontFamily: "sans-serif",
                fontWeight: "bold", fill: "#4f46e5", selectable: false, evented: false,
              });
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (lbl as any)._isShootLabel = true; (lbl as any)._shootZone = shoot;
              shoot._shootLabel = lbl; canvas.add(lbl);
            }
          }
        }
      }
      canvas.setActiveObject(cloned);
      canvas.requestRenderAll();
      return;
    }
    // Try sessionStorage fallback
    try {
      const stored = sessionStorage.getItem("selfizee_clipboard");
      if (stored) {
        const fabric = await import("fabric");
        const parsed = JSON.parse(stored);
        const [obj] = await fabric.util.enlivenObjects([parsed]);
        if (obj) {
          (obj as any).set({ left: ((obj as any).left || 0) + 20, top: ((obj as any).top || 0) + 20 });
          canvas.add(obj as any);
          canvas.setActiveObject(obj as any);
          canvas.requestRenderAll();
        }
      }
    } catch { /* ignore */ }
  }, [fabricRef]);

  const alignObjects = useCallback(async (alignment: "left" | "center-h" | "right" | "top" | "center-v" | "bottom" | "distribute-h" | "distribute-v") => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const sel = canvas.getActiveObject();
    if (!sel || (sel.type !== "activeselection" && sel.type !== "activeSelection")) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const objects: any[] = [...((sel as any)._objects || [])];
    if (objects.length < 2) return;

    // Inside an ActiveSelection, each child's left/top is RELATIVE to the
    // selection's transform, so applying an absolute-space delta produces
    // wrong results on rotated/scaled selections. Simplest correct fix:
    // break the ActiveSelection first (objects become independent, each
    // with absolute left/top in canvas coords), align them, then rebuild
    // a fresh ActiveSelection.
    canvas.discardActiveObject();
    canvas.requestRenderAll();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bounds = objects.map((o: any) => {
      const br = o.getBoundingRect();
      return { obj: o, left: br.left, top: br.top, right: br.left + br.width, bottom: br.top + br.height, cx: br.left + br.width / 2, cy: br.top + br.height / 2, w: br.width, h: br.height };
    });
    const minL = Math.min(...bounds.map((b: any) => b.left));
    const maxR = Math.max(...bounds.map((b: any) => b.right));
    const minT = Math.min(...bounds.map((b: any) => b.top));
    const maxB = Math.max(...bounds.map((b: any) => b.bottom));
    const cxAll = (minL + maxR) / 2;
    const cyAll = (minT + maxB) / 2;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bounds.forEach((b: any) => {
      const o = b.obj;
      // Since objects are no longer inside an ActiveSelection, their
      // left/top are in absolute canvas coords and the delta applies
      // directly.
      switch (alignment) {
        case "left": o.set({ left: (o.left || 0) + (minL - b.left) }); break;
        case "center-h": o.set({ left: (o.left || 0) + (cxAll - b.cx) }); break;
        case "right": o.set({ left: (o.left || 0) + (maxR - b.right) }); break;
        case "top": o.set({ top: (o.top || 0) + (minT - b.top) }); break;
        case "center-v": o.set({ top: (o.top || 0) + (cyAll - b.cy) }); break;
        case "bottom": o.set({ top: (o.top || 0) + (maxB - b.bottom) }); break;
        case "distribute-h": break;
        case "distribute-v": break;
      }
      o.setCoords();
    });
    if (alignment === "distribute-h" && bounds.length >= 3) {
      const sorted = [...bounds].sort((a: any, b: any) => a.left - b.left);
      const totalGap = (maxR - minL) - sorted.reduce((sum: number, b: any) => sum + b.w, 0);
      const gap = totalGap / (sorted.length - 1);
      let x = sorted[0].left;
      sorted.forEach((b: any) => { b.obj.set({ left: (b.obj.left || 0) + (x - b.left) }); x += b.w + gap; b.obj.setCoords(); });
    }
    if (alignment === "distribute-v" && bounds.length >= 3) {
      const sorted = [...bounds].sort((a: any, b: any) => a.top - b.top);
      const totalGap = (maxB - minT) - sorted.reduce((sum: number, b: any) => sum + b.h, 0);
      const gap = totalGap / (sorted.length - 1);
      let y = sorted[0].top;
      sorted.forEach((b: any) => { b.obj.set({ top: (b.obj.top || 0) + (y - b.top) }); y += b.h + gap; b.obj.setCoords(); });
    }

    // Rebuild an ActiveSelection from the same objects so the user's
    // multi-selection is preserved after the alignment.
    const fabricMod = await import("fabric");
    const newSel = new fabricMod.ActiveSelection(objects, { canvas });
    canvas.setActiveObject(newSel);
    canvas.requestRenderAll();
    canvas.fire("object:modified", { target: newSel, _historyLabel: "Alignement" });
  }, [fabricRef]);

  return {
    deleteSelected, duplicateSelected, bringForward, sendBackward, bringToFront, sendToBack,
    toggleLock, copySelected, pasteClipboard, alignObjects,
    copyStyle, pasteStyle, styleClipboardRef,
    clipboardRef, showShootDeleteAlert, setShowShootDeleteAlert,
  };
}
