"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import React from "react";
import { useEditorStore } from "../store/editorStore";
import { randomId } from "../canvas/canvasUtils";
import { apiUrl } from "@/studio/lib/api";
import { useLoadingClick } from "../hooks/useLoadingClick";
import { ThumbSpinner } from "./ThumbSpinner";

const BACKEND_BASE = process.env.NEXT_PUBLIC_STUDIO_BACKEND_URL || "";
const resolveBackendUrl = (u: string) =>
  // Studio interne Kalifun : /editor-api/generate-image renvoie une data URL
  // → la laisser telle quelle (comme les URLs absolues http(s)).
  /^(https?:\/\/|data:|blob:)/i.test(u) ? u : `${BACKEND_BASE}${u.startsWith("/") ? "" : "/"}${u}`;

// Suggestions when NO reference image is provided
const SUGGESTIONS_NO_REF = [
  "Un arrière-plan festif avec des confettis dorés",
  "Un fond dégradé bleu et violet lumineux",
  "Un décor élégant avec des fleurs blanches et roses",
  "Un fond abstrait géométrique moderne",
  "Un paysage de coucher de soleil sur la mer",
  "Un motif tropical avec des feuilles de palmier",
];

// Suggestions when reference image(s) are provided
const SUGGESTIONS_WITH_REF = [
  "Même style mais avec des tons plus chauds",
  "Rends-le plus festif et coloré",
  "Garde les couleurs, change le style en plus moderne",
  "Ajoute des éléments dorés et brillants",
  "Version plus épurée et minimaliste",
  "Même ambiance mais avec un fond plus sombre",
];

interface RefImage {
  id: string;
  dataUrl: string; // for preview
  mimeType: string;
  base64: string; // raw base64 (no prefix)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function PanelIA({ canvasRef, canvasWidth, canvasHeight, bleedPx = 0 }: { canvasRef: React.RefObject<any>; canvasWidth: number; canvasHeight: number; bleedPx?: number }) {
  const eventId = useEditorStore(s => s.eventId);
  const selectedObj = useEditorStore(s => s.selectedObj);

  // True if the currently selected object is a FabricImage (editable via IA)
  const isEditingImage = !!(selectedObj && (selectedObj.type === "image" || selectedObj.type === "Image"));

  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<{ prompt: string; url: string }[]>([]);
  const [aspectRatio, setAspectRatio] = useState<"3:4" | "4:3" | "1:1">("3:4");

  // Credit system
  const [credits, setCredits] = useState<number | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(true);

  // Reference images
  const [refImages, setRefImages] = useState<RefImage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { loadingKey: histLoadingKey, run: histRun } = useLoadingClick();

  // Abort any in-flight generation request on unmount so async state
  // updates don't land on a dead component.
  const abortRef = useRef<AbortController | null>(null);
  // Track mount state to gate post-await setState calls
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortRef.current) {
        try { abortRef.current.abort(); } catch { /* ignore */ }
      }
    };
  }, []);

  // Fetch credits on mount and when eventId changes
  const fetchCredits = useCallback(async () => {
    if (!eventId) return;
    try {
      const { fetchWithTimeout } = await import("../canvas/canvasUtils");
      const res = await fetchWithTimeout(apiUrl(`/api/events/${eventId}/ai-credits`), { timeoutMs: 15000, credentials: "include" as RequestCredentials });
      if (!mountedRef.current) return;
      if (res.ok) {
        const data = await res.json();
        if (mountedRef.current) setCredits(data.credits);
      }
    } catch {
      // silently fail — network/timeout
    } finally {
      if (mountedRef.current) setCreditsLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  // Handle reference image upload
  const handleRefImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).slice(0, 3 - refImages.length).forEach(file => {
      if (!file.type.startsWith("image/")) return;
      if (file.size > 5 * 1024 * 1024) return; // 5MB max per image

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        // Extract base64 without prefix
        const base64 = dataUrl.split(",")[1];
        setRefImages(prev => {
          if (prev.length >= 3) return prev;
          return [...prev, {
            id: randomId(),
            dataUrl,
            mimeType: file.type,
            base64,
          }];
        });
      };
      reader.readAsDataURL(file);
    });

    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const removeRefImage = (id: string) => {
    setRefImages(prev => prev.filter(img => img.id !== id));
  };

  const generate = async (text?: string) => {
    const q = (text || prompt).trim();
    if (!q) return;
    if (credits !== null && credits <= 0) {
      setError("Crédits IA épuisés.");
      return;
    }

    setGenerating(true);
    setError("");
    try {
      // Abort any previous in-flight generation (second click before
      // the first finished) and track the new controller on a ref so
      // unmount can cancel it.
      if (abortRef.current) {
        try { abortRef.current.abort(); } catch { /* ignore */ }
      }
      const controller = new AbortController();
      abortRef.current = controller;
      const timeout = setTimeout(() => controller.abort(), 60000);

      const body: Record<string, unknown> = {
        prompt: q,
        aspectRatio,
        ...(eventId && { eventId }),
      };

      // If editing an existing image on canvas, use it as the sole reference
      // so the IA modifies it rather than generating something new.
      const references: { mimeType: string; data: string }[] = [];
      if (isEditingImage && selectedObj) {
        try {
          // Export the selected image to a data URL
          const srcDataUrl = typeof selectedObj.toDataURL === "function"
            ? selectedObj.toDataURL({ format: "png" })
            : null;
          if (srcDataUrl && srcDataUrl.startsWith("data:image/")) {
            const m = srcDataUrl.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
            if (m) references.push({ mimeType: m[1], data: m[2] });
          }
        } catch { /* ignore — fallback to plain generate */ }
      }
      // Append user-uploaded references
      for (const img of refImages) {
        references.push({ mimeType: img.mimeType, data: img.base64 });
      }
      if (references.length > 0) {
        body.referenceImages = references;
      }

      const res = await fetch(apiUrl("/api/generate-image"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.code === "NO_CREDITS") {
          setCredits(0);
        }
        throw new Error(data.error || `Erreur ${res.status}`);
      }

      // Update credits from header
      const remaining = res.headers.get("X-AI-Credits-Remaining");
      if (remaining !== null) {
        setCredits(parseInt(remaining, 10));
      }

      // Backend now persists the image and returns { id, url, prompt }
      const data = await res.json();
      const finalSrc = data.url ? resolveBackendUrl(data.url) : "";
      if (!finalSrc) throw new Error("URL d'image manquante dans la réponse.");
      setPrompt("");

      if (!mountedRef.current) return;
      const fabric = await import("fabric");
      const canvas = canvasRef.current;
      if (!canvas || !mountedRef.current) return;

      // Store the backend URL in history.
      setHistory((prev) => [{ prompt: q, url: finalSrc }, ...prev.slice(0, 9)]);

      // Edit mode: replace the selected image's source in-place.
      if (isEditingImage && selectedObj && typeof selectedObj.setSrc === "function") {
        try {
          await selectedObj.setSrc(finalSrc, { crossOrigin: "anonymous" });
          selectedObj.setCoords?.();
          canvas.fire("object:modified", { target: selectedObj, _historyLabel: "Image modifiée par IA" });
          canvas.renderAll();
        } catch {
          if (mountedRef.current) setError("Impossible de mettre à jour l'image.");
        }
        return;
      }

      const imgEl = document.createElement("img");
      imgEl.crossOrigin = "anonymous";
      imgEl.onload = () => {
        if (!mountedRef.current || !canvasRef.current) return;
        const img = new fabric.FabricImage(imgEl, { crossOrigin: "anonymous" });
        const maxDim = Math.min(canvasWidth, canvasHeight) * 0.6;
        const scale = maxDim / Math.max(img.width!, img.height!);
        img.set({
          scaleX: scale,
          scaleY: scale,
          left: bleedPx + canvasWidth / 2,
          top: bleedPx + canvasHeight / 2,
          originX: "center",
          originY: "center",
        });
        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.renderAll();
      };
      imgEl.onerror = () => {
        if (!mountedRef.current) return;
        setError("Impossible de charger l'image générée.");
      };
      imgEl.src = finalSrc;
    } catch (err) {
      // AbortError is expected on unmount/cancel — don't surface it
      if (err instanceof Error && err.name === "AbortError") return;
      if (mountedRef.current) setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      abortRef.current = null;
      if (mountedRef.current) setGenerating(false);
    }
  };

  const noCredits = credits !== null && credits <= 0;
  const hasRef = refImages.length > 0 || isEditingImage;
  const suggestions = hasRef ? SUGGESTIONS_WITH_REF : SUGGESTIONS_NO_REF;
  const placeholder = isEditingImage
    ? "Décrivez la modification... Ex: Enlève le texte, Change le fond en bleu..."
    : hasRef
    ? "Que voulez-vous faire avec ces images ? Ex: Même style en bleu, Plus festif..."
    : "Décrivez ce que vous voulez... Ex: Fond festif doré, Paysage tropical...";

  return (
    <div className="space-y-4">
      {/* ── Hero intro block ── */}
      <div className="rounded-xl bg-gradient-to-br from-[#4f46e5]/10 via-purple-50 to-indigo-50 p-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#4f46e5] to-[#ec4899] flex items-center justify-center flex-shrink-0">
            <svg className="w-[18px] h-[18px] text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-[12px] font-bold text-gray-800">Créez avec l&apos;IA</p>
              <span className="px-1.5 py-px text-[8px] font-bold bg-gradient-to-r from-purple-600 to-indigo-500 text-white rounded-full leading-tight uppercase tracking-wide flex-shrink-0">
                Nouveau
              </span>
            </div>
            <p className="text-[10px] text-gray-500 leading-tight">{isEditingImage ? "Modifiez l'image sélectionnée" : hasRef ? "Décrivez ce que vous voulez modifier" : "Fond, motif, illustration... décrivez et générez"}</p>
          </div>
          {!creditsLoading && credits !== null && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${noCredits ? "bg-red-100 text-red-500" : "bg-white/80 text-[#4f46e5]"}`}>
              {noCredits ? "0 crédit" : `${credits} crédit${credits !== 1 ? "s" : ""}`}
            </span>
          )}
        </div>
      </div>

      {/* ── Edit mode banner ── */}
      {isEditingImage && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200">
          <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          <p className="text-[11px] text-amber-800 font-medium">Mode édition : l&apos;image sélectionnée sera modifiée</p>
        </div>
      )}

      {/* ── Prompt textarea ── */}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-xl bg-white border-2 border-[#4f46e5]/30 text-gray-800 placeholder-gray-400 text-sm focus:outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-[#4f46e5]/10 resize-none transition-all shadow-sm"
        rows={2}
        disabled={generating}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            generate();
          }
        }}
      />

      {/* ── Aspect ratio — larger 3-column tiles ── */}
      <div className="grid grid-cols-3 gap-2">
        {([
          { value: "3:4" as const, label: "Portrait", icon: "M6 3h12a1 1 0 011 1v16a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" },
          { value: "4:3" as const, label: "Paysage", icon: "M3 6h18a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V7a1 1 0 011-1z" },
          { value: "1:1" as const, label: "Carré", icon: "M4 4h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z" },
        ]).map((r) => (
          <button
            key={r.value}
            onClick={() => setAspectRatio(r.value)}
            disabled={generating}
            className={`flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-medium transition-all disabled:opacity-50 ${
              aspectRatio === r.value
                ? "bg-[#4f46e5]/10 text-[#4f46e5] border-2 border-[#4f46e5] shadow-sm"
                : "bg-white text-gray-500 border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d={r.icon} /></svg>
            {r.label}
          </button>
        ))}
      </div>

      {/* ── Reference images — prominent upload zone ── */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          {refImages.map((img) => (
            <div key={img.id} className="relative w-12 h-12 rounded-lg overflow-hidden border border-gray-200 group flex-shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.dataUrl} alt="Réf" className="w-full h-full object-cover" />
              <button
                onClick={() => removeRefImage(img.id)}
                className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          {refImages.length < 3 && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={generating}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-gray-300 text-gray-600 hover:border-[#4f46e5] hover:text-[#4f46e5] hover:bg-purple-50/50 transition-all text-[12px] font-medium disabled:opacity-50"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {refImages.length === 0 ? "S'inspirer d'une image" : "Ajouter une image"}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleRefImageUpload}
            className="hidden"
          />
        </div>
        {refImages.length > 0 && (
          <p className="text-[10px] text-gray-400 pl-1">
            L&apos;IA s&apos;en inspire
          </p>
        )}
      </div>

      {/* ── Generate button — always active, shows error on click if empty ── */}
      <button
        onClick={() => {
          if (!prompt.trim()) {
            setError("Décrivez ce que vous voulez générer.");
            return;
          }
          generate();
        }}
        disabled={generating}
        className="w-full py-2.5 bg-[#4f46e5] text-white font-semibold rounded-xl hover:bg-[#4338ca] transition-all disabled:opacity-70 text-sm flex items-center justify-center gap-2 shadow-sm"
      >
        {generating ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {isEditingImage ? "Modification en cours..." : "Génération en cours..."}
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            {isEditingImage ? "Modifier l'image" : "Générer l'image"}
          </>
        )}
      </button>

      {/* No credits warning */}
      {noCredits && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600 flex items-center gap-2">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          Crédits IA épuisés pour cet événement.
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">
          {error}
        </div>
      )}

      {/* ── Suggestions — secondary, discreet ── */}
      {!noCredits && (
        <div className="pt-3 mt-1 border-t border-gray-100">
          <p className="text-[9px] text-gray-400 font-medium uppercase tracking-wider mb-1.5">
            {hasRef ? "Idées avec vos images" : "Suggestions"}
          </p>
          <div className="space-y-0.5">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => setPrompt(s)}
                disabled={generating}
                className="w-full text-left px-2 py-1 rounded-md hover:bg-purple-50 hover:text-[#4f46e5] transition-all text-gray-400 text-[10px] leading-snug disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── History ── */}
      {history.length > 0 && (
        <div>
          <p className="text-[11px] text-gray-600 font-bold uppercase tracking-wider mb-2">Générations récentes</p>
          <div className="grid grid-cols-2 gap-2">
            {history.map((h, i) => {
              const key = `hist-${i}`;
              return (
                <button
                  key={i}
                  onClick={() => histRun(key, () => new Promise<void>(async (resolve) => {
                    const fabric = await import("fabric");
                    const canvas = canvasRef.current;
                    if (!canvas || !mountedRef.current) { resolve(); return; }
                    const imgEl = document.createElement("img");
                    imgEl.crossOrigin = "anonymous";
                    imgEl.onload = () => {
                      if (!mountedRef.current || !canvasRef.current) { resolve(); return; }
                      const img = new fabric.FabricImage(imgEl);
                      const maxDim = Math.min(canvasWidth, canvasHeight) * 0.6;
                      const scale = maxDim / Math.max(img.width!, img.height!);
                      img.set({ scaleX: scale, scaleY: scale, left: bleedPx + canvasWidth / 2, top: bleedPx + canvasHeight / 2, originX: "center", originY: "center" });
                      canvas.add(img);
                      canvas.setActiveObject(img);
                      canvas.renderAll();
                      resolve();
                    };
                    imgEl.onerror = () => {
                      if (mountedRef.current) setError("Impossible de charger l'image.");
                      resolve();
                    };
                    imgEl.src = h.url;
                  }))}
                  className="relative group rounded-lg overflow-hidden border border-gray-200 hover:border-[#4f46e5] transition-colors aspect-square"
                  title={h.prompt}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={h.url} alt={h.prompt} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <svg className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  {histLoadingKey === key && <ThumbSpinner />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-gray-400 text-[10px]">
        Les images générées sont ajoutées directement sur le canvas.
      </p>
    </div>
  );
}

export default React.memo(PanelIA);
