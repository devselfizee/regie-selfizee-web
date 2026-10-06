"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Fenêtre modale native (<dialog>) : focus, Échap et fond gérés par le navigateur. */
export function Modale({
  titre,
  ouverte,
  onFermer,
  large = false,
  children,
}: {
  titre: string;
  ouverte: boolean;
  onFermer: () => void;
  large?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (ouverte && !d.open) d.showModal();
    if (!ouverte && d.open) d.close();
  }, [ouverte]);

  return (
    <dialog
      ref={ref}
      onClose={onFermer}
      className={`m-auto ${large ? "w-[min(46rem,calc(100vw-2rem))]" : "w-[min(32rem,calc(100vw-2rem))]"} max-h-[calc(100vh-2rem)] overflow-y-auto rounded-lg border border-line bg-surface p-0 text-ink backdrop:bg-black/40`}
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
