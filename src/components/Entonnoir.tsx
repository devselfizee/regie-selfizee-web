"use client";

import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { euros, nombre, pct } from "@/lib/format";
import { Chargement, Erreur, Section } from "./Etat";

// Parcours invité (avenant des bornes du 26/10/2026) : de la première page à l'impression.

export interface StatsParcours {
  periode: { du: string; au: string };
  commencees: number;
  etapes: Record<"cadre" | "prise" | "photo" | "revelation" | "offre" | "paiement" | "paiement_demande" | "impression", number>;
  payees: number;
  validees: number;
  issues: { issue: string; nb: number }[];
  appels: { lancees: number; engagees: number; payees: number };
  hesitations: { avecRecommencer: number; avecRelancesCouleurs: number; avecRetoursOffre: number };
  upsell: { proposes: number; acceptes: number; montantCents: number };
  dureesMedianesS: { seance: number | null; cadreAPhoto: number | null; photoAOffre: number | null; offreAPaiement: number | null; paiementAImpression: number | null };
  parCadre: { cadre: string | null; commencees: number; offres: number; payees: number }[];
  parHeure: { heure: number; commencees: number; payees: number }[];
}

const MARCHES: { cle: keyof StatsParcours["etapes"] | "commencees" | "payees"; libelle: string }[] = [
  { cle: "commencees", libelle: "Séances commencées" },
  { cle: "cadre", libelle: "Cadre choisi" },
  { cle: "photo", libelle: "Photo prise" },
  { cle: "revelation", libelle: "Photo vue" },
  { cle: "offre", libelle: "Offre vue" },
  { cle: "paiement", libelle: "Paiement affiché" },
  { cle: "paiement_demande", libelle: "Paiement demandé" },
  { cle: "payees", libelle: "Paiement accepté" },
  { cle: "impression", libelle: "Imprimée" },
];

const ISSUES: Record<string, string> = {
  validee: "Photo enregistrée",
  retour: "Retour à l'accueil",
  delai: "Délai d'inactivité",
  appel: "Photo d'appel sans geste",
  autre: "Autre",
};

const duree = (s: number | null) => (s === null ? "—" : s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")}`);

/** Entonnoir du parcours invité, global (lieuId absent) ou d'un lieu. */
export function SectionParcours({ du, au, lieuId }: { du: string; au: string; lieuId?: number }) {
  const chemin = lieuId ? `/stats/lieux/${lieuId}/parcours` : "/stats/parcours";
  const { data, error, isPending } = useQuery({
    queryKey: ["parcours", chemin, du, au],
    queryFn: () => api<StatsParcours>(`${chemin}${qs({ du, au })}`),
  });
  if (error) return <Section titre="Parcours des invités"><Erreur erreur={error} /></Section>;
  if (isPending) return <Section titre="Parcours des invités"><Chargement /></Section>;
  // Rien reçu : la borne n'envoie pas encore ses parcours (logiciel à mettre à jour)
  if (!data.commencees) {
    return (
      <Section titre="Parcours des invités">
        <p className="text-sm text-ink-2">
          Aucun parcours reçu sur la période. Les bornes envoient le parcours de chaque séance (de la première page à l&apos;impression)
          depuis la version du logiciel livrée avec l&apos;avenant du 26/10/2026.
        </p>
      </Section>
    );
  }

  const valeur = (cle: (typeof MARCHES)[number]["cle"]) => (cle === "commencees" ? data.commencees : cle === "payees" ? data.payees : data.etapes[cle]);
  const d = data.dureesMedianesS;

  return (
    <Section titre="Parcours des invités" actions={<span className="text-sm text-ink-2">{nombre(data.commencees)} séances</span>}>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <ol className="space-y-1.5" aria-label="Entonnoir de conversion">
          {MARCHES.map((m, i) => {
            const v = valeur(m.cle);
            const precedente = i > 0 ? valeur(MARCHES[i - 1].cle) : v;
            const part = data.commencees ? v / data.commencees : 0;
            return (
              <li key={m.cle} className="grid grid-cols-[9rem_1fr_auto] items-center gap-3 text-sm">
                <span className="text-ink-2">{m.libelle}</span>
                <span className="h-5 rounded bg-surface-2" aria-hidden>
                  <span className="block h-5 rounded bg-accent/80" style={{ width: `${Math.max(part * 100, v ? 1 : 0)}%` }} />
                </span>
                <span className="w-32 text-right tabular">
                  <strong>{nombre(v)}</strong>
                  <span className="text-xs text-ink-muted"> · {pct(part)}</span>
                  {i > 0 && precedente > 0 && v < precedente && (
                    <span className="block text-xs text-ink-muted" title="Part perdue depuis l'étape précédente">−{pct(1 - v / precedente)} à cette marche</span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="space-y-4 text-sm">
          <div>
            <h3 className="mb-1 text-xs font-medium text-ink-2">Comment les séances se terminent</h3>
            <ul className="space-y-0.5">
              {data.issues.map((x) => (
                <li key={x.issue} className="flex justify-between gap-3 tabular">
                  <span>{ISSUES[x.issue] ?? x.issue}</span>
                  <span>{nombre(x.nb)} <span className="text-ink-muted">· {pct(x.nb / data.commencees)}</span></span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-medium text-ink-2">Temps médians</h3>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 tabular">
              <dt>Séance entière</dt><dd>{duree(d.seance)}</dd>
              <dt>Cadre → photo</dt><dd>{duree(d.cadreAPhoto)}</dd>
              <dt>Photo → offre</dt><dd>{duree(d.photoAOffre)}</dd>
              <dt>Offre → paiement demandé</dt><dd>{duree(d.offreAPaiement)}</dd>
              <dt>Paiement → impression</dt><dd>{duree(d.paiementAImpression)}</dd>
            </dl>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-medium text-ink-2">Hésitations</h3>
            <p className="text-ink-2">
              {pct(data.hesitations.avecRecommencer / data.commencees)} ont recommencé · {pct(data.hesitations.avecRelancesCouleurs / data.commencees)} ont relancé les couleurs ·{" "}
              {pct(data.hesitations.avecRetoursOffre / data.commencees)} sont revenus de l&apos;offre
            </p>
          </div>
          {data.upsell.proposes > 0 && (
            <div>
              <h3 className="mb-1 text-xs font-medium text-ink-2">« +1 pour un pote »</h3>
              <p className="text-ink-2">
                {nombre(data.upsell.acceptes)} acceptés sur {nombre(data.upsell.proposes)} proposés ({pct(data.upsell.acceptes / data.upsell.proposes)}) · {euros(data.upsell.montantCents)}
              </p>
            </div>
          )}
          {data.appels.lancees > 0 && (
            <div>
              <h3 className="mb-1 text-xs font-medium text-ink-2">Photos d&apos;appel</h3>
              <p className="text-ink-2">
                {nombre(data.appels.lancees)} lancées · {nombre(data.appels.engagees)} ont attiré quelqu&apos;un · {nombre(data.appels.payees)} finies en vente
              </p>
            </div>
          )}
        </div>
      </div>

      {data.parCadre.length > 1 && (
        <div className="mt-6 overflow-x-auto">
          <h3 className="mb-2 text-xs font-medium text-ink-2">Par cadre</h3>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Cadre</th>
                <th className="py-1.5 pr-3 text-right font-medium">Séances</th>
                <th className="py-1.5 pr-3 text-right font-medium">Offre vue</th>
                <th className="py-1.5 pr-3 text-right font-medium">Payées</th>
                <th className="py-1.5 text-right font-medium">Conversion</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {data.parCadre.map((c) => (
                <tr key={c.cadre ?? "—"} className="border-t border-line">
                  <td className="py-1.5 pr-3">{c.cadre ?? <span className="text-ink-muted">non choisi</span>}</td>
                  <td className="py-1.5 pr-3 text-right">{nombre(c.commencees)}</td>
                  <td className="py-1.5 pr-3 text-right">{nombre(c.offres)}</td>
                  <td className="py-1.5 pr-3 text-right">{nombre(c.payees)}</td>
                  <td className="py-1.5 text-right">{pct(c.commencees ? c.payees / c.commencees : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
