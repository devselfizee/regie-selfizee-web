"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * Choix proposé après un enregistrement réussi depuis l'espace client.
 *
 * Avant, le studio renvoyait d'office vers la configuration : impossible
 * d'enregistrer une étape intermédiaire et de continuer à travailler. On pose
 * la question au lieu de décider à la place du client.
 *
 * Échap et le clic en dehors valent « je reste » — la sortie ne doit jamais
 * être déclenchée par accident.
 */
export function SavedChoiceDialog({
  open,
  onStay,
  onLeave,
}: {
  open: boolean;
  onStay: () => void;
  onLeave: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onStay();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onStay]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      style={{ background: "rgba(15, 10, 30, 0.55)", backdropFilter: "blur(3px)" }}
      onClick={onStay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="saved-choice-title"
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[420px] overflow-hidden"
        style={{ animation: "saved-choice-in 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`
          @keyframes saved-choice-in {
            from { opacity: 0; transform: scale(0.88) translateY(12px); }
            to   { opacity: 1; transform: scale(1)    translateY(0); }
          }
        `}</style>

        <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg, #4f46e5, #4f46e5, #10b981)" }} />

        <div className="p-7">
          <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center">
            <svg className="w-7 h-7 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h2
            id="saved-choice-title"
            className="text-[18px] font-bold text-gray-900 text-center leading-snug mb-2"
          >
            Votre cadre est enregistré
          </h2>
          <p className="text-sm text-gray-500 text-center leading-relaxed mb-7">
            Vous pouvez continuer à le modifier, ou revenir à la fiche événement du
            lieu. Rien ne sera perdu.
          </p>

          <div className="flex flex-col gap-2.5">
            <button
              onClick={onLeave}
              className="w-full h-12 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2.5 transition-all active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, #4f46e5 0%, #4f46e5 60%, #4338ca 100%)",
                boxShadow: "0 4px 20px rgba(79,70,229,0.35)",
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Revenir à la fiche événement
            </button>
            <button
              onClick={onStay}
              autoFocus
              className="w-full h-11 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors border border-gray-200"
            >
              Continuer à modifier
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
