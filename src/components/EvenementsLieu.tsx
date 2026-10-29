"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type EvenementPonctuel, type FicheEvenementLieu } from "@/lib/api";
import { dateHeure, jour } from "@/lib/format";
import { Badge, Chargement, Erreur, Section } from "./Etat";

// Événements de la borne d'un lieu (CDC page souvenir § 13) : celui par défaut et les autres (Halloween,
// Noël, une soirée…), chacun avec son code. Onglet « Événements » de la fiche lieu, et création d'un
// événement depuis cet onglet ou depuis la fiche événement.

export type Periode = "en-cours" | "a-venir" | "passe";
const aujourdhui = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }); // AAAA-MM-JJ
export const periode = (e: { dateDebut: string; dateFin: string }, ce = aujourdhui()): Periode =>
  e.dateFin < ce ? "passe" : e.dateDebut > ce ? "a-venir" : "en-cours";
const PERIODES: Record<Periode, { libelle: string; ton: "ok" | "neutre" | "warn" }> = {
  "en-cours": { libelle: "En cours", ton: "ok" },
  "a-venir": { libelle: "À venir", ton: "neutre" },
  passe: { libelle: "Passé", ton: "warn" },
};
export const dates = (e: { dateDebut: string; dateFin: string }) => (e.dateDebut === e.dateFin ? jour(e.dateDebut) : `${jour(e.dateDebut)} → ${jour(e.dateFin)}`);
/** En cours d'abord, puis à venir (les plus proches en premier), puis passés (les plus récents en premier). */
export function trier<T extends { dateDebut: string; dateFin: string }>(liste: T[]): T[] {
  const rang = { "en-cours": 0, "a-venir": 1, passe: 2 } as const;
  return [...liste].sort((a, b) => {
    const pa = periode(a), pb = periode(b);
    if (pa !== pb) return rang[pa] - rang[pb];
    return pa === "passe" ? b.dateDebut.localeCompare(a.dateDebut) : a.dateDebut.localeCompare(b.dateDebut);
  });
}

const pageEvenement = (lieuId: number, eid?: number | null) => (eid ? `/lieux/${lieuId}/evenement/${eid}` : `/lieux/${lieuId}/evenement`);

/** Formulaire de création d'un événement ; ouvre sa fiche une fois créé. */
export function FormNouvelEvenement({ lieuId, onAnnuler }: { lieuId: number; onAnnuler: () => void }) {
  const client = useQueryClient();
  const router = useRouter();
  const [nom, setNom] = useState("");
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const creer = useMutation({
    mutationFn: () => api<FicheEvenementLieu>(`/lieux/${lieuId}/evenements-ponctuels`, { method: "POST", json: { nom: nom.trim(), dateDebut: debut, dateFin: fin || debut } }),
    onSuccess: (f) => {
      client.invalidateQueries({ queryKey: ["evenements-ponctuels", lieuId] });
      router.push(pageEvenement(lieuId, f.id));
    },
  });
  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-md border border-line bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        creer.mutate();
      }}
    >
      <label className="block">
        <span className="etiquette">Nom *</span>
        <input className="champ w-64" required maxLength={80} placeholder="Halloween, Noël…" value={nom} onChange={(e) => setNom(e.target.value)} />
      </label>
      <label className="block">
        <span className="etiquette">Début *</span>
        <input className="champ" type="date" required value={debut} onChange={(e) => setDebut(e.target.value)} />
      </label>
      <label className="block">
        <span className="etiquette">Fin</span>
        <input className="champ" type="date" min={debut} value={fin} onChange={(e) => setFin(e.target.value)} />
      </label>
      <button type="submit" className="bouton" disabled={creer.isPending || !nom.trim() || !debut}>
        {creer.isPending ? "Création…" : "Créer"}
      </button>
      <button type="button" className="bouton-second" onClick={onAnnuler}>Annuler</button>
      <p className="w-full text-xs text-ink-muted">
        Il reprend les réglages de l&apos;événement par défaut et les tarifs du lieu, sans les cadres ; il aura son propre code, à taper sur la borne.
        Sans date de fin : une seule journée.
      </p>
      {creer.error && <div className="w-full"><Erreur erreur={creer.error} /></div>}
    </form>
  );
}

function Publication({ version, publieeLe, modifie, enregistre = true }: { version: number; publieeLe: string | null; modifie: boolean; enregistre?: boolean }) {
  if (!enregistre) return <span className="text-ink-muted">Pas encore enregistré</span>;
  if (!version) return <Badge ton="neutre">Jamais publié</Badge>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      <span className="tabular">v{version} · {dateHeure(publieeLe)}</span>
      {modifie && <Badge ton="warn">Modifié depuis</Badge>}
    </span>
  );
}

/** Onglet « Événements » de la fiche lieu : tous les événements de la borne, et la création d'un nouveau. */
export function EvenementsLieu({ lieuId }: { lieuId: number }) {
  const defaut = useQuery({ queryKey: ["evenement-lieu", lieuId, "habituel"], queryFn: () => api<FicheEvenementLieu>(`/lieux/${lieuId}/evenement`) });
  const liste = useQuery({ queryKey: ["evenements-ponctuels", lieuId], queryFn: () => api<EvenementPonctuel[]>(`/lieux/${lieuId}/evenements-ponctuels`) });
  const [creation, setCreation] = useState(false);
  const [voirPasses, setVoirPasses] = useState(false);

  if (defaut.error || liste.error) return <Erreur erreur={defaut.error ?? liste.error} />;
  if (!defaut.data || !liste.data) return <Chargement />;
  const tries = trier(liste.data);
  const passes = tries.filter((e) => periode(e) === "passe").length;
  const visibles = voirPasses ? tries : tries.filter((e) => periode(e) !== "passe");
  const d = defaut.data;

  return (
    <Section
      titre="Événements de la borne"
      actions={!creation && <button type="button" className="bouton" onClick={() => setCreation(true)}>+ Nouvel événement</button>}
    >
      <p className="mb-3 text-sm text-ink-2">
        Chaque événement a son code, ses cadres, son thème et ses tarifs. Pour en installer un, tapez son code sur la borne ; pour revenir à
        l&apos;événement par défaut, retapez le sien.
      </p>
      {creation && <div className="mb-4"><FormNouvelEvenement lieuId={lieuId} onAnnuler={() => setCreation(false)} /></div>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-2">
              <th className="py-2 pr-3 font-medium">Événement</th>
              <th className="py-2 pr-3 font-medium">Code</th>
              <th className="py-2 pr-3 font-medium">Dates</th>
              <th className="py-2 pr-3 font-medium">Période</th>
              <th className="py-2 pr-3 font-medium">Publication</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line bg-surface-2/50">
              <td className="py-2 pr-3 font-medium">Par défaut <span className="ml-1 text-xs font-normal text-ink-muted">(toute l&apos;année)</span></td>
              <td className="py-2 pr-3 font-mono">{d.code ?? "—"}</td>
              <td className="py-2 pr-3 tabular">{dates(d.reglages.lieu)}</td>
              <td className="py-2 pr-3"><Badge ton={PERIODES[periode(d.reglages.lieu)].ton}>{PERIODES[periode(d.reglages.lieu)].libelle}</Badge></td>
              <td className="py-2 pr-3"><Publication version={d.version} publieeLe={d.publieeLe} modifie={d.modifieDepuisPublication} enregistre={d.enregistre} /></td>
              <td className="py-2 text-right"><Link href={pageEvenement(lieuId)} className="text-accent hover:underline">Ouvrir →</Link></td>
            </tr>
            {visibles.map((e) => {
              const p = PERIODES[periode(e)];
              return (
                <tr key={e.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-3 font-medium">{e.nom}</td>
                  <td className="py-2 pr-3 font-mono">{e.code}</td>
                  <td className="py-2 pr-3 tabular">{dates(e)}</td>
                  <td className="py-2 pr-3"><Badge ton={p.ton}>{p.libelle}</Badge></td>
                  <td className="py-2 pr-3"><Publication version={e.version} publieeLe={e.publieeLe} modifie={e.modifieDepuisPublication} /></td>
                  <td className="py-2 text-right"><Link href={pageEvenement(lieuId, e.id)} className="text-accent hover:underline">Ouvrir →</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {liste.data.length === 0 && <p className="mt-3 text-sm text-ink-muted">Aucun autre événement pour l&apos;instant (Halloween, Noël, une soirée…).</p>}
      {passes > 0 && (
        <button type="button" className="mt-3 text-sm text-accent hover:underline" onClick={() => setVoirPasses(!voirPasses)}>
          {voirPasses ? "Masquer les événements passés" : `Voir les ${passes} événement${passes > 1 ? "s" : ""} passé${passes > 1 ? "s" : ""}`}
        </button>
      )}
    </Section>
  );
}
