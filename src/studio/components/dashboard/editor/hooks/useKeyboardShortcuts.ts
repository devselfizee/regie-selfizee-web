"use client";

import { useEffect } from "react";
import { useEditorStore } from "../store/editorStore";

/* Keyboard shortcuts hook — extracted from FrameEditor */

export function useKeyboardShortcuts({
  fabricRef, deleteSelected, duplicateSelected, copySelected, pasteClipboard,
  undo, redo, cleanupTools, handleSave, bringForward, sendBackward, bringToFront, sendToBack,
  copyStyle, pasteStyle,
  lassoActiveRef, penModeRef, selectedObj, setSelectedObj,
  userZoomRef, applyScaleRef, addImageToCanvas,
  exitGroupEditing, editingGroupObjsRef, freedrawActiveRef,
}: {
  fabricRef: React.MutableRefObject<any>;
  deleteSelected: () => void;
  duplicateSelected: () => Promise<void>;
  copySelected: () => Promise<void>;
  pasteClipboard: () => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  cleanupTools: () => void;
  handleSave: (skip?: boolean) => Promise<void>;
  bringForward: () => void;
  sendBackward: () => void;
  bringToFront: () => void;
  sendToBack: () => void;
  copyStyle: () => void;
  pasteStyle: () => void;
  lassoActiveRef: React.MutableRefObject<boolean>;
  penModeRef: React.MutableRefObject<boolean>;
  selectedObj: any;
  setSelectedObj: (v: any) => void;
  userZoomRef: React.MutableRefObject<number | null>;
  applyScaleRef: React.MutableRefObject<((scale: number) => void)>;
  addImageToCanvas: (dataUrl: string, isBg: boolean, fillRatio?: number) => Promise<void>;
  exitGroupEditing: () => Promise<void>;
  editingGroupObjsRef: React.MutableRefObject<any[]>;
  freedrawActiveRef: React.MutableRefObject<boolean>;
}) {
  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (el?.isContentEditable) return;
      // Check if fabric text is being edited
      const active = fabricRef.current?.getActiveObject();
      // Ctrl+B/I/U while editing text → apply formatting.
      // Exclude Shift+... so Ctrl+Shift+B doesn't toggle bold.
      if (active?.isEditing && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        if (e.key === "b") {
          e.preventDefault();
          const isBold = active.getSelectionStyles()?.[0]?.fontWeight === "bold" || active.fontWeight === "bold";
          active.setSelectionStyles({ fontWeight: isBold ? "normal" : "bold" });
          if (active.selectionStart === active.selectionEnd) active.set({ fontWeight: isBold ? "normal" : "bold" });
          fabricRef.current?.requestRenderAll();
          fabricRef.current?.fire("object:modified", { target: active, _historyLabel: "Texte — Gras" });
          return;
        }
        if (e.key === "i") {
          e.preventDefault();
          const isItalic = active.getSelectionStyles()?.[0]?.fontStyle === "italic" || active.fontStyle === "italic";
          active.setSelectionStyles({ fontStyle: isItalic ? "normal" : "italic" });
          if (active.selectionStart === active.selectionEnd) active.set({ fontStyle: isItalic ? "normal" : "italic" });
          fabricRef.current?.requestRenderAll();
          fabricRef.current?.fire("object:modified", { target: active, _historyLabel: "Texte — Italique" });
          return;
        }
        if (e.key === "u") {
          e.preventDefault();
          const isUnderline = active.getSelectionStyles()?.[0]?.underline || active.underline;
          active.setSelectionStyles({ underline: !isUnderline });
          if (active.selectionStart === active.selectionEnd) active.set({ underline: !isUnderline });
          fabricRef.current?.requestRenderAll();
          fabricRef.current?.fire("object:modified", { target: active, _historyLabel: "Texte — Souligné" });
          return;
        }
      }
      if (active?.isEditing) return;

      if (e.key === "Escape") {
        e.preventDefault();
        // During group editing, Escape must re-group children (exitGroupEditing),
        // not just clear refs via cleanupTools which would leave children scattered.
        if (editingGroupObjsRef.current.length > 0) {
          exitGroupEditing();
        } else {
          cleanupTools();
          fabricRef.current?.discardActiveObject();
          fabricRef.current?.renderAll();
          setSelectedObj(null);
        }
        return;
      }
      // Don't delete objects while ANY tool mode is active
      if (e.key === "Delete" || e.key === "Backspace") {
        const st = useEditorStore.getState();
        const anyToolActive = lassoActiveRef.current || penModeRef.current || freedrawActiveRef.current
          || st.eraserActive || st.wandActive || st.cropping || st.selectAreaActive || st.penEditMode;
        if (!anyToolActive) {
          e.preventDefault();
          deleteSelected();
        }
      }
      if (e.key === "s" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSave();
      }
      if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const canvas = fabricRef.current;
        if (canvas) {
          (async () => {
            const fabric = await import("fabric");
            const objects = canvas.getObjects().filter((o: any) => o.selectable !== false);
            if (objects.length > 0) {
              canvas.discardActiveObject();
              const sel = new fabric.ActiveSelection(objects, { canvas });
              canvas.setActiveObject(sel);
              canvas.requestRenderAll();
              setSelectedObj(sel);
            }
          })();
        }
      }
      if (e.key === "0" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        userZoomRef.current = null; // back to auto-fit
        // Reset pan offset
        const { containerRef, canvasWidth, canvasHeight, autoScaleRef } = useEditorStore.getState();
        const cont = containerRef.current;
        if (cont) {
          const panEl = cont.querySelector("[data-canvas-pan]") as HTMLElement | null;
          if (panEl) panEl.style.transform = "";
          const availW = cont.clientWidth - 48;
          const availH = cont.clientHeight - 48;
          autoScaleRef.current = Math.min(availW / canvasWidth, availH / canvasHeight, 1.15);
          applyScaleRef.current?.(autoScaleRef.current);
        }
      }
      if (e.key === "d" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        duplicateSelected();
      }
      if (e.key === "c" && (e.ctrlKey || e.metaKey) && e.altKey) {
        e.preventDefault();
        copyStyle();
        return;
      }
      if (e.key === "v" && (e.ctrlKey || e.metaKey) && e.altKey) {
        e.preventDefault();
        pasteStyle();
        return;
      }
      if (e.key === "c" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        copySelected();
      }
      if (e.key === "v" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        // Check for image in system clipboard first. Use optional-chain
        // SAFELY — if navigator.clipboard.read is undefined (Firefox/older
        // browsers), the chain yields undefined and calling .then would
        // throw TypeError. Guard explicitly.
        const p = navigator.clipboard?.read?.();
        if (p && typeof p.then === "function") {
          p.then(async (items) => {
            for (const item of items) {
              const imageType = item.types.find(t => t.startsWith("image/"));
              if (imageType) {
                const blob = await item.getType(imageType);
                // Reject oversized clipboard images (e.g. 50MB screenshots)
                // that would OOM the tab.
                if (blob.size > 25 * 1024 * 1024) {
                  pasteClipboard();
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => { if (typeof reader.result === "string") addImageToCanvas(reader.result, false); };
                reader.onerror = () => pasteClipboard();
                reader.readAsDataURL(blob);
                return;
              }
            }
            // No image found, try regular paste
            pasteClipboard();
          }).catch(() => pasteClipboard());
        } else {
          pasteClipboard();
        }
      }
      if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.key === "z" && (e.ctrlKey || e.metaKey) && e.shiftKey) || (e.key === "y" && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        redo();
      }
      // Tab / Shift+Tab: cycle through objects
      if (e.key === "Tab") {
        e.preventDefault();
        const canvas = fabricRef.current;
        if (canvas) {
          const objects = canvas.getObjects().filter((o: any) => o.selectable !== false && !o._isTextGuide && !o._isGuideline && !o._isShootLabel);
          if (objects.length > 0) {
            // If active is an ActiveSelection it won't be in objects[] —
            // use its first child's index as the starting point.
            let currentIdx = -1;
            if (active) {
              if ((active.type === "activeselection" || active.type === "activeSelection") && active._objects?.length) {
                currentIdx = objects.indexOf(active._objects[0]);
              } else {
                currentIdx = objects.indexOf(active);
              }
            }
            const nextIdx = e.shiftKey
              ? (currentIdx <= 0 ? objects.length - 1 : currentIdx - 1)
              : (currentIdx >= objects.length - 1 ? 0 : currentIdx + 1);
            canvas.setActiveObject(objects[nextIdx]);
            canvas.requestRenderAll();
            setSelectedObj(objects[nextIdx]);
          }
        }
        return;
      }
      // Ctrl/Cmd + Arrow: reorder layers (Shift = absolute front/back)
      if ((e.ctrlKey || e.metaKey) && e.key === "ArrowUp" && active) {
        e.preventDefault();
        if (e.shiftKey) bringToFront(); else bringForward();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "ArrowDown" && active) {
        e.preventDefault();
        if (e.shiftKey) sendToBack(); else sendBackward();
        return;
      }
      // Ctrl/Cmd + G: group selection
      if (e.key === "g" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        const canvas = fabricRef.current;
        if (!canvas) return;
        const activeObj = canvas.getActiveObject();
        if (activeObj?.type === "activeselection" || activeObj?.type === "activeSelection") {
          (async () => {
            const fabric = await import("fabric");
            const objects = activeObj.getObjects();
            objects.forEach((o: any) => canvas.remove(o));
            const group = new fabric.Group(objects, { originX: "center", originY: "center" });
            canvas.add(group);
            canvas.setActiveObject(group);
            canvas.requestRenderAll();
            setSelectedObj(group);
            canvas.fire("object:modified", { target: group, _historyLabel: "Grouper" });
          })();
        }
        return;
      }
      // Ctrl/Cmd + Shift + G: ungroup
      if (e.key === "g" && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        const canvas = fabricRef.current;
        if (!canvas) return;
        const activeObj = canvas.getActiveObject();
        if (activeObj?.type === "group") {
          (async () => {
            const { CUSTOM_PROPS } = await import("../types");
            const fabric = await import("fabric");
            const group = activeObj;
            // Capture the group's z-index so children can be placed at the
            // same depth instead of piling up at the top of the stack.
            const groupZIndex = canvas.getObjects().indexOf(group);
            const groupJSON = group.toObject(CUSTOM_PROPS);
            const groupLeft = group.left || 0;
            const groupTop = group.top || 0;
            const groupAngle = group.angle || 0;
            const groupScaleX = group.scaleX || 1;
            const groupScaleY = group.scaleY || 1;

            // Suppress history saves across the enliven+add loop so the
            // operation produces ONE history entry instead of N.
            const isRestoringRef = useEditorStore.getState().isRestoringRef;
            const origRestoring = isRestoringRef.current;
            isRestoringRef.current = true;
            canvas.remove(group);

            const childJSONs = groupJSON.objects || [];
            // Enliven all children in one batch (was one await per child,
            // which serialised image loads).
            const enlivened = await fabric.util.enlivenObjects(childJSONs);

            const newObjects: any[] = [];
            for (let i = 0; i < enlivened.length; i++) {
              const obj = enlivened[i] as any;
              if (!obj) continue;
              const relX = obj.left || 0;
              const relY = obj.top || 0;
              const rad = (groupAngle * Math.PI) / 180;
              const scaledX = relX * groupScaleX;
              const scaledY = relY * groupScaleY;
              const absX = groupLeft + scaledX * Math.cos(rad) - scaledY * Math.sin(rad);
              const absY = groupTop + scaledX * Math.sin(rad) + scaledY * Math.cos(rad);
              obj.set({
                left: absX, top: absY,
                angle: (obj.angle || 0) + groupAngle,
                scaleX: (obj.scaleX || 1) * groupScaleX,
                scaleY: (obj.scaleY || 1) * groupScaleY,
                selectable: true, evented: true,
              });
              obj.setCoords();
              canvas.add(obj);
              // Move to the position where the group was, preserving order
              try { canvas.moveObjectTo(obj, groupZIndex + i); } catch { /* fallback no-op */ }
              newObjects.push(obj);
            }

            isRestoringRef.current = origRestoring;

            if (newObjects.length > 0) {
              const sel = new fabric.ActiveSelection(newObjects, { canvas });
              canvas.setActiveObject(sel);
              canvas.requestRenderAll();
              setSelectedObj(sel);
              // Single history save for the entire ungroup operation
              canvas.fire("object:modified", { target: sel, _historyLabel: "Dégrouper" });
            }
          })();
        }
        return;
      }
      // Arrow keys: move selected object
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) && active && active.selectable !== false) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        switch (e.key) {
          case "ArrowUp": active.set("top", (active.top || 0) - step); break;
          case "ArrowDown": active.set("top", (active.top || 0) + step); break;
          case "ArrowLeft": active.set("left", (active.left || 0) - step); break;
          case "ArrowRight": active.set("left", (active.left || 0) + step); break;
        }
        active.setCoords();
        fabricRef.current?.renderAll();
        // Force React re-render so BottomBar position updates
        useEditorStore.getState().forceRender((n: number) => n + 1);
        // Save to history (debounced) so undo works for arrow key moves
        fabricRef.current?.fire("object:modified", { target: active, _historyLabel: "Déplacement", _continuous: true });
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [deleteSelected, duplicateSelected, copySelected, pasteClipboard, undo, redo, cleanupTools, handleSave, bringForward, sendBackward, bringToFront, sendToBack, copyStyle, pasteStyle, exitGroupEditing, editingGroupObjsRef, setSelectedObj]);

  // ── Warn before closing/refreshing the page, but only if there are
  // unsaved changes (historyIndex > 0 means the user edited something). ──
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const historyIdx = useEditorStore.getState().historyIndexRef.current;
      if (historyIdx > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

}
