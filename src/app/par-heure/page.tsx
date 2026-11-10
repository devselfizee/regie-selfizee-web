"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { jour, nombre, pct } from "@/lib/format";
import { PageGuard } from "@/lib/perms";
import { Chargement, EnTete, Erreur, Section } from "@/components/Etat";
import { Filtres, filtresParDefaut, type ValeursFiltres } from "@/components/Filtres";
import { KpiCouleur } from "@/components/KpiCouleur";
import { ChoixJours, Infobulle, NUANCES, VERT, VIOLET_CLAIR, avecJours, duree, part } from "@/components/Entonnoir";

// Par heure (maquette du 10/11/2026) : les indicateurs de Comportements découpés en tranches fixes de 2 h,
// journée de 6 h à 6 h le lendemain. Seules les tranches où il y a eu des séances sont affichées. Unité : la séance.

interface Tranche {
  /** Heure de début, paire (0, 2… 22) */
  debut: number;
  commencees: number;
  payees: number;
  nonValidees: number;
  avantPhoto: number;
  fermentOffre: number;
  nonAboutis: number;
  recommencent: number;
  dureeMedianeS: number | null;
  upsellProposes: number;
  upsellAcceptes: number;
}
interface BorneTranches {
  borneId: number;
  identifiant: string;
  lieu: { id: number; enseigne: string } | null;
  commencees: number;
  payees: number;
  tranches: { debut: number; commencees: number; payees: number }[];
}
interface StatsParTranche {
  periode: { du: string; au: string };
  tranches: Tranche[];
  parBorne: BorneTranches[];
}

export default function PageParHeure() {
  return (
    <PageGuard perm="pages.comportements.view">
      <ParHeure />
    </PageGuard>
  );
}

function ParHeure() {
  const [filtres, setFiltres] = useState<ValeursFiltres>(filtresParDefaut);
  const [soirs, setSoirs] = useState("");
  // La granularité ne sert pas ici
  const requete = avecJours(qs({ ...filtres, granularite: undefined }), soirs);
  const { data, error, isPending, isFetching } = useQuery({
    queryKey: ["parcours-par-heure", requete],
    queryFn: () => api<StatsParTranche>(`/stats/parcours/par-heure${requete}`),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <EnTete
        titre="Par heure"
        sousTitre={`Du ${jour(filtres.du)} au ${jour(filtres.au)}`}
        actions={
          <>
            {isFetching && <span className="self-center text-xs text-ink-muted">mise à jour…</span>}
            <ChoixJours valeur={soirs} onChange={setSoirs} />
          </>
        }
      />
      <Filtres valeurs={filtres} onChange={setFiltres} />
      {error ? <Erreur erreur={error} /> : isPending ? <Chargement /> : <Contenu data={data} filtreJours={!!soirs} />}
    </>
  );
}

// La journée commence à 6 h : 6 h, 8 h… 22 h, 0 h… 4 h dans cet ordre
const rang = (debut: number) => (debut + 18) % 24;
const libelle = (debut: number) => `${debut} h – ${(debut + 2) % 24} h`;
/** Infobulle à gauche pour la première colonne, à droite pour la dernière */
const cote = (i: number, n: number) => (i === 0 ? "gauche" : i === n - 1 ? "droite" : "centre");
/** Nuance d'une valeur entre le minimum et le maximum (5 niveaux) */
const niveau = (v: number, min: number, max: number) => (max > min ? Math.round(((v - min) / (max - min)) * (NUANCES.length - 1)) : 0);

function Contenu({ data, filtreJours }: { data: StatsParTranche; filtreJours: boolean }) {
  const tranches = data.tranches.filter((t) => t.commencees > 0).sort((a, b) => rang(a.debut) - rang(b.debut));
  if (!tranches.length) {
    return (
      <Section titre="Par heure">
        <p className="text-sm text-ink-2">Aucun parcours reçu sur la période{filtreJours ? " pour ces jours" : ""}.</p>
      </Section>
    );
  }
  const total = tranches.reduce((s, t) => s + t.commencees, 0);
  const payees = tranches.reduce((s, t) => s + t.payees, 0);
  const tauxJour = part(payees, total);
  return (
    <div className="space-y-5">
      <Tuiles tranches={tranches} total={total} />
      <Colonnes tranches={tranches} tauxJour={tauxJour} />
      <Journee tranches={tranches} />
      {data.parBorne.length > 0 && <ParBorne tranches={tranches} bornes={data.parBorne} tauxJour={tauxJour} />}
    </div>
  );
}

/** Les trois tuiles « record », calculées sur le périmètre filtré */
function Tuiles({ tranches, total }: { tranches: Tranche[]; total: number }) {
  // Les taux ne comparent que des tranches assez remplies (10 séances et 5 % de la journée au moins)
  const comparables = tranches.filter((t) => t.commencees >= Math.max(10, total * 0.05));
  const base = comparables.length ? comparables : tranches;
  const meilleure = (l: Tranche[], v: (t: Tranche) => number) => l.reduce((a, b) => (v(b) > v(a) ? b : a));
  const pointe = meilleure(tranches, (t) => t.commencees);
  const paie = meilleure(base, (t) => part(t.payees, t.commencees));
  const abandon = meilleure(base, (t) => part(t.nonValidees, t.commencees));
  // Recommencent dans la tranche, contre le reste de la journée
  const reste = tranches.filter((t) => t !== abandon);
  const recReste = part(
    reste.reduce((s, t) => s + t.recommencent, 0),
    reste.reduce((s, t) => s + t.commencees, 0)
  );
  const recTranche = part(abandon.recommencent, abandon.commencees);
  const rapport = recReste ? recTranche / recReste : null;
  const recommence = !reste.length
    ? `${pct(recTranche)} recommencent`
    : rapport !== null && rapport >= 1.5
      ? `recommencent ${rapport.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}× plus que le reste de la journée`
      : `${pct(recTranche)} recommencent (${pct(recReste)} le reste de la journée)`;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <KpiCouleur teinte="vert" icone="appareil" libelle="Heure de pointe" valeur={libelle(pointe.debut)} detail={`${nombre(pointe.commencees)} séances · ${pct(part(pointe.commencees, total))} de la journée`} />
      <KpiCouleur teinte="bleu" icone="billet" libelle="On paie le mieux" valeur={libelle(paie.debut)} detail={`${pct(part(paie.payees, paie.commencees))} de séances payées · ${nombre(paie.commencees)} séances`} />
      <KpiCouleur
        teinte="rose"
        icone="pourcent"
        libelle="On abandonne le plus"
        valeur={libelle(abandon.debut)}
        detail={`${pct(part(abandon.nonValidees, abandon.commencees))} ne valident pas leur photo · ${recommence}`}
      />
    </div>
  );
}

/** Séances par tranche, payées ou non (colonnes empilées), taux payé sous chaque colonne */
function Colonnes({ tranches, tauxJour }: { tranches: Tranche[]; tauxJour: number }) {
  const max = Math.max(1, ...tranches.map((t) => t.commencees));
  const ton = (taux: number) => (taux >= tauxJour + 0.05 ? "bg-ok-bg text-good" : taux <= tauxJour - 0.05 ? "bg-crit-bg text-bad" : "bg-surface-2 text-ink-2");
  return (
    <section className="carte space-y-5 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-base font-bold">Séances par tranche de 2 h, payées ou non</h2>
        <div className="flex gap-3 text-xs text-ink-2">
          <span className="inline-flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded-sm" style={{ background: VERT }} />payées</span>
          <span className="inline-flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded-sm" style={{ background: VIOLET_CLAIR }} />sans tirage</span>
        </div>
      </div>
      <div
        className="grid items-end gap-1.5 pt-2 sm:gap-3.5"
        style={{ gridTemplateColumns: `repeat(${tranches.length}, minmax(0, 1fr))` }}
        role="img"
        aria-label={`Séances par tranche de 2 h : ${tranches.map((t) => `${libelle(t.debut)} ${t.commencees} séances, ${t.payees} payées`).join(" ; ")}`}
      >
        {tranches.map((t, i) => {
          const taux = part(t.payees, t.commencees);
          return (
            <Infobulle
              key={t.debut}
              cote={cote(i, tranches.length)}
              className="flex min-w-0 flex-col items-center gap-1.5"
              texte={`${libelle(t.debut)} : ${nombre(t.commencees)} séances · ${nombre(t.payees)} payées (${pct(taux)}) · ${nombre(t.commencees - t.payees)} sans tirage`}
            >
              <span className="text-lg font-extrabold tabular">{nombre(t.commencees)}</span>
              <div className="flex h-40 w-full flex-col justify-end overflow-hidden rounded-lg bg-[#F6F7FA] sm:h-56">
                <i className="block w-full rounded-t-md" style={{ height: `${(t.payees / max) * 100}%`, background: VERT }} />
                <i className="block w-full" style={{ height: `${((t.commencees - t.payees) / max) * 100}%`, background: VIOLET_CLAIR }} />
              </div>
              <span className="text-center text-xs font-semibold text-ink-2">{libelle(t.debut)}</span>
              <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold tabular ${ton(taux)}`}>{pct(taux)}</span>
            </Infobulle>
          );
        })}
      </div>
    </section>
  );
}

interface LigneJournee {
  libelle: string;
  aide: string;
  retrait?: boolean;
  /** Valeur de la case (teinte, texte) ; null = rien à mesurer dans la tranche */
  valeur: (t: Tranche) => number | null;
  texte: (v: number) => string;
  detail: (t: Tranche) => string;
}

/** Part d'un effectif dans les séances de la tranche */
const taux = (libelle: string, aide: string, n: (t: Tranche) => number, retrait = false): LigneJournee => ({
  libelle,
  aide,
  retrait,
  valeur: (t) => part(n(t), t.commencees),
  texte: pct,
  detail: (t) => `${pct(part(n(t), t.commencees))} · ${nombre(n(t))} sur ${nombre(t.commencees)}`,
});

const LIGNES: LigneJournee[] = [
  { libelle: "Séances", aide: "séances commencées dans la tranche", valeur: (t) => t.commencees, texte: nombre, detail: (t) => nombre(t.commencees) },
  taux("Payées et imprimées", "des séances de la tranche", (t) => t.payees),
  taux("Ne valident pas leur photo", "des séances de la tranche ; rien n'est gardé", (t) => t.nonValidees),
  taux("· partis avant de prendre la photo", "partis avant la photo", (t) => t.avantPhoto, true),
  taux("· photo prise, pas validée", "photo prise, mais rien n'est gardé", (t) => t.nonValidees - t.avantPhoto, true),
  taux("Ferment l'offre sans payer", "photo gardée, sans tirage", (t) => t.fermentOffre),
  taux("Paiement non abouti", "photo gardée, sans tirage", (t) => t.nonAboutis),
  taux("Recommencent la photo", "au moins une reprise", (t) => t.recommencent),
  { libelle: "Durée d'une séance", aide: "médiane, de l'accueil à la fin de la séance", valeur: (t) => t.dureeMedianeS, texte: duree, detail: (t) => duree(t.dureeMedianeS) },
  {
    libelle: "« +1 pour un pote » acceptés",
    aide: "des propositions",
    valeur: (t) => (t.upsellProposes ? part(t.upsellAcceptes, t.upsellProposes) : null),
    texte: pct,
    detail: (t) => (t.upsellProposes ? `${pct(part(t.upsellAcceptes, t.upsellProposes))} · ${nombre(t.upsellAcceptes)} sur ${nombre(t.upsellProposes)} propositions` : "aucune proposition"),
  },
];

/** Case teintée d'un tableau */
function Case({ nuance, children }: { nuance: number; children: ReactNode }) {
  return (
    <div className="flex h-[34px] items-center justify-center rounded-[7px] text-[13px] font-bold tabular" style={{ background: NUANCES[nuance], color: nuance === NUANCES.length - 1 ? "#fff" : undefined }}>
      {children}
    </div>
  );
}

function CaseVide({ texte, i, n }: { texte: string; i: number; n: number }) {
  return (
    <Infobulle texte={texte} cote={cote(i, n)}>
      <div className="flex h-[34px] items-center justify-center rounded-[7px] border border-dashed border-line bg-surface text-[13px] text-ink-muted">—</div>
    </Infobulle>
  );
}

/** Un seul tableau, mêmes colonnes que le graphique ; chaque ligne teintée de son plus faible à son plus fort */
function Journee({ tranches }: { tranches: Tranche[] }) {
  // « +1 pour un pote » : seulement si la borne l'a proposé sur la période
  const lignes = LIGNES.filter((l) => tranches.some((t) => l.valeur(t) !== null));
  return (
    <section className="carte space-y-4 p-5">
      <h2 className="text-base font-bold">La journée, tranche par tranche</h2>
      <div className="max-md:overflow-x-auto">
        <table className="w-full table-fixed border-separate border-spacing-0 text-sm max-md:min-w-[44rem]">
          <thead>
            <tr>
              <th className="w-56" />
              {tranches.map((t) => <th key={t.debut} className="px-[3px] pb-2 text-center text-xs font-semibold text-ink-2">{libelle(t.debut)}</th>)}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => {
              const valeurs = tranches.map(l.valeur);
              const connues = valeurs.filter((v): v is number => v !== null);
              const min = Math.min(...connues);
              const max = Math.max(...connues);
              return (
                <tr key={l.libelle}>
                  <td className={`py-[3px] pr-3 ${l.retrait ? "pl-3.5 font-medium text-ink-2" : "font-semibold"}`}>
                    <Infobulle texte={l.aide} cote="gauche" className="w-max max-w-full">
                      <span className="block truncate">{l.libelle}</span>
                    </Infobulle>
                  </td>
                  {tranches.map((t, i) => {
                    const v = valeurs[i];
                    return (
                      <td key={t.debut} className="p-[3px]">
                        {v === null ? (
                          <CaseVide texte={`${libelle(t.debut)} · ${l.libelle} : ${l.detail(t)}`} i={i} n={tranches.length} />
                        ) : (
                          <Infobulle texte={`${libelle(t.debut)} · ${l.libelle.replace(/^· /, "")} : ${l.detail(t)}`} cote={cote(i, tranches.length)}>
                            <Case nuance={niveau(v, min, max)}>{l.texte(v)}</Case>
                          </Infobulle>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Taux payé par borne et par tranche ; tiret = aucune séance (lieu fermé) ; ligne Parc et colonne Journée */
function ParBorne({ tranches, bornes, tauxJour }: { tranches: Tranche[]; bornes: BorneTranches[]; tauxJour: number }) {
  const valeurs = bornes.flatMap((b) => b.tranches.filter((x) => x.commencees > 0).map((x) => part(x.payees, x.commencees)));
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  const parc = new Map(tranches.map((t) => [t.debut, part(t.payees, t.commencees)]));
  return (
    <section className="carte space-y-4 p-5">
      <h2 className="text-base font-bold">Taux payé par borne et par tranche</h2>
      <div className="max-md:overflow-x-auto">
        <table className="w-full table-fixed border-separate border-spacing-0 text-sm max-md:min-w-[44rem]">
          <thead>
            <tr>
              <th className="w-56 pb-2 text-left text-xs font-semibold text-ink-2">Borne</th>
              {tranches.map((t) => <th key={t.debut} className="px-[3px] pb-2 text-center text-xs font-semibold text-ink-2">{libelle(t.debut)}</th>)}
              <th className="w-20 pb-2 text-right text-xs font-semibold text-ink-2">Journée</th>
            </tr>
          </thead>
          <tbody>
            {bornes.map((b) => {
              const parTranche = new Map(b.tranches.map((x) => [x.debut, x]));
              return (
                <tr key={b.borneId}>
                  <td className="truncate py-[3px] pr-3">
                    <Link href={`/bornes/${b.borneId}`} className="font-semibold hover:underline">{b.identifiant}</Link>
                    {b.lieu && (
                      <>
                        <span className="text-ink-2"> · </span>
                        <Link href={`/lieux/${b.lieu.id}`} className="text-ink-2 hover:underline">{b.lieu.enseigne}</Link>
                      </>
                    )}
                  </td>
                  {tranches.map((t, i) => {
                    const x = parTranche.get(t.debut);
                    if (!x || !x.commencees) {
                      return (
                        <td key={t.debut} className="p-[3px]">
                          <CaseVide texte={`${b.identifiant} · ${libelle(t.debut)} : aucune séance (lieu fermé)`} i={i} n={tranches.length} />
                        </td>
                      );
                    }
                    const v = part(x.payees, x.commencees);
                    return (
                      <td key={t.debut} className="p-[3px]">
                        <Infobulle
                          cote={cote(i, tranches.length)}
                          texte={`${b.identifiant} · ${libelle(t.debut)} : ${pct(v)} payées · ${nombre(x.payees)} sur ${nombre(x.commencees)} séances · parc ${pct(parc.get(t.debut) ?? 0)}`}
                        >
                          <Case nuance={niveau(v, min, max)}>{pct(v)}</Case>
                        </Infobulle>
                      </td>
                    );
                  })}
                  <td className="py-[3px] pl-3 text-right font-bold tabular">
                    <Infobulle texte={`${nombre(b.payees)} payées sur ${nombre(b.commencees)} séances`} cote="droite">
                      {pct(part(b.payees, b.commencees))}
                    </Infobulle>
                  </td>
                </tr>
              );
            })}
            <tr className="text-ink-2">
              <td className="pt-2 pr-3 font-semibold">Parc</td>
              {tranches.map((t) => <td key={t.debut} className="px-[3px] pt-2 text-center text-[13px] font-bold tabular">{pct(part(t.payees, t.commencees))}</td>)}
              <td className="pt-2 pl-3 text-right font-bold tabular">{pct(tauxJour)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
