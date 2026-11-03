"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type EvenementMarketing } from "@/lib/api";
import { jour } from "@/lib/format";
import { Badge, Chargement, Erreur } from "./Etat";

const JOURS_MOIS = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });

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
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="py-2 pr-3 font-medium">Événement</th>
                <th className="py-2 pr-3 font-medium">Date</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((e) =>
                edition !== "nouveau" && edition?.id === e.id ? (
                  <tr key={e.id} className="border-t border-line">
                    <td colSpan={3} className="py-2">
                      <Formulaire initial={e} onFini={fini} onAnnuler={() => setEdition(null)} />
                    </td>
                  </tr>
                ) : (
                  <tr key={e.id} className="border-t border-line">
                    <td className="py-2 pr-3 font-medium">{e.nom}</td>
                    <td className="py-2 pr-3">
                      {e.annuel ? (
                        <>
                          {e.debut === e.fin ? `le ${JOURS_MOIS(e.debut)}` : `du ${JOURS_MOIS(e.debut)} au ${JOURS_MOIS(e.fin)}`} <Badge ton="neutre">chaque année</Badge>
                        </>
                      ) : e.debut === e.fin ? (
                        jour(e.debut)
                      ) : (
                        `du ${jour(e.debut)} au ${jour(e.fin)}`
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2 text-right">
                      <button type="button" className="text-sm text-accent hover:underline" onClick={() => setEdition(e)}>Modifier</button>
                      <button
                        type="button"
                        className="ml-3 text-sm text-bad hover:underline"
                        onClick={() => confirm(`Supprimer « ${e.nom} » du calendrier ?`) && supprimer.mutate(e.id)}
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
          {supprimer.error && <Erreur erreur={supprimer.error} />}
          {edition === "nouveau" ? (
            <Formulaire onFini={fini} onAnnuler={() => setEdition(null)} />
          ) : (
            <button type="button" className="bouton-second" onClick={() => setEdition("nouveau")}>Ajouter un événement</button>
          )}
        </div>
      )}
    </section>
  );
}

function Formulaire({ initial, onFini, onAnnuler }: { initial?: EvenementMarketing; onFini: () => void; onAnnuler: () => void }) {
  const [nom, setNom] = useState(initial?.nom ?? "");
  const [debut, setDebut] = useState(initial?.debut.slice(0, 10) ?? "");
  const [periode, setPeriode] = useState(!!initial && initial.debut !== initial.fin);
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
        <label className="flex items-center gap-2"><input type="checkbox" checked={annuel} onChange={(e) => setAnnuel(e.target.checked)} /> Chaque année au même jour</label>
      </div>
      {enregistrer.error && <Erreur erreur={enregistrer.error} />}
      <div className="flex gap-2">
        <button className="bouton" disabled={enregistrer.isPending}>{enregistrer.isPending ? "Enregistrement…" : "Enregistrer"}</button>
        <button type="button" className="bouton-second" onClick={onAnnuler}>Annuler</button>
      </div>
    </form>
  );
}
