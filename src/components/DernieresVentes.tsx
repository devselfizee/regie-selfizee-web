import Link from "next/link";
import type { StatsGlobales } from "@/lib/api";
import { euros, MOYENS } from "@/lib/format";
import { Vide } from "./Etat";

const jourHeureCourtFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const jourHeureCourt = (iso: string) => jourHeureCourtFmt.format(new Date(iso)).replace(",", "");

/** Les dernières ventes débitées (tableau de bord, fiche lieu) ; sansLieu : seulement la borne (fiche d'un lieu) */
export function DernieresVentes({ ventes, ht, sansLieu = false }: { ventes: StatsGlobales["dernieresVentes"]; ht: boolean; sansLieu?: boolean }) {
  if (!ventes.length) return <Vide>Aucune vente sur la période.</Vide>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-2">
          <tr>
            <th className="py-2 pr-3 font-medium">Quand</th>
            <th className="w-12 py-2 pr-3" aria-label="Photo" />
            <th className="py-2 pr-3 font-medium">{sansLieu ? "Borne" : "Lieu · borne"}</th>
            <th className="py-2 pr-3 font-medium">Achat</th>
            <th className="py-2 text-right font-medium">{ht ? "HT" : "TTC"}</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {ventes.map((v) => (
            <tr key={v.id} className="border-t border-line">
              <td className="py-2 pr-3 whitespace-nowrap text-ink-2">{jourHeureCourt(v.horodatage)}</td>
              <td className="py-1.5 pr-3">
                {v.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- vignette (data URL) de la séance
                  <img src={v.photoUrl} alt="" loading="lazy" className="h-10 w-10 rounded object-cover" />
                ) : (
                  <span className="block h-10 w-10 rounded bg-surface-2" aria-hidden />
                )}
              </td>
              <td className="py-2 pr-3">
                {sansLieu ? (
                  v.borne
                ) : (
                  <>
                    <Link className="hover:underline" href={`/lieux/${v.lieuId}`}>{v.lieu}</Link>
                    <span className="text-ink-muted"> · {v.borne}</span>
                  </>
                )}
              </td>
              <td className="py-2 pr-3 text-ink-2">
                {v.produitLibelle ?? v.produitCode}
                {v.nbTirages > 0 && !/tirage/i.test(v.produitLibelle ?? "") && ` · ${v.nbTirages} tirage${v.nbTirages > 1 ? "s" : ""}`}
                <div className="text-xs text-ink-muted">{MOYENS[v.moyenPaiement] ?? v.moyenPaiement}</div>
              </td>
              <td className="py-2 text-right">{euros(ht ? v.montantHtCents : v.montantTtcCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
