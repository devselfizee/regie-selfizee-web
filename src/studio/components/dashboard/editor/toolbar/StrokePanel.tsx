"use client";

import { GRADIENT_PRESETS } from "../index";
import { useEditorStore } from "../store/editorStore";

export function StrokePanel({ updateObj }: { updateObj: (props: Record<string, any>) => void }) {
  const showShootStrokePanel = useEditorStore(s => s.showShootStrokePanel);
  const setShowShootStrokePanel = useEditorStore(s => s.setShowShootStrokePanel);
  const selectedObj = useEditorStore(s => s.selectedObj);
  const fabricRef = useEditorStore(s => s.fabricRef);
  const forceRender = useEditorStore(s => s.forceRender);
  const _forceRenderCount = useEditorStore(s => s._forceRenderCount);
  const showCustomGrad = useEditorStore(s => s.showCustomGrad);
  const setShowCustomGrad = useEditorStore(s => s.setShowCustomGrad);
  const shootGradType = useEditorStore(s => s.shootGradType);
  const setShootGradType = useEditorStore(s => s.setShootGradType);
  const shootGradColor1 = useEditorStore(s => s.shootGradColor1);
  const setShootGradColor1 = useEditorStore(s => s.setShootGradColor1);
  const shootGradColor2 = useEditorStore(s => s.shootGradColor2);
  const setShootGradColor2 = useEditorStore(s => s.setShootGradColor2);
  const shootGradAngle = useEditorStore(s => s.shootGradAngle);
  const setShootGradAngle = useEditorStore(s => s.setShootGradAngle);
  const shootStrokePanelPos = useEditorStore(s => s.shootStrokePanelPos);

  if (!showShootStrokePanel || !selectedObj) return null;

  return (
    <div>
      <div className="fixed inset-0 z-[9998]" onMouseDown={() => setShowShootStrokePanel(false)} />
      <div className="fixed bg-white rounded-xl shadow-xl border border-gray-200 p-3 z-[9999] w-[280px] space-y-3 overflow-y-auto" style={{ top: shootStrokePanelPos.top, left: Math.min(shootStrokePanelPos.left, window.innerWidth - 300), maxHeight: `calc(100vh - ${shootStrokePanelPos.top}px - 16px)` }} onClick={(e: any) => e.stopPropagation()} onMouseDown={(e: any) => e.stopPropagation()}>
        <h4 className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-1.5">Couleur unie</h4>
        <div className="flex items-center gap-2">
          <label className="relative w-8 h-8 rounded-lg border border-gray-200 overflow-hidden cursor-pointer flex-shrink-0">
            <input type="color" value={typeof selectedObj.stroke === "string" ? selectedObj.stroke : "#000"} onChange={(e: any) => { updateObj({ stroke: e.target.value, strokeWidth: Math.max(2, selectedObj.strokeWidth || 2), strokeUniform: true, paintFirst: "stroke" }); }} className="absolute inset-0 opacity-0 cursor-pointer" />
            <div className="w-full h-full" style={{ backgroundColor: typeof selectedObj.stroke === "string" ? selectedObj.stroke : "#000" }} />
          </label>
          <div className="flex flex-wrap gap-1">
            {["#fe0154", "#000000", "#ffffff", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"].map((c) => (
              <button key={c} onClick={() => updateObj({ stroke: c, strokeWidth: Math.max(2, selectedObj.strokeWidth || 2), strokeUniform: true, paintFirst: "stroke" })} className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${typeof selectedObj.stroke === "string" && selectedObj.stroke === c ? "border-gray-800 scale-110" : "border-gray-200"}`} style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
        <h4 className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-1.5">Dégradé</h4>
        <div className="grid grid-cols-6 gap-1.5">
          {GRADIENT_PRESETS.slice(0, 18).map((g: any, i: number) => (
            <button key={i} onClick={async () => {
              const fabric = await import("fabric");
              const w = selectedObj.width || 100; const h = selectedObj.height || 100;
              const coords = g.dir === "horizontal" ? { x1:0, y1:0, x2:w, y2:0 } : g.dir === "vertical" ? { x1:0, y1:0, x2:0, y2:h } : { x1:0, y1:0, x2:w, y2:h };
              const grad = new fabric.Gradient({ type: "linear", coords, colorStops: [{ offset: 0, color: g.colors[0] }, { offset: 1, color: g.colors[1] }] });
              selectedObj.set({ stroke: grad, strokeWidth: Math.max(2, selectedObj.strokeWidth || 2), strokeUniform: true, paintFirst: "stroke" });
              fabricRef.current?.requestRenderAll(); fabricRef.current?.fire("object:modified", { target: selectedObj, _historyLabel: "Contour modifié" }); forceRender((n: number) => n + 1);
            }} className="w-full aspect-square rounded-full border-2 border-gray-100 hover:border-gray-400 hover:scale-110 transition-all"
              style={{ background: `linear-gradient(${g.dir === "horizontal" ? "to right" : g.dir === "vertical" ? "to bottom" : "to bottom right"}, ${g.colors[0]}, ${g.colors[1]})` }} />
          ))}
        </div>
        {/* Custom gradient */}
        <div className="border-t border-gray-100 pt-2">
          <button onClick={() => setShowCustomGrad(!showCustomGrad)} className="flex items-center gap-1 text-[10px] text-[#4f46e5] font-medium hover:underline mb-1">
            <svg className={`w-3 h-3 transition-transform ${showCustomGrad ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            Dégradé sur mesure
          </button>
          {showCustomGrad && (
            <div className="space-y-2">
              <div className="w-full h-8 rounded-lg border border-gray-200" style={{
                background: shootGradType === "radial"
                  ? `radial-gradient(circle, ${shootGradColor1}, ${shootGradColor2})`
                  : `linear-gradient(${shootGradAngle + 90}deg, ${shootGradColor1}, ${shootGradColor2})`,
              }} />
              <div className="flex items-center gap-2">
                <label className="relative w-6 h-6 rounded-lg border border-gray-200 overflow-hidden cursor-pointer">
                  <input type="color" value={shootGradColor1} onChange={(e: any) => setShootGradColor1(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
                  <div className="w-full h-full" style={{ backgroundColor: shootGradColor1 }} />
                </label>
                <span className="text-gray-400 text-[10px]">{"\u2192"}</span>
                <label className="relative w-6 h-6 rounded-lg border border-gray-200 overflow-hidden cursor-pointer">
                  <input type="color" value={shootGradColor2} onChange={(e: any) => setShootGradColor2(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
                  <div className="w-full h-full" style={{ backgroundColor: shootGradColor2 }} />
                </label>
                <div className="flex gap-1 ml-auto">
                  <button onClick={() => setShootGradType("linear")} className={`px-2 py-0.5 text-[9px] rounded ${shootGradType === "linear" ? "bg-[#4f46e5] text-white" : "bg-gray-100 text-gray-500"}`}>Linéaire</button>
                  <button onClick={() => setShootGradType("radial")} className={`px-2 py-0.5 text-[9px] rounded ${shootGradType === "radial" ? "bg-[#4f46e5] text-white" : "bg-gray-100 text-gray-500"}`}>Radial</button>
                </div>
              </div>
              {shootGradType === "linear" && (
                <div className="flex items-center gap-1">
                  {[0, 90, 135, 180, 270, 315].map((a) => (
                    <button key={a} onClick={() => setShootGradAngle(a)} className={`w-6 h-6 rounded border text-[9px] ${shootGradAngle === a ? "border-[#4f46e5] bg-purple-50 text-[#4f46e5]" : "border-gray-200 text-gray-400 hover:border-gray-400"}`}>
                      {a === 0 ? "\u2192" : a === 90 ? "\u2193" : a === 135 ? "\u2198" : a === 180 ? "\u2190" : a === 270 ? "\u2191" : "\u2197"}
                    </button>
                  ))}
                  <input type="number" value={shootGradAngle} onChange={(e: any) => setShootGradAngle(parseInt(e.target.value) || 0)} className="w-10 h-6 text-[9px] text-center border border-gray-200 rounded" />
                </div>
              )}
              <button onClick={async () => {
                const fabric = await import("fabric");
                const w = selectedObj.width || 100; const h = selectedObj.height || 100;
                let grad;
                if (shootGradType === "radial") {
                  grad = new fabric.Gradient({ type: "radial", coords: { x1: w/2, y1: h/2, r1: 0, x2: w/2, y2: h/2, r2: Math.max(w,h)/2 }, colorStops: [{ offset: 0, color: shootGradColor1 }, { offset: 1, color: shootGradColor2 }] });
                } else {
                  const rad = ((shootGradAngle - 90) * Math.PI) / 180;
                  const cx = w/2, cy = h/2, len = Math.max(w,h);
                  grad = new fabric.Gradient({ type: "linear", coords: { x1: cx - Math.cos(rad)*len/2, y1: cy - Math.sin(rad)*len/2, x2: cx + Math.cos(rad)*len/2, y2: cy + Math.sin(rad)*len/2 }, colorStops: [{ offset: 0, color: shootGradColor1 }, { offset: 1, color: shootGradColor2 }] });
                }
                selectedObj.set({ stroke: grad, strokeWidth: Math.max(2, selectedObj.strokeWidth || 2), strokeUniform: true, paintFirst: "stroke" });
                fabricRef.current?.requestRenderAll(); fabricRef.current?.fire("object:modified", { target: selectedObj, _historyLabel: "Contour modifié" }); forceRender((n: number) => n + 1);
              }} className="w-full py-1.5 bg-[#4f46e5] text-white text-[10px] font-semibold rounded-lg hover:bg-[#4338ca] transition-colors">
                Appliquer
              </button>
            </div>
          )}
        </div>
        <button onClick={() => { updateObj({ stroke: "transparent", strokeWidth: 0 }); setShowShootStrokePanel(false); }} className="w-full text-[10px] text-red-500 hover:text-red-600 font-medium mt-1">Supprimer le contour</button>
      </div>
    </div>
  );
}
