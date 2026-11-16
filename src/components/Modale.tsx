"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Fenêtre modale native (<dialog>) : focus, Échap et fond gérés par le navigateur ; un clic sur le fond la ferme. */
export function Modale({
  titre,
  ouverte,
  onFermer,
  large = false,
  tresLarge = false,
  children,
}: {
  titre: string;
  ouverte: boolean;
  onFermer: () => void;
  large?: boolean;
  /** Pour un tableau (paiements d'un jour) */
  tresLarge?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // L'événement « close » arrive aussi quand le parent ferme la modale (ex. pour en ouvrir une autre) :
  // dans ce cas il ne doit pas rappeler onFermer, qui fermerait la suivante.
  const ouverteRef = useRef(ouverte);
  // Clic sur le fond : la cible est le <dialog> lui-même (son contenu le recouvre entièrement) et le point est hors de
  // la fenêtre (pas sa barre de défilement). On vérifie aussi l'appui, pour ne pas fermer après une sélection de
  // texte commencée dans la fenêtre et relâchée sur le fond.
  const appuiFond = useRef(false);
  const surFond = (e: React.MouseEvent<HTMLDialogElement>) => {
    const d = ref.current;
    if (!d || e.target !== d) return false;
    const r = d.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  useEffect(() => {
    ouverteRef.current = ouverte;
    const d = ref.current;
    if (!d) return;
    if (ouverte && !d.open) d.showModal();
    if (!ouverte && d.open) d.close();
  }, [ouverte]);

  return (
    <dialog
      ref={ref}
      onClose={() => ouverteRef.current && onFermer()}
      onMouseDown={(e) => { appuiFond.current = surFond(e); }}
      onClick={(e) => {
        if (appuiFond.current && surFond(e)) onFermer();
        appuiFond.current = false;
      }}
      className={`m-auto ${tresLarge ? "w-[min(72rem,calc(100vw-2rem))]" : large ? "w-[min(46rem,calc(100vw-2rem))]" : "w-[min(32rem,calc(100vw-2rem))]"} max-h-[calc(100vh-2rem)] overflow-y-auto rounded-lg border border-line bg-surface p-0 text-ink backdrop:bg-black/40`}
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">{titre}</h2>
        <button type="button" className="text-ink-muted hover:text-ink" aria-label="Fermer" onClick={onFermer}>✕</button>
      </div>
      <div className="p-4">{ouverte && children}</div>
    </dialog>
  );
}

/** Affiche une clé API une seule fois, avec copie. */
export function CleUnique({ identifiant, cle }: { identifiant: string; cle: string }) {
  return (
    <div className="space-y-3 text-sm">
      <p>
        Clé API de <strong>{identifiant}</strong>. Copiez-la maintenant et installez-la sur la borne :{" "}
        <strong>elle ne sera plus jamais affichée</strong>.
      </p>
      <code className="block break-all rounded-md bg-surface-2 p-3 font-mono text-xs">{cle}</code>
      <button type="button" className="bouton-second" onClick={() => navigator.clipboard.writeText(cle)}>Copier</button>
    </div>
  );
}
