"use client";

import React from "react";
import { useEditorStore } from "../store/editorStore";
import { colorToHex, colorToAlpha } from "../canvas/canvasUtils";

function CommonToolsComponent({ updateObj, isMultiSelect, isShootSelected }: {
  updateObj: (props: Record<string, any>) => void;
  isMultiSelect: boolean;
  isShootSelected: boolean;
}) {
  const selectedObj = useEditorStore(s => s.selectedObj);
  const showShadowPanel = useEditorStore(s => s.showShadowPanel);
  const setShowShadowPanel = useEditorStore(s => s.setShowShadowPanel);
  const shadowPanelPos = useEditorStore(s => s.shadowPanelPos);
  const fabricRef = useEditorStore(s => s.fabricRef);
  const forceRender = useEditorStore(s => s.forceRender);
  const _forceRenderCount = useEditorStore(s => s._forceRenderCount);

  if (!selectedObj || isMultiSelect || isShootSelected) return null;

  const BLEND_MODES: [string, string][] = [
    ["normal", "Normal"],
    ["multiply", "Multiplier"],
    ["screen", "Écran"],
    ["overlay", "Superposer"],
    ["darken", "Assombrir"],
    ["lighten", "Éclaircir"],
    ["color-dodge", "Esquiver"],
    ["color-burn", "Brûler"],
    ["hard-light", "Lumière dure"],
    ["soft-light", "Lumière douce"],
    ["difference", "Différence"],
    ["exclusion", "Exclusion"],
    ["hue", "Teinte"],
    ["saturation", "Saturation"],
    ["color", "Couleur"],
    ["luminosity", "Luminosité"],
  ];

  return (
    <div className="flex items-center gap-1 px-3 flex-shrink-0 border-l border-gray-100">
      {/* Blend mode selector — disabled for now, may re-enable later
      <select
        value={selectedObj.globalCompositeOperation || "normal"}
        onChange={(e) => updateObj({ globalCompositeOperation: e.target.value })}
        title="Mode de fusion"
        className="h-7 text-[10px] bg-white border border-gray-200 rounded-md px-1 text-gray-600 cursor-pointer hover:border-gray-400 focus:outline-none focus:border-[#4f46e5]"
        style={{ maxWidth: 100 }}
      >
        {BLEND_MODES.map(([val, label]) => (
          <option key={val} value={val}>{label}</option>
        ))}
      </select>
      <div className="w-px h-6 bg-gray-200 mx-0.5" />
      */}
      <button onClick={() => updateObj({ flipX: !selectedObj.flipX })} className="w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 flex items-center justify-center transition-colors" title="Retourner H">
        <svg className="w-4 h-4 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
      </button>
      <button onClick={() => updateObj({ flipY: !selectedObj.flipY })} className="w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 flex items-center justify-center transition-colors" title="Retourner V">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
      </button>
      <div className="w-px h-6 bg-gray-200 mx-0.5" />
      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="4" cy="4" r="1.5" opacity="0.3" /><circle cx="8" cy="4" r="1.5" opacity="0.5" /><circle cx="12" cy="4" r="1.5" opacity="0.7" />
        <circle cx="4" cy="8" r="1.5" opacity="0.5" /><circle cx="8" cy="8" r="1.5" opacity="0.7" /><circle cx="12" cy="8" r="1.5" opacity="0.9" />
        <circle cx="4" cy="12" r="1.5" opacity="0.7" /><circle cx="8" cy="12" r="1.5" opacity="0.9" /><circle cx="12" cy="12" r="1.5" />
      </svg>
      <input type="range" min={0} max={100} step={5} value={Math.round((selectedObj.opacity ?? 1) * 100)} onChange={(e: any) => updateObj({ opacity: parseInt(e.target.value) / 100 })} className="w-20 accent-[#4f46e5] cursor-pointer" title="Transparence" />
      <span className="text-[10px] text-gray-500 w-7 tabular-nums">{Math.round((selectedObj.opacity ?? 1) * 100)}%</span>
      {/* Dimensions moved to bottom bar */}
      <div className="w-px h-6 bg-gray-200 mx-0.5" />
      {/* Shadow panel is now triggered from the shape toolbar Ombre button — no separate icon here */}
      {showShadowPanel && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setShowShadowPanel(false)} />
          <div className="fixed bg-white rounded-xl shadow-xl border border-gray-200 p-3 z-[9999] w-[250px] space-y-2.5 overflow-y-auto" style={{ top: shadowPanelPos.top, left: shadowPanelPos.left, maxHeight: `calc(100vh - ${shadowPanelPos.top}px - 16px)` }} onClick={(e: any) => e.stopPropagation()} onMouseDown={(e: any) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h4 className="text-gray-700 text-xs font-semibold">Ombre portée</h4>
              <button
                onClick={async () => {
                  if (selectedObj.shadow) {
                    selectedObj.set({ shadow: null });
                  } else {
                    const fabric = await import("fabric");
                    selectedObj.set({ shadow: new fabric.Shadow({ color: "rgba(0,0,0,0.3)", blur: 10, offsetX: 5, offsetY: 5 }) });
                  }
                  fabricRef.current?.requestRenderAll();
                  fabricRef.current?.fire("object:modified", { target: selectedObj, _historyLabel: "Ombre — " + (selectedObj.shadow ? "activée" : "désactivée") });
                  forceRender((n: number) => n + 1);
                }}
                className={`relative w-9 h-5 rounded-full transition-colors ${selectedObj.shadow ? "bg-[#4f46e5]" : "bg-gray-300"}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${selectedObj.shadow ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
            </div>
            {selectedObj.shadow && (() => {
              const sh = selectedObj.shadow;
              const updateShadow = (props: Record<string, number | string>) => {
                import("fabric").then((fabric) => {
                  // Re-read the shadow from the object inside the async
                  // callback so that rapid slider drags compose properly
                  // instead of using the stale `sh` from the render closure.
                  const base = selectedObj.shadow || sh;
                  selectedObj.set({ shadow: new fabric.Shadow({
                    color: base.color || "rgba(0,0,0,0.3)",
                    blur: base.blur ?? 10,
                    offsetX: base.offsetX ?? 0,
                    offsetY: base.offsetY ?? 0,
                    ...props,
                  }) });
                  fabricRef.current?.requestRenderAll();
                  fabricRef.current?.fire("object:modified", { target: selectedObj, _historyLabel: "Ombre modifiée", _continuous: true });
                  forceRender((n: number) => n + 1);
                });
              };
              return (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 w-12">Flou</span>
                    <input type="range" min={0} max={50} value={sh.blur ?? 10} onChange={(e: any) => updateShadow({ blur: parseInt(e.target.value) })} className="flex-1 accent-[#4f46e5] cursor-pointer" />
                    <span className="text-[10px] text-gray-500 w-6 tabular-nums">{sh.blur ?? 0}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 w-12">Décal. X</span>
                    <input type="range" min={-30} max={30} value={sh.offsetX ?? 0} onChange={(e: any) => updateShadow({ offsetX: parseInt(e.target.value) })} className="flex-1 accent-[#4f46e5] cursor-pointer" />
                    <span className="text-[10px] text-gray-500 w-6 tabular-nums">{sh.offsetX ?? 0}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 w-12">Décal. Y</span>
                    <input type="range" min={-30} max={30} value={sh.offsetY ?? 0} onChange={(e: any) => updateShadow({ offsetY: parseInt(e.target.value) })} className="flex-1 accent-[#4f46e5] cursor-pointer" />
                    <span className="text-[10px] text-gray-500 w-6 tabular-nums">{sh.offsetY ?? 0}</span>
                  </div>
                  {/* Shadow color */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 w-12">Couleur</span>
                    <label className="relative w-7 h-7 rounded-lg border border-gray-200 overflow-hidden cursor-pointer flex-shrink-0">
                      <input
                        type="color"
                        // Convert any shadow colour (rgba/rgb/named/hex) to
                        // hex so the native picker shows the correct colour.
                        value={colorToHex(sh.color)}
                        onChange={(e: any) => {
                          const hex = e.target.value;
                          const r = parseInt(hex.slice(1, 3), 16);
                          const g = parseInt(hex.slice(3, 5), 16);
                          const b = parseInt(hex.slice(5, 7), 16);
                          // Preserve the existing alpha instead of
                          // hard-coding 0.3 every time the colour changes.
                          const a = colorToAlpha(sh.color) || 0.3;
                          updateShadow({ color: `rgba(${r},${g},${b},${a})` });
                        }}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      <div className="w-full h-full" style={{ backgroundColor: sh.color || "#000000" }} />
                    </label>
                    <div className="flex gap-1">
                      {["rgba(0,0,0,0.3)", "rgba(0,0,0,0.6)", "rgba(124,58,237,0.3)", "rgba(254,1,84,0.3)"].map((c) => (
                        <button key={c} onClick={() => updateShadow({ color: c })} className="w-5 h-5 rounded-full border border-gray-200 hover:scale-110 transition-transform" style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </div>
                  </div>
                );
              })()}
            </div>
          </>
        )}
    </div>
  );
}
export { CommonToolsComponent as CommonTools };
