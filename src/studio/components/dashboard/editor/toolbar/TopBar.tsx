"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useEditorStore } from "../store/editorStore";
import type { Format, Gabarit } from "@/studio/lib/gabarits";
import { resolveHistoryEntry } from "../canvas/canvasHistory";
import { CUSTOM_PROPS } from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface TopBarProps {
  shareToken?: string;
  onClose?: () => void;
  onSaved: () => void;
  eventName?: string;
  format: Format;
  gabarit: Gabarit;
  undo: () => void;
  redo: () => void;
  saveStatus: string;
  lastSavedAt: number;
  showVersions: boolean;
  setShowVersions: (v: boolean) => void;
  versionHistory: any[];
  setVersionHistory: (v: any[]) => void;
  eventId?: string;
  handleShare: () => void;
  handleDownloadPNG: () => void;
  handleSave: (force?: boolean) => void;
  onChangeGabarit?: (...args: any[]) => void;
  addShootZone: (idx?: number) => void;
  marginWarningsCount?: number;
  onReviewMargins?: () => void;
  previewMode?: boolean;
  onTogglePreview?: () => void;
  typeSlug?: string;
  /** Masque « Partager » : la création du lien passe par POST /api/share, qui
   *  exige une session — inutilisable depuis l'éditeur public. */
  hideShare?: boolean;
  /** Masque « PNG » : téléchargement d'image = outil « pro » inutile pour le
   *  client (retour boss p.9). */
  hideDownload?: boolean;
  /** Cadre d'événement : le nom affiché est celui de l'événement et l'input
   *  passe en lecture seule. */
  fixedFrameName?: string;
}

function TopBarComponent(props: TopBarProps) {
  const {
    shareToken, onClose, onSaved, eventName,
    format, gabarit,
    undo, redo,
    saveStatus, lastSavedAt,
    showVersions, setShowVersions,
    versionHistory, setVersionHistory,
    eventId,
    handleShare, handleDownloadPNG, handleSave,
    onChangeGabarit,
    addShootZone,
    marginWarningsCount = 0,
    onReviewMargins,
    previewMode = false,
    onTogglePreview,
    typeSlug,
    hideShare = false,
    hideDownload = false,
    fixedFrameName,
  } = props;
  const isCadres = (typeSlug || "cadres") === "cadres";

  const fabricRef = useEditorStore(s => s.fabricRef);
  const frameName = useEditorStore(s => s.frameName);
  const setFrameName = useEditorStore(s => s.setFrameName);
  const canUndo = useEditorStore(s => s.canUndo);
  const canRedo = useEditorStore(s => s.canRedo);
  const saving = useEditorStore(s => s.saving);
  const ready = useEditorStore(s => s.ready);
  const setShowFormatPicker = useEditorStore(s => s.setShowFormatPicker);
  const [shootCount, setShootCount] = useState(0);

  useEffect(() => {
    const canvas = fabricRef?.current;
    if (!canvas) return;
    const update = () => {
      setShootCount(canvas.getObjects().filter((o: any) => o._isShootZone).length);
    };
    update();
    canvas.on("object:added", update);
    canvas.on("object:removed", update);
    return () => { canvas.off("object:added", update); canvas.off("object:removed", update); };
  }, [fabricRef, ready]);

  return (
    <>
      <div className="flex items-center justify-between px-4 h-[52px] flex-shrink-0" style={{ background: "linear-gradient(135deg, #4338ca, #4f46e5)" }}>
        {/* Left: Back + Name + Undo/Redo */}
        <div className="flex items-center gap-2">
          {!shareToken && (
            <button
              onClick={onClose || onSaved}
              className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              title="Fermer l'éditeur"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
          )}

          <div className="flex flex-col px-2.5 py-1 rounded-md bg-white/10 max-w-[280px]">
            {eventName && (
              <span className="text-[10px] text-white/50 truncate leading-tight">{eventName}</span>
            )}
            <input
              type="text"
              value={fixedFrameName ?? (frameName || `${format.name} — ${gabarit.name}`)}
              onChange={fixedFrameName ? undefined : (e) => setFrameName(e.target.value)}
              readOnly={!!fixedFrameName}
              title={fixedFrameName ? `Cadre de l'événement ${fixedFrameName}` : undefined}
              className={`text-white text-sm font-medium truncate bg-transparent border-none outline-none placeholder-white/40 w-full${
                fixedFrameName ? " cursor-default" : ""
              }`}
              placeholder="Nom du cadre..."
            />
          </div>

          <div className="w-px h-6 bg-white/20 mx-1" />

          {/* Undo/Redo — bigger, more visible */}
          <button
            onClick={undo}
            disabled={!canUndo}
            className="w-9 h-9 rounded-lg text-white hover:bg-white/20 transition-colors disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center"
            title="Annuler (⌘Z)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
            </svg>
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="w-9 h-9 rounded-lg text-white hover:bg-white/20 transition-colors disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center"
            title="Rétablir (⌘⇧Z)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4" />
            </svg>
          </button>

          <div className="w-px h-5 bg-white/20 mx-1" />

          {/* History button */}
          <button
            onClick={() => setShowVersions(!showVersions)}
            className="flex items-center gap-1.5 h-9 px-2.5 rounded-lg hover:bg-white/20 transition-colors"
            title="Historique local"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-white/70 text-[11px] hidden sm:inline">Historique</span>
          </button>
        </div>

        {/* Right: Share + Download + Save */}
        <div className="flex items-center gap-2">
          {onTogglePreview && (
            <button
              onClick={onTogglePreview}
              disabled={!ready}
              title={previewMode ? "Revenir en édition" : "Basculer en mode aperçu"}
              className={`px-4 py-2 font-semibold rounded-lg transition-all disabled:opacity-50 text-sm flex items-center gap-1.5 border ${
                previewMode
                  ? "bg-white text-[#4f46e5] border-white"
                  : "bg-white/20 text-white border-white/30 hover:bg-white/30"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              {previewMode ? "Quitter aperçu" : "Aperçu"}
            </button>
          )}
          {!hideShare && (
            <button
              onClick={handleShare}
              disabled={!ready}
              className="px-4 py-2 bg-white/20 text-white font-semibold rounded-lg hover:bg-white/30 transition-all disabled:opacity-50 text-sm flex items-center gap-1.5 border border-white/30"
              title="Partager ce cadre"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Partager
            </button>
          )}
          {!hideDownload && (
            <button
              onClick={handleDownloadPNG}
              disabled={!ready}
              className="px-4 py-2 bg-white/20 text-white font-semibold rounded-lg hover:bg-white/30 transition-all disabled:opacity-50 text-sm flex items-center gap-1.5 border border-white/30"
              title="Télécharger en PNG"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              PNG
            </button>
          )}
          {!shareToken && (
            <button
              onClick={() => handleSave()}
              disabled={saving || !ready}
              className="px-5 py-2 bg-white text-[#4f46e5] font-bold rounded-lg hover:bg-white/90 transition-all disabled:opacity-50 text-sm flex items-center gap-2 shadow-sm"
            >
              {saving && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          )}
        </div>
      </div>

      {/* ═══ FORMAT INFO BAR ═══ */}
      <div className="flex items-center h-[36px] bg-gray-50 border-b border-gray-200 px-5 gap-3 flex-shrink-0">
        <span className="text-xs text-gray-500 italic">
          {format.name}{isCadres ? ` — ${shootCount} photo${shootCount > 1 ? "s" : ""}` : ""}
        </span>
        {onChangeGabarit && (
          <button
            onClick={() => setShowFormatPicker(true)}
            className="text-xs text-[#4f46e5] hover:text-[#4338ca] font-medium transition-colors"
          >
            Changer de format
          </button>
        )}
        {isCadres && (
          <button
            onClick={() => addShootZone(0)}
            className="text-xs text-[#4f46e5] hover:text-[#e0014a] font-medium transition-colors"
          >
            Ajouter un shoot
          </button>
        )}
        {marginWarningsCount > 0 && onReviewMargins && (
          <button
            onClick={onReviewMargins}
            title="Voir le détail des éléments hors marge"
            className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-100 border border-amber-300 text-amber-800 hover:bg-amber-200 transition-colors text-xs font-semibold"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            {marginWarningsCount} hors marge
          </button>
        )}
      </div>

      {/* ═══ HISTORY MODAL — rendered via portal to avoid React event propagation issues ═══ */}
      {showVersions && typeof document !== "undefined" && createPortal(
        <HistoryModal
          onClose={() => setShowVersions(false)}
          undo={undo}
          eventId={eventId}
          format={format}
          gabarit={gabarit}
          onChangeGabarit={onChangeGabarit}
        />,
        document.body
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   History Modal — timeline with canvas previews + rollback
   ═══════════════════════════════════════════════════════════════ */

function HistoryModal({ onClose, undo, eventId, format, gabarit, onChangeGabarit }: {
  onClose: () => void;
  undo: () => void;
  eventId?: string;
  format: Format;
  gabarit: Gabarit;
  // Cross-format rollback: when the selected entry was saved under a
  // different format, applyRollback hands the JSON to the parent so it
  // can remount the editor with the right format + previousCanvasState.
  // Reuses the same callback wired to "Charger les éléments existants".
  onChangeGabarit?: (...args: any[]) => void;
}) {
  const fabricRef = useEditorStore(s => s.fabricRef);
  const [shootCount, setShootCount] = useState(0);

  useEffect(() => {
    const canvas = fabricRef?.current;
    if (!canvas) return;
    const update = () => {
      const count = canvas.getObjects().filter((o: any) => o._isShootZone).length;
      setShootCount(count);
    };
    update();
    canvas.on("object:added", update);
    canvas.on("object:removed", update);
    return () => { canvas.off("object:added", update); canvas.off("object:removed", update); };
  }, [fabricRef]);

  const historyRef = useEditorStore(s => s.historyRef);
  const historyIndexRef = useEditorStore(s => s.historyIndexRef);
  const historyImageCacheRef = useEditorStore(s => s.historyImageCacheRef);
  const isRestoringRef = useEditorStore(s => s.isRestoringRef);
  const canvasWidth = useEditorStore(s => s.canvasWidth);
  const canvasHeight = useEditorStore(s => s.canvasHeight);
  const BLEED_PX = useEditorStore(s => s.BLEED_PX);
  const bufferWidth = useEditorStore(s => s.bufferWidth);
  const bufferHeight = useEditorStore(s => s.bufferHeight);
  const setSelectedObj = useEditorStore(s => s.setSelectedObj);
  const setHistoryVersion = useEditorStore(s => s.setHistoryVersion);
  const setCropping = useEditorStore(s => s.setCropping);

  const [selectedIdx, setSelectedIdx] = useState(historyIndexRef.current);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Auto-scroll timeline to keep selected entry visible
  useEffect(() => {
    const el = timelineRef.current?.querySelector(`[data-history-idx="${selectedIdx}"]`);
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIdx]);

  const currentIdx = historyIndexRef.current;
  const historyLen = historyRef.current.length;
  // Track the latest preview request id so slower in-flight previews
  // can't clobber a newer one (user rapidly arrow-keying through the
  // timeline would otherwise show out-of-order thumbnails).
  const previewRequestRef = useRef(0);

  // Generate preview — crop to design area for both current and past states
  const generatePreview = async (idx: number) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const reqId = ++previewRequestRef.current;

    if (idx === currentIdx) {
      try {
        // Capture live canvas and crop to design area (remove bleed)
        const fullUrl = canvas.toDataURL({ format: "png", quality: 0.8, multiplier: 1 });
        const img = new Image();
        img.onload = () => {
          // Discard stale response if a newer preview was requested
          if (reqId !== previewRequestRef.current) return;
          const cropEl = document.createElement("canvas");
          const s = Math.min(600 / canvasWidth, 500 / canvasHeight, 1);
          cropEl.width = Math.round(canvasWidth * s);
          cropEl.height = Math.round(canvasHeight * s);
          const ctx = cropEl.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, cropEl.width, cropEl.height);
            ctx.drawImage(img, BLEED_PX, BLEED_PX, canvasWidth, canvasHeight, 0, 0, cropEl.width, cropEl.height);
            setPreviewUrl(cropEl.toDataURL("image/png", 0.8));
          }
          cropEl.width = 0; cropEl.height = 0;
        };
        img.src = fullUrl;
      } catch { setPreviewUrl(null); }
      return;
    }

    setGenerating(true);
    try {
      const fabric = await import("fabric");
      const parsed = resolveHistoryEntry(historyRef.current, idx);
      if (!parsed) { setPreviewUrl(null); setGenerating(false); return; }

      // Restore image data from cache
      if (parsed.objects) {
        const restoreImg = (obj: any) => {
          if (obj?.type === "image" && obj.src?.startsWith("__img_")) {
            const data = historyImageCacheRef.current.get(obj.src);
            if (data) obj.src = data;
          }
          if (obj?.objects) obj.objects.forEach(restoreImg);
        };
        parsed.objects.forEach(restoreImg);
      }

      // Use the entry's own buffer dimensions + bleed instead of the current
      // mount's. Without this, an entry saved under a different format (e.g.
      // Carte Postale Portrait while we're now in Paysage) would render at
      // Paysage dims, cropping or stretching its content.
      const entry: any = historyRef.current[idx];
      const entryBufW = entry?.bufferDims?.width ?? bufferWidth;
      const entryBufH = entry?.bufferDims?.height ?? bufferHeight;
      const entryBleed = entry?.bleed ?? BLEED_PX;
      const entryDesignW = entryBufW - 2 * entryBleed;
      const entryDesignH = entryBufH - 2 * entryBleed;

      // Create a hidden offscreen canvas (not attached to DOM = no visual flicker)
      const offEl = document.createElement("canvas");
      offEl.width = entryBufW;
      offEl.height = entryBufH;
      // Use StaticCanvas for offscreen rendering (no event handling needed)
      const offCanvas = new fabric.StaticCanvas(offEl, {
        width: entryBufW, height: entryBufH,
        backgroundColor: "#ffffff", enableRetinaScaling: false,
      });
      await offCanvas.loadFromJSON(parsed);
      offCanvas.setDimensions({ width: entryBufW, height: entryBufH });
      // Offset objects (stored without bleed offset)
      offCanvas.getObjects().forEach((o: any) => {
        o.set({ left: (o.left || 0) + entryBleed, top: (o.top || 0) + entryBleed });
        o.setCoords();
      });
      offCanvas.renderAll();

      // Crop to the entry's design area — bail if a newer preview was
      // requested (rapid arrow-key navigation through the timeline).
      const cropEl = document.createElement("canvas");
      const previewScale = Math.min(600 / entryDesignW, 500 / entryDesignH, 1);
      cropEl.width = Math.round(entryDesignW * previewScale);
      cropEl.height = Math.round(entryDesignH * previewScale);
      const ctx = cropEl.getContext("2d");
      if (ctx && reqId === previewRequestRef.current) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, cropEl.width, cropEl.height);
        ctx.drawImage(offEl, entryBleed, entryBleed, entryDesignW, entryDesignH, 0, 0, cropEl.width, cropEl.height);
        setPreviewUrl(cropEl.toDataURL("image/png", 0.8));
      }
      // Cleanup offscreen resources
      try { offCanvas.dispose(); } catch { /* ignore */ }
      offEl.width = 0; offEl.height = 0;
      cropEl.width = 0; cropEl.height = 0;
    } catch (err) {
      console.warn("Preview generation failed:", err);
      if (reqId === previewRequestRef.current) setPreviewUrl(null);
    }
    if (reqId === previewRequestRef.current) setGenerating(false);
  };

  // Generate preview when selection changes — auto for all states
  useEffect(() => {
    setPreviewUrl(null);
    generatePreview(selectedIdx);
  }, [selectedIdx]);

  // Ref to always have latest applyRollback (avoids stale closure in keydown)
  const applyRollbackRef = useRef<() => void>(() => {});

  // Keyboard navigation: arrows to move, Enter to apply, Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); return; }
      if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); applyRollbackRef.current(); return; }
      // Timeline renders newest-on-top (idx = historyLen - 1 - i).
      // ArrowUp → visually up → more recent → higher idx.
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx((prev: number) => Math.min(prev + 1, historyLen - 1)); }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx((prev: number) => Math.max(prev - 1, 0)); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [historyLen, onClose]);

  // Apply rollback
  const applyRollback = async () => {
    if (selectedIdx === currentIdx) return;
    const canvas = fabricRef.current;
    if (!canvas || selectedIdx === currentIdx) return;

    try {
      const fabric = await import("fabric");
      const parsed = resolveHistoryEntry(historyRef.current, selectedIdx);
      if (!parsed) return;

      // Restore image data from cache
      if (parsed.objects) {
        const restoreImg = (obj: any) => {
          if (obj?.type === "image" && obj.src?.startsWith("__img_")) {
            const data = historyImageCacheRef.current.get(obj.src);
            if (data) obj.src = data;
          }
          if (obj?.objects) obj.objects.forEach(restoreImg);
        };
        parsed.objects.forEach(restoreImg);
      }

      // ── Cross-format rollback: route through the parent ──
      // Same problem as undo/redo across a format change: loading an
      // OLD-format JSON into the current canvas (different dims) corrupts
      // the layout. If the selected entry was saved under a different
      // format/gabarit, hand the JSON to onChangeGabarit (which we wired
      // up to remount FrameEditor with previousCanvasState).
      const targetEntry: any = historyRef.current[selectedIdx];
      const tFmtId = targetEntry?.formatId;
      const tGabId = targetEntry?.gabaritId;
      const tFormat = targetEntry?.format;
      const tGabarit = targetEntry?.gabarit;
      const tDims = targetEntry?.bufferDims;
      const tBleed = targetEntry?.bleed ?? 0;
      const formatsMismatch = tFmtId && (tFmtId !== format?.id || tGabId !== gabarit?.id);
      if (formatsMismatch && tFormat && tGabarit && tDims && typeof onChangeGabarit === "function") {
        // Add the saved bleed back so smartReposition (which expects
        // buffer-space positions) gets the right input — saveHistory
        // stripped BLEED_PX from positions at save time.
        if (tBleed && parsed.objects) {
          for (const o of parsed.objects) {
            if (typeof o.left === "number") o.left = o.left + tBleed;
            if (typeof o.top === "number") o.top = o.top + tBleed;
          }
        }
        // Pass DESIGN dims, not BUFFER. Sidebar.onSelect uses the same
        // convention for "Charger les éléments existants"; with buffer
        // dims, smartReposition's scaleX != 1 even for same format.
        const tDesignDims = {
          width: tDims.width - 2 * tBleed,
          height: tDims.height - 2 * tBleed,
        };
        historyIndexRef.current = selectedIdx;
        const s = useEditorStore.getState();
        s.suppressHistoryRef.current = true;
        s.setPendingFormatTransitionLabel(null);
        // Cancel any pending wrap-up saveHistory from a previous format
        // change so it doesn't fire at the now-moved historyIndex and
        // truncate future entries.
        if (s.pendingTransitionSaveTimerRef.current) {
          clearTimeout(s.pendingTransitionSaveTimerRef.current);
          s.pendingTransitionSaveTimerRef.current = null;
        }
        setHistoryVersion((v: number) => v + 1);
        onChangeGabarit(tFormat, tGabarit, JSON.stringify(parsed), tDesignDims);
        // Safety net for the rare case the parent never re-renders.
        setTimeout(() => {
          if (isRestoringRef.current) isRestoringRef.current = false;
          if (useEditorStore.getState().suppressHistoryRef.current) {
            useEditorStore.getState().suppressHistoryRef.current = false;
          }
        }, 5000);
        onClose();
        return;
      }

      // Clean up group editing mode before replacing canvas state —
      // undo/redo call cleanupTools() but rollback bypasses that path,
      // leaving editingGroupObjsRef with stale refs and editingGroup=true.
      const { editingGroup: isGroupEditing, setEditingGroup, editingGroupObjsRef, editingGroupPropsRef } = useEditorStore.getState();
      if (isGroupEditing || editingGroupObjsRef.current.length > 0) {
        editingGroupObjsRef.current = [];
        editingGroupPropsRef.current = null;
        setEditingGroup(false);
      }

      isRestoringRef.current = true;
      // Suppress Fabric events during loadFromJSON
      const _origFire = canvas.fire.bind(canvas);
      canvas.fire = (() => canvas) as any;
      try { await canvas.loadFromJSON(parsed); } finally { canvas.fire = _origFire; }
      canvas.setDimensions({ width: bufferWidth, height: bufferHeight });
      canvas.backgroundColor = "transparent";

      // Restore clipPath
      canvas.clipPath = new fabric.Rect({
        left: BLEED_PX, top: BLEED_PX, width: canvasWidth, height: canvasHeight,
        originX: "left", originY: "top", absolutePositioned: true,
      });

      // Restore custom properties (_isShootZone, _shootIndex, etc.)
      (canvas as any)._reapplyCustomProps?.(parsed);

      // Remove stale bg objects, offset objects — capture custom solid fill first
      const solidBgObjs = canvas.getObjects().filter((o: any) => o._isSolidBg);
      const customSolidFill = solidBgObjs.length > 0 ? solidBgObjs[0].fill : null;
      // Migrate legacy _isGradientBg
      const legacyGrad = canvas.getObjects().find((o: any) => o._isGradientBg);
      const gradFill = legacyGrad?.fill || null;
      const bgToRemove = canvas.getObjects().filter((o: any) => o._isDesignAreaBg || o._isSolidBg || o._isGradientBg);
      bgToRemove.forEach((o: any) => canvas.remove(o));
      canvas.getObjects().forEach((o: any) => {
        o.set({ left: (o.left || 0) + BLEED_PX, top: (o.top || 0) + BLEED_PX });
        o.setCoords();
      });

      // Restore solidBg with saved fill or default white
      const isCustom = customSolidFill && customSolidFill !== "#ffffff" && customSolidFill !== "white" && customSolidFill !== "transparent";
      const bgFill = isCustom ? customSolidFill : (gradFill || "#ffffff");
      const dBg = new fabric.Rect({
        left: BLEED_PX, top: BLEED_PX, width: canvasWidth, height: canvasHeight,
        fill: bgFill, originX: "left", originY: "top",
        selectable: false, evented: false, hoverCursor: "default",
      });
      (dBg as any)._isSolidBg = true;
      canvas.add(dBg);
      canvas.sendObjectToBack(dBg);

      canvas.requestRenderAll();
      historyIndexRef.current = selectedIdx;
      setSelectedObj(null);
      setCropping(false);
      setHistoryVersion((v: number) => v + 1);
      // Reset diff state so next save produces a full snapshot (not a delta against stale base)
      (canvas as any)._resetHistoryDiffState?.();
      // Restore zoom/pan after canvas reload
      const { displayScaleRef, userZoomRef, applyScaleRef } = useEditorStore.getState();
      const scale = userZoomRef.current ?? displayScaleRef.current;
      if (scale && applyScaleRef.current) applyScaleRef.current(scale);
      // Block spurious saves for 300ms after rollback (React effects, deferred Fabric events)

      isRestoringRef.current = false;
      onClose();
    } catch (err) {
      console.error("Rollback failed:", err);
      isRestoringRef.current = false;
    }
  };
  applyRollbackRef.current = applyRollback;

  // Icon for each history entry type
  const getHistoryIcon = (title: string) => {
    const cls = "w-3.5 h-3.5";
    if (title.startsWith("Texte")) return <span className="text-[11px] font-bold text-gray-500">T</span>;
    if (title.startsWith("Image")) return <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 15l5-5 4 4 3-3 6 6" /></svg>;
    if (title.startsWith("Rectangle")) return <svg className={cls} viewBox="0 0 20 20"><rect x="2" y="4" width="16" height="12" rx="1" fill="currentColor" opacity=".4" /></svg>;
    if (title.startsWith("Cercle")) return <svg className={cls} viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="currentColor" opacity=".4" /></svg>;
    if (title.startsWith("Triangle")) return <svg className={cls} viewBox="0 0 20 20"><polygon points="10,3 18,17 2,17" fill="currentColor" opacity=".4" /></svg>;
    if (title.startsWith("Zone photo")) return <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><circle cx="12" cy="13" r="3" /></svg>;
    if (title.startsWith("Groupe")) return <svg className={cls} viewBox="0 0 20 20"><rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor" opacity=".5" /><rect x="11" y="11" width="8" height="8" rx="1" fill="currentColor" opacity=".3" /></svg>;
    if (title.startsWith("Fond") || title.startsWith("Dégradé")) return <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>;
    if (title.startsWith("Tracé") || title.startsWith("Dessin") || title.startsWith("Ligne")) return <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>;
    if (title.startsWith("Alignement")) return <svg className={cls} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M4 6h16M4 12h10M4 18h14" /></svg>;
    return <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
  };

  // Time formatting helper
  const formatTime = (stepsBack: number) => {
    if (stepsBack === 0) return "Maintenant";
    if (stepsBack === 1) return "1 action avant";
    return `${stepsBack} actions avant`;
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-[900px] max-w-[95vw] h-[80vh] max-h-[85vh] overflow-hidden flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <svg className="w-5 h-5 text-[#4f46e5]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Historique local
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">{historyLen} état{historyLen > 1 ? "s" : ""} enregistré{historyLen > 1 ? "s" : ""} dans cette session</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: Timeline */}
          <div className="w-[280px] border-r border-gray-100 overflow-y-auto flex-shrink-0" ref={timelineRef}>
            <div className="p-2">
              {Array.from({ length: historyLen }).map((_, i) => {
                const idx = historyLen - 1 - i;
                const entry = historyRef.current[idx];
                const isCurrent = idx === currentIdx;
                const isSelected = idx === selectedIdx;
                const stepsBack = currentIdx - idx;
                const entryLabel = entry?.label || "";
                const labelParts = entryLabel.split(" — ");
                const labelTitle = labelParts[0] || "";
                const labelDetail = labelParts[1] || "";
                const icon = getHistoryIcon(labelTitle);
                const ts = entry?.timestamp;
                const timeStr = ts ? new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
                return (
                  <div key={idx} className="flex gap-2">
                    {/* Timeline line */}
                    <div className="flex flex-col items-center w-4 flex-shrink-0">
                      <div className={`w-2.5 h-2.5 rounded-full mt-2.5 ${
                        isCurrent ? "bg-[#4f46e5]" : isSelected ? "bg-[#4f46e5]/60" : "border-2 border-gray-300 bg-white"
                      }`} />
                      {i < historyLen - 1 && <div className="w-0.5 flex-1 bg-gray-200" />}
                    </div>
                    {/* Entry */}
                    <button
                      data-history-idx={idx}
                      onClick={() => setSelectedIdx(idx)}
                      className={`flex-1 flex items-center gap-2 px-2 py-1.5 mb-0.5 rounded-xl text-left transition-all ${
                        isSelected
                          ? "bg-[#4f46e5]/10 ring-1 ring-[#4f46e5]/30"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isCurrent ? "bg-[#4f46e5]/15 text-[#4f46e5]" : isSelected ? "bg-[#4f46e5]/10 text-[#4f46e5]" : "bg-gray-100 text-gray-400"
                      }`}>
                        {icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className={`text-[13px] font-semibold truncate ${isCurrent ? "text-[#4f46e5]" : isSelected ? "text-gray-800" : "text-gray-700"}`}>
                            {isCurrent ? "Actuel" : labelTitle || formatTime(stepsBack)}
                          </p>
                          {isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />}
                          {timeStr && !isCurrent && <span className="text-[9px] text-gray-300 flex-shrink-0 ml-auto">{timeStr}</span>}
                        </div>
                        <p className="text-[11px] text-gray-400 truncate">
                          {isCurrent ? "Version courante" : labelDetail ? labelDetail : formatTime(stepsBack)}
                        </p>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Preview */}
          <div className="flex-1 flex flex-col items-center justify-center p-4 bg-gray-100/80 overflow-hidden">
            {generating ? (
              <div className="flex flex-col items-center gap-3">
                <svg className="w-8 h-8 text-[#4f46e5] animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-sm text-gray-400">Chargement de l&apos;apercu...</p>
              </div>
            ) : previewUrl ? (
              <div className="flex flex-col items-center gap-3 w-full h-full">
                <div className="relative flex-1 flex items-center justify-center w-full min-h-0">
                  <div className="relative rounded-lg shadow-md border-2 border-gray-300 overflow-hidden bg-white" style={{ maxWidth: "100%", maxHeight: "100%" }}>
                    <img src={previewUrl} alt="Apercu" className="block max-w-full max-h-[60vh] object-contain" />
                    {selectedIdx === currentIdx && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 bg-green-500 text-white text-[10px] font-bold rounded-full shadow">ACTUEL</div>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-500 flex-shrink-0">
                  {selectedIdx === currentIdx ? "Version courante" : `${currentIdx - selectedIdx} action${currentIdx - selectedIdx > 1 ? "s" : ""} en arriere`}
                </p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm text-gray-400">Selectionnez un etat dans la timeline</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-white">
          <p className="text-[11px] text-gray-400">
            Cet historique est local a votre navigateur et disparait en fermant l&apos;editeur.
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
              Fermer
            </button>
            {selectedIdx !== currentIdx && (
              <button
                onClick={applyRollback}
                className="px-5 py-2 bg-[#4f46e5] text-white font-semibold rounded-lg hover:bg-[#4338ca] transition-all text-sm flex items-center gap-2 shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
                </svg>
                Revenir a cet etat
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
export const TopBar = TopBarComponent;
