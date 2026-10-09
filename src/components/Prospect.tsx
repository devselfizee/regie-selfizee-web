"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, type EstimationProspect, type ListeProspects, type Prospect } from "@/lib/api";
import { euros, eurosRond, pct } from "@/lib/format";
import { Badge, Chargement, Erreur, Section } from "./Etat";

const TON_CLASSE = { A: "ok", B: "ok", C: "warn", D: "crit" } as const;
export const CONFIANCE = { FORTE: "forte", MOYENNE: "moyenne", FAIBLE: "faible" } as const;

export const Classe = ({ e }: { e: EstimationProspect }) => (
  <Badge ton={TON_CLASSE[e.classe]}>
    {e.classe} · {e.score}/100
  </Badge>
);

/** Lecture de la précision de la méthode, mesurée sur le parc actuel. */
export function Precision({ l }: { l: Pick<ListeProspects, "references" | "precision"> }) {
  return (
    <p className="text-xs text-ink-muted">
      Estimation d&apos;après les lieux équipés les plus semblables ({l.references} lieu(x) de référence, ouverts et équipés au moins 30 jours sur les 12 derniers mois).
      {l.precision && <> Testée sur le parc actuel (chaque lieu estimé à partir des autres) : écart médian de {pct(l.precision.ecartMedian)} avec le CA réel.</>}
      {" "}Le score situe l&apos;estimation dans le parc : 70/100 = ferait mieux que 70 % des lieux équipés.
    </p>
  );
}

/** Fiche d'un prospect : potentiel estimé et lieux semblables retenus. */
export function SectionPotentiel({ lieuId }: { lieuId: number }) {
  const { data: p, error } = useQuery({
    queryKey: ["prospect", lieuId],
    queryFn: () => api<Prospect & Pick<ListeProspects, "references" | "precision">>(`/prospects/${lieuId}`),
  });
  return (
    <Section titre="Potentiel estimé">
      {error && <Erreur erreur={error} />}
      {!p && !error && <Chargement />}
      {p && !p.estimation && <p className="text-sm text-ink-2">Aucun lieu équipé de référence pour l&apos;instant : pas d&apos;estimation possible.</p>}
      {p?.estimation && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <div className="text-xs font-medium text-ink-2">CA par jour d&apos;ouverture</div>
              <div className="text-2xl font-semibold">{euros(p.estimation.caJourOuvertCents)}</div>
              <div className="text-xs text-ink-2">entre {euros(p.estimation.basseCents)} et {euros(p.estimation.hauteCents)}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-ink-2">CA annuel estimé</div>
              <div className="text-2xl font-semibold">{p.caAnnuelCents !== null ? eurosRond(p.caAnnuelCents) : "—"}</div>
              <div className="text-xs text-ink-2">
                {p.joursOuvertsAn !== null ? `${p.joursOuvertsAn} jours d'ouverture sur 12 mois` : "Saisissez les saisons du lieu pour l'estimer"}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-ink-2">Score</div>
              <div className="mt-1"><Classe e={p.estimation} /></div>
              <div className="mt-1 text-xs text-ink-2">confiance {CONFIANCE[p.estimation.confiance]} · fiche remplie à {pct(p.completude.taux)}</div>
            </div>
          </div>

          {p.completude.manquants.length > 0 && (
            <p className="text-sm text-ink-2">Pour affiner, complétez la fiche : {p.completude.manquants.join(", ").toLowerCase()}.</p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-2">
                <tr>
                  <th className="py-2 pr-4 font-medium">Lieux semblables retenus</th>
                  <th className="py-2 pr-4 text-right font-medium">Ressemblance</th>
                  <th className="py-2 pr-4 text-right font-medium">CA / jour ouvert</th>
                  <th className="py-2 pr-4 font-medium">En commun</th>
                  <th className="py-2 font-medium">Différences</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {p.estimation.voisins.map((v, i) => (
                  <tr key={i} className="border-t border-line align-top">
                    <td className="py-2 pr-4">
                      {v.id ? <Link className="hover:underline" href={`/lieux/${v.id}`}>{v.enseigne}</Link> : <span className="text-ink-2">{v.enseigne}</span>}
                    </td>
                    <td className="py-2 pr-4 text-right">{pct(v.similarite)}</td>
                    <td className="py-2 pr-4 text-right">{euros(v.caJourOuvertCents)}</td>
                    <td className="py-2 pr-4 text-xs text-ink-2">{v.communs.join(", ") || "—"}</td>
                    <td className="py-2 text-xs text-ink-2">{v.differences.join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Precision l={p} />
        </div>
      )}
    </Section>
  );
}
