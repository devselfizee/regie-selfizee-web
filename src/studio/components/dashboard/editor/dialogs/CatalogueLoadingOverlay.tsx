"use client";

import React from "react";
import { useEditorStore } from "../store/editorStore";

/**
 * Full-viewport, semi-transparent loading overlay shown while a Selfizee
 * catalogue model is being applied to the canvas. Driven by the
 * `cataloguePending` flag in the editor store so it survives the
 * format-switch remount that fires mid-load.
 *
 * Visual: light backdrop blur + centered card with a fluid spinner and
 * the current loading message. Pointer events are blocked by the
 * backdrop so the user can't click another template mid-load.
 */
export function CatalogueLoadingOverlay() {
  const message = useEditorStore((s) => s.cataloguePending);
  const visible = !!message;
  // Tailwind's transition utilities animate opacity / pointer-events when
  // we toggle classes — keep the element mounted so the fade-out plays
  // even after pending is cleared.
  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-0 z-[10000] flex items-center justify-center transition-opacity duration-200 ${
        visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-white/40 backdrop-blur-sm" />

      {/* Card */}
      <div
        role="status"
        aria-live="polite"
        className="relative flex flex-col items-center gap-4 px-8 py-7 rounded-2xl bg-white/90 shadow-2xl ring-1 ring-black/5 max-w-sm mx-4"
      >
        {/* Animated spinner — gradient ring */}
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-4 border-gray-200" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#4f46e5] border-r-[#4f46e5] animate-spin" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-gray-800">
            {message || "Chargement du modèle"}
          </p>
          <p className="text-xs text-gray-500">
            Veuillez patienter pendant le chargement du contenu.
          </p>
        </div>
      </div>
    </div>
  );
}

export default CatalogueLoadingOverlay;
