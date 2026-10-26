"use client";

import { useState } from "react";
import { type Format, type Gabarit } from "@/studio/lib/gabarits";
import { CUSTOM_PROPS } from "../types";
import { randomId } from "../canvas/canvasUtils";
import { useTypeFormats } from "../hooks/useTypeFormats";
import { useEditorStore } from "../store/editorStore";

/* ═══ BG IMAGE REPLACE CONFIRM ═══ */
export function BgReplaceConfirm({ show, onConfirm, onCancel }: { show: boolean; onConfirm: () => void; onCancel: () => void }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-[420px] max-w-[90vw] p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-[#4f46e5]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-gray-800 mb-2">Remplacer l&apos;image de fond ?</h3>
        <p className="text-sm text-gray-500 mb-5">Une image de fond est d&eacute;j&agrave; pr&eacute;sente. Voulez-vous la remplacer par la nouvelle ?</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors">
            Annuler
          </button>
          <button onClick={onConfirm} className="flex-1 px-4 py-2.5 bg-[#4f46e5] text-white text-sm font-semibold rounded-xl hover:bg-[#4338ca] transition-colors">
            Remplacer
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══ SHOOT DELETE ALERT ═══ */
export function ShootDeleteAlert(props: any) {
  const { showShootDeleteAlert, setShowShootDeleteAlert } = props;

  if (!showShootDeleteAlert) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowShootDeleteAlert(false)}>
      <div className="bg-white rounded-2xl shadow-2xl w-[420px] max-w-[90vw] p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-gray-800 mb-2">Impossible de supprimer</h3>
        <p className="text-sm text-gray-500 mb-1">En mode cadre photo, il doit y avoir <strong>au moins une zone de shoot</strong>.</p>
        <p className="text-sm text-gray-400 mb-5">Ajoutez un nouveau shoot avant de supprimer celui-ci, ou modifiez-le au lieu de le supprimer.</p>
        <button
          onClick={() => setShowShootDeleteAlert(false)}
          className="px-6 py-2.5 bg-[#4f46e5] text-white text-sm font-semibold rounded-xl hover:bg-[#4338ca] transition-colors"
        >
          Compris
        </button>
      </div>
    </div>
  );
}

/* ═══ MARGIN CHECK MODAL ═══ */
export function MarginCheckModal(props: any) {
  const {
    showMarginCheck,
    setShowMarginCheck,
    setPendingSaveAfterCheck,
    marginWarnings,
    PRINT_MARGIN,
    marginCheckPreview,
    pendingSaveAfterCheck,
    handleSave,
    setShowPrintMargins,
  } = props;

  if (!showMarginCheck) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => { setShowMarginCheck(false); setPendingSaveAfterCheck(false); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-[680px] max-w-[95vw] max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Vérification des marges d&apos;impression</h2>
              <p className="text-sm text-gray-500">{marginWarnings.length} élément{marginWarnings.length > 1 ? "s" : ""} dans la zone de coupe</p>
            </div>
          </div>
          <button onClick={() => { setShowMarginCheck(false); setPendingSaveAfterCheck(false); }} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Preview image with margin overlay */}
        <div className="px-6 py-4 flex-1 overflow-auto">
          <p className="text-sm text-gray-600 mb-4">
            Les éléments ci-dessous se trouvent dans la <strong>zone de marge ({PRINT_MARGIN}px)</strong>. Ils risquent d&apos;être partiellement ou totalement coupés lors de l&apos;impression.
          </p>

          {/* Preview */}
          {marginCheckPreview && (
            <div className="relative rounded-lg overflow-hidden border border-gray-200 shadow-sm mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={marginCheckPreview} alt="Aperçu des marges" className="w-full h-auto" />
            </div>
          )}

          {/* Warning list */}
          <div className="space-y-2">
            {marginWarnings.map((w: any, i: number) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200">
                <div className="flex-shrink-0">
                  {w.type === "Texte" ? (
                    <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h8m-8 6h16" />
                    </svg>
                  ) : w.type === "Image" ? (
                    <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {w.type} : {w.name}
                  </p>
                  <p className="text-xs text-amber-700">
                    Dépasse de {w.overflow}px — côté {w.side}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button
            onClick={() => {
              setShowMarginCheck(false);
              setPendingSaveAfterCheck(false);
              setShowPrintMargins(true);
            }}
            className="flex-1 px-5 py-2.5 bg-white border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors text-sm"
          >
            Modifier ma création
          </button>
          <button
            onClick={() => {
              setShowMarginCheck(false);
              if (pendingSaveAfterCheck) {
                setPendingSaveAfterCheck(false);
                handleSave(true);
              }
            }}
            className="flex-1 px-5 py-2.5 bg-[#4f46e5] text-white font-semibold rounded-xl hover:bg-[#e0014a] transition-colors text-sm"
          >
            Confirmer et enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══ FORMAT PICKER MODAL ═══ */
export function FormatPickerModal(props: any) {
  const {
    showFormatPicker,
    setShowFormatPicker,
    onChangeGabarit,
    format,
    gabarit,
    fabricRef,
    canvasWidth,
    canvasHeight,
    typeSlug,
  } = props;
  const { formats: typeFormats } = useTypeFormats(typeSlug);

  const [pendingChoice, setPendingChoice] = useState<{ format: Format; gabarit: Gabarit } | null>(null);

  if (!showFormatPicker || !onChangeGabarit) return null;

  const applyChoice = (keepContent: boolean) => {
    if (!pendingChoice) return;
    // Gate history before the remount: the per-object events fired by
    // smartReposition (or createShootZones on fresh start) would otherwise
    // pile up entries. useCanvasInit consumes pendingFormatTransitionLabel
    // after setReady and pushes ONE consolidated entry stamped with the
    // new format — undo from that entry then routes back via the parent.
    const s = useEditorStore.getState();
    s.suppressHistoryRef.current = true;
    s.setPendingFormatTransitionLabel(
      keepContent
        ? `Changement de format — ${pendingChoice.format.name} / ${pendingChoice.gabarit.name}`
        : `Nouveau format — ${pendingChoice.format.name} / ${pendingChoice.gabarit.name}`,
    );
    if (keepContent) {
      const canvas = fabricRef.current;
      if (canvas) {
        const jsonObj = (canvas as any).toObject(CUSTOM_PROPS);
        const canvasJson = JSON.stringify(jsonObj);
        onChangeGabarit(pendingChoice.format, pendingChoice.gabarit, canvasJson, { width: canvasWidth, height: canvasHeight });
      } else {
        onChangeGabarit(pendingChoice.format, pendingChoice.gabarit);
      }
    } else {
      onChangeGabarit(pendingChoice.format, pendingChoice.gabarit);
    }
    setPendingChoice(null);
    setShowFormatPicker(false);
  };

  // ── Confirmation popup (3 buttons) ──
  if (pendingChoice) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setPendingChoice(null)}>
        <div className="bg-white rounded-2xl shadow-2xl w-[420px] max-w-[90vw] p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0d1216]">Changer de gabarit</h3>
              <p className="text-xs text-gray-500 mt-0.5">{pendingChoice.format.name} — {pendingChoice.gabarit.name}</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            Choisissez comment appliquer ce gabarit. Vous pouvez repartir de zéro ou conserver vos éléments actuels.
          </p>
          <div className="space-y-2">
            <button
              onClick={() => applyChoice(true)}
              className="w-full py-2.5 rounded-xl font-semibold text-sm bg-[#4f46e5] text-white hover:bg-[#4338ca] transition-colors"
            >
              Charger les éléments existants
            </button>
            <button
              onClick={() => applyChoice(false)}
              className="w-full py-2.5 rounded-xl font-semibold text-sm border-2 border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Repartir d&apos;un nouveau gabarit
            </button>
            <button
              onClick={() => setPendingChoice(null)}
              className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Format/gabarit picker grid ──
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowFormatPicker(false)}>
      <div className="bg-white rounded-2xl shadow-2xl w-[680px] max-w-[95vw] max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Changer de format</h2>
            <p className="text-sm text-gray-400">Format actuel : {format.name} — {gabarit.name}</p>
          </div>
          <button onClick={() => setShowFormatPicker(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 pb-6 overflow-y-auto">
          {typeFormats.map((fmt: Format) => (
            <div key={fmt.id} className="mb-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">{fmt.name}</h3>
              <div className="grid grid-cols-3 gap-3">
                {fmt.gabarits.map((gab) => {
                  const isCurrent = fmt.id === format.id && gab.id === gabarit.id;
                  return (
                    <button
                      key={gab.id}
                      disabled={isCurrent}
                      onClick={() => setPendingChoice({ format: fmt, gabarit: gab })}
                      className={`rounded-xl border-2 p-4 text-left transition-all ${
                        isCurrent
                          ? "border-[#4f46e5] bg-purple-50 cursor-default"
                          : "border-gray-200 hover:border-[#4f46e5] hover:shadow-md cursor-pointer"
                      }`}
                    >
                      <div className="relative w-full aspect-[4/3] bg-gray-100 rounded-lg mb-2 overflow-hidden">
                        {gab.photoZones.map((zone, zi) => (
                          <div
                            key={zi}
                            className="absolute bg-[#4f46e5]/20 border border-[#4f46e5]/40 rounded-sm flex items-center justify-center"
                            style={{
                              left: `${zone.x}%`, top: `${zone.y}%`,
                              width: `${zone.w}%`, height: `${zone.h}%`,
                            }}
                          >
                            <span className="text-[8px] font-bold text-[#4f46e5]">#{zi + 1}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs font-semibold text-gray-800">{gab.name}</p>
                      {gab.photoZones.length > 0 && (
                        <p className="text-[10px] text-gray-400">{gab.photoZones.length} zone{gab.photoZones.length > 1 ? "s" : ""} photo</p>
                      )}
                      {isCurrent && <span className="text-[10px] text-[#4f46e5] font-medium">Actuel</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══ PDF PAGE PICKER MODAL ═══ */
export function PdfPagePickerModal(props: any) {
  const {
    showPdfPicker,
    setShowPdfPicker,
    pdfPages,
    pdfFileName,
    addImageToCanvas,
    uploadHistory,
    saveUploadHistory,
  } = props;

  if (!showPdfPicker || !pdfPages || pdfPages.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowPdfPicker(false)}>
      <div className="bg-white rounded-2xl shadow-2xl w-[780px] max-w-[95vw] max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Importer depuis le PDF</h2>
            <p className="text-sm text-gray-400">{pdfFileName} — {pdfPages.length} page{pdfPages.length > 1 ? "s" : ""}</p>
          </div>
          <button onClick={() => setShowPdfPicker(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 pb-4">
          <button
            onClick={() => {
              pdfPages.forEach((p: any) => addImageToCanvas(p.dataUrl, false, 0.9));
              const entry = { id: randomId(), dataUrl: pdfPages[0].dataUrl, name: pdfFileName, date: Date.now() };
              saveUploadHistory([entry, ...uploadHistory]);
              setShowPdfPicker(false);
            }}
            className="w-full py-2 rounded-xl bg-[#4f46e5] text-white text-sm font-semibold hover:bg-[#4338ca] transition-colors"
          >
            Importer toutes les pages ({pdfPages.length})
          </button>
        </div>
        <div className="px-6 pb-6 overflow-y-auto">
          <p className="text-xs text-gray-500 font-medium mb-3">Ou sélectionnez une page :</p>
          <div className="grid grid-cols-3 gap-3">
            {pdfPages.map((page: any) => (
              <button
                key={page.pageNum}
                onClick={() => {
                  addImageToCanvas(page.dataUrl, false, 0.9);
                  const entry = { id: randomId(), dataUrl: page.dataUrl, name: `${pdfFileName} (p${page.pageNum})`, date: Date.now() };
                  saveUploadHistory([entry, ...uploadHistory]);
                  setShowPdfPicker(false);
                }}
                className="group relative rounded-xl overflow-hidden border-2 border-gray-200 hover:border-[#4f46e5] hover:shadow-lg transition-all bg-gray-50"
              >
                <img src={page.dataUrl} alt={`Page ${page.pageNum}`} className="w-full aspect-[3/4] object-contain bg-white" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-full p-1.5 shadow-lg">
                    <svg className="w-4 h-4 text-[#4f46e5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-1.5">
                  <span className="text-white text-[11px] font-bold">Page {page.pageNum}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
