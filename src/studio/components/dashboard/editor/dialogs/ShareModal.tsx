"use client";

import React from "react";
import { toast } from "../../Toast";
import { apiUrl } from "@/studio/lib/api";

/* ═══════════════════════════════════════════════════════════════
   ShareModal — Canva-style share dialog with link, email, and
   quick export actions.
   ═══════════════════════════════════════════════════════════════ */

interface ShareModalProps {
  shareUrl: string | null;
  shareAccess: "edit" | "view";
  setShareAccess: (v: "edit" | "view") => void;
  shareCopied: boolean;
  copyShareLink: () => void;
  shareEmailTo: string;
  setShareEmailTo: (v: string) => void;
  shareEmailMsg: string;
  setShareEmailMsg: (v: string) => void;
  shareEmailSending: boolean;
  setShareEmailSending: (v: boolean) => void;
  shareEmailSent: boolean;
  setShareEmailSent: (v: boolean) => void;
  frameName: string;
  onClose: () => void;
  onDownloadPNG: () => void;
}

export function ShareModal({
  shareUrl, shareAccess, setShareAccess,
  shareCopied, copyShareLink,
  shareEmailTo, setShareEmailTo, shareEmailMsg, setShareEmailMsg,
  shareEmailSending, setShareEmailSending, shareEmailSent, setShareEmailSent,
  frameName, onClose, onDownloadPNG,
}: ShareModalProps) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[780px] max-w-[95vw] max-h-[90vh] overflow-hidden flex" onClick={(e) => e.stopPropagation()}>
        {/* Left: illustration */}
        <div className="hidden sm:flex w-[260px] flex-shrink-0 bg-gradient-to-b from-[#e0e7ff] via-[#e0e7ff] to-[#e0f2fe] flex-col items-center justify-center p-8 text-center">
          <div className="w-20 h-20 bg-white/80 rounded-2xl flex items-center justify-center shadow-sm mb-5">
            <svg className="w-12 h-12" viewBox="0 0 48 48" fill="none">
              <circle cx="16" cy="14" r="6" fill="#4f46e5" opacity="0.8" />
              <circle cx="34" cy="14" r="6" fill="#a5b4fc" opacity="0.6" />
              <path d="M8 40c0-6.6 5.4-12 12-12h8c6.6 0 12 5.4 12 8" stroke="#4f46e5" strokeWidth="2.5" fill="none" opacity="0.4" />
              <path d="M28 34l3 3 6-6" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="6" y="24" width="12" height="9" rx="2" fill="#4f46e5" opacity="0.15" />
              <path d="M9 27h6M9 30h4" stroke="#4f46e5" opacity="0.4" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-[#4338ca] mb-2">Collaborez en temps réel</h3>
          <p className="text-xs text-[#4338ca]/60 leading-relaxed">
            Invitez un collègue ou un graphiste pour travailler sur ce cadre à votre place. Il pourra modifier le design directement depuis son navigateur.
          </p>
          <div className="mt-6 flex items-center gap-2">
            <div className="flex -space-x-2">
              <div className="w-7 h-7 rounded-full bg-[#4f46e5] border-2 border-white flex items-center justify-center text-white text-[10px] font-bold">V</div>
              <div className="w-7 h-7 rounded-full bg-[#a5b4fc] border-2 border-white flex items-center justify-center text-white text-[10px] font-bold">M</div>
              <div className="w-7 h-7 rounded-full bg-[#c7d2fe] border-2 border-white flex items-center justify-center text-[#4338ca] text-[10px] font-bold">+</div>
            </div>
            <span className="text-[10px] text-[#4338ca]/50">Éditeurs actifs</span>
          </div>
        </div>

        {/* Right: form */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <h2 className="text-lg font-bold text-[#0d1216]">Partager ce design</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="px-6 pb-6 space-y-5">
            {/* Access level */}
            <div>
              <p className="text-sm font-semibold text-[#0d1216] mb-2">Niveau d&apos;accès</p>
              <div className="flex items-center gap-3 p-3 bg-[#f8f8fc] rounded-xl border border-gray-100">
                <div className="w-9 h-9 rounded-full bg-[#e0e7ff] flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-[#4f46e5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-[#0d1216]">Quiconque ayant le lien</p>
                  <p className="text-[11px] text-gray-400">Visible par tous ceux qui ont le lien</p>
                </div>
                <select value={shareAccess} onChange={(e) => setShareAccess(e.target.value as "edit" | "view")} className="text-sm font-medium text-[#0d1216] bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#4f46e5]">
                  <option value="edit">Modifier</option>
                  <option value="view">Consulter</option>
                </select>
              </div>
            </div>

            {/* Link */}
            {shareUrl ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 bg-[#f8f8fc] rounded-xl px-3 py-2.5 border border-gray-100">
                  <svg className="w-4 h-4 text-[#4f46e5]/50 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                  <input type="text" readOnly value={shareUrl} className="flex-1 text-sm text-gray-500 bg-transparent outline-none truncate" onClick={(e) => (e.target as HTMLInputElement).select()} />
                </div>
                <button onClick={copyShareLink} className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${shareCopied ? "bg-emerald-500 text-white" : "bg-gradient-to-r from-[#4f46e5] to-[#a5b4fc] text-white hover:shadow-lg hover:shadow-purple-200"}`}>
                  {shareCopied ? (<><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>Lien copié !</>) : (<><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>Copier le lien</>)}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center py-4">
                <div className="w-6 h-6 border-2 border-[#4f46e5] border-t-transparent rounded-full animate-spin" />
                <span className="ml-2 text-sm text-gray-500">Génération du lien...</span>
              </div>
            )}

            {/* Email */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-semibold text-[#0d1216] mb-2">Envoyer par email</p>
              <div className="space-y-2">
                <input type="email" placeholder="adresse@email.com" value={shareEmailTo} onChange={(e) => setShareEmailTo(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5]/20 bg-[#f8f8fc] transition-all" />
                <textarea placeholder="Message personnalisé (optionnel)" value={shareEmailMsg} onChange={(e) => setShareEmailMsg(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5]/20 bg-[#f8f8fc] resize-none transition-all" />
                <button
                  onClick={async () => {
                    if (!shareEmailTo || !shareUrl) return;
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shareEmailTo.trim())) { toast("Adresse email invalide", "error"); return; }
                    setShareEmailSending(true);
                    try {
                      const { fetchWithTimeout } = await import("../canvas/canvasUtils");
                      const res = await fetchWithTimeout(apiUrl("/api/send-share-email"), {
                        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include" as RequestCredentials,
                        body: JSON.stringify({ to: shareEmailTo, shareUrl, message: shareEmailMsg, senderName: frameName || "Un utilisateur Selfizee", subject: `${frameName || "Un design Selfizee"} a été partagé avec vous` }),
                        timeoutMs: 20000,
                      });
                      if (!res.ok) throw new Error("Erreur");
                      setShareEmailSent(true); setShareEmailTo(""); setShareEmailMsg("");
                      setTimeout(() => setShareEmailSent(false), 4000);
                    } catch { toast("Erreur lors de l'envoi de l'email.", "error"); }
                    setShareEmailSending(false);
                  }}
                  disabled={!shareEmailTo || shareEmailSending}
                  className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${shareEmailSent ? "bg-emerald-500 text-white" : "bg-[#0d1216] text-white hover:bg-[#1a1f25] disabled:opacity-40"}`}
                >
                  {shareEmailSending ? (<svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>) : shareEmailSent ? (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>) : (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>)}
                  {shareEmailSending ? "Envoi..." : shareEmailSent ? "Email envoyé !" : "Envoyer l'invitation"}
                </button>
              </div>
            </div>

            {/* Quick actions */}
            <div className="border-t border-gray-100 pt-3">
              <div className="flex gap-3 justify-center">
                <button onClick={() => { onClose(); onDownloadPNG(); }} className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl hover:bg-[#f8f8fc] transition-colors group">
                  <div className="w-9 h-9 rounded-lg bg-[#f0f0f5] group-hover:bg-[#e8e8f0] flex items-center justify-center transition-colors">
                    <svg className="w-4 h-4 text-[#4b5563]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  </div>
                  <span className="text-[10px] font-medium text-gray-500">PNG</span>
                </button>
                <button onClick={() => { if (shareUrl) window.open(shareUrl, "_blank"); }} className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl hover:bg-[#f8f8fc] transition-colors group">
                  <div className="w-9 h-9 rounded-lg bg-[#f0f0f5] group-hover:bg-[#e8e8f0] flex items-center justify-center transition-colors">
                    <svg className="w-4 h-4 text-[#4b5563]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  </div>
                  <span className="text-[10px] font-medium text-gray-500">Aperçu</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default React.memo(ShareModal);
