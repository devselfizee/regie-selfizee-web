"use client";

import React, { useState, useRef, useEffect } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function PanelCalques({ canvasRef, selectedObj, onForceUpdate }: { canvasRef: React.MutableRefObject<any>; selectedObj: any; onForceUpdate?: () => void }) {
  // Read the canvas fresh from the ref on each render so format
  // changes (which replace the underlying fabric canvas) are picked
  // up. Previously the parent passed `canvas={fabricRef.current}`
  // which froze the reference at that render and kept the panel
  // pointing at a disposed canvas.
  const canvas = canvasRef.current;
  const [, forceUpdate] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  // Track the object to delete by REFERENCE rather than index — otherwise
  // any list re-render (visibility toggle, reorder, filter change) that
  // shifts indices leaves the confirm pending on the wrong row.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [confirmDeleteObj, setConfirmDeleteObj] = useState<any>(null);
  // Custom drag state (refs to avoid stale closures)
  const dragFromRef = useRef<number | null>(null);
  const dragOverRef = useRef<number | null>(null);
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [renamingIdx, setRenamingIdx] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // Moved ABOVE the early return to respect Rules of Hooks
  const [shootAlert, setShootAlert] = useState(false);

  useEffect(() => {
    if (!canvas) return;
    const refresh = () => forceUpdate((n) => n + 1);
    canvas.on("object:added", refresh); canvas.on("object:removed", refresh);
    canvas.on("object:modified", refresh); canvas.on("selection:created", refresh);
    canvas.on("selection:updated", refresh); canvas.on("selection:cleared", refresh);
    return () => { canvas.off("object:added", refresh); canvas.off("object:removed", refresh); canvas.off("object:modified", refresh); canvas.off("selection:created", refresh); canvas.off("selection:updated", refresh); canvas.off("selection:cleared", refresh); };
  }, [canvas]);

  if (!canvas) return null;

  const allObjects = canvas.getObjects();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const objects = allObjects.filter((o: any) =>
    !o._isTextGuide && !o._isGuideline && !o._isCropRect && !o._isCropOverlay &&
    !o._isCropPreview && !o._isShootLabel && !o._isPenOverlay && !o._isPenPreview &&
    !o._isFeatherPreview && !o._isSolidBg && !o._isDesignAreaBg &&
    (o.selectable !== false || o._isShootZone)
  );
  const displayObjects = [...objects].reverse();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function getLabel(obj: any): string {
    if (obj.type === "textbox" || obj.type === "i-text") return (obj.text || "").substring(0, 15) || "Texte";
    if (obj.type === "image") { const w = Math.round((obj.width||0)*(obj.scaleX||1)); const h = Math.round((obj.height||0)*(obj.scaleY||1)); return obj._isBgImage ? `Fond image ${w}×${h}` : `Image ${w}×${h}`; }
    if (obj.type === "rect") return obj._isShootZone ? `Shoot #${obj._shootIndex||"?"}` : "Rectangle";
    if (obj.type === "circle") return "Cercle"; if (obj.type === "ellipse") return "Ovale";
    if (obj.type === "triangle") return "Triangle"; if (obj.type === "polygon") return "Polygone";
    if (obj.type === "line") return "Ligne";
    if (obj.type === "group" && obj._isCurvedText) return `Texte arc: ${(obj._curveText || "").substring(0, 12)}`;
    if (obj.type === "group") return `Groupe (${obj.getObjects?.()?.length||"?"})`;
    if (obj.type === "path") return obj._isPenPath ? "Forme plume" : "Tracé";
    return obj.type || "Objet";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function renderIcon(obj: any) {
    const c = (typeof obj.fill === "string" && obj.fill !== "transparent") ? obj.fill : "#aaa";
    const sc = (typeof obj.stroke === "string" && obj.stroke) ? obj.stroke : "none";
    if (obj.type === "textbox" || obj.type === "i-text") return <div className="w-7 h-7 rounded bg-gray-100 border border-gray-200 flex items-center justify-center"><span className="text-sm font-bold" style={{ color: typeof obj.fill === "string" ? obj.fill : "#333" }}>T</span></div>;
    try { if (obj.type === "image") { const el = obj.getElement?.() || obj._element; if (el) { const cv = document.createElement("canvas"); cv.width=32; cv.height=32; const cx=cv.getContext("2d"); if(cx){ const sw=el.naturalWidth||el.width||32; const sh=el.naturalHeight||el.height||32; const s=Math.min(32/sw,32/sh); cx.drawImage(el,(32-sw*s)/2,(32-sh*s)/2,sw*s,sh*s); return <img src={cv.toDataURL("image/jpeg",0.5)} alt="" className="w-7 h-7 rounded border border-gray-200 object-cover" />; } } } } catch { /* skip */ }
    if (obj._isShootZone) return <div className="w-7 h-7 rounded bg-gray-50 border border-gray-200 flex items-center justify-center"><svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg></div>;
    const icons: Record<string, React.ReactNode> = {
      rect: <svg viewBox="0 0 20 20" className="w-4 h-4"><rect x="2" y="4" width="16" height="12" rx={obj.rx?3:0} fill={c} stroke={sc} strokeWidth="1"/></svg>,
      circle: <svg viewBox="0 0 20 20" className="w-4 h-4"><circle cx="10" cy="10" r="8" fill={c} stroke={sc} strokeWidth="1"/></svg>,
      ellipse: <svg viewBox="0 0 20 20" className="w-4 h-4"><ellipse cx="10" cy="10" rx="9" ry="6" fill={c} stroke={sc} strokeWidth="1"/></svg>,
      triangle: <svg viewBox="0 0 20 20" className="w-4 h-4"><polygon points="10,2 19,18 1,18" fill={c} stroke={sc} strokeWidth="1"/></svg>,
      polygon: <svg viewBox="0 0 20 20" className="w-4 h-4"><polygon points="10,1 18,7 15,17 5,17 2,7" fill={c} stroke={sc} strokeWidth="1"/></svg>,
      line: <svg viewBox="0 0 20 20" className="w-4 h-4"><line x1="2" y1="18" x2="18" y2="2" stroke={sc!=="none"?sc:c} strokeWidth="2" strokeLinecap="round"/></svg>,
      path: <svg viewBox="0 0 20 20" className="w-4 h-4"><path d="M2 16C6 2,14 2,18 16" fill={c!=="#aaa"?c:"none"} stroke={c!=="#aaa"?c:"#888"} strokeWidth="1.5"/></svg>,
      group: <svg viewBox="0 0 20 20" className="w-4 h-4"><rect x="1" y="1" width="8" height="8" rx="1" fill="#4f46e5" opacity=".6"/><rect x="6" y="6" width="8" height="8" rx="1" fill="#4f46e5" opacity=".4"/><rect x="11" y="11" width="8" height="8" rx="1" fill="#4f46e5" opacity=".3"/></svg>,
    };
    return <div className="w-7 h-7 rounded bg-gray-50 border border-gray-200 flex items-center justify-center flex-shrink-0">{icons[obj.type] || <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" strokeWidth="1.5"/></svg>}</div>;
  }

  function isObjSelected(obj: any): boolean {
    const active = canvas.getActiveObject();
    if (!active) return false;
    if (active === obj) return true;
    if (active.type === "activeselection" || active.type === "activeSelection") return active.getObjects?.()?.includes(obj) ?? false;
    return false;
  }

  function handleLayerClick(obj: any, e: React.MouseEvent) {
    if (obj._isShootZone && obj._shootLocked) obj.set({ selectable: true, evented: true });
    const isMac = navigator.platform?.toUpperCase().includes("MAC");
    const isMultiKey = isMac ? e.metaKey : e.ctrlKey;
    if (isMultiKey) {
      const active = canvas.getActiveObject();
      if (!active) { canvas.setActiveObject(obj); }
      else if (active === obj) { canvas.discardActiveObject(); }
      else {
        const cur = (active.type === "activeselection" || active.type === "activeSelection") ? [...active.getObjects()] : [active];
        const newObjs = cur.includes(obj) ? cur.filter((o: any) => o !== obj) : [...cur, obj];
        canvas.discardActiveObject();
        if (newObjs.length === 1) canvas.setActiveObject(newObjs[0]);
        else if (newObjs.length > 1) import("fabric").then((f) => { const sel = new f.ActiveSelection(newObjs, { canvas }); canvas.setActiveObject(sel); canvas.requestRenderAll(); });
      }
    } else if (e.shiftKey) {
      const active = canvas.getActiveObject();
      const lastObj = (active?.type === "activeselection" || active?.type === "activeSelection") ? active.getObjects().at(-1) : active;
      if (lastObj) {
        const fromIdx = displayObjects.indexOf(lastObj); const toIdx = displayObjects.indexOf(obj);
        if (fromIdx >= 0 && toIdx >= 0) {
          const rangeObjs = displayObjects.slice(Math.min(fromIdx, toIdx), Math.max(fromIdx, toIdx) + 1);
          canvas.discardActiveObject();
          import("fabric").then((f) => { const sel = new f.ActiveSelection(rangeObjs, { canvas }); canvas.setActiveObject(sel); canvas.requestRenderAll(); });
        }
      } else canvas.setActiveObject(obj);
    } else {
      canvas.setActiveObject(obj);
    }
    canvas.requestRenderAll();
    forceUpdate((n) => n + 1);
  }

  // shootAlert useState moved above early return (Rules of Hooks)
  function doDelete(obj: any) {
    // Prevent deleting last shoot zone (must keep at least 1)
    if (obj._isShootZone) {
      const allShoots = canvas.getObjects().filter((o: any) => o._isShootZone || o._shootIndex);
      if (allShoots.length <= 1) {
        setShootAlert(true);
        setConfirmDeleteObj(null);
        return;
      }
    }
    if ((obj._isShootZone || obj._shootIndex) && obj._shootLabel) canvas.remove(obj._shootLabel);
    canvas.remove(obj); canvas.discardActiveObject(); canvas.requestRenderAll();
    // Re-number remaining shoots
    const remainingShoots = canvas.getObjects().filter((o: any) => o._isShootZone || o._shootIndex);
    remainingShoots.forEach((shoot: any, i: number) => {
      shoot._shootIndex = i + 1;
      if (shoot._shootLabel) shoot._shootLabel.set({ text: `#${i + 1}` });
    });
    // If only 1 shoot remains, remove its label
    if (remainingShoots.length === 1 && remainingShoots[0]._shootLabel) {
      canvas.remove(remainingShoots[0]._shootLabel);
      remainingShoots[0]._shootLabel = null;
    }
    canvas.requestRenderAll();
    setConfirmDeleteObj(null); forceUpdate((n) => n + 1);
  }

  const moveLayer = (i: number, dir: "up" | "down") => {
    const obj = displayObjects[i]; if (!obj) return;
    if (dir === "up" && i > 0) canvas.bringObjectForward(obj);
    else if (dir === "down" && i < displayObjects.length - 1) canvas.sendObjectBackwards(obj);
    canvas.requestRenderAll(); forceUpdate((n) => n + 1);
  };

  // Custom drag via mousedown/mousemove (no HTML5 drag = no upload conflict)
  // Store displayObjects snapshot in a ref so the onUp closure reads fresh data
  const displayObjsRef = useRef(displayObjects);
  displayObjsRef.current = displayObjects;
  const didDragRef = useRef(false);

  function startDrag(fromIdx: number, startY: number) {
    dragFromRef.current = fromIdx;
    dragOverRef.current = null;
    setDragFromIdx(fromIdx);
    let hasDragged = false;
    didDragRef.current = false;

    const onMove = (ev: MouseEvent) => {
      if (!hasDragged && Math.abs(ev.clientY - startY) < 5) return;
      hasDragged = true;
      didDragRef.current = true;
      // Find which layer the cursor is over by checking DOM positions
      let over: number | null = null;
      const els = Array.from(document.querySelectorAll("[data-layer-idx]"));
      if (els.length > 0) {
        // Check if above the first element
        const firstRect = els[0].getBoundingClientRect();
        if (ev.clientY < firstRect.top + firstRect.height / 2) {
          over = 0;
        } else {
          // Check if below the last element
          const lastRect = els[els.length - 1].getBoundingClientRect();
          if (ev.clientY > lastRect.top + lastRect.height / 2) {
            over = els.length - 1;
          } else {
            // Find which element the cursor is in.
            // Break on first hit — iterating without break meant later
            // overlapping elements (during animation) would overwrite
            // `over` with a stale value.
            for (const el of els) {
              const rect = el.getBoundingClientRect();
              if (ev.clientY >= rect.top && ev.clientY <= rect.bottom) {
                over = parseInt(el.getAttribute("data-layer-idx") || "-1");
                break;
              }
            }
          }
        }
      }
      if (over !== dragOverRef.current) {
        dragOverRef.current = over;
        setDragOverIdx(over);
      }
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);

      const from = dragFromRef.current;
      const to = dragOverRef.current;

      // Reset visual state immediately
      dragFromRef.current = null;
      dragOverRef.current = null;
      setDragFromIdx(null);
      setDragOverIdx(null);

      if (!hasDragged || from === null || to === null || from === to) return;

      // Read CURRENT displayObjects from ref (not stale closure)
      const objs = displayObjsRef.current;
      const fromObj = objs[from];
      const toObj = objs[to];
      if (!fromObj || !toObj) return;

      // Reorder by manipulating the internal _objects array directly
      // (Fabric.js v7 doesn't have insertAt)
      const canvasObjs = canvas._objects;
      const fromCanvasIdx = canvasObjs.indexOf(fromObj);
      const toCanvasIdx = canvasObjs.indexOf(toObj);
      if (fromCanvasIdx < 0 || toCanvasIdx < 0) return;

      // Remove from current position
      canvasObjs.splice(fromCanvasIdx, 1);
      // Recalculate target index after removal
      const newToIdx = canvasObjs.indexOf(toObj);
      // Insert: display list is reversed, so "above" in display = higher index in canvas
      // Dragging UP in display = moving to HIGHER canvas index
      const insertIdx = from < to ? newToIdx : newToIdx + 1;
      canvasObjs.splice(Math.max(0, Math.min(canvasObjs.length, insertIdx)), 0, fromObj);
      canvas.requestRenderAll();
      canvas.fire("object:modified", { target: fromObj, _historyLabel: "Ordre des calques modifié" });
      forceUpdate((n) => n + 1);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  const isMac = typeof navigator !== "undefined" && navigator.platform?.toUpperCase().includes("MAC");

  const q = searchQuery.trim().toLowerCase();
  const filteredDisplayObjects = q
    ? displayObjects.filter((obj: any) => getLabel(obj).toLowerCase().includes(q) || (obj.type || "").toLowerCase().includes(q))
    : displayObjects;

  return (
    <div className="space-y-3">
      {/* Shoot delete alert */}
      {shootAlert && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-center animate-[fadeSlideIn_0.1s_ease-out]">
          <p className="text-xs text-amber-700 font-semibold mb-1">Impossible de supprimer</p>
          <p className="text-[10px] text-amber-600">Il doit y avoir au moins 1 zone de shoot.</p>
          <button onClick={() => setShootAlert(false)} className="mt-2 px-3 py-1 text-[10px] bg-amber-100 text-amber-700 font-medium rounded-lg hover:bg-amber-200 transition-colors">OK</button>
        </div>
      )}
      {/* Search */}
      <div className="relative">
        <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input
          type="text"
          placeholder="Rechercher un calque…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-6 pr-7 py-1.5 text-[11px] bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#4f46e5] text-gray-700 placeholder-gray-400"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-gray-400 text-[10px] font-medium">
          {q ? `${filteredDisplayObjects.length}/${objects.length}` : objects.length} élément{objects.length > 1 ? "s" : ""}
        </p>
        <p className="text-gray-300 text-[9px]">{isMac ? "⌘" : "Ctrl"}+clic = multi</p>
      </div>
      {objects.length === 0 ? (
        <p className="text-gray-400 text-xs text-center py-4">Aucun élément sur le canvas.</p>
      ) : filteredDisplayObjects.length === 0 ? (
        <p className="text-gray-400 text-xs text-center py-4">Aucun calque trouvé.</p>
      ) : (
        <div className="space-y-0.5">
          {filteredDisplayObjects.map((obj: any, i: number) => {
            const selected = isObjSelected(obj);
            const isLocked = !!obj.lockMovementX;
            const isConfirming = confirmDeleteObj === obj;
            return (
              <div key={`layer-${i}-${obj.type}`}>
                <div
                  data-layer-idx={i}
                  onMouseDown={(e) => {
                    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
                    startDrag(i, e.clientY);
                  }}
                  onClick={(e) => { if (didDragRef.current) { didDragRef.current = false; return; } if (!(e.target as HTMLElement).closest("button")) handleLayerClick(obj, e); }}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-grab active:cursor-grabbing transition-all select-none ${
                    dragOverIdx === i && dragFromIdx !== i ? "ring-2 ring-[#4f46e5] ring-offset-1" : ""
                  } ${dragFromIdx === i ? "opacity-40 scale-95" : ""
                  } ${selected ? "bg-purple-50 ring-1 ring-[#4f46e5] text-gray-800" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                  } ${isLocked ? "opacity-60" : ""}`}
                >
                  <div className="flex-shrink-0">{renderIcon(obj)}</div>
                  {renamingIdx === i ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => { if (renameValue.trim()) obj._customName = renameValue.trim(); setRenamingIdx(null); forceUpdate((n) => n + 1); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { if (renameValue.trim()) obj._customName = renameValue.trim(); setRenamingIdx(null); forceUpdate((n) => n + 1); } if (e.key === "Escape") setRenamingIdx(null); }}
                      className="flex-1 min-w-0 h-5 px-1 text-[11px] font-medium bg-white border border-[#4f46e5] rounded outline-none"
                    />
                  ) : (
                    <span
                      className="flex-1 truncate text-[11px] font-medium"
                      onDoubleClick={(e) => { e.stopPropagation(); setRenamingIdx(i); setRenameValue(obj._customName || getLabel(obj)); }}
                    >{obj._customName || getLabel(obj)}</span>
                  )}

                  {/* Duplicate */}
                  <button onClick={async (e) => {
                    e.stopPropagation();
                    if (!canvas) return;
                    try {
                      const cloned = await obj.clone();
                      cloned.set({ left: (obj.left || 0) + 15, top: (obj.top || 0) + 15 });
                      // Copy ONLY own enumerable underscore props. `for...in`
                      // would traverse the prototype chain and pull in
                      // Fabric internals like `_setLineDash`,
                      // `_controlsVisibility` etc., which clobber
                      // prototype-provided defaults and corrupt the clone.
                      for (const k of Object.keys(obj)) {
                        if (k.startsWith("_") && k !== "_shootLabel" && k !== "_objects") {
                          cloned[k] = obj[k];
                        }
                      }
                      // Don't copy the label reference (we'll create a new one for shoots)
                      cloned._shootLabel = null;

                      // Duplicated shoots: unlocked, ratio-free, normalized scale, fresh checkerboard
                      if (cloned._isShootZone) {
                        cloned._shootLocked = false;
                        cloned._locked = false;
                        cloned._ratioLocked = false;
                        cloned.set({
                          fill: await (async () => { const f = await import("fabric"); const s=12,c=document.createElement("canvas"); c.width=s*2; c.height=s*2; const x=c.getContext("2d")!; x.fillStyle="#fff"; x.fillRect(0,0,s*2,s*2); x.fillStyle="#e0e0e0"; x.fillRect(0,0,s,s); x.fillRect(s,s,s,s); return new f.Pattern({source:c,repeat:"repeat"}); })(),
                          lockMovementX: false, lockMovementY: false,
                          lockScalingX: false, lockScalingY: false,
                          lockRotation: false, hasControls: true,
                          selectable: true, evented: true,
                          hoverCursor: "move",
                          noScaleCache: true,
                        });
                      }

                      canvas.add(cloned);

                      // Handle shoot zone duplication: re-number ALL shoots
                      // (including the freshly-added clone) + create missing
                      // labels. Previously `allShoots` was snapshot BEFORE
                      // adding the clone, so the clone kept a pre-add index
                      // that could collide with an existing shoot.
                      if (cloned._isShootZone) {
                        const fabric = await import("fabric");
                        const allShoots = canvas.getObjects().filter((o: any) => o._isShootZone);
                        allShoots.forEach((shoot: any, idx: number) => {
                          shoot._shootIndex = idx + 1;
                          if (shoot._shootLabel) {
                            shoot._shootLabel.set({ text: `#${idx + 1}` });
                          } else {
                            // Create missing label
                            const lbl = new fabric.FabricText(`#${idx + 1}`, {
                              left: (shoot.left || 0) + 8, top: (shoot.top || 0) + 6,
                              originX: "left", originY: "top",
                              fontSize: 16, fontFamily: "sans-serif", fontWeight: "bold",
                              fill: "#4f46e5", selectable: false, evented: false,
                            });
                            (lbl as any)._isShootLabel = true;
                            (lbl as any)._shootZone = shoot;
                            shoot._shootLabel = lbl;
                            canvas.add(lbl);
                          }
                        });
                      }

                      canvas.setActiveObject(cloned);
                      canvas.requestRenderAll();
                      forceUpdate((n) => n + 1);
                      onForceUpdate?.();
                    } catch { /* clone failed */ }
                  }} className="p-0.5 rounded transition-colors text-gray-300 hover:text-gray-500" title="Dupliquer">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  </button>
                  {/* Delete */}
                  <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteObj(isConfirming ? null : obj); }} className={`p-0.5 rounded transition-colors ${isConfirming ? "text-red-500" : "text-gray-300 hover:text-red-400"}`} title="Supprimer">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                  {/* Lock */}
                  <button onClick={(e) => { e.stopPropagation(); const l = obj.lockMovementX; obj.set({ lockMovementX:!l, lockMovementY:!l, lockScalingX:!l, lockScalingY:!l, lockRotation:!l, hasControls:l, hoverCursor: !l ? "default" : "move" }); if(obj._isShootZone) obj._shootLocked=!l; (obj as any)._locked=!l; obj.setCoords(); const active = canvas.getActiveObject(); if (active === obj) { canvas.discardActiveObject(); canvas.setActiveObject(obj); } canvas.requestRenderAll(); forceUpdate((n)=>n+1); onForceUpdate?.(); }}
                    className={`p-0.5 rounded transition-colors ${isLocked ? "text-amber-500" : "text-gray-300 hover:text-gray-400"}`} title={isLocked ? "Déverrouiller" : "Verrouiller"}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">{isLocked ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />}</svg>
                  </button>
                  {/* Visibility */}
                  <button onClick={(e) => { e.stopPropagation(); obj.set("visible", !obj.visible); canvas.requestRenderAll(); canvas.fire("object:modified", { target: obj, _historyLabel: "Visibilité modifiée" }); forceUpdate((n)=>n+1); }}
                    className={`p-0.5 rounded transition-colors ${obj.visible !== false ? "text-gray-400" : "text-gray-300"}`} title={obj.visible !== false ? "Masquer" : "Afficher"}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">{obj.visible !== false ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />}</svg>
                  </button>
                  {/* Move */}
                  <div className="flex flex-col -space-y-0.5">
                    <button onClick={(e) => { e.stopPropagation(); moveLayer(i, "up"); }} className="p-0 text-gray-300 hover:text-gray-600" disabled={i===0}><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" /></svg></button>
                    <button onClick={(e) => { e.stopPropagation(); moveLayer(i, "down"); }} className="p-0 text-gray-300 hover:text-gray-600" disabled={i===displayObjects.length-1}><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg></button>
                  </div>
                </div>
                {/* Delete confirmation message */}
                {isConfirming && (
                  <div className="flex items-center gap-2 px-2 py-1.5 ml-9 animate-[fadeSlideIn_0.1s_ease-out]">
                    <span className="text-[10px] text-red-500">Supprimer ?</span>
                    <button onClick={() => doDelete(obj)} className="px-2 py-0.5 text-[10px] font-semibold bg-red-500 text-white rounded hover:bg-red-600 transition-colors">Oui</button>
                    <button onClick={() => setConfirmDeleteObj(null)} className="px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-700 transition-colors">Non</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PanelCalques;
