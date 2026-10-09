"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, qs, type ContexteLieu, type EffetContexte, type EffetsContexte, type EvenementLieu, type ImpactEvenement, type JourContexte } from "@/lib/api";
import { euros, eurosRond, jour, pct } from "@/lib/format";
import { Chargement, Erreur, Section, Vide } from "./Etat";
import { Modale } from "./Modale";
import { useReferentiel } from "./Filtres";

export const useContexteLieu = (lieuId: number, du?: string, au?: string) =>
  useQuery({
    queryKey: ["contexte", lieuId, du, au],
    queryFn: () => api<ContexteLieu>(`/stats/contexte/lieux/${lieuId}${qs({ du, au })}`),
    staleTime: 10 * 60_000,
  });

export const useEvenements = (lieuId: number) =>
  useQuery({ queryKey: ["evenements", lieuId], queryFn: () => api<EvenementLieu[]>(`/lieux/${lieuId}/evenements`) });

const resumeMeteo = (j: JourContexte) =>
  j.meteo ? [j.temps, j.meteo.tempMax != null && `${Math.round(j.meteo.tempMax)} °C`, j.meteo.precipitationMm ? `${j.meteo.precipitationMm.toLocaleString("fr-FR")} mm` : null].filter(Boolean).join(" · ") : null;

/** Superpositions de la courbe de CA : vacances (bandes), fériés et événements (repères), météo (infobulle). */
export function superpositions(contexte: ContexteLieu | undefined, evenements: EvenementLieu[] | undefined) {
  const jours = contexte?.jours ?? [];
  const bandes: { du: string; au: string; libelle: string }[] = [];
  for (const j of jours) {
    const derniere = bandes[bandes.length - 1];
    if (!j.vacances) continue;
    const veille = new Date(new Date(`${j.jour}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
    if (derniere && derniere.libelle === j.vacances && derniere.au === veille) derniere.au = j.jour;
    else bandes.push({ du: j.jour, au: j.jour, libelle: j.vacances });
  }
  const infosJour = Object.fromEntries(
    jours.map((j) => [j.jour, [j.ferie && `Férié : ${j.ferie}`, resumeMeteo(j)].filter(Boolean).join(" · ")]).filter(([, v]) => v)
  );
  const reperes = [
    ...jours.filter((j) => j.ferie).map((j) => ({ jour: j.jour, libelle: j.ferie!, court: "Férié" })),
    ...(evenements ?? []).map((e) => ({ jour: e.debut, libelle: `${e.type.libelle} : ${e.libelle}`, court: e.type.libelle })),
  ];
  return { bandes, infosJour, reperes };
}

// ─── Effets mesurés ───

export function Effet({ e }: { e: EffetContexte }) {
  if (e.effet === null) return <span className="text-ink-muted">{e.n ? `${e.n} jour(s), trop peu` : "—"}</span>;
  const fort = Math.abs(e.effet) >= 0.1;
  return (
    <span className={fort ? (e.effet > 0 ? "text-good" : "text-bad") : "text-ink-2"}>
      <span aria-hidden>{!fort ? "→" : e.effet > 0 ? "▲" : "▼"}</span> {e.effet > 0 ? "+" : ""}{pct(e.effet)}
      <span className="text-ink-muted"> · {e.n} j</span>
    </span>
  );
}

/** Lignes du tableau d'effets : calendrier, pluie, puis tranches de température. */
export const lignesEffets = (e: EffetsContexte): { libelle: string; effet: EffetContexte }[] => [
  { libelle: "Jours fériés", effet: e.feries },
  { libelle: "Vacances scolaires", effet: e.vacances },
  { libelle: "Jours de pluie (≥ 1 mm)", effet: e.pluie },
  ...e.temperatures.map((t) => ({ libelle: `Maximale ${t.tranche}`, effet: t })),
];

export const EXPLICATION_EFFETS =
  "Chaque jour est comparé au même jour de la semaine des 4 semaines avant et après : la saison et le jour de la semaine ne faussent pas la comparaison. Pour les longues vacances (été), les jours de référence sont eux aussi en vacances : l'effet affiché est alors sous-estimé.";

/** Fiche lieu : effets mesurés sur 12 mois et météo des prochains jours. */
export function SectionContexte({ lieuId }: { lieuId: number }) {
  const { data: c, error } = useContexteLieu(lieuId);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const prochains = (c?.jours ?? []).filter((j) => j.jour >= aujourdhui && j.meteo).slice(0, 8);

  return (
    <Section titre="Calendrier et météo">
      {error && <Erreur erreur={error} />}
      {!c && !error && <Chargement />}
      {c && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm text-ink-2">
              Effet sur le CA d&apos;un jour ouvert, mesuré sur les 12 derniers mois ({c.effets.jours} jours comparables).
              {!c.zoneScolaire && " Zone scolaire inconnue : renseignez le code postal."}
              {!c.geolocalise && " Lieu non géolocalisé : pas de météo."}
            </p>
            <table className="w-full text-sm">
              <tbody className="tabular">
                {lignesEffets(c.effets).map((l) => (
                  <tr key={l.libelle} className="border-t border-line">
                    <td className="py-1.5 pr-4">{l.libelle}</td>
                    <td className="py-1.5 text-right"><Effet e={l.effet} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-ink-muted">{EXPLICATION_EFFETS}</p>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">Prochains jours</h3>
            {prochains.length ? (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {prochains.map((j) => (
                  <li key={j.jour} className="rounded-md bg-surface-2 p-2 text-xs">
                    <div className="font-medium">{new Date(`${j.jour}T00:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", timeZone: "UTC" })}</div>
                    <div className="text-ink-2">{j.temps}</div>
                    <div className="tabular">
                      {j.meteo?.tempMax != null && `${Math.round(j.meteo.tempMax)} °C`}
                      {j.meteo?.precipitationMm ? <span className="text-ink-2"> · {j.meteo.precipitationMm.toLocaleString("fr-FR")} mm</span> : null}
                    </div>
                    {(j.ferie || j.vacances) && <div className="mt-1 text-ink-muted">{j.ferie ?? j.vacances}</div>}
                  </li>
                ))}
              </ul>
            ) : (
              <Vide>Pas de prévision météo pour ce lieu.</Vide>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}

// ─── Journal d'événements ───

const effetTexte = (x: number | null) => (x === null ? "—" : `${x > 0 ? "+" : ""}${pct(x)}`);
const ton = (x: number | null) => (x === null || Math.abs(x) < 0.05 ? "text-ink-2" : x > 0 ? "text-good" : "text-bad");

function Impact({ i }: { i: ImpactEvenement }) {
  switch (i.type) {
    case "A_VENIR":
      return <span className="text-ink-muted">À venir</span>;
    case "EN_COURS":
      return <span className="text-ink-muted">En observation ({i.joursObserves} jour(s) ouvert(s) sur 7)</span>;
    case "PONCTUEL":
      return (
        <span>
          {eurosRond(i.caCents)} contre {eurosRond(i.habituelCents)} habituellement{" "}
          <span className={ton(i.effet)}>({effetTexte(i.effet)})</span>
        </span>
      );
    case "DURABLE":
      return (
        <span className="space-x-3">
          <span>CA/jour {euros(i.avant.caParJourCents)} → {euros(i.apres.caParJourCents)} <span className={ton(i.effetCa)}>{effetTexte(i.effetCa)}</span></span>
          <span>ventes/jour {i.avant.ventesParJour.toLocaleString("fr-FR")} → {i.apres.ventesParJour.toLocaleString("fr-FR")} <span className={ton(i.effetVentes)}>{effetTexte(i.effetVentes)}</span></span>
          <span>panier {euros(i.avant.panierMoyenCents)} → {euros(i.apres.panierMoyenCents)} <span className={ton(i.effetPanier)}>{effetTexte(i.effetPanier)}</span></span>
        </span>
      );
  }
}

export function JournalEvenements({ lieuId, peutEcrire }: { lieuId: number; peutEcrire: boolean }) {
  const client = useQueryClient();
  const { data, error } = useEvenements(lieuId);
  const [edition, setEdition] = useState<EvenementLieu | "nouveau" | null>(null);
  const supprimer = useMutation({
    mutationFn: (id: number) => api(`/evenements/${id}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["evenements", lieuId] }),
  });

  return (
    <Section titre="Journal d'événements" actions={peutEcrire ? <button className="bouton-second" onClick={() => setEdition("nouveau")}>Ajouter</button> : undefined}>
      <p className="mb-3 text-sm text-ink-2">
        Soirée spéciale, travaux, déplacement de la borne, changement de prix… Les événements apparaissent sur la courbe de CA et leur effet est mesuré :
        jour même contre jour habituel pour un événement court, 4 semaines avant contre 4 semaines après pour un changement durable.
      </p>
      {error && <Erreur erreur={error} />}
      {!data && !error && <Chargement />}
      {data && !data.length && <Vide>Aucun événement.</Vide>}
      {data && data.length > 0 && (
        <ul className="divide-y divide-line text-sm">
          {data.map((e) => (
            <li key={e.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
              <div>
                <div>
                  <span className="font-medium">{e.libelle}</span> <span className="text-ink-muted">· {e.type.libelle}</span>
                </div>
                <div className="text-xs text-ink-2">
                  {e.fin && e.fin !== e.debut ? `du ${jour(e.debut)} au ${jour(e.fin)}` : e.fin ? `le ${jour(e.debut)}` : `depuis le ${jour(e.debut)}`}
                </div>
                {e.impact && <div className="mt-1 text-xs"><Impact i={e.impact} /></div>}
              </div>
              {peutEcrire && (
                <div className="flex gap-2">
                  <button className="text-xs text-accent hover:underline" onClick={() => setEdition(e)}>Modifier</button>
                  <button className="text-xs text-bad hover:underline" onClick={() => confirm("Supprimer cet événement ?") && supprimer.mutate(e.id)}>Supprimer</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Modale titre={edition === "nouveau" ? "Nouvel événement" : "Modifier l'événement"} ouverte={edition !== null} onFermer={() => setEdition(null)}>
        {edition !== null && <FormEvenement lieuId={lieuId} evenement={edition === "nouveau" ? null : edition} onFini={() => setEdition(null)} />}
      </Modale>
    </Section>
  );
}

function FormEvenement({ lieuId, evenement, onFini }: { lieuId: number; evenement: EvenementLieu | null; onFini: () => void }) {
  const client = useQueryClient();
  const { data: ref } = useReferentiel();
  const types = (ref?.listes.TYPE_EVENEMENT ?? []).filter((t) => t.actif || t.id === evenement?.type.id);
  const [f, setF] = useState({
    typeId: evenement ? String(evenement.type.id) : "",
    libelle: evenement?.libelle ?? "",
    debut: evenement?.debut ?? new Date().toISOString().slice(0, 10),
    fin: evenement?.fin ?? "",
    duree: evenement ? (evenement.fin ? "periode" : "durable") : "jour",
  });
  const enregistrer = useMutation({
    mutationFn: () => {
      const json = {
        typeId: Number(f.typeId),
        libelle: f.libelle,
        debut: f.debut,
        fin: f.duree === "durable" ? null : f.duree === "jour" ? f.debut : f.fin,
      };
      return evenement
        ? api(`/evenements/${evenement.id}`, { method: "PUT", json })
        : api(`/lieux/${lieuId}/evenements`, { method: "POST", json });
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["evenements", lieuId] });
      onFini();
    },
  });

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); enregistrer.mutate(); }}>
      <label className="block">
        <span className="etiquette">Type *</span>
        <select className="champ" required value={f.typeId} onChange={(e) => setF({ ...f, typeId: e.target.value })}>
          <option value="">—</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="etiquette">Description *</span>
        <input className="champ" required placeholder="Soirée années 80, bande passée à 8 €…" value={f.libelle} onChange={(e) => setF({ ...f, libelle: e.target.value })} />
      </label>
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="etiquette">Durée</legend>
        {[["jour", "Un jour"], ["periode", "Plusieurs jours"], ["durable", "Changement durable (prix…)"]].map(([v, l]) => (
          <label key={v} className="flex items-center gap-1.5">
            <input type="radio" name="duree" checked={f.duree === v} onChange={() => setF({ ...f, duree: v })} /> {l}
          </label>
        ))}
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="etiquette">{f.duree === "jour" ? "Date *" : "Début *"}</span>
          <input type="date" className="champ" required value={f.debut} onChange={(e) => setF({ ...f, debut: e.target.value })} />
        </label>
        {f.duree === "periode" && (
          <label className="block">
            <span className="etiquette">Fin *</span>
            <input type="date" className="champ" required min={f.debut} value={f.fin} onChange={(e) => setF({ ...f, fin: e.target.value })} />
          </label>
        )}
      </div>
      {enregistrer.error && <Erreur erreur={enregistrer.error} />}
      <button className="bouton" disabled={enregistrer.isPending}>Enregistrer</button>
    </form>
  );
}
