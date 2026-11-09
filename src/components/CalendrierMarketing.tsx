"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type EvenementMarketing } from "@/lib/api";
import { Chargement, Erreur } from "./Etat";
import { Gate } from "@/lib/perms";

// L'API renvoie des dates complètes (« 2026-05-31T00:00:00.000Z ») : seul le jour compte
const ymd = (d: string) => d.slice(0, 10);
const enDate = (d: string) => new Date(`${ymd(d)}T00:00:00Z`);
/** « 14 février » (chaque année) */
const JOURS_MOIS = (d: string) => enDate(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
/** « dim. 31 mai 2026 » (une seule fois) */
const DATE_COMPLETE = (d: string) => enDate(d).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const unJour = (e: EvenementMarketing) => ymd(e.debut) === ymd(e.fin);

/**
 * Paramètres : calendrier marketing (Saint-Valentin, Halloween, Coupe du monde…). Un jour par défaut, ou une période ;
 * « chaque année » : répété au même jour. Affiché sur les courbes de CA des lieux (en orange).
 */
export function CalendrierMarketing() {
  const client = useQueryClient();
  const { data, error } = useQuery({ queryKey: ["calendrier-marketing"], queryFn: () => api<EvenementMarketing[]>("/calendrier-marketing") });
  const [edition, setEdition] = useState<EvenementMarketing | "nouveau" | null>(null);
  const fini = () => {
    setEdition(null);
    client.invalidateQueries({ queryKey: ["calendrier-marketing"] });
    client.invalidateQueries({ queryKey: ["contexte"] });
  };
  const supprimer = useMutation({ mutationFn: (id: number) => api(`/calendrier-marketing/${id}`, { method: "DELETE" }), onSuccess: fini });

  return (
    <section className="carte p-4">
      <h2 className="text-base font-semibold">Calendrier marketing</h2>
      <p className="mb-4 text-sm text-ink-2">
        Les temps forts commerciaux, affichés en orange sur les courbes de chiffre d&apos;affaires des lieux : un jour (trait) ou une période (bande).
        « Chaque année » répète l&apos;événement au même jour ; une date qui change d&apos;une année à l&apos;autre (fête des mères, rentrée…) se saisit pour chaque année.
      </p>
      {error && <Erreur erreur={error} />}
      {!data && !error && <Chargement />}
      {data && (
        <div className="space-y-4">
          <Tableau
            titre="Chaque année"
            aide="Répétés au même jour tous les ans (Saint-Valentin, Halloween…)."
            vide="Aucun événement annuel."
            evenements={data.filter((e) => e.annuel).sort((a, b) => ymd(a.debut).slice(5).localeCompare(ymd(b.debut).slice(5)))}
            date={(e) => (unJour(e) ? `le ${JOURS_MOIS(e.debut)}` : `du ${JOURS_MOIS(e.debut)} au ${JOURS_MOIS(e.fin)}`)}
            edition={edition}
            setEdition={setEdition}
            fini={fini}
            onSupprimer={(e) => confirm(`Supprimer « ${e.nom} » du calendrier ?`) && supprimer.mutate(e.id)}
          />
          <Tableau
            titre="Ponctuels"
            aide="Une seule fois, à une date précise (Coupe du monde, fête des mères de l'année…). Ceux qui sont passés sont grisés."
            vide="Aucun événement ponctuel."
            evenements={data.filter((e) => !e.annuel).sort((a, b) => ymd(b.debut).localeCompare(ymd(a.debut)))}
            date={(e) => (unJour(e) ? DATE_COMPLETE(e.debut) : `du ${DATE_COMPLETE(e.debut)} au ${DATE_COMPLETE(e.fin)}`)}
            passe={(e) => ymd(e.fin) < new Date().toISOString().slice(0, 10)}
            edition={edition}
            setEdition={setEdition}
            fini={fini}
            onSupprimer={(e) => confirm(`Supprimer « ${e.nom} » du calendrier ?`) && supprimer.mutate(e.id)}
          />
          {supprimer.error && <Erreur erreur={supprimer.error} />}
          {edition === "nouveau" ? (
            <Formulaire onFini={fini} onAnnuler={() => setEdition(null)} />
          ) : (
            <Gate perm="marketing.edit">
              <button type="button" className="bouton-second" onClick={() => setEdition("nouveau")}>Ajouter un événement</button>
            </Gate>
          )}
        </div>
      )}
    </section>
  );
}

/** Un groupe d'événements du calendrier (annuels ou ponctuels), modifiables sur place */
function Tableau({
  titre,
  aide,
  vide,
  evenements,
  date,
  passe,
  edition,
  setEdition,
  fini,
  onSupprimer,
}: {
  titre: string;
  aide: string;
  vide: string;
  evenements: EvenementMarketing[];
  date: (e: EvenementMarketing) => string;
  passe?: (e: EvenementMarketing) => boolean;
  edition: EvenementMarketing | "nouveau" | null;
  setEdition: (e: EvenementMarketing | null) => void;
  fini: () => void;
  onSupprimer: (e: EvenementMarketing) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold">
        {titre} <span className="font-normal text-ink-muted">({evenements.length})</span>
      </h3>
      <p className="mb-1 text-xs text-ink-2">{aide}</p>
      {!evenements.length ? (
        <p className="py-2 text-sm text-ink-muted">{vide}</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {evenements.map((e) =>
              edition !== "nouveau" && edition?.id === e.id ? (
                <tr key={e.id} className="border-t border-line">
                  <td colSpan={3} className="py-2">
                    <Formulaire initial={e} onFini={fini} onAnnuler={() => setEdition(null)} />
                  </td>
                </tr>
              ) : (
                <tr key={e.id} className={`border-t border-line ${passe?.(e) ? "text-ink-muted" : ""}`}>
                  <td className="w-1/3 py-2 pr-3 font-medium">{e.nom}</td>
                  <td className="py-2 pr-3 tabular">{date(e)}</td>
                  <td className="whitespace-nowrap py-2 text-right">
                    <button type="button" className="text-sm text-accent hover:underline" onClick={() => setEdition(e)}>Modifier</button>
                    <button type="button" className="ml-3 text-sm text-bad hover:underline" onClick={() => onSupprimer(e)}>
                      Supprimer
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Formulaire({ initial, onFini, onAnnuler }: { initial?: EvenementMarketing; onFini: () => void; onAnnuler: () => void }) {
  const [nom, setNom] = useState(initial?.nom ?? "");
  const [debut, setDebut] = useState(initial?.debut.slice(0, 10) ?? "");
  const [periode, setPeriode] = useState(!!initial && !unJour(initial));
  const [fin, setFin] = useState(initial?.fin.slice(0, 10) ?? "");
  const [annuel, setAnnuel] = useState(initial?.annuel ?? false);
  const enregistrer = useMutation({
    mutationFn: () =>
      api(initial ? `/calendrier-marketing/${initial.id}` : "/calendrier-marketing", {
        method: initial ? "PUT" : "POST",
        json: { nom, debut, fin: periode ? fin : null, annuel },
      }),
    onSuccess: onFini,
  });
  return (
    <form
      className="space-y-2 rounded-md bg-surface-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        enregistrer.mutate();
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="etiquette">Nom *</span>
          <input className="champ w-full" required maxLength={120} placeholder="Saint-Valentin, Coupe du monde…" value={nom} onChange={(e) => setNom(e.target.value)} />
        </label>
        <label>
          <span className="etiquette">{periode ? "Du *" : "Le *"}</span>
          <input className="champ" type="date" required value={debut} onChange={(e) => setDebut(e.target.value)} />
        </label>
        {periode && (
          <label>
            <span className="etiquette">Au *</span>
            <input className="champ" type="date" required min={debut || undefined} value={fin} onChange={(e) => setFin(e.target.value)} />
          </label>
        )}
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={periode} onChange={(e) => setPeriode(e.target.checked)} /> Sur une période</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={annuel} onChange={(e) => setAnnuel(e.target.checked)} /> Chaque année au même jour (sinon : ponctuel)</label>
      </div>
      {enregistrer.error && <Erreur erreur={enregistrer.error} />}
      <div className="flex gap-2">
        <button className="bouton" disabled={enregistrer.isPending}>{enregistrer.isPending ? "Enregistrement…" : "Enregistrer"}</button>
        <button type="button" className="bouton-second" onClick={onAnnuler}>Annuler</button>
      </div>
    </form>
  );
}
