"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, type ListeProspects } from "@/lib/api";
import { euros, eurosRond, pct } from "@/lib/format";
import { Reserve } from "@/lib/session";
import { Chargement, EnTete, Erreur, Vide } from "@/components/Etat";
import { Classe, CONFIANCE, Precision } from "@/components/Prospect";

export default function PageProspects() {
  return (
    <Reserve roles={["ADMIN", "COMMERCIAL"]}>
      <Prospects />
    </Reserve>
  );
}

function Prospects() {
  const { data, error, isPending } = useQuery({ queryKey: ["prospects"], queryFn: () => api<ListeProspects>("/prospects") });
  return (
    <>
      <EnTete
        titre="Prospects"
        sousTitre="Lieux à démarcher, classés par CA estimé d'après les lieux équipés qui leur ressemblent."
        actions={<Link href="/lieux/nouveau?statut=PROSPECT" className="bouton">Nouveau prospect</Link>}
      />
      {error && <Erreur erreur={error} />}
      {isPending && !error && <Chargement />}
      {data && !data.prospects.length && <Vide>Aucun prospect. Créez une fiche lieu avec le statut « Prospect ».</Vide>}
      {data && data.prospects.length > 0 && (
        <>
          <div className="carte overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-2">
                <tr>
                  <th className="px-4 py-3 font-medium">Prospect</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 text-right font-medium">CA / jour ouvert estimé</th>
                  <th className="px-4 py-3 text-right font-medium">CA annuel estimé</th>
                  <th className="px-4 py-3 font-medium">Confiance</th>
                  <th className="px-4 py-3 text-right font-medium">Fiche remplie</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {data.prospects.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="px-4 py-3">
                      <Link className="font-medium hover:underline" href={`/lieux/${p.id}`}>{p.enseigne}</Link>
                      <div className="text-xs text-ink-muted">{[p.typeLieu, p.ville].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="px-4 py-3">{p.estimation ? <Classe e={p.estimation} /> : "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {p.estimation ? (
                        <>
                          {euros(p.estimation.caJourOuvertCents)}
                          <div className="text-xs text-ink-muted">{euros(p.estimation.basseCents)} – {euros(p.estimation.hauteCents)}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.caAnnuelCents !== null ? eurosRond(p.caAnnuelCents) : <span className="text-xs text-ink-muted">saisons à saisir</span>}
                    </td>
                    <td className="px-4 py-3">{p.estimation ? CONFIANCE[p.estimation.confiance] : "—"}</td>
                    <td className={`px-4 py-3 text-right ${p.completude.taux < 0.5 ? "text-warn-ink" : ""}`}>{pct(p.completude.taux)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <Precision l={data} />
          </div>
        </>
      )}
    </>
  );
}
