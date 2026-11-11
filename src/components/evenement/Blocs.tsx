"use client";

import type { ReactNode } from "react";

// Briques de la page d'un événement (maquettes du 10/11/2026) : blocs numérotés que le sommaire fait défiler,
// lignes « libellé · valeur · Changer », interrupteurs.

/** Un bloc numéroté de la page ; `id` sert d'ancre au sommaire. */
export function Bloc({ id, numero, titre, actions, children }: { id: string; numero: number; titre: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titre`} className="carte scroll-mt-4 px-5 py-5 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${id}-titre`} className="text-lg font-semibold">
          {numero} · {titre}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Ligne d'un bloc : libellé à gauche, valeur, action à droite ; ce qui s'ouvre dessous (`detail`). */
export function Ligne({ libelle, valeur, action, detail, fort = false, detailPleineLargeur = false }: {
  libelle: ReactNode;
  valeur?: ReactNode;
  action?: ReactNode;
  detail?: ReactNode;
  fort?: boolean;
  /** Le détail prend toute la largeur (sinon il s'aligne sur la colonne des valeurs) */
  detailPleineLargeur?: boolean;
}) {
  return (
    <div className="border-t border-line py-3 first:border-t-0 first:pt-0">
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[9.5rem_1fr_auto]">
        <span className={`text-sm ${fort ? "font-semibold text-ink" : "text-ink-2"}`}>{libelle}</span>
        <span className="col-span-2 row-start-2 min-w-0 text-sm font-semibold sm:col-span-1 sm:row-start-auto">{valeur}</span>
        <span className="col-start-2 row-start-1 justify-self-end sm:col-start-auto sm:row-start-auto">{action}</span>
      </div>
      {detail && <div className={`mt-3 ${detailPleineLargeur ? "" : "sm:ml-[10.5rem]"}`}>{detail}</div>}
    </div>
  );
}

/** Lien « Changer » / « Fermer » d'une ligne repliable. */
export function BoutonChanger({ ouvert, onClick, libelle = "Changer" }: { ouvert: boolean; onClick: () => void; libelle?: string }) {
  return (
    <button type="button" aria-expanded={ouvert} onClick={onClick} className="text-sm font-semibold text-accent hover:underline">
      {ouvert ? "Fermer" : libelle}
    </button>
  );
}

/** Interrupteur (case à cocher en forme de bascule). */
export function Interrupteur({ actif, onChange, libelle, desactive = false }: { actif: boolean; onChange: (v: boolean) => void; libelle: string; desactive?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={actif}
      aria-label={libelle}
      disabled={desactive}
      onClick={() => onChange(!actif)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition disabled:opacity-50 ${actif ? "bg-accent" : "bg-line-strong"}`}
    >
      <span className={`inline-block size-4 rounded-full bg-white shadow transition ${actif ? "translate-x-[1.125rem]" : "translate-x-0.5"}`} />
    </button>
  );
}

/** Pastille de choix (source des photos d'illustration…). */
export function Pastille({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={actif}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${actif ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink hover:bg-line"}`}
    >
      {children}
    </button>
  );
}

/** Panneau gris sous une ligne ouverte. */
export function Panneau({ titre, droite, children }: { titre?: ReactNode; droite?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-2 p-4">
      {(titre || droite) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {titre && <p className="text-sm font-semibold">{titre}</p>}
          {droite}
        </div>
      )}
      {children}
    </div>
  );
}
