"use client";

import { useState, useEffect, useRef } from "react";
import { ALL_FONTS, FONT_LIST, FONT_CATEGORIES, loadGoogleFont, searchAllFonts } from "./fonts";

export function FontPicker({ value, onChange }: { value: string; onChange: (font: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(-1);
  // Mirror of highlightIdx so async applyPreview can tell whether the
  // user moved on before the font finished loading.
  const highlightIdxRef = useRef(-1);
  useEffect(() => { highlightIdxRef.current = highlightIdx; }, [highlightIdx]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = search ? searchAllFonts(search) : ALL_FONTS;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Preload visible fonts when dropdown opens
  useEffect(() => {
    if (open) {
      filtered.slice(0, 20).forEach((f) => {
        if (!["sans-serif", "serif", "monospace"].includes(f)) loadGoogleFont(f);
      });
      // Set highlight to current value
      const idx = filtered.indexOf(value);
      setHighlightIdx(idx >= 0 ? idx : 0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reset highlight when search changes
  useEffect(() => {
    setHighlightIdx(filtered.length > 0 ? 0 : -1);
  }, [search, filtered.length]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (listRef.current && highlightIdx >= 0) {
      const el = listRef.current.children[highlightIdx] as HTMLElement;
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIdx]);

  function select(font: string) {
    if (!["sans-serif", "serif", "monospace"].includes(font)) loadGoogleFont(font);
    onChange(font);
    setOpen(false);
    setSearch("");
  }

  // Live preview on arrow key navigation.
  // Commit the font only AFTER the stylesheet actually loads so Fabric
  // measures with the real font (not a fallback) and avoids the visible
  // jump that happened when we committed immediately and the font
  // loaded a few frames later.
  async function applyPreview(idx: number) {
    if (idx < 0 || idx >= filtered.length) return;
    const font = filtered[idx];
    if (!["sans-serif", "serif", "monospace"].includes(font)) {
      await loadGoogleFont(font);
    }
    // Bail if the user moved past this preview during the font load
    if (highlightIdxRef.current !== idx) return;
    onChange(font);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setOpen(false); setSearch(""); return; }
    if (e.key === "Enter") {
      if (highlightIdx >= 0 && highlightIdx < filtered.length) select(filtered[highlightIdx]);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(highlightIdx + 1, filtered.length - 1);
      setHighlightIdx(next);
      applyPreview(next);
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = Math.max(highlightIdx - 1, 0);
      setHighlightIdx(prev);
      applyPreview(prev);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => { setOpen(!open); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded bg-gray-100 border border-gray-200 text-gray-800 text-xs hover:bg-gray-200 transition-colors focus:outline-none"
      >
        <span style={{ fontFamily: `'${value}', sans-serif` }} className="truncate">{value}</span>
        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-2xl overflow-hidden" style={{ bottom: "auto" }}>
          {/* Search input */}
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une police..."
              className="w-full px-2.5 py-1.5 rounded bg-gray-100 border border-gray-200 text-gray-800 text-xs placeholder:text-gray-400 focus:outline-none focus:border-purple-500/50"
              onKeyDown={handleKeyDown}
            />
          </div>
          {/* Font list */}
          <div ref={listRef} className="max-h-56 overflow-y-auto overscroll-contain">
            {filtered.length === 0 && (
              <p className="text-gray-400 text-xs text-center py-4">Aucune police trouvée</p>
            )}
            {filtered.map((font, i) => {
              const fontDef = FONT_LIST.find(fd => fd.name === font);
              const cat = fontDef ? FONT_CATEGORIES.find(c => c.id === fontDef.category) : null;
              return (
                <button
                  key={font}
                  type="button"
                  onClick={() => select(font)}
                  onMouseEnter={() => {
                    setHighlightIdx(i);
                    if (!["sans-serif", "serif", "monospace"].includes(font)) loadGoogleFont(font);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between gap-2 ${
                    i === highlightIdx ? "bg-[#f0e6ff] text-[#4f46e5]" : font === value ? "bg-gray-50 text-gray-800" : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <span style={{ fontFamily: `'${font}', sans-serif` }} className="truncate">{font}</span>
                  <span className="flex items-center gap-1 flex-shrink-0">
                    {cat && <span className="text-[8px] font-medium px-1.5 py-0.5 rounded-full" style={{ color: cat.color, backgroundColor: cat.bg }}>{cat.label}</span>}
                    {font === value && (
                      <svg className="w-3.5 h-3.5 text-purple-400 ml-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default FontPicker;
