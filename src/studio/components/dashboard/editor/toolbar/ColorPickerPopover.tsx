"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { HexColorPicker } from "react-colorful";

function hexToRgb(hex: string) {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export default function ColorPickerPopover({
  color,
  onChange,
  className,
  swatchClassName,
  swatchStyle,
}: {
  color: string;
  onChange: (color: string) => void;
  className?: string;
  swatchClassName?: string;
  swatchStyle?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(color);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setHex(color); }, [color]);

  // Position the popover when opening AND keep it pinned on
  // scroll/resize — previously the position was computed once on open
  // and the popover drifted out of alignment if the user scrolled the
  // page or resized the window while it was open.
  useEffect(() => {
    if (!open || !btnRef.current) return;
    const reposition = () => {
      if (!btnRef.current) return;
      const rect = btnRef.current.getBoundingClientRect();
      const popW = 232;
      const popH = 280;
      let top = rect.bottom + 4;
      let left = rect.left;
      if (top + popH > window.innerHeight) top = rect.top - popH - 4;
      if (left + popW > window.innerWidth) left = window.innerWidth - popW - 8;
      if (left < 4) left = 4;
      setPos({ top, left });
    };
    reposition();
    window.addEventListener("resize", reposition);
    // Listen on capture so nested scroll containers also trigger
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleDown(e: MouseEvent) {
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleDown);
    return () => document.removeEventListener("mousedown", handleDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const handlePickerChange = useCallback((c: string) => {
    setHex(c);
    onChange(c);
  }, [onChange]);

  const handleHexInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value;
    if (v && !v.startsWith("#")) v = "#" + v;
    if (/^#[0-9a-fA-F]{0,6}$/.test(v) || v === "#") {
      setHex(v);
      if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v);
    }
  }, [onChange]);

  const handleHexBlur = useCallback(() => {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) setHex(color);
  }, [hex, color]);

  // Read RGB from LOCAL `hex` state, not the `color` prop — otherwise
  // back-to-back RGB edits read a stale prop (parent hasn't flushed
  // the previous onChange yet), so editing G after R would revert R.
  const rgb = hexToRgb(/^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#000000");

  const handleRgbChange = useCallback((channel: "r" | "g" | "b", value: string) => {
    const num = Math.max(0, Math.min(255, parseInt(value) || 0));
    const cur = hexToRgb(/^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#000000");
    const newColor = rgbToHex(
      channel === "r" ? num : cur.r,
      channel === "g" ? num : cur.g,
      channel === "b" ? num : cur.b,
    );
    setHex(newColor);
    onChange(newColor);
  }, [hex, onChange]);

  return (
    <div className={className || ""}>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className={swatchClassName || "w-8 h-8 rounded-lg border border-gray-200 cursor-pointer flex-shrink-0"}
        style={swatchStyle || { backgroundColor: color }}
        title={color}
      />

      {open && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[9999] p-3 bg-white rounded-xl shadow-xl border border-gray-100"
          style={{ top: pos.top, left: pos.left }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <HexColorPicker color={color} onChange={handlePickerChange} style={{ width: 200, height: 160 }} />
          {/* Hex */}
          <div className="flex items-center gap-2 mt-2">
            <div className="w-6 h-6 rounded border border-gray-200 flex-shrink-0" style={{ backgroundColor: color }} />
            <input
              type="text"
              value={hex}
              onChange={handleHexInput}
              onBlur={handleHexBlur}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              className="flex-1 px-2 py-1 rounded border border-gray-200 text-xs font-mono text-gray-700 focus:outline-none focus:border-[#4f46e5]"
              maxLength={7}
              spellCheck={false}
              placeholder="#000000"
            />
          </div>
          {/* RGB */}
          <div className="flex items-center gap-1.5 mt-1.5">
            {(["r", "g", "b"] as const).map((ch) => (
              <div key={ch} className="flex-1 text-center">
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={rgb[ch]}
                  onChange={(e) => handleRgbChange(ch, e.target.value)}
                  className="w-full px-1 py-0.5 rounded border border-gray-200 text-xs text-center text-gray-700 focus:outline-none focus:border-[#4f46e5]"
                />
                <span className="text-[9px] text-gray-400 uppercase">{ch}</span>
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
