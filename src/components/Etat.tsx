import type { ReactNode } from "react";

export function Chargement({ texte = "Chargement…" }: { texte?: string }) {
  return <p className="py-10 text-center text-sm text-ink-muted">{texte}</p>;
}

export function Erreur({ erreur }: { erreur: unknown }) {
  const message = erreur instanceof Error ? erreur.message : String(erreur);
  return (
    <div role="alert" className="rounded-md bg-crit-bg px-4 py-3 text-sm text-crit-ink">
      <strong>Erreur :</strong> {message}
      {message.includes("fetch") && " — l'API est-elle démarrée (npm run dev dans api/) ?"}
    </div>
  );
}

export function Vide({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-ink-muted">{children}</p>;
}

type Ton = "ok" | "warn" | "crit" | "neutre";
const TONS: Record<Ton, string> = {
  ok: "bg-ok-bg text-ok-ink",
  warn: "bg-warn-bg text-warn-ink",
  crit: "bg-crit-bg text-crit-ink",
  neutre: "bg-surface-2 text-ink-2",
};
const ICONES: Record<Ton, string> = { ok: "●", warn: "▲", crit: "■", neutre: "○" };

/** Badge d'état : couleur + icône + libellé (jamais la couleur seule). */
export function Badge({ ton, children }: { ton: Ton; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONS[ton]}`}>
      <span aria-hidden className="text-[0.6rem]">{ICONES[ton]}</span>
      {children}
    </span>
  );
}

export function Section({ titre, actions, children }: { titre: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="carte p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{titre}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** En-tête de page */
export function EnTete({ titre, sousTitre, actions }: { titre: string; sousTitre?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{titre}</h1>
        {sousTitre && <p className="mt-1 text-sm text-ink-2">{sousTitre}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
