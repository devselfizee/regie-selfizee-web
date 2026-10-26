"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { CtxBtn } from "./CtxBtn";
import { SvgColorEditor } from "../panels/SvgColorEditor";
import { TextToolbar } from "./TextToolbar";
import { ImageToolbar } from "./ImageToolbar";
import { ShapeToolbar } from "./ShapeToolbar";
import { ShootToolbar } from "./ShootToolbar";
import { StrokePanel } from "./StrokePanel";
import { CommonTools } from "./CommonTools";
import { CUSTOM_PROPS } from "../types";
import { useEditorStore } from "../store/editorStore";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Props that cannot come from the store (action callbacks from hooks) */
interface ContextualToolbarProps {
  updateObj: (props: Record<string, any>) => void;
  applyGradientBg: (...args: any[]) => void;
  addText: (...args: any[]) => void;
  startCrop: () => void;
  removingBg: boolean;
  removeBackground: () => void;
  startSelectArea: (...args: any[]) => void;
  showSelectionPopup: (...args: any[]) => void;
  applyFade: (...args: any[]) => void;
  alignObjects: (dir: any) => void;
  addShootZone: () => void;
  enterGroupEditing: (group: any) => void;
  /** These remain local state in FrameEditor since they don't belong to the editor store */
  fadeOrigImgRef: React.MutableRefObject<HTMLImageElement | null>;
  fadeOffscreenRef: React.MutableRefObject<HTMLCanvasElement | null>;
  fadeMaskRef: React.MutableRefObject<HTMLCanvasElement | null>;
  effectsPos: { top: number; left: number };
  setEffectsPos: (v: { top: number; left: number }) => void;
  cleanupTools: () => void;
  clipFeatherValue: number;
  setClipFeatherValue: (v: number) => void;
  clipFeatherRef: { current: number };
  addCurvedText?: (...args: any[]) => void;
}

function ContextualToolbarComponent(props: ContextualToolbarProps) {
  const {
    updateObj,
    applyGradientBg,
    addText,
    startCrop, removingBg, removeBackground,
    startSelectArea, showSelectionPopup,
    applyFade,
    alignObjects,
    addShootZone,
    enterGroupEditing,
    effectsPos, setEffectsPos,
    cleanupTools,
  } = props;

  // Read only the state slices this component needs
  const selectedObj = useEditorStore(s => s.selectedObj);
  const cropping = useEditorStore(s => s.cropping);
  const fabricRef = useEditorStore(s => s.fabricRef);
  const forceRender = useEditorStore(s => s.forceRender);
  const _forceRenderCount = useEditorStore(s => s._forceRenderCount);
  const setSelectedObj = useEditorStore(s => s.setSelectedObj);
  const showShadowPanel = useEditorStore(s => s.showShadowPanel);
  const setShowShadowPanel = useEditorStore(s => s.setShowShadowPanel);
  const setShadowPanelPos = useEditorStore(s => s.setShadowPanelPos);
  const showCornerPanel = useEditorStore(s => s.showCornerPanel);
  const setShowCornerPanel = useEditorStore(s => s.setShowCornerPanel);
  const cornerPanelPos = useEditorStore(s => s.cornerPanelPos);

  // Derived selection booleans
  const isTextSelected = selectedObj?.type === "textbox" || selectedObj?.type === "i-text";
  const isImageSelected = selectedObj?.type === "image";
  const isCurvedTextSelected = selectedObj?.type === "group" && selectedObj._isCurvedText;
  const isSvgGroupSelected = selectedObj?.type === "group" && !selectedObj._isShootZone && !selectedObj._isCurvedText && selectedObj._objects?.length > 0;
  const isMultiSelect = selectedObj?.type === "activeselection" || selectedObj?.type === "activeSelection";
  const isShootSelected = selectedObj && (selectedObj._isShootZone || (selectedObj._shootIndex && selectedObj.type === "rect"));

  return (
    <>
      {/* ═══ CONTEXTUAL TOOLBAR (Canva-style full-width secondary bar) ═══ */}
      {selectedObj && !cropping && (
        <div className="flex items-center h-[52px] bg-white border-b border-gray-200 flex-shrink-0 animate-[fadeSlideIn_0.12s_ease-out]">
        <div className="flex items-center gap-2 px-5 flex-1 overflow-x-auto min-w-0" style={{ overscrollBehavior: "contain" }}>
          {/* ── Locked object banner ── */}
          {selectedObj.lockMovementX && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const canvas = fabricRef.current;
                  if (!canvas) return;
                  // Get the real Fabric object (selectedObj may be a spread copy without methods)
                  const obj = canvas.getActiveObject();
                  if (!obj) return;
                  obj.set({ lockMovementX: false, lockMovementY: false, lockScalingX: false, lockScalingY: false, lockRotation: false, hasControls: true, hoverCursor: "move" });
                  (obj as any)._locked = false;
                  if ((obj as any)._isShootZone) (obj as any)._shootLocked = false;
                  obj.setCoords();
                  canvas.discardActiveObject();
                  canvas.setActiveObject(obj);
                  canvas.requestRenderAll();
                  canvas.fire("object:modified", { target: obj });
                  setSelectedObj(obj);
                  forceRender((n: number) => n + 1);
                }}
                className="flex items-center gap-2 h-9 px-4 rounded-lg bg-amber-100 text-amber-700 text-sm font-semibold hover:bg-amber-200 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                Verrouillé — Cliquer pour déverrouiller
              </button>
            </div>
          )}
          {/* ── Text contextual tools ── */}
          {isTextSelected && !selectedObj.lockMovementX && (
            <TextToolbar
              updateObj={updateObj}
              applyGradientBg={applyGradientBg}
              addText={addText}
              effectsPos={effectsPos}
              setEffectsPos={setEffectsPos}
            />
          )}

          {/* ── Image contextual tools ── */}
          {isImageSelected && !selectedObj.lockMovementX && (
            <ImageToolbar
              startCrop={startCrop}
              removingBg={removingBg}
              removeBackground={removeBackground}
              startSelectArea={startSelectArea}
              showSelectionPopup={showSelectionPopup}
              applyFade={applyFade}
            />
          )}

          {/* ── SVG Group color editor + shadow ── */}
          {isSvgGroupSelected && (
            <div className="flex items-center gap-3 px-4 h-11 bg-white border-b border-gray-100 flex-shrink-0">
              <SvgColorEditor canvas={fabricRef.current} selectedObj={selectedObj} />
              <div className="w-px h-7 bg-gray-200 mx-0.5" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = (e.target as HTMLElement).closest("button")!.getBoundingClientRect();
                  setShadowPanelPos({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 260) });
                  setShowShadowPanel(!showShadowPanel);
                }}
                className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedObj.shadow
                    ? "bg-[#4f46e5]/10 text-[#4f46e5] border border-[#4f46e5]/30"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
                title="Ombre portée"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="3" y="3" width="14" height="14" rx="2" strokeWidth={2} />
                  <rect x="7" y="7" width="14" height="14" rx="2" strokeWidth={1.5} opacity="0.3" fill="currentColor" stroke="none" />
                </svg>
                Ombre
              </button>
            </div>
          )}

          {/* ── Curved text toolbar ── */}
          {isCurvedTextSelected && (
            <CurvedTextToolbar
              selectedObj={selectedObj}
              fabricRef={fabricRef}
              setSelectedObj={setSelectedObj}
              forceRender={forceRender}
            />
          )}

          {/* ── Shape contextual tools ── */}
          {!isImageSelected && !isTextSelected && !isSvgGroupSelected && !isCurvedTextSelected && !selectedObj._isShootZone && !isMultiSelect && selectedObj?.type !== "group" && (
            <ShapeToolbar updateObj={updateObj} />
          )}

          {/* ── Shoot zone tools ── */}
          {selectedObj?._isShootZone && (
            <ShootToolbar updateObj={updateObj} addShootZone={addShootZone} />
          )}

          {/* ── Multi-selection alignment ── */}
          {isMultiSelect && (
            <>
              <span className="text-sm text-gray-400 mr-1">Aligner :</span>
              <CtxBtn title="Gauche" onClick={() => alignObjects("left")}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v16M8 8h12M8 16h8" />
              </CtxBtn>
              <CtxBtn title="Centrer H" onClick={() => alignObjects("center-h")}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16M6 8h12M8 16h8" />
              </CtxBtn>
              <CtxBtn title="Droite" onClick={() => alignObjects("right")}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 4v16M4 8h12M8 16h8" />
              </CtxBtn>
              <div className="w-px h-7 bg-gray-200 mx-1" />
              <CtxBtn title="Haut" onClick={() => alignObjects("top")}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h16M8 8v12M16 8v8" />
              </CtxBtn>
              <CtxBtn title="Centrer V" onClick={() => alignObjects("center-v")}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12h16M8 6v12M16 8v8" />
              </CtxBtn>
              <CtxBtn title="Bas" onClick={() => alignObjects("bottom")}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 20h16M8 4v12M16 8v8" />
              </CtxBtn>
              <div className="w-px h-7 bg-gray-200 mx-1" />
              <CtxBtn title="Distribuer H" onClick={() => alignObjects("distribute-h")}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v16M12 6v12M20 4v16" />
              </CtxBtn>
              <CtxBtn title="Distribuer V" onClick={() => alignObjects("distribute-v")}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h16M6 12h12M4 20h16" />
              </CtxBtn>
              <div className="w-px h-7 bg-gray-200 mx-1" />
              {/* Multi-select: shared opacity */}
              <div className="flex items-center gap-1.5 flex-shrink-0" title="Opacité de tous les objets sélectionnés">
                <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="4" cy="4" r="1.5" opacity="0.3" /><circle cx="8" cy="4" r="1.5" opacity="0.5" /><circle cx="12" cy="4" r="1.5" opacity="0.7" />
                  <circle cx="4" cy="8" r="1.5" opacity="0.5" /><circle cx="8" cy="8" r="1.5" opacity="0.7" /><circle cx="12" cy="8" r="1.5" opacity="0.9" />
                  <circle cx="4" cy="12" r="1.5" opacity="0.7" /><circle cx="8" cy="12" r="1.5" opacity="0.9" /><circle cx="12" cy="12" r="1.5" />
                </svg>
                <input
                  type="range" min={0} max={100} step={5}
                  // Controlled from the first selected child's opacity.
                  // Using defaultValue (uncontrolled) would keep stale
                  // values across successive multi-selections.
                  key={`mopacity-${(selectedObj as any)?._objects?.length ?? 0}`}
                  defaultValue={Math.round(((selectedObj as any)?._objects?.[0]?.opacity ?? 1) * 100)}
                  onChange={(e) => {
                    const canvas = fabricRef.current;
                    if (!canvas) return;
                    const val = parseInt(e.target.value) / 100;
                    const active = canvas.getActiveObject();
                    if (!active) return;
                    const objs = (active as any).getObjects ? (active as any).getObjects() : [active];
                    objs.forEach((o: any) => o.set({ opacity: val }));
                    canvas.requestRenderAll();
                  }}
                  onMouseUp={() => {
                    const canvas = fabricRef.current;
                    const target = canvas?.getActiveObject();
                    // Guard: the active object can become null between
                    // mousedown and mouseup if the selection cleared
                    // (click outside, tool deactivation, etc.)
                    if (canvas && target) {
                      canvas.fire("object:modified", { target, _historyLabel: "Opacité multi" });
                    }
                  }}
                  className="w-16 accent-[#4f46e5] cursor-pointer"
                />
              </div>
              {/* Multi-select: shared fill color */}
              <label className="relative w-7 h-7 rounded-lg border-2 border-gray-200 overflow-hidden cursor-pointer flex-shrink-0 hover:border-[#4f46e5] transition-colors" title="Couleur de remplissage de tous les objets sélectionnés">
                <input
                  type="color"
                  // Re-key on selection change so the picker resets to
                  // the first child's current fill instead of showing
                  // the previous selection's colour.
                  key={`mfill-${(selectedObj as any)?._objects?.length ?? 0}`}
                  defaultValue={(() => {
                    const firstFill = (selectedObj as any)?._objects?.[0]?.fill;
                    return typeof firstFill === "string" && /^#[0-9a-f]{6}$/i.test(firstFill) ? firstFill : "#000000";
                  })()}
                  onChange={(e) => {
                  const canvas = fabricRef.current;
                  if (!canvas) return;
                  const active = canvas.getActiveObject();
                  if (!active) return;
                  const objs = (active as any).getObjects ? (active as any).getObjects() : [active];
                  objs.forEach((o: any) => o.set({ fill: e.target.value }));
                  canvas.requestRenderAll();
                  canvas.fire("object:modified", { target: active, _historyLabel: "Couleur multi" });
                  forceRender((n: number) => n + 1);
                }} className="absolute inset-0 opacity-0 cursor-pointer" />
                <div className="w-full h-full bg-gradient-to-br from-red-400 via-purple-500 to-blue-500" />
              </label>
              <div className="w-px h-7 bg-gray-200 mx-1" />
              <button
                onClick={async () => {
                  const canvas = fabricRef.current;
                  if (!canvas) return;
                  const active = canvas.getActiveObject();
                  if (active?.type === "activeselection" || active?.type === "activeSelection") {
                    const fabric = await import("fabric");
                    const objects = (active as any).getObjects();
                    objects.forEach((o: any) => canvas.remove(o));
                    const group = new fabric.Group(objects, { originX: "center", originY: "center" });
                    canvas.add(group);
                    canvas.setActiveObject(group);
                    canvas.requestRenderAll();
                    setSelectedObj(group);
                  }
                }}
                className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium bg-[#4f46e5] text-white hover:bg-[#4338ca] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                Grouper
              </button>
            </>
          )}

          {/* ── Group ungroup ── */}
          {selectedObj?.type === "group" && (
            <button
              onClick={async () => {
                const canvas = fabricRef.current;
                if (!canvas) return;
                const group = canvas.getActiveObject();
                if (group?.type !== "group") return;
                const fabric = await import("fabric");
                const groupJSON = group.toObject(CUSTOM_PROPS);
                const groupLeft = group.left || 0;
                const groupTop = group.top || 0;
                const groupAngle = group.angle || 0;
                const groupScaleX = group.scaleX || 1;
                const groupScaleY = group.scaleY || 1;
                canvas.remove(group);
                const childJSONs = groupJSON.objects || [];
                const newObjects: any[] = [];
                for (const childJSON of childJSONs) {
                  const [obj] = await fabric.util.enlivenObjects([childJSON]);
                  if (!obj) continue;
                  const relX = (obj as any).left || 0;
                  const relY = (obj as any).top || 0;
                  const rad = (groupAngle * Math.PI) / 180;
                  const scaledX = relX * groupScaleX;
                  const scaledY = relY * groupScaleY;
                  const absX = groupLeft + scaledX * Math.cos(rad) - scaledY * Math.sin(rad);
                  const absY = groupTop + scaledX * Math.sin(rad) + scaledY * Math.cos(rad);
                  (obj as any).set({
                    left: absX,
                    top: absY,
                    angle: ((obj as any).angle || 0) + groupAngle,
                    scaleX: ((obj as any).scaleX || 1) * groupScaleX,
                    scaleY: ((obj as any).scaleY || 1) * groupScaleY,
                    selectable: true,
                    evented: true,
                  });
                  (obj as any).setCoords();
                  canvas.add(obj);
                  newObjects.push(obj);
                }
                if (newObjects.length > 0) {
                  const sel = new fabric.ActiveSelection(newObjects, { canvas });
                  canvas.setActiveObject(sel);
                  setSelectedObj(sel);
                }
                canvas.requestRenderAll();
              }}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              Dégrouper
            </button>
          )}

          {/* ── Edit group contents (double-click alternative) ── */}
          {selectedObj?.type === "group" && !selectedObj._isShootZone && (
            <button
              onClick={() => enterGroupEditing?.(selectedObj)}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Modifier le groupe
            </button>
          )}

        </div>
          {/* ── Stroke color/gradient panel (shared by shapes + shoots) ── */}
          <StrokePanel updateObj={updateObj} />
          {/* ── Common tools: Flip + Opacity (fixed right) ── */}
          <CommonTools
            updateObj={updateObj}
            isMultiSelect={isMultiSelect}
            isShootSelected={!!isShootSelected}
          />
        </div>
      )}

      {/* ── Individual corners panel (fixed, outside all toolbar conditions) ── */}
      {showCornerPanel && selectedObj && (
        <>
          <div className="fixed inset-0 z-[9998]" onMouseDown={() => {
            setShowCornerPanel(false);
            if (selectedObj._individualCorners) {
              const tl = selectedObj._radiusTL ?? 0; const tr = selectedObj._radiusTR ?? 0;
              const br = selectedObj._radiusBR ?? 0; const bl = selectedObj._radiusBL ?? 0;
              if (tl === tr && tr === br && br === bl) {
                selectedObj._individualCorners = false;
                selectedObj.set({ clipPath: undefined, rx: tl, ry: tl });
                if (selectedObj._isShootZone) selectedObj._shootBorderRadius = tl;
                fabricRef.current?.requestRenderAll();
                fabricRef.current?.fire("object:modified", { target: selectedObj, _historyLabel: "Coins réinitialisés" });
                forceRender((n: number) => n + 1);
              }
            }
          }} />
          <div
            className="fixed bg-white rounded-xl shadow-xl border border-gray-200 p-3 z-[9999] w-[190px]"
            style={{ top: cornerPanelPos.top, left: cornerPanelPos.left }}
            // Stop BOTH onClick and onMouseDown from propagating: the
            // backdrop above uses onMouseDown (fires before click) and
            // without stopping mousedown here every slider/input press
            // would close the panel before the value committed.
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Coins individuels</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                ["_radiusTL", "\u250C", "Haut-gauche"],
                ["_radiusTR", "\u2510", "Haut-droite"],
                ["_radiusBL", "\u2514", "Bas-gauche"],
                ["_radiusBR", "\u2518", "Bas-droite"],
              ] as const).map(([prop, icon, label]) => (
                <div key={prop} className="flex items-center gap-1.5">
                  <span className="text-gray-400 text-sm font-mono leading-none">{icon}</span>
                  <input
                    type="number"
                    min={0}
                    max={Math.round(Math.min(selectedObj.width || 100, selectedObj.height || 100) / 2)}
                    value={(selectedObj as any)[prop] ?? 0}
                    onChange={(e) => {
                      const v = Math.max(0, parseInt(e.target.value) || 0);
                      (selectedObj as any)[prop] = v;
                      const tl = selectedObj._radiusTL ?? 0;
                      const tr = selectedObj._radiusTR ?? 0;
                      const br = selectedObj._radiusBR ?? 0;
                      const bl = selectedObj._radiusBL ?? 0;
                      const w = selectedObj.width || 100;
                      const h = selectedObj.height || 100;
                      import("fabric").then((fabric) => {
                        const path = `M ${tl} 0 L ${w - tr} 0 Q ${w} 0 ${w} ${tr} L ${w} ${h - br} Q ${w} ${h} ${w - br} ${h} L ${bl} ${h} Q 0 ${h} 0 ${h - bl} L 0 ${tl} Q 0 0 ${tl} 0 Z`;
                        selectedObj.set({
                          rx: 0, ry: 0,
                          clipPath: new fabric.Path(path, {
                            left: -w / 2, top: -h / 2,
                            originX: "left", originY: "top",
                            absolutePositioned: false,
                          }),
                        });
                        selectedObj.dirty = true;
                        fabricRef.current?.requestRenderAll();
                        fabricRef.current?.fire("object:modified", { target: selectedObj, _historyLabel: "Coins individuels", _continuous: true });
                        forceRender((n: number) => n + 1);
                      });
                    }}
                    title={label}
                    className="w-full h-6 text-center bg-gray-50 border border-gray-200 rounded text-[11px] font-medium"
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
/* ═══════════════════════════════════════════════════════════════
   Curved text toolbar — debounced slider
   ═══════════════════════════════════════════════════════════════ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CurvedTextToolbar({ selectedObj, fabricRef, setSelectedObj, forceRender }: { selectedObj: any; fabricRef: any; setSelectedObj: (v: any) => void; forceRender: (fn: (n: number) => number) => void }) {
  const [localAngle, setLocalAngle] = useState(selectedObj._curveAngle ?? 180);
  const [localText, setLocalText] = useState(selectedObj._curveText || "Texte");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fabricCacheRef = useRef<any>(null);

  // Pin the curved-text target at callback creation time so the
  // debounced rebuild fires against the object the user was editing,
  // not whatever is selected 120ms later. If the user deselects or
  // switches to another object mid-debounce, we simply bail out.
  const targetRef = useRef<any>(selectedObj);
  useEffect(() => { targetRef.current = selectedObj; }, [selectedObj]);

  const rebuild = useCallback(async (opts: { angle?: number; text?: string; fill?: string }) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    // Use the pinned target instead of whatever is active now. Bail if
    // the target was detached from the canvas (undo/redo, deletion)
    // or the user moved to a different selection.
    const obj = targetRef.current;
    if (!obj || !obj._isCurvedText || canvas.getActiveObject() !== obj) return;
    if (!fabricCacheRef.current) fabricCacheRef.current = await import("fabric");
    const fabric = fabricCacheRef.current;
    const prevLeft = obj.left, prevTop = obj.top, prevScaleX = obj.scaleX, prevScaleY = obj.scaleY, prevRotation = obj.angle;
    const text: string = opts.text ?? obj._curveText ?? "Texte";
    const newAngle = opts.angle ?? obj._curveAngle ?? 180;
    const fontSize: number = obj._curveFontSize || 36;
    const fontFamily: string = obj._curveFontFamily || "Montserrat";
    const fill: string = opts.fill ?? obj._curveFill ?? "#1a1a2e";
    const fontWeight = "bold";
    const totalArcDeg = Math.abs(newAngle) || 1;
    const totalArcRad = (totalArcDeg * Math.PI) / 180;
    const approxCharWidth = fontSize * 0.6;
    const chars = text.split("");
    // Measure character widths via a shared hidden canvas 2D context.
    // Previously we allocated one fabric.FabricText per char and called
    // `tmp.dispose?.()` which doesn't exist on FabricText in v6/v7 — each
    // temporary object leaked its internal cache canvas. On a 30-char
    // string rebuilt every 120ms during editing, this produced hundreds
    // of leaked objects per minute.
    const measureCtx = (() => {
      const c = document.createElement("canvas");
      c.width = 1; c.height = 1;
      const ctx = c.getContext("2d");
      if (ctx) ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
      return ctx;
    })();
    const charWidths = chars.map((ch: string) => {
      if (!measureCtx) return approxCharWidth;
      return measureCtx.measureText(ch).width || approxCharWidth;
    });
    const totalMeasuredWidth = charWidths.reduce((s: number, w: number) => s + w, 0);
    const radius = Math.max(totalMeasuredWidth / totalArcRad, fontSize * 2);
    const sign = newAngle >= 0 ? 1 : -1;
    const arcPerUnit = totalArcRad / totalMeasuredWidth;
    let currentArc = -totalArcRad / 2;
    const letters: any[] = [];
    for (let i = 0; i < chars.length; i++) {
      const halfW = charWidths[i] / 2;
      const charAngle = currentArc + halfW * arcPerUnit;
      const x = radius * Math.cos(sign * charAngle - Math.PI / 2);
      const y = radius * Math.sin(sign * charAngle - Math.PI / 2);
      letters.push(new fabric.FabricText(chars[i], {
        fontSize, fontFamily, fontWeight, fill,
        left: x, top: y, originX: "center", originY: "center",
        angle: (sign * charAngle * 180) / Math.PI,
        selectable: false, evented: false,
      }));
      currentArc += charWidths[i] * arcPerUnit;
    }
    canvas.remove(obj);
    const group = new fabric.Group(letters, { left: prevLeft, top: prevTop, originX: "center", originY: "center", scaleX: prevScaleX, scaleY: prevScaleY, angle: prevRotation });
    (group as any)._isCurvedText = true;
    (group as any)._curveAngle = newAngle;
    (group as any)._curveText = text;
    (group as any)._curveFontSize = fontSize;
    (group as any)._curveFontFamily = fontFamily;
    (group as any)._curveFill = fill;
    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.requestRenderAll();
    canvas.fire("object:modified", { target: group, _historyLabel: "Texte incurvé modifié", _continuous: true });
    setSelectedObj(group);
    forceRender((n: number) => n + 1);
  }, [fabricRef, setSelectedObj, forceRender]);

  const debouncedRebuild = useCallback((opts: { angle?: number; text?: string; fill?: string }) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => rebuild(opts), 120);
  }, [rebuild]);

  return (
    <div className="flex items-center gap-2 px-4 h-11 bg-white border-b border-gray-100 flex-shrink-0">
      {/* Text input */}
      <input
        type="text" value={localText}
        onChange={(e) => { setLocalText(e.target.value); debouncedRebuild({ text: e.target.value, angle: localAngle }); }}
        className="w-28 h-7 px-2 rounded border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-[#4f46e5] transition-colors"
        placeholder="Texte..."
      />
      {/* Color */}
      <label className="relative w-7 h-7 rounded border border-gray-200 overflow-hidden cursor-pointer flex-shrink-0" title="Couleur">
        <input type="color" value={selectedObj._curveFill || "#1a1a2e"} onChange={(e) => { debouncedRebuild({ fill: e.target.value, angle: localAngle, text: localText }); }} className="absolute inset-0 opacity-0 cursor-pointer" />
        <div className="w-full h-full" style={{ backgroundColor: selectedObj._curveFill || "#1a1a2e" }} />
      </label>
      <div className="w-px h-5 bg-gray-200" />
      {/* Curve angle */}
      <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 16c0-4.418 3.582-8 8-8s8 3.582 8 8" strokeLinecap="round" /></svg>
      <input
        type="range" min={-360} max={360} value={localAngle}
        onChange={(e) => { const v = parseInt(e.target.value); setLocalAngle(v); debouncedRebuild({ angle: v, text: localText }); }}
        className="w-20 accent-[#4f46e5] cursor-pointer"
      />
      <span className="text-[10px] font-mono text-gray-500 w-8 text-right">{localAngle}°</span>
    </div>
  );
}

export { ContextualToolbarComponent as ContextualToolbar };
