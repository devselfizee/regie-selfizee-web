"use client";

import React from "react";
import { SIDEBAR_ITEMS, CUSTOM_PROPS } from "../types";
import {
  PanelFonds,
  PanelTextes,
  PanelModeles,
  PanelUpload,
  PanelIA,
  PanelFormes,
  PanelPhotos,
  PanelCalques,
  PRESET_COLORS,
} from "..";
import { useEditorStore } from "../store/editorStore";
import type { Format, Gabarit } from "@/studio/lib/gabarits";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface SidebarProps {
  format: Format;
  gabarit?: Gabarit | undefined;
  onChangeGabarit?: (...args: any[]) => void;
  addImageToCanvas: (dataUrl: string, isBg: boolean) => void;
  addText: (...args: any[]) => void;
  addShape: (...args: any[]) => void;
  addCurvedText: (...args: any[]) => void;
  addTextCombo?: (...args: any[]) => void;
  handleImageUpload: (e: any, isBg: boolean) => void;
  updateBgColor: (c: string) => void;
  applyGradientBg: (...args: any[]) => void;
  uploadHistory: any[];
  saveUploadHistory: (h: any[]) => void;
  updateObj: (props: Record<string, any>) => void;
  onBgImageClick?: () => void;
  addShootZone?: (...args: any[]) => void;
  fileInputRef?: React.RefObject<HTMLInputElement | null>;
  typeSlug?: string;
}

function SidebarComponent(props: SidebarProps) {
  const {
    format, gabarit, onChangeGabarit,
    addImageToCanvas, addText, addShape, addCurvedText, addTextCombo,
    handleImageUpload, updateBgColor, applyGradientBg,
    uploadHistory, saveUploadHistory,
    onBgImageClick, addShootZone, fileInputRef,
    typeSlug,
  } = props;

  const activeTab = useEditorStore(s => s.activeTab);
  const setActiveTab = useEditorStore(s => s.setActiveTab);
  const fabricRef = useEditorStore(s => s.fabricRef);
  const canvasWidth = useEditorStore(s => s.canvasWidth);
  const canvasHeight = useEditorStore(s => s.canvasHeight);
  const BLEED_PX = useEditorStore(s => s.BLEED_PX);
  const selectedObj = useEditorStore(s => s.selectedObj);
  const forceRender = useEditorStore(s => s.forceRender);
  const bgColor = useEditorStore(s => s.bgColor);

  return (
    <>
      {/* ── Left icon sidebar (Canva-style) ── */}
      <div className={`w-[72px] flex flex-col items-center py-3 gap-0.5 flex-shrink-0 ${
        activeTab ? "bg-white" : "bg-[#e5e5e5]"
      }`}>
        {SIDEBAR_ITEMS.map((item: any) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(activeTab === item.id ? null : item.id)}
            aria-label={`Onglet ${item.label}`}
            aria-pressed={activeTab === item.id}
            className={`relative flex flex-col items-center justify-center w-[58px] h-[58px] rounded-xl transition-all text-[10px] gap-0.5 ${
              activeTab === item.id
                ? "text-[#4f46e5] font-semibold"
                : item.id === "ia"
                  ? "text-purple-500 hover:text-purple-700 hover:bg-purple-50"
                  : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
            }`}
          >
            {activeTab === item.id && (
              <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-[#4f46e5]" />
            )}
            {item.badge && (
              <span className="absolute -top-0.5 -right-0.5 px-1 py-px text-[7px] font-bold bg-gradient-to-r from-purple-600 to-indigo-500 text-white rounded-full leading-tight">
                {item.badge}
              </span>
            )}
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
            </svg>
            <span className="leading-tight font-medium">{item.label}</span>
          </button>
        ))}
      </div>

      {/* ── Slide-out panel (Canva-style white) ── */}
      <div
        data-panel-scroll="1"
        className={`bg-white flex-shrink-0 overflow-y-auto overflow-x-hidden transition-all duration-200 scrollbar-thin ${
          activeTab ? "w-[300px] border-r border-gray-200" : "w-0"
        }`}
      >
        {activeTab && (
          <div key={activeTab} className="w-[300px] p-4 animate-[fadeSlideIn_0.15s_ease-out]">
            {/* Panel header with close */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800 text-[15px]">
                {SIDEBAR_ITEMS.find((s: any) => s.id === activeTab)?.panelTitle || SIDEBAR_ITEMS.find((s: any) => s.id === activeTab)?.label}
              </h3>
              <button
                type="button"
                onClick={() => setActiveTab(null)}
                aria-label="Fermer le panneau"
                className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            </div>

            {activeTab === "modeles" && (
              <PanelModeles currentFormat={format} currentGabarit={gabarit!} onSelect={onChangeGabarit ? (fmt: any, gab: any, keepContent?: boolean, prevDimsOverride?: { width: number; height: number }) => {
                // Gate history before the remount so the per-object events
                // fired by smartReposition (or createShootZones on fresh
                // start) don't pile up entries. useCanvasInit consumes
                // pendingFormatTransitionLabel after setReady and pushes
                // ONE consolidated entry stamped with the new format.
                // If the catalogue load has already set a more specific
                // label (e.g. "Modèle catalogue — XYZ"), preserve it.
                const s = useEditorStore.getState();
                s.suppressHistoryRef.current = true;
                if (!s.pendingFormatTransitionLabel) {
                  s.setPendingFormatTransitionLabel(
                    keepContent
                      ? `Changement de gabarit — ${fmt.name} / ${gab.name}`
                      : `Nouveau gabarit — ${fmt.name} / ${gab.name}`,
                  );
                }
                if (keepContent) {
                  // Save current canvas state so smartRepositionFromPreviousFormat can reuse elements.
                  // prevDimsOverride lets a caller (e.g. catalogue load that pre-scaled to the
                  // matched format's target dims) declare prevDims == newDims so the
                  // smart-reposition pass runs as a no-op.
                  const canvas = fabricRef.current;
                  if (canvas) {
                    const jsonObj = (canvas as any).toObject(CUSTOM_PROPS);
                    const canvasJson = JSON.stringify(jsonObj);
                    const dims = prevDimsOverride ?? { width: canvasWidth, height: canvasHeight };
                    onChangeGabarit(fmt, gab, canvasJson, dims);
                  } else {
                    onChangeGabarit(fmt, gab);
                  }
                } else {
                  // Fresh start — no previous state
                  onChangeGabarit(fmt, gab);
                }
              } : undefined} canvasRef={fabricRef} canvasWidth={canvasWidth} canvasHeight={canvasHeight} bleedPx={BLEED_PX} typeSlug={typeSlug} />
            )}
            {activeTab === "fonds" && (
              <PanelFonds
                bgColor={bgColor}
                presetColors={PRESET_COLORS}
                onColorChange={updateBgColor}
                onBgImageClick={onBgImageClick!}
                onBgImageSelect={(url: string) => {
                  // Remote URLs (Pexels/Pixabay) are used as-is with
                  // crossOrigin anonymous so canvasState stores a URL, not
                  // base64. Data URLs pass through unchanged.
                  addImageToCanvas(url, true);
                }}
                onGradient={applyGradientBg}
                onAddShootZone={addShootZone!}
                canvasRef={fabricRef}
              />
            )}
            {activeTab === "textes" && <PanelTextes onAddText={addText} onAddCurvedText={addCurvedText} onAddTextCombo={addTextCombo} />}
            {activeTab === "formes" && <PanelFormes onAddShape={addShape} />}
            {activeTab === "photos" && <PanelPhotos canvasRef={fabricRef} canvasWidth={canvasWidth} canvasHeight={canvasHeight} bleedPx={BLEED_PX} />}
            {activeTab === "upload" && <PanelUpload onUploadClick={() => fileInputRef?.current?.click()} uploadHistory={uploadHistory} onReAdd={(dataUrl: any) => addImageToCanvas(dataUrl, false)} onDelete={(id: any) => saveUploadHistory(uploadHistory.filter((u: any) => u.id !== id))} />}
            {activeTab === "ia" && <PanelIA canvasRef={fabricRef} canvasWidth={canvasWidth} canvasHeight={canvasHeight} bleedPx={BLEED_PX} />}
            {activeTab === "calques" && <PanelCalques canvasRef={fabricRef} selectedObj={selectedObj} onForceUpdate={() => forceRender((n: number) => n + 1)} />}
          </div>
        )}
      </div>
    </>
  );
}
export const Sidebar = SidebarComponent;
