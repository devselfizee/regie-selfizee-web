"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import React from "react";
import ColorPickerPopover from "../toolbar/ColorPickerPopover";
import { apiUrl } from "@/studio/lib/api";
import { useLoadingClick } from "../hooks/useLoadingClick";
import { ThumbSpinner } from "./ThumbSpinner";

/* ═══════════════════════════════════════════════════════════════
   Gradient presets
   ═══════════════════════════════════════════════════════════════ */

export const GRADIENT_PRESETS: { colors: [string, string]; dir: "horizontal" | "vertical" | "diagonal" }[] = [
  // Pastel (visible first — cheerful defaults)
  { colors: ["#a1c4fd", "#c2e9fb"], dir: "horizontal" },
  { colors: ["#fbc2eb", "#a6c1ee"], dir: "horizontal" },
  { colors: ["#d4fc79", "#96e6a1"], dir: "diagonal" },
  { colors: ["#fddb92", "#d1fdff"], dir: "vertical" },
  { colors: ["#ff9a9e", "#fecfef"], dir: "horizontal" },
  { colors: ["#ffecd2", "#fcb69f"], dir: "vertical" },
  // Blue/Purple
  { colors: ["#667eea", "#764ba2"], dir: "diagonal" },
  { colors: ["#7c3aed", "#a78bfa"], dir: "vertical" },
  { colors: ["#4facfe", "#00f2fe"], dir: "horizontal" },
  { colors: ["#2193b0", "#6dd5ed"], dir: "vertical" },
  { colors: ["#6366f1", "#ec4899"], dir: "diagonal" },
  // Green/Nature
  { colors: ["#00b09b", "#96c93d"], dir: "horizontal" },
  { colors: ["#a8ff78", "#78ffd6"], dir: "diagonal" },
  { colors: ["#11998e", "#38ef7d"], dir: "horizontal" },
  { colors: ["#56ab2f", "#a8e063"], dir: "diagonal" },
  // Warm/Sunset
  { colors: ["#f5af19", "#f12711"], dir: "vertical" },
  { colors: ["#f093fb", "#f5576c"], dir: "diagonal" },
  // Pink/Red
  { colors: ["#fc5c7d", "#6a82fb"], dir: "horizontal" },
  { colors: ["#f857a6", "#ff5858"], dir: "horizontal" },
  { colors: ["#ee0979", "#ff6a00"], dir: "horizontal" },
  { colors: ["#fe0154", "#ff6b9d"], dir: "diagonal" },
  // Bold
  { colors: ["#8e2de2", "#4a00e0"], dir: "diagonal" },
  { colors: ["#ff0844", "#ffb199"], dir: "horizontal" },
  { colors: ["#00c6ff", "#0072ff"], dir: "diagonal" },
  { colors: ["#f7971e", "#ffd200"], dir: "horizontal" },
  // Dark/Neutral (pushed to end)
  { colors: ["#000000", "#434343"], dir: "vertical" },
  { colors: ["#1a1a2e", "#16213e"], dir: "diagonal" },
  { colors: ["#0f0c29", "#302b63"], dir: "diagonal" },
  { colors: ["#232526", "#414345"], dir: "horizontal" },
  { colors: ["#c31432", "#240b36"], dir: "diagonal" },
];

// Helper: normalize CSS color to hex
function normalizeColor(color: string): string | null {
  if (!color || typeof color !== "string" || color === "transparent") return null;
  if (color.startsWith("#")) {
    const hex = color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color.substring(0, 7);
    return hex.toLowerCase();
  }
  if (color.startsWith("rgb")) {
    const m = color.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) return `#${(+m[1]).toString(16).padStart(2, "0")}${(+m[2]).toString(16).padStart(2, "0")}${(+m[3]).toString(16).padStart(2, "0")}`;
  }
  return null;
}
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}
// Sample dominant colors from an image element
function sampleImageColors(el: HTMLImageElement): string[] {
  try {
    const tmp = document.createElement("canvas");
    const size = 64;
    tmp.width = size;
    tmp.height = size;
    const ctx = tmp.getContext("2d");
    if (!ctx) return [];
    ctx.drawImage(el, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    const colorCounts = new Map<string, number>();
    for (let i = 0; i < data.length; i += 16) {
      const r = Math.round(data[i] / 32) * 32;
      const g = Math.round(data[i + 1] / 32) * 32;
      const b = Math.round(data[i + 2] / 32) * 32;
      if (data[i + 3] < 128) continue;
      const key = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
      colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
    }
    return Array.from(colorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([c]) => c);
  } catch {
    return [];
  }
}

/* Gradient popover — opens like ColorPickerPopover */
function GradientPopover({
  gradColor1, gradColor2, setGradColor1, setGradColor2,
  gradType, setGradType, gradAngle, setGradAngle,
  onApply, onClose,
}: {
  gradColor1: string; gradColor2: string;
  setGradColor1: (c: string) => void; setGradColor2: (c: string) => void;
  gradType: "linear" | "radial"; setGradType: (t: "linear" | "radial") => void;
  gradAngle: number; setGradAngle: (a: number) => void;
  onApply: () => void; onClose: () => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    function handleDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleDown);
    return () => document.removeEventListener("mousedown", handleDown);
  }, [onClose]);
  React.useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute z-[9999] mt-1 p-3 bg-white rounded-xl shadow-xl border border-gray-100 space-y-2.5"
      style={{ left: 0, top: "100%", width: 230 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Preview */}
      <div className="w-full h-12 rounded-lg border border-gray-200" style={{
        background: gradType === "radial"
          ? `radial-gradient(circle, ${gradColor1}, ${gradColor2})`
          : `linear-gradient(${gradAngle + 90}deg, ${gradColor1}, ${gradColor2})`,
      }} />
      {/* Color pickers + type toggle */}
      <div className="flex gap-2 items-center">
        <ColorPickerPopover color={gradColor1} onChange={setGradColor1} swatchClassName="w-7 h-7 rounded-lg border border-gray-200 cursor-pointer flex-shrink-0" />
        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
        <ColorPickerPopover color={gradColor2} onChange={setGradColor2} swatchClassName="w-7 h-7 rounded-lg border border-gray-200 cursor-pointer flex-shrink-0" />
        <div className="flex gap-0.5 ml-auto">
          {([["linear", "Lin."], ["radial", "Rad."]] as const).map(([t, label]) => (
            <button key={t} onClick={() => setGradType(t)} className={`px-2 py-1 rounded text-[9px] font-medium ${gradType === t ? "bg-[#4f46e5] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>{label}</button>
          ))}
        </div>
      </div>
      {/* Direction arrows */}
      {gradType === "linear" && (
        <div className="flex items-center gap-1">
          {[{ a: 0, l: "→" }, { a: 90, l: "↓" }, { a: 135, l: "↘" }, { a: 180, l: "←" }, { a: 270, l: "↑" }, { a: 315, l: "↗" }].map((d) => (
            <button key={d.a} onClick={() => setGradAngle(d.a)} className={`w-6 h-6 rounded text-[10px] font-bold ${gradAngle === d.a ? "bg-[#4f46e5] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>{d.l}</button>
          ))}
          <input type="number" min={0} max={360} value={gradAngle} onChange={(e) => setGradAngle(parseInt(e.target.value) || 0)} className="w-10 h-6 rounded border border-gray-200 text-[9px] text-center text-gray-600 focus:outline-none" />
        </div>
      )}
      {/* Apply */}
      <button onClick={onApply}
        className="w-full py-1.5 bg-[#4f46e5] text-white font-semibold rounded-lg hover:bg-[#4338ca] transition-all text-xs">
        Appliquer
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Panel: Fonds (backgrounds)
   ═══════════════════════════════════════════════════════════════ */

export function PanelFonds({
  bgColor,
  presetColors,
  onColorChange,
  onBgImageClick,
  onBgImageSelect,
  onGradient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  canvasRef,
}: {
  bgColor: string;
  presetColors: string[];
  onColorChange: (c: string) => void;
  onBgImageClick: () => void;
  onBgImageSelect?: (imageUrl: string) => void;
  onGradient: (colors: [string, string], dir: "horizontal" | "vertical" | "diagonal" | number, type?: "linear" | "radial") => void;
  onAddShootZone?: (borderRadius?: number) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  canvasRef?: React.RefObject<any>;
}) {
  const [showCustomGradient, setShowCustomGradient] = useState(false);
  const [showAllColors, setShowAllColors] = useState(false);
  const [showAllGradients, setShowAllGradients] = useState(false);
  const [gradColor1, setGradColor1] = useState("#7c3aed");
  const [gradColor2, setGradColor2] = useState("#ec4899");
  const [gradAngle, setGradAngle] = useState(135);
  const [gradType, setGradType] = useState<"linear" | "radial">("linear");

  // Pick up current canvas gradient when opening custom gradient popover
  const openCustomGradient = useCallback(() => {
    const canvas = canvasRef?.current;
    if (canvas) {
      // Gradient is now stored as fill of solidBg (or legacy _isGradientBg)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const solidBg = canvas.getObjects().find((o: any) => o._isSolidBg);
      const gradFill = solidBg?.fill && typeof solidBg.fill === "object" ? solidBg.fill : null;
      if (gradFill && gradFill.colorStops) {
        const stops = gradFill.colorStops;
        if (stops.length >= 2) {
          setGradColor1(stops[0].color || "#7c3aed");
          setGradColor2(stops[stops.length - 1].color || "#ec4899");
        }
        if (gradFill.type === "radial") {
          setGradType("radial");
        } else {
          setGradType("linear");
          const g = gradFill;
          if (g.x1 !== undefined && g.y1 !== undefined && g.x2 !== undefined && g.y2 !== undefined) {
            const dx = g.x2 - g.x1;
            const dy = g.y2 - g.y1;
            const angle = Math.round((Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360);
            setGradAngle(angle > 180 ? angle - 180 : angle);
          }
        }
      }
    }
    setShowCustomGradient(true);
  }, [canvasRef]);
  const [docColors, setDocColors] = useState<string[]>([]);
  const [docImages, setDocImages] = useState<{ src: string; thumb: string }[]>([]);
  const { loadingKey: docLoadingKey, run: docRun } = useLoadingClick();
  // Does the canvas have a full-cover background image that would hide
  // any solid color / gradient the user applies? Used to show a notice.
  const [hasBgImage, setHasBgImage] = useState(false);
  const extractTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Remove the current background image so the user's color/gradient
  // actually becomes visible.
  const removeBgImage = useCallback(() => {
    const canvas = canvasRef?.current;
    if (!canvas) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bgImg = canvas.getObjects().find((o: any) => o._isBgImage);
    if (!bgImg) return;
    canvas.remove(bgImg);
    canvas.requestRenderAll();
    canvas.fire("object:modified", { target: bgImg, _historyLabel: "Image de fond retirée" });
    setHasBgImage(false);
  }, [canvasRef]);

  const extractColors = useCallback(() => {
    const canvas = canvasRef?.current;
    if (!canvas) return;
    const colors = new Set<string>();
    const images: { src: string; thumb: string }[] = [];
    const seenSrcs = new Set<string>();
    canvas.getObjects().forEach((obj: any) => {
      if (obj._isShootZone || obj._isShootLabel || obj._isTextGuide) return;
      if ((obj.type === "textbox" || obj.type === "i-text" || obj.type === "text") && obj.fill) {
        const c = normalizeColor(obj.fill);
        if (c) colors.add(c);
      }
      if (obj.fill && typeof obj.fill === "string") {
        const c = normalizeColor(obj.fill);
        if (c) colors.add(c);
      }
      if (obj.stroke && typeof obj.stroke === "string") {
        const c = normalizeColor(obj.stroke);
        if (c) colors.add(c);
      }
      if (obj.type === "image") {
        try {
          const el = obj.getElement?.() || obj._element;
          if (el) {
            sampleImageColors(el).forEach((sc) => colors.add(sc));
            // Extract thumbnail for "images du document"
            if (!obj._isSolidBg) {
              const tmp = document.createElement("canvas");
              const thumbSize = 80;
              tmp.width = thumbSize;
              tmp.height = thumbSize;
              const ctx = tmp.getContext("2d");
              if (ctx) {
                ctx.drawImage(el, 0, 0, thumbSize, thumbSize);
                const thumb = tmp.toDataURL("image/jpeg", 0.6);
                const src = obj.toDataURL?.({ format: "png" }) || el.src || "";
                const dedupKey = el.src || src;
                if (src && !seenSrcs.has(dedupKey)) {
                  seenSrcs.add(dedupKey);
                  images.push({ src, thumb });
                }
              }
            }
          }
        } catch { /* skip */ }
      }
      if (obj.type === "group" && obj._objects) {
        obj._objects.forEach((child: any) => {
          if (child.fill && typeof child.fill === "string") {
            const c = normalizeColor(child.fill);
            if (c) colors.add(c);
          }
        });
      }
    });
    if (canvas.backgroundColor && canvas.backgroundColor !== "#ffffff" && canvas.backgroundColor !== "white") {
      const c = normalizeColor(canvas.backgroundColor);
      if (c) colors.add(c);
    }
    const filtered = Array.from(colors).filter((c) => {
      const rgb = hexToRgb(c);
      if (!rgb) return false;
      const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
      return brightness > 15 && brightness < 245;
    });
    setDocColors(filtered.slice(0, 12));
    setDocImages(images);
    // Refresh the "blocking background image" flag at the same time
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setHasBgImage(canvas.getObjects().some((o: any) => o._isBgImage));
  }, [canvasRef]);

  // Only re-extract on object:modified if fill/stroke actually changed (not moves/resizes)
  const onObjectModified = useCallback((e: any) => {
    const label = e?._historyLabel || "";
    if (label.includes("couleur") || label.includes("contour") || label.includes("Filtre") || label.includes("fond") || label.includes("Fond")) {
      if (extractTimerRef.current) clearTimeout(extractTimerRef.current);
      extractTimerRef.current = setTimeout(extractColors, 300);
    }
  }, [extractColors]);

  useEffect(() => {
    const canvas = canvasRef?.current;
    if (!canvas) return;
    extractColors();
    canvas.on("object:added", extractColors);
    canvas.on("object:removed", extractColors);
    canvas.on("object:modified", onObjectModified);
    return () => {
      canvas.off("object:added", extractColors);
      canvas.off("object:removed", extractColors);
      canvas.off("object:modified", onObjectModified);
      if (extractTimerRef.current) clearTimeout(extractTimerRef.current);
    };
  }, [canvasRef, extractColors, onObjectModified]);

  // Merge all colors: document colors first, then presets (deduplicated)
  const allColors = [...docColors];
  presetColors.forEach((c) => { if (!allColors.includes(c)) allColors.push(c); });

  return (
    <div className="space-y-3">
      {/* Blocking-bg-image notice — shown when a full-cover image sits
          on top of the solid/gradient bg, which would make any color
          change invisible. Lets the user remove it in one click. */}
      {hasBgImage && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2.5">
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-amber-800 leading-tight mb-0.5">
              Une image de fond couvre votre cadre
            </p>
            <p className="text-[10px] text-amber-700/90 leading-snug">
              Les couleurs et dégradés choisis ci-dessous seront cachés derrière. Retirez l&apos;image pour les voir apparaître.
            </p>
            <button
              onClick={removeBgImage}
              className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 hover:text-amber-900 underline decoration-amber-300 hover:decoration-amber-600 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Retirer l&apos;image de fond
            </button>
          </div>
        </div>
      )}

      {/* Couleur — color-wheel first, then presets */}
      <div>
        <div className="mb-1.5">
          <p className="text-[11px] text-gray-600 font-bold uppercase tracking-wider">Couleur</p>
        </div>
        <div className="grid grid-cols-8 gap-1.5">
          {/* Roue de couleur = <input type="color"> natif : ouvre le picker du
              navigateur, qui embarque SA pipette (marche aussi en HTTP,
              contrairement à l'API EyeDropper). Remplace l'ancien sélecteur
              custom (react-colorful) qui n'avait pas de pipette. */}
          <label
            className="relative w-full aspect-square rounded-full cursor-pointer border-2 border-gray-200 hover:scale-110 transition-all overflow-hidden"
            title="Choisir une couleur (pipette incluse)"
            style={{ background: "conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
          >
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(bgColor) ? bgColor : "#ffffff"}
              onChange={(e) => onColorChange(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
          {(showAllColors ? allColors : allColors.slice(0, 15)).map((c) => (
            <button key={c} onClick={() => onColorChange(c)}
              className={`w-full aspect-square rounded-full border-2 transition-all hover:scale-110 ${bgColor === c ? "border-gray-800 scale-110 shadow" : "border-gray-100 hover:border-gray-400"}`}
              style={{ backgroundColor: c }} title={c} />
          ))}
        </div>
        {allColors.length > 15 && (
          <button onClick={() => setShowAllColors(!showAllColors)} className="text-[10px] text-[#4f46e5] hover:underline mt-0.5">
            {showAllColors ? "Voir moins" : `+ ${allColors.length - 15} couleurs`}
          </button>
        )}
      </div>

      {/* Dégradés — custom gradient popover first, then presets (2 rows visible) */}
      <div>
        <p className="text-[11px] text-gray-600 font-bold uppercase tracking-wider mb-1.5">Dégradés</p>
        <div className="grid grid-cols-6 gap-1.5">
          {/* Custom gradient button — distinctive "+" icon, opens popover */}
          <div className="relative">
            <button
              onClick={() => showCustomGradient ? setShowCustomGradient(false) : openCustomGradient()}
              className={`w-full aspect-square rounded-full border-2 transition-all hover:scale-110 flex items-center justify-center ${showCustomGradient ? "border-[#4f46e5] scale-110 shadow-md" : "border-gray-300 border-dashed hover:border-[#4f46e5]"}`}
              style={{ background: "linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)" }}
              title="Dégradé sur mesure"
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
            </button>
            {/* Popover */}
            {showCustomGradient && (
              <GradientPopover
                gradColor1={gradColor1} gradColor2={gradColor2}
                setGradColor1={setGradColor1} setGradColor2={setGradColor2}
                gradType={gradType} setGradType={setGradType}
                gradAngle={gradAngle} setGradAngle={setGradAngle}
                onApply={() => { onGradient([gradColor1, gradColor2], gradAngle, gradType); setShowCustomGradient(false); }}
                onClose={() => setShowCustomGradient(false)}
              />
            )}
          </div>
          {(showAllGradients ? GRADIENT_PRESETS : GRADIENT_PRESETS.slice(0, 11)).map((g, i) => (
            <button key={i} onClick={() => onGradient(g.colors, g.dir)}
              className="w-full aspect-square rounded-full border-2 border-gray-100 hover:border-gray-400 hover:scale-110 transition-all"
              style={{ background: `linear-gradient(${g.dir === "horizontal" ? "to right" : g.dir === "vertical" ? "to bottom" : "to bottom right"}, ${g.colors[0]}, ${g.colors[1]})` }}
            />
          ))}
        </div>
        {GRADIENT_PRESETS.length > 11 && (
          <button onClick={() => setShowAllGradients(!showAllGradients)} className="text-[10px] text-[#4f46e5] hover:underline mt-0.5">
            {showAllGradients ? "Voir moins" : `+ ${GRADIENT_PRESETS.length - 11} dégradés`}
          </button>
        )}
      </div>

      {/* Background image — compact layout */}
      <div className="border-t border-gray-100 pt-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] text-gray-600 font-bold uppercase tracking-wider">Image de fond</p>
        </div>
        <BgDropZone onBgImageClick={onBgImageClick} />
        {docImages.length > 0 && (
          <div className="mb-2">
            <p className="text-[11px] text-gray-600 font-bold uppercase tracking-wider mb-1">Du document</p>
            <div className="grid grid-cols-4 gap-1.5">
              {docImages.map((img, i) => {
                const key = `doc-${i}`;
                return (
                  <button
                    key={i}
                    onClick={() => docRun(key, async () => onBgImageSelect?.(img.src))}
                    className="relative rounded-lg overflow-hidden hover:ring-2 hover:ring-[#4f46e5] transition-all cursor-pointer group"
                    title="Utiliser comme fond"
                  >
                    <img src={img.thumb} alt="Image du document" className="w-full aspect-square object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                      <svg className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                    </div>
                    {docLoadingKey === key && <ThumbSpinner size={16} />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <BgImageSearch onSelect={onBgImageSelect} />
      </div>
    </div>
  );
}

/* ── Drag & drop zone for background image import ── */
function BgDropZone({ onBgImageClick }: { onBgImageClick: () => void }) {
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items?.length) setDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragging(false);
    dragCounter.current = 0;
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      // Simulate a file input change event for the hidden bg input
      onBgImageClick(); // opens file dialog as fallback — we'll handle the dropped file
      // Actually dispatch via the hidden input — create a synthetic DataTransfer
      const dt = new DataTransfer();
      dt.items.add(file);
      const bgInput = document.querySelector('input[type="file"][class="hidden"]') as HTMLInputElement;
      if (bgInput) {
        bgInput.files = dt.files;
        bgInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={onBgImageClick}
      className={`w-full py-3 border-2 border-dashed rounded-xl transition-all flex flex-col items-center gap-1 cursor-pointer mb-2 ${
        dragging
          ? "border-[#4f46e5] bg-purple-50 scale-[1.01]"
          : "border-gray-200 hover:border-[#4f46e5]/50 hover:bg-purple-50/30"
      }`}
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${dragging ? "bg-[#4f46e5] text-white" : "bg-gray-100 text-gray-400"}`}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      </div>
      <span className={`text-[11px] font-medium ${dragging ? "text-[#4f46e5]" : "text-gray-400"}`}>
        {dragging ? "Déposez l'image ici" : "Glissez ou cliquez pour importer"}
      </span>
    </div>
  );
}

/* ── Background image search (Pexels textures/backgrounds) ── */

function BgImageSearch({ onSelect }: { onSelect?: (imageUrl: string) => void }) {
  const [query, setQuery] = useState("");
  const [photos, setPhotos] = useState<{ id: number; src: { tiny: string; medium: string; large: string; large2x: string; original: string }; alt: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [showMoreTags, setShowMoreTags] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const { loadingKey: bgLoadingKey, run: bgRun } = useLoadingClick();

  // Load default background textures on mount. Results are cached in
  // localStorage with a 7-day TTL so re-opening the Fonds tab doesn't
  // re-fetch the same 40 Pexels photos every time.
  useEffect(() => {
    const CACHE_KEY = "selfizee_bg_default_cache_v1";
    const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.ts === "number" && Date.now() - parsed.ts < TTL_MS && Array.isArray(parsed.photos)) {
          setPhotos(parsed.photos);
          return;
        }
      }
    } catch { /* ignore parse errors */ }

    const controller = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(apiUrl("/api/pexels?query=soft+beautiful+background+bokeh+pastel&per_page=40&skip_translate=1"), { signal: controller.signal });
        if (!res.ok) throw new Error("err");
        const data = await res.json();
        const photos = data.photos || [];
        setPhotos(photos);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), photos })); } catch { /* quota */ }
      } catch (e: any) {
        if (e?.name !== "AbortError") setPhotos([]);
      }
      setLoading(false);
    })();
    return () => controller.abort();
  }, []);

  async function search(q: string) {
    if (!q.trim()) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/pexels?query=${encodeURIComponent(q)}&per_page=40`), { signal: controller.signal });
      if (!res.ok) throw new Error("err");
      const data = await res.json();
      setPhotos(data.photos || []);
    } catch (e: any) {
      if (e?.name !== "AbortError") setPhotos([]);
    }
    setLoading(false);
  }

  // Search with pre-translated English query (for predefined tags)
  async function searchDirect(englishQuery: string) {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/pexels?query=${encodeURIComponent(englishQuery)}&per_page=40&skip_translate=1`), { signal: controller.signal });
      if (!res.ok) throw new Error("err");
      const data = await res.json();
      setPhotos(data.photos || []);
    } catch (e: any) {
      if (e?.name !== "AbortError") setPhotos([]);
    }
    setLoading(false);
  }

  return (
    <div className="space-y-2">
      <form onSubmit={(e) => { e.preventDefault(); search(query); }} className="flex gap-1.5">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un fond..."
          className="flex-1 px-2.5 py-1.5 rounded-lg bg-gray-100 border border-gray-200 text-gray-800 placeholder-gray-400 text-xs focus:outline-none focus:border-[#4f46e5]"
        />
        <button type="submit" className="px-2 py-1.5 bg-gray-100 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-200 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      </form>

      {(() => {
        const allTags = [
          { label: "fleurs", query: "flowers beautiful colorful background" },
          { label: "néon", query: "neon glow colorful background" },
          { label: "tropical", query: "tropical leaves colorful background" },
          { label: "doré", query: "gold luxury elegant background" },
          { label: "bokeh", query: "bokeh dreamy soft light background" },
          { label: "abstrait", query: "abstract modern colorful background" },
          { label: "aquarelle", query: "watercolor artistic background" },
          { label: "holographique", query: "holographic iridescent gradient background" },
          { label: "coucher de soleil", query: "sunset colorful sky background" },
          { label: "minimaliste", query: "minimal clean modern background" },
        ];
        const visibleTags = showMoreTags ? allTags : allTags.slice(0, 4);
        return (
          <div className="flex flex-wrap gap-1 items-center">
            {visibleTags.map((tag) => (
              <button
                key={tag.label}
                onClick={() => { setQuery(tag.label); searchDirect(tag.query); }}
                className="px-2 py-0.5 rounded-full text-[10px] bg-gray-100 text-gray-500 hover:bg-[#4f46e5] hover:text-white transition-colors"
              >
                {tag.label}
              </button>
            ))}
            <button onClick={() => setShowMoreTags(!showMoreTags)} className="text-[10px] text-[#4f46e5] hover:underline">
              {showMoreTags ? "moins" : "+ d'idées"}
            </button>
          </div>
        );
      })()}

      {loading && <p className="text-gray-400 text-[10px] text-center py-2">Recherche...</p>}

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5 h-[calc(100dvh_-_260px)] overflow-y-auto">
          {photos.map((photo) => {
            const key = `bg-${photo.id}`;
            return (
              <button
                key={photo.id}
                onClick={() => bgRun(key, async () => onSelect?.(photo.src.original))}
                className="relative rounded-lg overflow-hidden hover:ring-2 hover:ring-[#4f46e5] transition-all cursor-pointer group"
                title="Utiliser comme fond"
              >
                <img src={photo.src.tiny} alt={photo.alt} className="w-full aspect-square object-cover" loading="lazy" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                  <svg className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                </div>
                {bgLoadingKey === key && <ThumbSpinner />}
              </button>
            );
          })}
        </div>
      )}

    </div>
  );
}

export default React.memo(PanelFonds);
