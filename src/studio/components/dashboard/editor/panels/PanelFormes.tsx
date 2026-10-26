"use client";
import React from "react";

import { useState, useMemo } from "react";

type CustomKind = "polygon" | "star" | "rounded-rect";

const PRESET_COLORS = [
  "#7c3aed", "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#ec4899", "#0891b2", "#1a1a2e", "#64748b", "#ffffff",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function PanelFormes({ onAddShape }: { onAddShape: (type: string, options?: any) => void }) {
  const [showAllShapes, setShowAllShapes] = useState(false);

  // ── Custom shape state ──
  const [customKind, setCustomKind] = useState<CustomKind>("polygon");
  const [polygonSides, setPolygonSides] = useState(5);
  const [polygonRotation, setPolygonRotation] = useState(0);
  const [starPoints, setStarPoints] = useState(5);
  const [starInnerRatio, setStarInnerRatio] = useState(0.45);
  const [starRotation, setStarRotation] = useState(0);
  const [rrWidthRatio, setRrWidthRatio] = useState(1.5);
  const [rrRadius, setRrRadius] = useState(0.2);
  const [customColor, setCustomColor] = useState("#7c3aed");

  const shapes = [
    // Rectangles
    { type: "rect", label: "Rectangle", color: "#fe0154", svg: '<rect x="4" y="6" width="16" height="12" rx="0" fill="currentColor"/>' },
    { type: "rounded-rect", label: "Arrondi", color: "#fe0154", svg: '<rect x="4" y="6" width="16" height="12" rx="4" fill="currentColor"/>' },
    // Circles
    { type: "circle", label: "Cercle", color: "#3b82f6", svg: '<circle cx="12" cy="12" r="9" fill="currentColor"/>' },
    { type: "ellipse", label: "Ovale", color: "#3b82f6", svg: '<ellipse cx="12" cy="12" rx="10" ry="6" fill="currentColor"/>' },
    // Triangles
    { type: "triangle", label: "Triangle", color: "#f59e0b", svg: '<path d="M12 3L22 21H2L12 3z" fill="currentColor"/>' },
    { type: "triangle-right", label: "Triangle D.", color: "#f59e0b", svg: '<path d="M3 3L21 12L3 21V3z" fill="currentColor"/>' },
    // Diamonds & polygons
    { type: "diamond", label: "Losange", color: "#ef4444", svg: '<path d="M12 2L22 12L12 22L2 12L12 2z" fill="currentColor"/>' },
    { type: "hexagon", label: "Hexagone", color: "#ec4899", svg: '<path d="M12 2L21 7V17L12 22L3 17V7L12 2z" fill="currentColor"/>' },
    // Crosses
    { type: "cross", label: "Croix +", color: "#8b5cf6", svg: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3z" fill="currentColor"/>' },
    { type: "cross-thin", label: "Croix fine", color: "#8b5cf6", svg: '<path d="M10.5 2h3v8.5H22v3h-8.5V22h-3v-8.5H2v-3h8.5V2z" fill="currentColor"/>' },
    // Arrows
    { type: "arrow", label: "Flèche →", color: "#0891b2", svg: '<path d="M4 12h12l-4-4h3l5 4-5 4h-3l4-4H4z" fill="currentColor"/>' },
    { type: "arrow-fat", label: "Flèche large", color: "#0891b2", svg: '<path d="M2 9h12V4l8 8-8 8v-5H2V9z" fill="currentColor"/>' },
    // Stars
    { type: "star", label: "Étoile 5", color: "#f59e0b", svg: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.27 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z" fill="currentColor"/>' },
    { type: "star4", label: "Étoile 4", color: "#f59e0b", svg: '<path d="M12 2L14.5 9.5 22 12 14.5 14.5 12 22 9.5 14.5 2 12 9.5 9.5z" fill="currentColor"/>' },
    // Lines
    { type: "line", label: "Ligne", color: "#64748b", svg: '<line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="3"/>' },
    { type: "line-diagonal", label: "Diagonale", color: "#64748b", svg: '<line x1="3" y1="21" x2="21" y2="3" stroke="currentColor" stroke-width="2.5"/>' },
  ];

  // ── Live custom-shape preview (SVG path) ──
  const previewPath = useMemo(() => {
    const cx = 50, cy = 50;
    if (customKind === "polygon") {
      const r = 40;
      const rot = (polygonRotation * Math.PI) / 180;
      const pts = Array.from({ length: polygonSides }, (_, i) => {
        const a = (2 * Math.PI / polygonSides) * i - Math.PI / 2 + rot;
        return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
      });
      return { kind: "polygon", points: pts.join(" ") };
    }
    if (customKind === "star") {
      const outer = 42;
      const inner = outer * starInnerRatio;
      const rot = (starRotation * Math.PI) / 180;
      const pts = Array.from({ length: starPoints * 2 }, (_, i) => {
        const r2 = i % 2 === 0 ? outer : inner;
        const a = (Math.PI / starPoints) * i - Math.PI / 2 + rot;
        return `${(cx + r2 * Math.cos(a)).toFixed(2)},${(cy + r2 * Math.sin(a)).toFixed(2)}`;
      });
      return { kind: "polygon", points: pts.join(" ") };
    }
    // rounded-rect
    const baseH = 60;
    const baseW = baseH * rrWidthRatio;
    const w = Math.min(90, baseW);
    const h = w / rrWidthRatio;
    const radius = Math.min(w, h) * rrRadius;
    const x = cx - w / 2;
    const y = cy - h / 2;
    return { kind: "rect", x, y, w, h, r: radius };
  }, [customKind, polygonSides, polygonRotation, starPoints, starInnerRatio, starRotation, rrWidthRatio, rrRadius]);

  const addCustom = () => {
    if (customKind === "polygon") {
      onAddShape("polygon", { sides: polygonSides, rotation: polygonRotation, fill: customColor });
    } else if (customKind === "star") {
      onAddShape("star", { points: starPoints, innerRatio: starInnerRatio, rotation: starRotation, fill: customColor });
    } else {
      onAddShape("rounded-rect", { widthRatio: rrWidthRatio, radiusRatio: rrRadius, fill: customColor });
    }
  };

  return (
    <div className="space-y-3">
      {/* Formes de base */}
      <p className="text-[11px] text-gray-600 font-bold uppercase tracking-wider mb-1">Formes de base</p>
      <div className="grid grid-cols-4 gap-1.5">
        {(showAllShapes ? shapes : shapes.slice(0, 8)).map((shape) => (
          <button
            key={shape.type}
            onClick={() => onAddShape(shape.type)}
            aria-label={`Ajouter ${shape.label}`}
            className="flex flex-col items-center gap-1 p-2 rounded-lg bg-white border border-gray-100 hover:shadow-md hover:border-[#4f46e5] transition-all group"
          >
            <svg className="w-7 h-7 transition-transform group-hover:scale-110" viewBox="0 0 24 24" style={{ color: shape.color }} dangerouslySetInnerHTML={{ __html: shape.svg }} />
            <span className="text-[8px] font-medium text-gray-400 group-hover:text-gray-700 transition-colors leading-tight text-center">{shape.label}</span>
          </button>
        ))}
      </div>
      {shapes.length > 8 && (
        <button onClick={() => setShowAllShapes(!showAllShapes)} className="text-[10px] text-[#4f46e5] hover:underline mt-0.5">
          {showAllShapes ? "Voir moins" : `+ ${shapes.length - 8} formes`}
        </button>
      )}

      {/* ════════ Forme sur mesure ════════ */}
      <div className={`border-t border-gray-100 pt-3 space-y-3 ${showAllShapes ? "" : "hidden"}`}>
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-gray-600 font-bold uppercase tracking-wider">Forme sur mesure</p>
          <span className="text-[9px] text-gray-400">aperçu en direct</span>
        </div>

        {/* Type selector */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {([
            { k: "polygon" as CustomKind, label: "Polygone" },
            { k: "star" as CustomKind, label: "Étoile" },
            { k: "rounded-rect" as CustomKind, label: "Arrondi" },
          ]).map(({ k, label }) => (
            <button
              key={k}
              onClick={() => setCustomKind(k)}
              className={`flex-1 px-2 py-1.5 rounded-md text-[10px] font-semibold transition-colors ${
                customKind === k ? "bg-white text-[#4f46e5] shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Preview + params */}
        <div className="flex gap-3">
          {/* Live preview */}
          <div className="w-24 h-24 shrink-0 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-100 flex items-center justify-center">
            <svg viewBox="0 0 100 100" className="w-20 h-20">
              {previewPath.kind === "polygon" && (
                <polygon points={previewPath.points} fill={customColor} />
              )}
              {previewPath.kind === "rect" && (
                <rect x={previewPath.x} y={previewPath.y} width={previewPath.w} height={previewPath.h} rx={previewPath.r} ry={previewPath.r} fill={customColor} />
              )}
            </svg>
          </div>

          {/* Params */}
          <div className="flex-1 space-y-2 min-w-0">
            {customKind === "polygon" && (
              <>
                <RangeRow label="Côtés" value={polygonSides} min={3} max={20} step={1} onChange={setPolygonSides} suffix="" accent="#7c3aed" />
                <RangeRow label="Rotation" value={polygonRotation} min={-180} max={180} step={1} onChange={setPolygonRotation} suffix="°" accent="#7c3aed" />
              </>
            )}
            {customKind === "star" && (
              <>
                <RangeRow label="Branches" value={starPoints} min={3} max={20} step={1} onChange={setStarPoints} suffix="" accent="#f59e0b" />
                <RangeRow label="Profondeur" value={Math.round(starInnerRatio * 100)} min={10} max={90} step={1} onChange={(v) => setStarInnerRatio(v / 100)} suffix="%" accent="#f59e0b" />
                <RangeRow label="Rotation" value={starRotation} min={-180} max={180} step={1} onChange={setStarRotation} suffix="°" accent="#f59e0b" />
              </>
            )}
            {customKind === "rounded-rect" && (
              <>
                <RangeRow label="Ratio L/H" value={Math.round(rrWidthRatio * 100)} min={50} max={250} step={5} onChange={(v) => setRrWidthRatio(v / 100)} suffix="%" accent="#4f46e5" />
                <RangeRow label="Coins" value={Math.round(rrRadius * 100)} min={0} max={50} step={1} onChange={(v) => setRrRadius(v / 100)} suffix="%" accent="#4f46e5" />
              </>
            )}
          </div>
        </div>

        {/* Color picker */}
        <div>
          <p className="text-[10px] text-gray-500 font-medium mb-1.5">Couleur</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setCustomColor(c)}
                aria-label={`Couleur ${c}`}
                className={`w-6 h-6 rounded-full border-2 transition-all ${
                  customColor === c ? "border-[#4f46e5] scale-110 shadow-sm" : "border-gray-200 hover:border-gray-400"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
            <label className="relative w-6 h-6 rounded-full border-2 border-gray-200 hover:border-gray-400 overflow-hidden cursor-pointer" title="Couleur personnalisée">
              <input
                type="color"
                value={customColor}
                onChange={(e) => setCustomColor(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="w-full h-full" style={{ background: "conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red)" }} />
            </label>
          </div>
        </div>

        {/* Add button */}
        <button
          onClick={addCustom}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-[#4f46e5] text-white text-xs font-semibold rounded-lg hover:bg-[#4338ca] transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
          Ajouter au canvas
        </button>
      </div>

      {/* Drawing tools — stacked, equal size */}
      <div className="border-t border-gray-100 pt-3 space-y-1.5">
        <p className="text-[11px] text-gray-600 font-bold uppercase tracking-wider mb-2">Dessin</p>

        <button onClick={() => onAddShape("pen")}
          className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-white border border-gray-100 hover:shadow-md hover:border-[#4f46e5] transition-all group">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#4f46e5] to-[#a5b4fc] flex items-center justify-center shadow-sm flex-shrink-0">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none">
              <path d="M4 20 C4 20 8 4 12 12 S20 4 20 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              <circle cx="4" cy="20" r="2" fill="currentColor"/>
              <circle cx="20" cy="4" r="2" fill="currentColor"/>
            </svg>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] font-semibold text-gray-600 group-hover:text-gray-800 transition-colors">Formes arrondies</span>
            <span className="text-[9px] text-gray-400 leading-snug">Tracé avec courbes ajustables</span>
          </div>
        </button>

        <button onClick={() => onAddShape("pen-straight")}
          className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-white border border-gray-100 hover:shadow-md hover:border-[#4f46e5] transition-all group">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center shadow-sm flex-shrink-0">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none">
              <path d="M4 20 L10 6 L16 14 L20 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <rect x="3" y="19" width="3" height="3" rx="0.5" fill="currentColor"/>
              <rect x="8.5" y="4.5" width="3" height="3" rx="0.5" fill="currentColor"/>
              <rect x="14.5" y="12.5" width="3" height="3" rx="0.5" fill="currentColor"/>
              <rect x="18.5" y="2.5" width="3" height="3" rx="0.5" fill="currentColor"/>
            </svg>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] font-semibold text-gray-600 group-hover:text-gray-800 transition-colors">Polygone</span>
            <span className="text-[9px] text-gray-400 leading-snug">Tracé en lignes droites</span>
          </div>
        </button>

        <button onClick={() => onAddShape("freedraw")}
          className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-white border border-gray-100 hover:shadow-md hover:border-[#ec4899] transition-all group">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#ec4899] to-[#f472b6] flex items-center justify-center shadow-sm flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 17c2-4 5-12 9-6s5 2 9-6" /></svg>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] font-semibold text-gray-600 group-hover:text-gray-800 transition-colors">Main levée</span>
            <span className="text-[9px] text-gray-400 leading-snug">Dessin libre au doigt ou à la souris</span>
          </div>
        </button>
      </div>
    </div>
  );
}

function RangeRow({
  label, value, min, max, step, onChange, suffix, accent,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  suffix: string;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-medium text-gray-500 w-14 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1.5 min-w-0"
        style={{ accentColor: accent }}
      />
      <span className="text-[10px] font-mono font-semibold text-gray-700 w-10 text-right tabular-nums shrink-0">{value}{suffix}</span>
    </div>
  );
}

export default React.memo(PanelFormes);
