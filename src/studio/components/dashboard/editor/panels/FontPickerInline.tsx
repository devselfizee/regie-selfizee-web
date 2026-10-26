"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  GOOGLE_FONTS,
  FONT_LIST,
  FONT_CATEGORIES,
  loadGoogleFont,
  searchFonts,
  getCustomFonts,
  subscribeCustomFonts,
  fetchCustomFontsFromApi,
  loadCustomFontFace,
  type CustomFont,
} from "./fonts";

export function FontPickerInline({ value, onChange }: { value: string; onChange: (f: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [customFonts, setCustomFontsState] = useState<CustomFont[]>(() => getCustomFonts());
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Stay in sync with the shared custom-fonts registry (populated by the
  // text panel when the user uploads/deletes fonts).
  useEffect(() => {
    const unsub = subscribeCustomFonts(setCustomFontsState);
    // If the registry is empty (e.g. toolbar opened before the panel),
    // kick off a fetch so custom fonts still appear here.
    if (getCustomFonts().length === 0) {
      fetchCustomFontsFromApi();
    }
    return () => unsub();
  }, []);

  // Make sure @font-face rules exist for custom fonts so previews render.
  useEffect(() => {
    customFonts.forEach(loadCustomFontFace);
  }, [customFonts]);

  const toggleOpen = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + 4, left: rect.left });
      setHighlightIdx(-1);
    }
    setOpen(!open);
  };

  const customFontNames = useMemo(() => customFonts.map(f => f.displayName), [customFonts]);
  const customFontNameSet = useMemo(() => new Set(customFontNames), [customFontNames]);

  const filtered = useMemo(() => {
    if (search) {
      const matchedCustom = customFontNames.filter(n => n.toLowerCase().includes(search.toLowerCase().trim()));
      const matchedGoogle = searchFonts(search).map(f => f.name).filter(n => !customFontNameSet.has(n));
      return [...matchedCustom, ...matchedGoogle];
    }
    return [...customFontNames, ...GOOGLE_FONTS.filter(n => !customFontNameSet.has(n))];
  }, [search, customFontNames, customFontNameSet]);

  const previewFont = async (name: string) => {
    if (customFontNameSet.has(name)) {
      const cf = customFonts.find(f => f.displayName === name);
      if (cf) loadCustomFontFace(cf);
    } else {
      // Await the CSS load + force-fetch the actual WOFF so the parent's
      // updateObj fires with the font already available. Without this the
      // live preview kept the fallback font for any family not previously
      // touched in this session.
      await loadGoogleFont(name);
    }
    try {
      if ((document as any).fonts?.load) {
        await Promise.all([
          (document as any).fonts.load(`400 16px "${name}"`),
          (document as any).fonts.load(`700 16px "${name}"`),
        ]);
      }
    } catch { /* ignore */ }
    onChange(name);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(highlightIdx + 1, filtered.length - 1);
      setHighlightIdx(next);
      // Live preview: apply font as you navigate
      if (filtered[next]) previewFont(filtered[next]);
      // Scroll into view
      setTimeout(() => {
        listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
      }, 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = Math.max(highlightIdx - 1, 0);
      setHighlightIdx(prev);
      if (filtered[prev]) previewFont(filtered[prev]);
      setTimeout(() => {
        listRef.current?.children[prev]?.scrollIntoView({ block: "nearest" });
      }, 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIdx >= 0 && filtered[highlightIdx]) {
        previewFont(filtered[highlightIdx]);
        setOpen(false);
        setSearch("");
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
    }
  };

  // Reset highlight when search changes
  useEffect(() => { setHighlightIdx(-1); }, [search]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={toggleOpen}
        className="flex items-center gap-2 px-3 h-9 rounded-lg border border-gray-200 hover:border-gray-400 text-[15px] text-gray-800 min-w-[160px] transition-colors"
      >
        <span className="truncate flex-1 text-left" style={{ fontFamily: value }}>{value}</span>
        <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div
          ref={dropRef}
          className="fixed w-[260px] bg-white rounded-xl shadow-2xl border border-gray-200 z-[9999] max-h-[340px] flex flex-col"
          style={{ top: dropPos.top, left: dropPos.left }}
        >
          <div className="p-2.5 border-b border-gray-100">
            <input
              type="text"
              placeholder="Rechercher ou ↑↓ pour parcourir..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#4f46e5]"
              autoFocus
            />
          </div>
          <div ref={listRef} className="overflow-y-auto flex-1">
            {filtered.map((f, i) => {
              const isCustom = customFontNameSet.has(f);
              const fontDef = isCustom ? null : FONT_LIST.find(fd => fd.name === f);
              const cat = fontDef ? FONT_CATEGORIES.find(c => c.id === fontDef.category) : null;
              return (
                <button
                  key={`${isCustom ? "custom" : "google"}-${f}`}
                  onClick={() => { previewFont(f); setOpen(false); setSearch(""); }}
                  onMouseEnter={() => setHighlightIdx(i)}
                  className={`w-full text-left px-3 py-2.5 text-sm transition-colors flex items-center justify-between gap-2 ${
                    i === highlightIdx
                      ? "bg-[#f0e6ff] text-[#4f46e5]"
                      : value === f
                      ? "bg-purple-50 text-[#4f46e5]"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                  style={{ fontFamily: `'${f}', sans-serif` }}
                >
                  <span className="truncate">{f}</span>
                  <span className="flex items-center gap-1 flex-shrink-0">
                    {isCustom && (
                      <span className="text-[8px] font-medium px-1.5 py-0.5 rounded-full" style={{ color: "#4f46e5", backgroundColor: "#ebf0fa" }}>
                        Ma police
                      </span>
                    )}
                    {cat && <span className="text-[8px] font-medium px-1.5 py-0.5 rounded-full" style={{ color: cat.color, backgroundColor: cat.bg }}>{cat.label}</span>}
                    {value === f && (
                      <svg className="w-4 h-4 text-[#4f46e5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          {/* Import your own — subtle footer action */}
          <button
            onClick={() => {
              setOpen(false);
              setSearch("");
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("selfizee:open-fonts-modal"));
              }
            }}
            className="flex-shrink-0 flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-medium text-gray-400 hover:text-[#4f46e5] border-t border-gray-100 hover:bg-gray-50 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Importer une police
          </button>
        </div>
      )}
    </div>
  );
}

export default FontPickerInline;
