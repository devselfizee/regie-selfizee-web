"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type GrilleTarifs, type TarifsLieu } from "@/lib/api";
import { dateHeure, euros } from "@/lib/format";
import { useMoi } from "@/lib/session";
import { Badge, Chargement, Erreur, Section } from "./Etat";

// Tarifs en trois niveaux (demande de Sébastien) : base du parc → lieu → événement.
// L'éditeur de grille sert aux trois : Paramètres, fiche lieu, fiche événement.

/** Saisie d'un montant en euros (« 3,50 »), stocké en centimes. */
export function ChampEuros({ cents, onChange, id, desactive }: { cents: number; onChange: (c: number) => void; id?: string; desactive?: boolean }) {
  const [texte, setTexte] = useState((cents / 100).toFixed(2).replace(".", ","));
  return (
    <div className="relative">
      <input
        id={id}
        className="champ pr-7 text-right tabular"
        inputMode="decimal"
        value={desactive ? (cents / 100).toFixed(2).replace(".", ",") : texte}
        disabled={desactive}
        onChange={(e) => {
          setTexte(e.target.value);
          const v = Number(e.target.value.replace(",", ".").replace(/\s/g, ""));
          if (Number.isFinite(v) && v >= 0) onChange(Math.round(v * 100));
        }}
        onBlur={() => setTexte((cents / 100).toFixed(2).replace(".", ","))}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted">€</span>
    </div>
  );
}

/** Erreurs bloquantes, comme côté API (paliers croissants et dégressifs). */
export function erreursGrille(g: GrilleTarifs): string[] {
  const e: string[] = [];
  const p = g.paliers;
  if (p[0]?.de !== 1) e.push("Le premier palier de prix doit commencer à 1 tirage.");
  for (let i = 1; i < p.length; i++) {
    if (p[i].de <= p[i - 1].de) e.push("Les paliers doivent aller dans l'ordre croissant des quantités.");
    if (p[i].prixCents > p[i - 1].prixCents) e.push("La grille doit être dégressive : un palier coûte plus cher que le précédent.");
  }
  if (g.palierMisEnAvant !== null && !p.some((x) => x.de === g.palierMisEnAvant)) e.push("Le palier mis en avant n'existe pas dans la grille.");
  return [...new Set(e)];
}

/** Grille de prix des tirages : paliers dégressifs, palier mis en avant, « +1 pour un pote ». */
export function EditeurGrille({ valeur, onChange, desactive = false, nom = "grille" }: { valeur: GrilleTarifs; onChange: (g: GrilleTarifs) => void; desactive?: boolean; nom?: string }) {
  const maj = (p: Partial<GrilleTarifs>) => onChange({ ...valeur, ...p });
  const majPalier = (i: number, p: Partial<GrilleTarifs["paliers"][number]>) => maj({ paliers: valeur.paliers.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  return (
    <div>
      <p className="mb-3 text-xs text-ink-muted">Grille dégressive : le prix d&apos;un tirage selon le nombre commandé. Le premier palier est le prix unitaire.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[26rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-2">
              <th className="pb-2 font-medium">À partir de</th>
              <th className="pb-2 font-medium">Prix par tirage</th>
              <th className="pb-2 font-medium">Exemple</th>
              <th className="pb-2 font-medium">Mis en avant</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {valeur.paliers.map((p, i) => (
              <tr key={i} className="border-t border-line">
                <td className="py-2 pr-3">
                  <input
                    className="champ w-20 tabular"
                    type="number"
                    min={1}
                    max={50}
                    aria-label="À partir de (tirages)"
                    value={p.de}
                    disabled={desactive || i === 0}
                    onChange={(e) => majPalier(i, { de: Number(e.target.value) })}
                  />
                </td>
                <td className="w-32 py-2 pr-3">
                  <ChampEuros cents={p.prixCents} desactive={desactive} onChange={(c) => majPalier(i, { prixCents: c })} />
                </td>
                <td className="py-2 pr-3 text-ink-2 tabular">
                  {p.de} × {euros(p.prixCents)} = {euros(p.de * p.prixCents)}
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="radio"
                    name={`${nom}-palier-en-avant`}
                    className="h-4 w-4 accent-accent"
                    aria-label={`Mettre en avant ${p.de} tirages`}
                    checked={valeur.palierMisEnAvant === p.de}
                    disabled={desactive}
                    onChange={() => maj({ palierMisEnAvant: p.de })}
                  />
                </td>
                <td className="py-2 text-right">
                  {i > 0 && !desactive && (
                    <button
                      type="button"
                      className="text-xs text-crit-ink hover:underline"
                      onClick={() => maj({ paliers: valeur.paliers.filter((_, j) => j !== i), palierMisEnAvant: valeur.palierMisEnAvant === p.de ? null : valeur.palierMisEnAvant })}
                    >
                      Retirer
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!desactive && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="bouton-second !py-1 text-xs"
            disabled={valeur.paliers.length >= 10}
            onClick={() => {
              const dernier = valeur.paliers[valeur.paliers.length - 1];
              maj({ paliers: [...valeur.paliers, { de: dernier.de + 1, prixCents: dernier.prixCents }] });
            }}
          >
            + Ajouter un palier
          </button>
          <button type="button" className="text-xs text-accent hover:underline" disabled={valeur.palierMisEnAvant === null} onClick={() => maj({ palierMisEnAvant: null })}>
            Ne rien mettre en avant
          </button>
        </div>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="etiquette">Libellé du palier mis en avant</span>
          <input className="champ" value={valeur.libelleMisEnAvant} disabled={desactive} onChange={(e) => maj({ libelleMisEnAvant: e.target.value })} />
        </label>
        <label className="block">
          <span className="etiquette">« +1 pour un pote » pendant l&apos;impression</span>
          <ChampEuros cents={valeur.plusUnCents} desactive={desactive} onChange={(c) => maj({ plusUnCents: c })} />
          <span className="mt-1 block text-xs text-ink-muted">0 € : la question n&apos;est pas posée.</span>
        </label>
      </div>
    </div>
  );
}

/** Résumé d'une grille sur une ligne : « 3,50 € · 2 tirages 3,00 € · 3 tirages 2,50 € · +1 pote 2,00 € » */
export const resumeGrille = (g: GrilleTarifs) =>
  [...g.paliers.map((p, i) => (i === 0 ? `${euros(p.prixCents)} le tirage` : `dès ${p.de} : ${euros(p.prixCents)}`)), g.plusUnCents ? `+1 pote ${euros(g.plusUnCents)}` : null]
    .filter(Boolean)
    .join(" · ");

/** Paramètres : tarifs de base du parc Selfizee, repris par chaque lieu sans tarifs propres. */
export function TarifsBase() {
  const moi = useMoi();
  const client = useQueryClient();
  const { data, error } = useQuery({
    queryKey: ["tarifs-base"],
    queryFn: () => api<{ grille: GrilleTarifs; saisie: boolean; majLe: string | null; majPar: { prenom: string; nom: string } | null; nbLieuxPropres: number }>("/tarifs/base"),
  });
  const [brouillon, setBrouillon] = useState<GrilleTarifs | null>(null);
  const enregistrer = useMutation({
    mutationFn: (grille: GrilleTarifs) => api("/tarifs/base", { method: "PUT", json: { grille } }),
    onSuccess: () => {
      setBrouillon(null);
      client.invalidateQueries({ queryKey: ["tarifs-base"] });
      client.invalidateQueries({ queryKey: ["tarifs-lieu"] });
      client.invalidateQueries({ queryKey: ["evenement-lieu"] });
    },
  });
  if (error) return <Erreur erreur={error} />;
  if (!data) return <Chargement />;
  const g = brouillon ?? data.grille;
  const erreurs = erreursGrille(g);
  const admin = moi.role === "ADMIN";
  return (
    <Section titre="Tarifs de base du parc">
      <p className="mb-3 text-sm text-ink-2">
        Prix des tirages repris par défaut par chaque lieu, puis par ses événements. Un lieu peut avoir ses propres tarifs (fiche lieu, onglet Informations) ; un
        événement peut aussi avoir les siens (fiche événement, étape Tarifs).
        {data.nbLieuxPropres > 0 && ` ${data.nbLieuxPropres} lieu${data.nbLieuxPropres > 1 ? "x ont" : " a"} ses propres tarifs et ne suivent pas ceux-ci.`}
      </p>
      <p className="mb-3 text-xs text-ink-muted">
        {data.saisie ? `Modifiés le ${dateHeure(data.majLe)}${data.majPar ? ` par ${data.majPar.prenom} ${data.majPar.nom}` : ""}.` : "Pas encore saisis : la grille d'usine du mode régie s'applique."}
      </p>
      <EditeurGrille valeur={g} onChange={setBrouillon} desactive={!admin} nom="base" />
      {admin && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" className="bouton" disabled={!brouillon || erreurs.length > 0 || enregistrer.isPending} onClick={() => enregistrer.mutate(g)}>
            {enregistrer.isPending ? "Enregistrement…" : "Enregistrer les tarifs de base"}
          </button>
          {brouillon && (
            <button type="button" className="bouton-second" onClick={() => setBrouillon(null)}>
              Annuler
            </button>
          )}
          {erreurs.map((m) => (
            <span key={m} className="text-xs text-crit-ink">
              {m}
            </span>
          ))}
        </div>
      )}
      {enregistrer.error ? <Erreur erreur={enregistrer.error} /> : null}
    </Section>
  );
}

/** Fiche lieu : tarifs par défaut du lieu, ceux de base du parc ou les siens. */
export function TarifsDuLieu({ lieuId }: { lieuId: number }) {
  const client = useQueryClient();
  const { data, error } = useQuery({ queryKey: ["tarifs-lieu", lieuId], queryFn: () => api<TarifsLieu>(`/lieux/${lieuId}/tarifs`) });
  const [brouillon, setBrouillon] = useState<GrilleTarifs | null>(null);
  const enregistrer = useMutation({
    mutationFn: (grille: GrilleTarifs | null) => api<TarifsLieu>(`/lieux/${lieuId}/tarifs`, { method: "PUT", json: { grille } }),
    onSuccess: (d) => {
      setBrouillon(null);
      client.setQueryData(["tarifs-lieu", lieuId], d);
      client.invalidateQueries({ queryKey: ["evenement-lieu", lieuId] });
      client.invalidateQueries({ queryKey: ["suivi", lieuId] });
    },
  });
  if (error) return <Erreur erreur={error} />;
  if (!data) return <Chargement />;
  const propres = brouillon !== null || data.propre !== null;
  const g = brouillon ?? data.propre ?? data.base;
  const erreurs = erreursGrille(g);
  return (
    <Section
      titre="Tarifs"
      actions={propres ? <Badge ton="warn">Tarifs propres au lieu</Badge> : <Badge ton="neutre">Tarifs de base du parc</Badge>}
    >
      <div className="mb-3 flex flex-wrap gap-4 text-sm" role="radiogroup" aria-label="Tarifs du lieu">
        <label className="flex items-center gap-2">
          <input type="radio" className="h-4 w-4 accent-accent" checked={!propres} onChange={() => (data.propre ? enregistrer.mutate(null) : setBrouillon(null))} />
          Reprendre les tarifs de base du parc
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" className="h-4 w-4 accent-accent" checked={propres} onChange={() => setBrouillon(data.propre ?? data.base)} />
          Tarifs propres au lieu
        </label>
      </div>
      <EditeurGrille valeur={g} onChange={setBrouillon} desactive={!propres} nom={`lieu-${lieuId}`} />
      {brouillon && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" className="bouton" disabled={erreurs.length > 0 || enregistrer.isPending} onClick={() => enregistrer.mutate(brouillon)}>
            {enregistrer.isPending ? "Enregistrement…" : "Enregistrer les tarifs du lieu"}
          </button>
          <button type="button" className="bouton-second" onClick={() => setBrouillon(null)}>
            Annuler
          </button>
          {erreurs.map((m) => (
            <span key={m} className="text-xs text-crit-ink">
              {m}
            </span>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-ink-muted">Les événements du lieu reprennent ces tarifs, sauf s&apos;ils ont les leurs (fiche événement, étape Tarifs).</p>
      {enregistrer.error ? <Erreur erreur={enregistrer.error} /> : null}
    </Section>
  );
}
