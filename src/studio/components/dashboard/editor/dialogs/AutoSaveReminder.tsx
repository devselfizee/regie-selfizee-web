"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditorStore } from "../store/editorStore";

/* eslint-disable @typescript-eslint/no-explicit-any */

const REMIND_AFTER_MS = 5 * 60 * 1000; // 5 minutes without save
const SNOOZE_MS = 5 * 60 * 1000;       // snooze for 5 more minutes on "Plus tard"
const CHECK_INTERVAL_MS = 20_000;       // check every 20s

interface AutoSaveReminderProps {
  lastSavedAt: number;
  handleSave: (force?: boolean) => void;
}

export function AutoSaveReminder({ lastSavedAt, handleSave }: AutoSaveReminderProps) {
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const historyVersion = useEditorStore(s => s.historyVersion);
  const snoozeUntilRef = useRef<number>(0);
  // Track historyVersion at last save to know if there are unsaved changes
  const savedVersionRef = useRef<number>(0);

  // Update savedVersionRef whenever a save completes
  useEffect(() => {
    if (lastSavedAt > 0) {
      savedVersionRef.current = historyVersion;
      setVisible(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSavedAt]);

  useEffect(() => {
    const check = () => {
      const now = Date.now();
      if (now < snoozeUntilRef.current) return;
      const hasUnsaved = historyVersion > savedVersionRef.current;
      if (!hasUnsaved) return;
      const timeSinceSave = lastSavedAt === 0 ? now : now - lastSavedAt;
      if (timeSinceSave >= REMIND_AFTER_MS) {
        setVisible(true);
      }
    };
    const id = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [historyVersion, lastSavedAt]);

  if (!visible) return null;

  const minutesAgo = lastSavedAt === 0
    ? null
    : Math.max(1, Math.round((Date.now() - lastSavedAt) / 60_000));

  const handleSaveNow = async () => {
    setSaving(true);
    handleSave(true);
    // Give save a moment to trigger then close
    await new Promise(r => setTimeout(r, 600));
    setSaving(false);
    setVisible(false);
  };

  const handleLater = () => {
    snoozeUntilRef.current = Date.now() + SNOOZE_MS;
    setVisible(false);
  };

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
        style={{ background: "rgba(15, 10, 30, 0.55)", backdropFilter: "blur(3px)" }}
        onClick={handleLater}
      >
        {/* Card */}
        <div
          className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[400px] overflow-hidden"
          style={{ animation: "autosave-in 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
          onClick={e => e.stopPropagation()}
        >
          <style>{`
            @keyframes autosave-in {
              from { opacity: 0; transform: scale(0.88) translateY(12px); }
              to   { opacity: 1; transform: scale(1)    translateY(0); }
            }
            @keyframes pulse-ring {
              0%, 100% { transform: scale(1); opacity: 0.6; }
              50%       { transform: scale(1.15); opacity: 0.3; }
            }
          `}</style>

          {/* Gradient header strip */}
          <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg, #4f46e5, #4f46e5, #3b82f6)" }} />

          <div className="p-7">
            {/* Icon */}
            <div className="relative w-16 h-16 mx-auto mb-5 flex items-center justify-center">
              {/* Pulse ring */}
              <div className="absolute inset-0 rounded-full bg-amber-100" style={{ animation: "pulse-ring 2s ease-in-out infinite" }} />
              <div className="relative w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center border-2 border-amber-200">
                <svg className="w-7 h-7 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>

            {/* Text */}
            <h2 className="text-[18px] font-bold text-gray-900 text-center leading-snug mb-2">
              Votre travail n&apos;est pas encore sauvegardé
            </h2>
            <p className="text-sm text-gray-500 text-center leading-relaxed mb-7">
              {minutesAgo
                ? <>Dernière sauvegarde il y a <span className="font-semibold text-gray-700">{minutesAgo} min</span>. Pensez à sauvegarder régulièrement pour ne rien perdre.</>
                : <>Vous avez effectué des modifications. Sauvegardez pour ne rien perdre.</>
              }
            </p>

            {/* Buttons */}
            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleSaveNow}
                disabled={saving}
                className="w-full h-12 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2.5 transition-all active:scale-[0.98]"
                style={{
                  background: saving
                    ? "#a5b4fc"
                    : "linear-gradient(135deg, #4f46e5 0%, #4f46e5 60%, #4338ca 100%)",
                  boxShadow: saving ? "none" : "0 4px 20px rgba(124,58,237,0.35)",
                }}
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Enregistrement…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                    Enregistrer maintenant
                  </>
                )}
              </button>
              <button
                onClick={handleLater}
                className="w-full h-11 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors border border-gray-200"
              >
                Plus tard
              </button>
            </div>
          </div>

          {/* Dismiss X */}
          <button
            onClick={handleLater}
            className="absolute top-4 right-4 w-7 h-7 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
