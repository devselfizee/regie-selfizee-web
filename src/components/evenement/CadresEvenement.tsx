"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { api, MAX_COMPOSITIONS, type CadreEvenement, type ReglagesEvenement } from "@/lib/api";
import { GABARITS } from "@/lib/gabaritsEvenement";
import { Erreur } from "../Etat";
import { IllustrationGabarit } from "../IllustrationGabarit";

// Bloc « 2 · Cadres proposés » de la page d'un événement (maquettes du 10/11/2026) : une carte par cadre
// (aperçu, nom, rang à glisser), « Mis en avant à l'accueil » en bas de carte, deux au plus ; tuile
// « Ajouter un cadre ». Pas d'étiquette « personnalisé » / « du kit » : on personnalise toujours. Un clic sur
// l'aperçu ouvre le studio.

/** Cadres mis en avant sur l'écran d'accueil, au plus (maquettes du 10/11) */
export const MAX_ACCUEIL = 2;

/** « 3 cadres sur 9 · 2 mis en avant au plus · glisser pour changer l'ordre » (en-tête du bloc) */
export const resumeCadres = (n: number) => `${n} cadre${n > 1 ? "s" : ""} sur ${MAX_COMPOSITIONS} · ${MAX_ACCUEIL} mis en avant au plus · glisser pour changer l'ordre`;

export function CadresEvenement({ r, setR, cadres, apiEvenement, ouvrirStudio, ouverture, dupliquer }: {
  r: ReglagesEvenement;
  setR: (f: (r: ReglagesEvenement) => ReglagesEvenement) => void;
  cadres: UseQueryResult<CadreEvenement[]>;
  apiEvenement: string;
  ouvrirStudio: (compositionId: string) => void;
  ouverture: boolean;
  dupliquer: { mutate: (compositionId: string) => void; isPending: boolean; error: unknown };
}) {
  const { choisis, accueil } = r.gabarits;
  const client = useQueryClient();
  const retirer = useMutation({
    mutationFn: (compositionId: string) => api(`${apiEvenement}/cadres/${compositionId}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["cadres-evenement", apiEvenement] }),
  });
  const maj = (g: Partial<ReglagesEvenement["gabarits"]>) => setR((x) => ({ ...x, gabarits: { ...x.gabarits, ...g } }));
  const ids = choisis.map((c) => c.id);
  const plein = choisis.length >= MAX_COMPOSITIONS;
  const enlever = (id: string, avecCadre: boolean) => {
    if (avecCadre && !confirm("Retirer ce cadre ? Son dessin sera supprimé à l'enregistrement.")) return;
    maj({ choisis: choisis.filter((c) => c.id !== id), accueil: accueil.filter((a) => a !== id) });
  };
  const deplacer = (i: number, sens: -1 | 1) => {
    const n = [...choisis];
    [n[i], n[i + sens]] = [n[i + sens], n[i]];
    maj({ choisis: n });
  };
  // Glisser-déposer : l'ordre se réarrange en direct pendant le glissement (`ordre`), il n'est retenu qu'au
  // dépôt dans la grille ; lâché ailleurs ou Échap, tout revient comme avant
  const [ordre, setOrdre] = useState<typeof choisis | null>(null);
  const [glisse, setGlisse] = useState<string | null>(null);
  const liste = ordre ?? choisis;
  const survoler = (cible: string) => {
    if (!glisse || glisse === cible) return;
    setOrdre((o) => {
      const n = [...(o ?? choisis)];
      const de = n.findIndex((x) => x.id === glisse);
      const vers = n.findIndex((x) => x.id === cible);
      if (de < 0 || vers < 0) return o;
      const [x] = n.splice(de, 1);
      n.splice(vers, 0, x);
      return n;
    });
  };
  const deposer = () => {
    if (ordre && ordre.some((x, i) => x.id !== choisis[i]?.id)) maj({ choisis: ordre });
  };
  const mettreEnAvant = (id: string, oui: boolean) =>
    maj({ accueil: oui ? ids.filter((x) => x === id || accueil.includes(x)) : accueil.filter((x) => x !== id) });
  const enAvant = accueil.filter((a) => ids.includes(a)).length;

  return (
    <div>
      <ul
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        onDragOver={(e) => {
          if (!glisse) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => {
          if (!glisse) return;
          e.preventDefault();
          deposer();
        }}
      >
        {liste.map((c, rang) => {
          const g = GABARITS.find((x) => x.cle === c.gabarit)!;
          const memes = liste.filter((x) => x.gabarit === c.gabarit);
          const libelle = memes.length > 1 ? `${g.nom} · ${memes.indexOf(c) + 1}` : g.nom;
          const cadre = cadres.data?.find((x) => x.compositionId === c.id);
          const coche = accueil.includes(c.id);
          return (
            <li
              key={c.id}
              draggable={!ouverture}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", c.id);
                // Après la capture de l'image glissée : sinon elle prendrait le style « en cours de glissement »
                setTimeout(() => {
                  setGlisse(c.id);
                  setOrdre(choisis);
                });
              }}
              onDragEnter={() => survoler(c.id)}
              onDragEnd={() => {
                setGlisse(null);
                setOrdre(null);
              }}
              className={`flex flex-col overflow-hidden rounded-xl border bg-surface transition hover:shadow-md ${glisse === c.id ? "border-2 border-dashed border-accent opacity-50" : "border-line"}`}
            >
              <div className="relative h-36 bg-accent/5">
                {/* L'aperçu ouvre le studio */}
                <button
                  type="button"
                  disabled={ouverture}
                  onClick={() => ouvrirStudio(c.id)}
                  aria-label={`Ouvrir le studio : ${libelle}`}
                  className="group/apercu relative flex h-full w-full items-center justify-center p-3 focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {cadre?.vignette ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cadre.vignette} alt="" draggable={false} className="max-h-full max-w-full rounded bg-white object-contain shadow" />
                  ) : (
                    <IllustrationGabarit gabarit={c.gabarit} className="h-full max-w-full" />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-ink/0 opacity-0 transition group-hover/apercu:bg-ink/45 group-hover/apercu:opacity-100 group-focus-visible/apercu:bg-ink/45 group-focus-visible/apercu:opacity-100">
                    <span className="rounded-full bg-surface px-3 py-1.5 text-sm font-semibold text-accent shadow">{ouverture ? "Enregistrement…" : "✎ Ouvrir le studio"}</span>
                  </span>
                </button>
                <span
                  className="absolute top-2.5 left-2.5 flex cursor-grab items-center gap-1 rounded-md bg-ink px-1.5 py-0.5 text-xs font-bold text-white active:cursor-grabbing"
                  title="Position dans l'écran de choix de la borne : glissez la carte pour la changer"
                >
                  <span aria-hidden>⠿</span>
                  {rang + 1}
                  {rang === 0 ? "er" : "e"}
                </span>
                <div className="absolute top-2 right-2">
                  <MenuCarte
                    libelle={libelle}
                    actions={[
                      { libelle: "Ouvrir le studio", onClick: () => ouvrirStudio(c.id), desactive: ouverture },
                      { libelle: "Dupliquer", aide: "Même format, copie du dessin", onClick: () => dupliquer.mutate(c.id), desactive: plein || dupliquer.isPending },
                      { libelle: "Avancer dans l'écran de choix", onClick: () => deplacer(rang, -1), desactive: rang === 0, separe: true },
                      { libelle: "Reculer dans l'écran de choix", onClick: () => deplacer(rang, 1), desactive: rang === choisis.length - 1 },
                      ...(cadre
                        ? [{
                            libelle: "Repartir du cadre du kit",
                            onClick: () => confirm(`Repartir du cadre du kit pour « ${libelle} » ? Le dessin fait au studio sera supprimé.`) && retirer.mutate(c.id),
                            desactive: retirer.isPending,
                            separe: true,
                            danger: true,
                          }]
                        : []),
                      { libelle: "Retirer ce cadre", onClick: () => enlever(c.id, Boolean(cadre)), separe: !cadre, danger: true },
                    ]}
                  />
                </div>
              </div>
              <div className="flex flex-1 flex-col px-3.5 pb-3">
                <h3 className="py-3 text-sm font-semibold leading-snug">{libelle}</h3>
                <label
                  className={`mt-auto flex items-center gap-2 border-t border-line pt-3 text-sm ${!coche && enAvant >= MAX_ACCUEIL ? "text-ink-muted" : "text-ink"}`}
                  title={!coche && enAvant >= MAX_ACCUEIL ? `${MAX_ACCUEIL} cadres au plus sur l'écran d'accueil : décochez-en un d'abord` : undefined}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-accent"
                    checked={coche}
                    disabled={!coche && enAvant >= MAX_ACCUEIL}
                    onChange={(e) => mettreEnAvant(c.id, e.target.checked)}
                  />
                  Mis en avant à l&apos;accueil
                </label>
              </div>
            </li>
          );
        })}

        {/* Ajouter un cadre : le studio s'ouvre sur le choix du format ; il n'entre dans l'événement qu'au
            premier enregistrement de son dessin */}
        <li>
          <button
            type="button"
            disabled={plein || ouverture}
            onClick={() => ouvrirStudio("nouveau")}
            className="flex h-full min-h-56 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong p-6 text-center text-ink-2 transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span aria-hidden className="flex size-9 items-center justify-center rounded-full bg-surface text-xl shadow-sm">+</span>
            <span className="font-semibold">Ajouter un cadre</span>
            {plein && <span className="text-xs text-ink-muted">{MAX_COMPOSITIONS} cadres au plus sur l&apos;écran de choix</span>}
          </button>
        </li>
      </ul>

      {choisis.length === 0 && (
        <p className="mt-4 rounded-md bg-warn-bg px-4 py-3 text-sm text-warn-ink">Aucun cadre : la borne n&apos;aurait rien à proposer. Ajoutez-en au moins un.</p>
      )}
      {(cadres.error || retirer.error || dupliquer.error) ? <div className="mt-3"><Erreur erreur={cadres.error ?? retirer.error ?? dupliquer.error} /></div> : null}
    </div>
  );
}

interface ActionCarte {
  libelle: string;
  aide?: string;
  onClick: () => void;
  desactive?: boolean;
  /** Trait au-dessus : un autre groupe d'actions */
  separe?: boolean;
  danger?: boolean;
}

/** Menu « ⋯ » d'une carte : toutes ses actions au même endroit. Échap et clic ailleurs le ferment. */
function MenuCarte({ libelle, actions }: { libelle: string; actions: ActionCarte[] }) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOuvert(false);
    const echap = (e: KeyboardEvent) => e.key === "Escape" && setOuvert(false);
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", echap);
    // Le premier choix prend le focus, pour le clavier
    ref.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")?.focus();
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-label={`Actions : ${libelle}`}
        title="Actions"
        onClick={() => setOuvert((v) => !v)}
        className={`flex h-7 w-7 items-center justify-center rounded-full text-lg leading-none transition ${ouvert ? "bg-ink text-white" : "text-ink-2 hover:bg-surface hover:text-ink"}`}
      >
        <span aria-hidden>⋯</span>
      </button>
      {ouvert && (
        <div role="menu" aria-label={`Actions : ${libelle}`} className="absolute top-9 right-0 z-30 w-64 overflow-hidden rounded-lg border border-line bg-surface py-1 text-left shadow-xl">
          {actions.map((a) => (
            <div key={a.libelle}>
              {a.separe && <div role="separator" className="my-1 border-t border-line" />}
              <button
                type="button"
                role="menuitem"
                disabled={a.desactive}
                onClick={() => {
                  setOuvert(false);
                  a.onClick();
                }}
                className={`block w-full px-4 py-2 text-left text-sm hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${a.danger ? "text-crit-ink" : "text-ink"}`}
              >
                {a.libelle}
                {a.aide && <span className="block text-xs text-ink-muted">{a.aide}</span>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
