"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, qs, type Granularite, type StatsGlobales } from "@/lib/api";
import { MenuExport } from "@/components/BoutonExport";
import { euros, eurosRond, jour, MOYENS, nombre, pct } from "@/lib/format";

// « 25/10 22:48 » : l'année se devine
const jourHeureCourtFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const jourHeureCourt = (iso: string) => jourHeureCourtFmt.format(new Date(iso)).replace(",", "");
import { KpiCouleur } from "@/components/KpiCouleur";
import { BasculeHt, usePreferenceHt } from "@/components/BasculeHt";
import { GraphiqueCA } from "@/components/GraphiqueCA";
import { axeCategorie, axeValeur, Graphique, type Jetons } from "@/components/Graphique";
import { PrevisionGlobaleSection } from "@/components/SectionPrevision";
import { aujourdhui, FiltresPage, useFiltresPage, ymd } from "@/components/FiltresPage";
import { Chargement, EnTete, Erreur, Section, Vide } from "@/components/Etat";
import { useMoi } from "@/lib/session";
import { useDroits } from "@/lib/perms";

export default function Accueil() {
  const moi = useMoi();
  const router = useRouter();
  // Sans tableau de bord (droits Konitys) : vers la première page permise (bornes, son lieu), sinon le refus
  const a = useDroits();
  const redirection = a("pages.tableau_de_bord.view") ? null : a("pages.bornes.view") ? "/bornes" : moi.lieuId ? `/lieux/${moi.lieuId}` : "/403";
  useEffect(() => {
    if (redirection) router.replace(redirection);
  }, [redirection, router]);
  return redirection ? null : <VueGlobale />;
}

// ─── Période (retour de Sébastien, comme boothpay : les ventes du jour par défaut), parc et lieu : FiltresPage ───

/** Granularité de la courbe proposée selon la durée (une journée : par heure, à part). */
const granulariteAuto = (du: string, au: string): Granularite => {
  const jours = (new Date(au).getTime() - new Date(du).getTime()) / 86_400_000 + 1;
  return jours <= 31 ? "jour" : jours <= 120 ? "semaine" : "mois";
};


function VueGlobale() {
  const f = useFiltresPage("jour");
  const { du, au, lieuId, parc } = f;
  const [ht, setHt] = usePreferenceHt();
  const [granularite, setGranularite] = useState<Granularite | null>(null);

  const gran = granularite ?? granulariteAuto(du, au);
  const query = qs({ du, au, granularite: gran, lieuId, parc });

  const { data, error, isPending, isFetching } = useQuery({
    queryKey: ["stats-global", query],
    queryFn: () => api<StatsGlobales>(`/stats/global${query}`),
    placeholderData: keepPreviousData,
    // Les ventes du jour arrivent au fil de l'eau
    refetchInterval: f.etat.cle === "jour" ? 60_000 : false,
  });

  return (
    <>
      <EnTete
        titre="Tableau de bord"
        sousTitre={`${du === au ? `Le ${jour(du)}` : `Du ${jour(du)} au ${jour(au)}`}${isFetching ? " · mise à jour…" : ""}`}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <BasculeHt ht={ht} onChange={setHt} />
            <FiltresPage f={f} prefixe="tdb" onPeriode={() => setGranularite(null)} />
            <MenuExport
              exports={[
                { libelle: "Ventes", chemin: "/export/transactions", requete: query },
                { libelle: "Classement des lieux", chemin: "/export/classement", requete: query },
              ]}
            />
          </div>
        }
      />

      {error && <Erreur erreur={error} />}
      {isPending && !error && <Chargement />}
      {data && <Contenu data={data} ht={ht} granularite={gran} setGranularite={setGranularite} parc={f.etat.parc} lieuId={f.etat.lieuId} />}
    </>
  );
}

function Contenu({
  data,
  ht,
  granularite,
  setGranularite,
  parc,
  lieuId,
}: {
  data: StatsGlobales;
  ht: boolean;
  granularite: Granularite;
  setGranularite: (g: Granularite) => void;
  parc: string;
  lieuId: string;
}) {
  const { courant: c, precedente: p } = data.kpis;
  const montant = (k: { caTtcCents: number; caHtCents: number }) => (ht ? k.caHtCents : k.caTtcCents);
  const suffixe = ht ? "HT" : "TTC";
  const unJour = data.periode.du === data.periode.au;
  // Journée en cours : la comparer à toute la journée d'hier n'a pas de sens (toujours en baisse le matin)
  const enCours = unJour && data.periode.du === ymd(aujourdhui());
  const comparer = (courant: number, precedente: number) => (enCours ? {} : { courant, precedente });
  // Des centaines de lieux : seulement ceux qui ont vendu sur la période (retour de Sébastien)
  const lieux = data.classement.filter((l) => l.caTtcCents > 0 || l.nbVentes > 0).sort((a, b) => montant(b) - montant(a));

  return (
    <div className="space-y-6">
      {/* Bloc chiffres, en couleur comme les autres tableaux de bord Konitys */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7">
        <KpiCouleur
          teinte="vert"
          icone="billet"
          libelle={`Encaissé ${suffixe}`}
          valeur={euros(montant(c))}
          detail={ht ? `TTC : ${euros(c.caTtcCents)}` : `HT : ${euros(c.caHtCents)}`}
          {...comparer(montant(c), montant(p))}
        />
        <KpiCouleur teinte="bleu" icone="image" libelle="Photos achetées" valeur={nombre(c.photosAchetees)} detail="séances payées" {...comparer(c.photosAchetees, p.photosAchetees)} />
        <KpiCouleur teinte="indigo" icone="numerique" libelle="Versions numériques" valeur={nombre(c.versionsNumeriques)} detail="achetées" {...comparer(c.versionsNumeriques, p.versionsNumeriques)} />
        <KpiCouleur teinte="violet" icone="imprimante" libelle="Impressions payantes" valeur={nombre(c.impressionsPayantes)} detail="tirages payés" {...comparer(c.impressionsPayantes, p.impressionsPayantes)} />
        <KpiCouleur
          teinte="turquoise"
          icone="appareil"
          libelle="Photos prises"
          valeur={nombre(c.photosPrises)}
          detail={c.sourcePhotosPrises === "parcours" ? "d'après le parcours des invités" : "arrivées au paiement"}
          {...comparer(c.photosPrises, p.photosPrises)}
        />
        <KpiCouleur
          teinte="orange"
          icone="pourcent"
          libelle="Taux de conversion"
          valeur={pct(c.tauxConversion)}
          detail={`${nombre(c.photosAchetees)} / ${nombre(c.photosPrises)}`}
          {...comparer(c.tauxConversion, p.tauxConversion)}
        />
        <KpiCouleur
          teinte="rose"
          icone="sac"
          libelle={`Panier moyen ${suffixe}`}
          valeur={euros(ht ? c.panierPhotoHtCents : c.panierPhotoTtcCents)}
          detail="par photo achetée"
          {...comparer(ht ? c.panierPhotoHtCents : c.panierPhotoTtcCents, ht ? p.panierPhotoHtCents : p.panierPhotoTtcCents)}
        />
      </div>
      {c.tests && c.tests.nbVentes > 0 && <LigneTests tests={c.tests} />}

      {/* Graphique d'évolution du CA */}
      <Section
        titre={unJour ? `Chiffre d'affaires ${suffixe} de la journée, par heure` : `Évolution du chiffre d'affaires ${suffixe}`}
        actions={
          unJour ? undefined : (
            <div className="flex gap-1" role="group" aria-label="Regrouper par">
              {(
                [
                  ["jour", "Jour"],
                  ["semaine", "Semaine"],
                  ["mois", "Mois"],
                ] as const
              ).map(([g, l]) => (
                <button
                  key={g}
                  type="button"
                  aria-pressed={granularite === g}
                  onClick={() => setGranularite(g)}
                  className={`rounded-md px-2.5 py-1 text-xs ${granularite === g ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2 hover:text-ink"}`}
                >
                  {l}
                </button>
              ))}
            </div>
          )
        }
      >
        {unJour ? (
          <ParHeure heures={data.parHeure} ht={ht} />
        ) : (
          <GraphiqueCA du={data.periode.du} au={data.periode.au} granularite={data.granularite} serie={data.serie} serieN1={data.serieN1} ht={ht} />
        )}
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Classement des lieux */}
        <Section titre="Classement des lieux">
          {lieux.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-ink-2">
                  <tr>
                    <th className="py-2 pr-3 font-medium">#</th>
                    <th className="py-2 pr-3 font-medium">Lieu</th>
                    <th className="py-2 pr-3 text-right font-medium">CA {suffixe}</th>
                    <th className="py-2 text-right font-medium">Ventes</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {lieux.map((l, i) => (
                    <tr key={l.lieuId} className="border-t border-line">
                      <td className="py-2 pr-3 text-ink-muted">{i + 1}</td>
                      <td className="py-2 pr-3">
                        <Link className="font-medium hover:underline" href={`/lieux/${l.lieuId}`}>{l.enseigne}</Link>
                        {l.ville && <div className="text-xs text-ink-muted">{l.ville}</div>}
                      </td>
                      <td className="py-2 pr-3 text-right">{euros(montant(l))}</td>
                      <td className="py-2 text-right text-ink-2">{nombre(l.nbVentes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Vide>Aucune vente sur la période.</Vide>
          )}
        </Section>

        {/* Dernières ventes */}
        <Section titre="Dernières ventes" actions={<Link className="text-sm text-accent hover:underline" href="/paiements">Tous les paiements</Link>}>
          {data.dernieresVentes.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-ink-2">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Quand</th>
                    <th className="py-2 pr-3 font-medium">Lieu · borne</th>
                    <th className="py-2 pr-3 font-medium">Achat</th>
                    <th className="py-2 text-right font-medium">{suffixe}</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {data.dernieresVentes.map((v) => (
                    <tr key={v.id} className="border-t border-line">
                      <td className="py-2 pr-3 whitespace-nowrap text-ink-2">{jourHeureCourt(v.horodatage)}</td>
                      <td className="py-2 pr-3">
                        <Link className="hover:underline" href={`/lieux/${v.lieuId}`}>{v.lieu}</Link>
                        <span className="text-ink-muted"> · {v.borne}</span>
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
          ) : (
            <Vide>Aucune vente sur la période.</Vide>
          )}
        </Section>
      </div>

      {/* Prévision du mois ; l'état des bornes est sur la page Monitoring live (retour de Sébastien) */}
      <PrevisionGlobaleSection ht={ht} parc={parc} lieuId={lieuId} />
    </div>
  );
}

/** CA d'une journée par heure (barres). */
function ParHeure({ heures, ht }: { heures: StatsGlobales["parHeure"]; ht: boolean }) {
  const option = useCallback(
    (j: Jetons) => ({
      legend: { show: false },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (items: { dataIndex: number }[]) => {
          const h = heures[items[0].dataIndex];
          return `<b>${h.heure} h – ${h.heure + 1} h</b><br>${euros(ht ? h.caHtCents : h.caTtcCents)} · ${nombre(h.nbVentes)} ventes`;
        },
      },
      xAxis: axeCategorie(j, heures.map((h) => `${h.heure} h`)),
      yAxis: axeValeur(j, (v: number) => eurosRond(v * 100)),
      series: [
        {
          type: "bar",
          data: heures.map((h) => (ht ? h.caHtCents : h.caTtcCents) / 100),
          barMaxWidth: 22,
          itemStyle: { color: j.viz1, borderRadius: [4, 4, 0, 0] },
        },
      ],
    }),
    [heures, ht]
  );
  if (!heures.some((h) => h.caTtcCents > 0)) return <Vide>Aucune vente sur la journée pour l&apos;instant.</Vide>;
  return <Graphique option={option} description={`Chiffre d'affaires ${ht ? "HT" : "TTC"} de la journée par heure`} />;
}

/** Ventes des cartes de test sur la période : à part, hors chiffres ci-dessus */
function LigneTests({ tests }: { tests: { nbVentes: number; caTtcCents: number } }) {
  return (
    <p className="-mt-3 text-sm text-ink-2">
      Hors chiffres : {nombre(tests.nbVentes)} vente{tests.nbVentes > 1 ? "s" : ""} de test ({euros(tests.caTtcCents)} TTC) avec les{" "}
      <Link href="/paiements?cartes=test" className="text-accent hover:underline">
        cartes de test
      </Link>
      .
    </p>
  );
}
