"use client";

import { useEffect } from "react";
import { posesDuGabarit } from "@/studio/lib/restrictionStudio";

// Modèle du catalogue dont le nombre de shoots n'est pas celui du gabarit du kit (une bandelette
// à 3 poses pour la « Bandelette 4 poses »…) : on prévient avant de le charger. On peut continuer et
// ajuster les shoots dans l'éditeur ; l'enregistrement exige le nombre du gabarit.

const shoots = (n: number) => (n === 0 ? "aucun shoot" : `${n} shoot${n > 1 ? "s" : ""}`);

export function AvertissementPoses({ poses, onContinuer, onAnnuler }: { poses: number | null; onContinuer: () => void; onAnnuler: () => void }) {
  const attendu = posesDuGabarit();
  const ouvert = poses !== null && attendu !== null;

  useEffect(() => {
    if (!ouvert) return;
    const touche = (e: KeyboardEvent) => e.key === "Escape" && onAnnuler();
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [ouvert, onAnnuler]);

  if (!ouvert) return null;
  const ecart = attendu - poses;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onAnnuler}>
      <div role="dialog" aria-modal="true" className="w-[440px] max-w-[90vw] space-y-4 rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
            <svg className="h-5 w-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-[#0d1216]">Ce modèle ne correspond pas au format</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Il a {shoots(poses)}, le format actuel en attend {attendu}.
            </p>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-gray-600">
          Vous pouvez continuer avec ce modèle puis, dans l&apos;éditeur,{" "}
          {ecart > 0 ? <>ajouter {shoots(ecart)} (« Ajouter un shoot »)</> : <>supprimer {shoots(-ecart)}</>}. Le cadre ne pourra être enregistré
          qu&apos;avec {shoots(attendu)}.
        </p>
        <div className="space-y-2">
          <button onClick={onContinuer} className="w-full rounded-xl bg-[#4f46e5] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4338ca]">
            Continuer avec ce modèle
          </button>
          <button onClick={onAnnuler} className="w-full py-2 text-sm text-gray-500 transition-colors hover:text-gray-700">
            Choisir un autre modèle
          </button>
        </div>
      </div>
    </div>
  );
}

/** Le modèle a-t-il un autre nombre de shoots que le gabarit du kit ? */
export const posesDifferentes = (poses: number) => {
  const attendu = posesDuGabarit();
  return attendu !== null && poses !== attendu;
};
