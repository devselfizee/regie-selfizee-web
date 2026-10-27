"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMoi } from "@/lib/session";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, qs, type Granularite, type LieuListe, type StatsGlobales } from "@/lib/api";
import { Exporter } from "@/components/BoutonExport";
import { dateHeure, depuis, euros, eurosRond, jour, MOYENS, nombre, pct } from "@/lib/format";
import { Kpi } from "@/components/Kpi";
import { GraphiqueCA } from "@/components/GraphiqueCA";
import { axeCategorie, axeValeur, Graphique, type Jetons } from "@/components/Graphique";
import { PrevisionGlobaleSection } from "@/components/SectionPrevision";
import { SectionParcours } from "@/components/Entonnoir";
import { Badge, Chargement, EnTete, Erreur, Section, Vide } from "@/components/Etat";

export default function Accueil() {
  const moi = useMoi();
  const router = useRouter();
  const redirection = moi.role === "TECHNICIEN" ? "/bornes" : moi.role === "PARTENAIRE" ? `/lieux/${moi.lieuId}` : null;
  useEffect(() => {
    if (redirection) router.replace(redirection);
  }, [redirection, router]);
  return redirection ? null : <VueGlobale />;
}

// ─── Période (retour de Sébastien, comme boothpay : les ventes du jour par défaut) ───

const ymd = (d: Date) => d.toISOString().slice(0, 10);
// Aujourd'hui en heure de Paris, à minuit UTC (dates « métier »)
const aujourdhui = () => new Date(new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date()) + "T00:00:00Z");
const plusJours = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const lundi = (d: Date) => plusJours(d, -((d.getUTCDay() + 6) % 7));

const PERIODES: { cle: string; libelle: string; calcul?: () => { du: Date; au: Date } }[] = [
  { cle: "jour", libelle: "Aujourd'hui", calcul: () => ({ du: aujourdhui(), au: aujourdhui() }) },
  { cle: "hier", libelle: "Hier", calcul: () => ({ du: plusJours(aujourdhui(), -1), au: plusJours(aujourdhui(), -1) }) },
  { cle: "7j", libelle: "7 derniers jours", calcul: () => ({ du: plusJours(aujourdhui(), -6), au: aujourdhui() }) },
  { cle: "30j", libelle: "30 derniers jours", calcul: () => ({ du: plusJours(aujourdhui(), -29), au: aujourdhui() }) },
  { cle: "semaine", libelle: "Cette semaine", calcul: () => ({ du: lundi(aujourdhui()), au: aujourdhui() }) },
  { cle: "semaine-1", libelle: "Semaine dernière", calcul: () => ({ du: plusJours(lundi(aujourdhui()), -7), au: plusJours(lundi(aujourdhui()), -1) }) },
  {
    cle: "mois",
    libelle: "Ce mois",
    calcul: () => {
      const a = aujourdhui();
      return { du: new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1)), au: a };
    },
  },
  {
    cle: "mois-1",
    libelle: "Mois précédent",
    calcul: () => {
      const a = aujourdhui();
      return { du: new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() - 1, 1)), au: new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 0)) };
    },
  },
  {
    cle: "annee",
    libelle: "Cette année",
    calcul: () => {
      const a = aujourdhui();
      return { du: new Date(Date.UTC(a.getUTCFullYear(), 0, 1)), au: a };
    },
  },
  { cle: "perso", libelle: "Période personnalisée" },
];

/** Granularité de la courbe proposée selon la durée (une journée : par heure, à part). */
const granulariteAuto = (du: string, au: string): Granularite => {
  const jours = (new Date(au).getTime() - new Date(du).getTime()) / 86_400_000 + 1;
  return jours <= 31 ? "jour" : jours <= 120 ? "semaine" : "mois";
};

// Préférence HT / TTC gardée sur ce navigateur
const CLE_HT = "regie_tdb_ht";
const lireHt = () => {
  try {
    return localStorage.getItem(CLE_HT) === "1";
  } catch {
    return false;
  }
};

function VueGlobale() {
  const [cle, setCle] = useState("jour");
  const [perso, setPerso] = useState(() => ({ du: ymd(plusJours(aujourdhui(), -29)), au: ymd(aujourdhui()) }));
  const [lieuId, setLieuId] = useState("");
  // Parc Selfizee par défaut : les clients en location financière à part (demande de Sébastien)
  const [parc, setParc] = useState("SELFIZEE");
  const [ht, setHtEtat] = useState(lireHt);
  const [granularite, setGranularite] = useState<Granularite | null>(null);
  const setHt = (v: boolean) => {
    setHtEtat(v);
    try {
      localStorage.setItem(CLE_HT, v ? "1" : "0");
    } catch {
      /* stockage indisponible : la préférence vaut pour la visite */
    }
  };

  const choisie = PERIODES.find((p) => p.cle === cle);
  const { du, au } = choisie?.calcul ? (({ du, au }) => ({ du: ymd(du), au: ymd(au) }))(choisie.calcul()) : perso;
  const gran = granularite ?? granulariteAuto(du, au);
  const query = qs({ du, au, granularite: gran, lieuId: lieuId || undefined, parc: lieuId ? undefined : parc || undefined });

  const lieux = useQuery({ queryKey: ["lieux", "tdb"], queryFn: () => api<LieuListe[]>("/lieux"), staleTime: 5 * 60_000 });
  const { data, error, isPending, isFetching } = useQuery({
    queryKey: ["stats-global", query],
    queryFn: () => api<StatsGlobales>(`/stats/global${query}`),
    placeholderData: keepPreviousData,
    // Les ventes du jour arrivent au fil de l'eau
    refetchInterval: cle === "jour" ? 60_000 : false,
  });

  return (
    <>
      <EnTete
        titre="Tableau de bord"
        sousTitre={`${du === au ? `Le ${jour(du)}` : `Du ${jour(du)} au ${jour(au)}`}${isFetching ? " · mise à jour…" : ""}`}
        actions={
          <>
            <Exporter libelle="Ventes" chemin="/export/transactions" requete={query} />
            <Exporter libelle="Classement" chemin="/export/classement" requete={query} />
          </>
        }
      />

      <div className="carte mb-6 flex flex-wrap items-end gap-3 p-3">
        <div className="flex rounded-md bg-surface-2 p-1" role="group" aria-label="Montants">
          {[false, true].map((v) => (
            <button
              key={String(v)}
              type="button"
              aria-pressed={ht === v}
              onClick={() => setHt(v)}
              className={`rounded px-3 py-1.5 text-sm font-medium ${ht === v ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink"}`}
            >
              {v ? "HT" : "TTC"}
            </button>
          ))}
        </div>
        <label>
          <span className="etiquette">Parc</span>
          <select id="tdb-parc" className="champ" value={parc} onChange={(e) => setParc(e.target.value)} disabled={!!lieuId}>
            <option value="SELFIZEE">Parc Selfizee</option>
            <option value="CLIENT">Parc client</option>
            <option value="">Tout</option>
          </select>
        </label>
        <label className="min-w-48">
          <span className="etiquette">Lieu</span>
          <select id="tdb-lieu" className="champ" value={lieuId} onChange={(e) => setLieuId(e.target.value)}>
            <option value="">Tous les lieux</option>
            {lieux.data
              ?.filter((l) => l.statut === "ACTIF" && (!parc || l.parc === parc))
              .map((l) => <option key={l.id} value={l.id}>{l.enseigne}{l.ville ? ` · ${l.ville}` : ""}</option>)}
          </select>
        </label>
        <label className="min-w-48">
          <span className="etiquette">Période</span>
          <select
            id="tdb-periode"
            className="champ"
            value={cle}
            onChange={(e) => {
              setCle(e.target.value);
              setGranularite(null);
            }}
          >
            {PERIODES.map((p) => <option key={p.cle} value={p.cle}>{p.libelle}</option>)}
          </select>
        </label>
        {cle === "perso" && (
          <>
            <label>
              <span className="etiquette">Du</span>
              <input id="tdb-du" type="date" className="champ" value={perso.du} max={perso.au} onChange={(e) => e.target.value && setPerso({ ...perso, du: e.target.value })} />
            </label>
            <label>
              <span className="etiquette">Au</span>
              <input id="tdb-au" type="date" className="champ" value={perso.au} min={perso.du} onChange={(e) => e.target.value && setPerso({ ...perso, au: e.target.value })} />
            </label>
          </>
        )}
      </div>

      {error && <Erreur erreur={error} />}
      {isPending && !error && <Chargement />}
      {data && <Contenu data={data} ht={ht} granularite={gran} setGranularite={setGranularite} />}
    </>
  );
}

function Contenu({
  data,
  ht,
  granularite,
  setGranularite,
}: {
  data: StatsGlobales;
  ht: boolean;
  granularite: Granularite;
  setGranularite: (g: Granularite) => void;
}) {
  const { courant: c, precedente: p, n1 } = data.kpis;
  const montant = (k: { caTtcCents: number; caHtCents: number }) => (ht ? k.caHtCents : k.caTtcCents);
  const suffixe = ht ? "HT" : "TTC";
  const unJour = data.periode.du === data.periode.au;
  const lieux = [...data.classement].sort((a, b) => montant(b) - montant(a));

  return (
    <div className="space-y-6">
      {/* Bloc chiffres */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Kpi
          libelle={`Encaissé ${suffixe}`}
          valeur={euros(montant(c))}
          courant={montant(c)}
          precedente={montant(p)}
          n1={montant(n1)}
          detail={ht ? `TTC : ${euros(c.caTtcCents)}` : `HT : ${euros(c.caHtCents)} · TVA : ${euros(c.caTtcCents - c.caHtCents)}`}
        />
        <Kpi libelle="Photos achetées" valeur={nombre(c.photosAchetees)} courant={c.photosAchetees} precedente={p.photosAchetees} n1={n1.photosAchetees} detail="séances payées" />
        <Kpi libelle="Versions numériques" valeur={nombre(c.versionsNumeriques)} courant={c.versionsNumeriques} precedente={p.versionsNumeriques} detail="achetées" />
        <Kpi libelle="Impressions payantes" valeur={nombre(c.impressionsPayantes)} courant={c.impressionsPayantes} precedente={p.impressionsPayantes} detail="tirages payés" />
        <Kpi libelle="Photos prises" valeur={nombre(c.photosPrises)} courant={c.photosPrises} precedente={p.photosPrises} detail={c.sourcePhotosPrises === "parcours" ? "d'après le parcours des invités" : "arrivées au paiement"} />
        <Kpi
          libelle="Taux de conversion"
          valeur={pct(c.tauxConversion)}
          courant={c.tauxConversion}
          precedente={p.tauxConversion}
          detail={`${nombre(c.photosAchetees)} / ${nombre(c.photosPrises)}`}
        />
        <Kpi
          libelle={`Panier moyen ${suffixe}`}
          valeur={euros(ht ? c.panierPhotoHtCents : c.panierPhotoTtcCents)}
          courant={ht ? c.panierPhotoHtCents : c.panierPhotoTtcCents}
          precedente={ht ? p.panierPhotoHtCents : p.panierPhotoTtcCents}
          detail="par photo achetée"
        />
      </div>

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
                        <div className="text-xs text-ink-muted">{[l.typeLieu, l.ville].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td className="py-2 pr-3 text-right">{euros(montant(l))}</td>
                      <td className="py-2 text-right text-ink-2">{nombre(l.nbVentes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Vide>Aucun lieu actif.</Vide>
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
                      <td className="py-2 pr-3 whitespace-nowrap text-ink-2">{dateHeure(v.horodatage)}</td>
                      <td className="py-2 pr-3">
                        <Link className="hover:underline" href={`/lieux/${v.lieuId}`}>{v.lieu}</Link>
                        <span className="text-ink-muted"> · {v.borne}</span>
                      </td>
                      <td className="py-2 pr-3 text-ink-2">
                        {v.produitLibelle ?? v.produitCode}
                        {v.nbTirages > 0 && ` · ${v.nbTirages} tirage${v.nbTirages > 1 ? "s" : ""}`}
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

      {/* Compléments : commissions, prévisions, état du parc */}
      {data.commissions && (
        <div className="carte p-4">
          <div className="text-xs font-medium text-ink-2">Commissions dues · CA net Selfizee (TTC)</div>
          <div className="mt-1 text-lg font-semibold">
            {euros(data.commissions.montantCents)} <span className="text-sm font-normal text-ink-2">· net {eurosRond(c.caTtcCents - data.commissions.montantCents)}</span>
          </div>
          <div className="mt-1 text-xs text-ink-muted">
            {data.commissions.nbPeriodes} période(s) de commission terminée(s) dans l&apos;intervalle
            {data.commissions.nbAValider > 0 && <> · <Link className="text-accent hover:underline" href="/reversements">{data.commissions.nbAValider} à valider</Link></>}
          </div>
        </div>
      )}

      <SectionParcours du={data.periode.du} au={data.periode.au} />

      <PrevisionGlobaleSection />

      <Section
        titre="Parc"
        actions={
          <span className="text-sm text-ink-2">
            {data.parc.actives} / {data.parc.bornesAffectees} bornes avec ventes
          </span>
        }
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <Badge ton="ok">{data.parc.actives} actives</Badge>
          <Badge ton={data.parc.inactives.length ? "warn" : "neutre"}>{data.parc.inactives.length} sans vente</Badge>
          {data.parc.bornesNonAffectees > 0 && <Badge ton="neutre">{data.parc.bornesNonAffectees} non affectées</Badge>}
        </div>
        {data.parc.inactives.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-2">
                <tr>
                  <th className="py-2 pr-3 font-medium">Borne</th>
                  <th className="py-2 pr-3 font-medium">Lieu</th>
                  <th className="py-2 pr-3 font-medium">Dernière vente</th>
                  <th className="py-2 font-medium">Dernier signal</th>
                </tr>
              </thead>
              <tbody>
                {data.parc.inactives.map((b) => (
                  <tr key={b.borneId} className="border-t border-line">
                    <td className="py-2 pr-3 font-medium">{b.identifiant}</td>
                    <td className="py-2 pr-3">
                      <Link className="hover:underline" href={`/lieux/${b.lieuId}`}>{b.lieu}</Link>
                    </td>
                    <td className="py-2 pr-3 text-ink-2">{depuis(b.derniereVente)}</td>
                    <td className="py-2 text-ink-2">{depuis(b.dernierHeartbeat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
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
