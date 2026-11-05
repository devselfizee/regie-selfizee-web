"use client";

import Link from "next/link";
import { useState } from "react";
import { dateHeure, depuis, euros, nombre } from "@/lib/format";
import { Reserve } from "@/lib/session";
import { Badge, Chargement, EnTete, Erreur, Section } from "@/components/Etat";
import { Modale } from "@/components/Modale";
import { libelleErreurBorne } from "@/lib/erreursBorne";
import { tonPapier, useSupervision, type BorneSupervisee } from "@/components/Supervision";

// Monitoring live (demande de Sébastien, 02/11/2026) : en un écran, ce qui marche et ce qui ne marche pas.
// Une borne doit être allumée quand son lieu est ouvert (horaires, saison et fermetures de la fiche).

const ETATS: Record<BorneSupervisee["etat"], { libelle: string; ton: "ok" | "warn" | "crit" | "neutre" }> = {
  ok: { libelle: "En ligne", ton: "ok" },
  alerte: { libelle: "En ligne, à vérifier", ton: "warn" },
  eteinte_anormale: { libelle: "Devrait être allumée", ton: "crit" },
  eteinte: { libelle: "Éteinte (lieu fermé)", ton: "neutre" },
};

const ISSUES: Record<string, string> = { validee: "photo enregistrée", retour: "retour accueil", delai: "délai d'inactivité", appel: "photo d'appel", autre: "autre" };

export default function PageMonitoring() {
  return (
    <Reserve roles={["ADMIN", "TECHNICIEN"]}>
      <Monitoring />
    </Reserve>
  );
}

function Monitoring() {
  const { data, error, isPending, isFetching } = useSupervision();
  const [detail, setDetail] = useState<BorneSupervisee | null>(null);
  // Blocs repliés (retour de Sébastien : il y en aura beaucoup) ; « Éteintes, lieu fermé » replié par défaut, mémorisé
  const [replies, setReplies] = useState<Set<string>>(() => {
    try {
      const brut = localStorage.getItem("monitoring_replies");
      return new Set(brut ? (JSON.parse(brut) as string[]) : ["eteintes"]);
    } catch {
      return new Set(["eteintes"]);
    }
  });
  const basculer = (cle: string) =>
    setReplies((r) => {
      const s = new Set(r);
      if (s.has(cle)) s.delete(cle);
      else s.add(cle);
      try {
        localStorage.setItem("monitoring_replies", JSON.stringify([...s]));
      } catch {
        /* stockage indisponible */
      }
      return s;
    });
  if (error) return <Erreur erreur={error} />;
  if (isPending) return <Chargement />;

  const bornes = data.bornes.filter((b) => b.lieu || b.enLigne);
  // Le lieu ouvre plus tard dans la journée d'exploitation (jusqu'à 6 h demain) : la borne doit être allumée ce jour
  const finJournee = new Date(data.debutJournee).getTime() + 86_400_000;
  const ouvreCeJour = (b: BorneSupervisee) => b.lieuOuvert || (!!b.prochaineOuverture && new Date(b.prochaineOuverture).getTime() < finJournee);
  // Cinq blocs (retour de Sébastien, 04/11/2026)
  const manquantes = bornes.filter((b) => !b.enLigne && b.lieuOuvert);
  const aAllumer = bornes
    .filter((b) => !b.enLigne && !b.lieuOuvert && ouvreCeJour(b))
    .sort((a, b) => (a.prochaineOuverture ?? "").localeCompare(b.prochaineOuverture ?? ""));
  const attendues = bornes.filter((b) => b.enLigne && ouvreCeJour(b));
  const enTrop = bornes.filter((b) => b.enLigne && !ouvreCeJour(b));
  const eteintes = bornes.filter((b) => !b.enLigne && !ouvreCeJour(b));
  const connectees = bornes.filter((b) => b.enLigne);
  const aRegler = bornes.filter((b) => b.etat === "eteinte_anormale" || b.etat === "alerte");
  const ca = bornes.reduce((s, b) => s + b.journee.caTtcCents, 0);
  const ventes = bornes.reduce((s, b) => s + b.journee.ventes, 0);

  return (
    <>
      <EnTete
        titre="Monitoring live"
        sousTitre={`Mis à jour ${dateHeure(data.maintenant)}${isFetching ? " · actualisation…" : ""} · toutes les 30 s · journée depuis ${dateHeure(data.debutJournee)}`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Chiffre libelle="Connectées" valeur={nombre(connectees.length)} detail={`sur ${nombre(bornes.length)} bornes en lieu`} ton="text-good" />
        <Chiffre libelle="À régler" valeur={nombre(aRegler.length)} detail="éteintes alors que le lieu est ouvert, ou en erreur" ton={aRegler.length ? "text-bad" : "text-good"} />
        <Chiffre libelle="CA de la journée" valeur={euros(ca)} detail="TTC, toutes bornes" />
        <Chiffre libelle="Commandes de la journée" valeur={nombre(ventes)} detail="ventes payées" />
      </div>

      <div className="space-y-6">
        {[
          { cle: "manquantes", titre: "Devraient être connectées, ne le sont pas", bornes: manquantes, vide: "Rien à signaler : toutes les bornes des lieux ouverts sont en ligne." },
          { cle: "aAllumer", titre: "À allumer ce jour, pas encore allumées", bornes: aAllumer, vide: "Aucune autre ouverture prévue aujourd'hui." },
          { cle: "attendues", titre: "Connectées comme prévu", bornes: attendues, vide: "Aucune borne connectée parmi celles prévues aujourd'hui." },
          { cle: "enTrop", titre: "Allumées sans utilisation prévue aujourd'hui", bornes: enTrop, vide: "Aucune." },
          { cle: "eteintes", titre: "Éteintes, lieu fermé", bornes: eteintes, vide: "Aucune.", replie: "Normal : leur lieu est fermé en ce moment." },
        ].map((bloc) => {
          const replie = replies.has(bloc.cle);
          return (
            <Section
              key={bloc.cle}
              titre={`${bloc.titre} (${bloc.bornes.length})`}
              actions={
                <button type="button" className="text-sm text-accent hover:underline" aria-expanded={!replie} onClick={() => basculer(bloc.cle)}>
                  {replie ? "Afficher" : "Masquer"}
                </button>
              }
            >
              {replie ? (
                <p className="text-sm text-ink-2">{bloc.replie ?? `${bloc.bornes.length} borne${bloc.bornes.length > 1 ? "s" : ""}, masquée${bloc.bornes.length > 1 ? "s" : ""}.`}</p>
              ) : bloc.bornes.length ? (
                <Tableau bornes={bloc.bornes} onDetail={setDetail} finJournee={finJournee} />
              ) : (
                <p className="text-sm text-ink-2">{bloc.vide}</p>
              )}
            </Section>
          );
        })}
      </div>

      <Modale titre={detail ? `${detail.identifiant}${detail.lieu ? ` · ${detail.lieu.enseigne}` : ""}` : "Borne"} large ouverte={detail !== null} onFermer={() => setDetail(null)}>
        {detail && <DetailBorne b={detail} />}
      </Modale>
    </>
  );
}

function Chiffre({ libelle, valeur, detail, ton = "" }: { libelle: string; valeur: string; detail: string; ton?: string }) {
  return (
    <div className="carte p-4">
      <div className="text-xs font-medium text-ink-2">{libelle}</div>
      <div className={`text-2xl font-semibold tabular ${ton}`}>{valeur}</div>
      <div className="text-xs text-ink-muted">{detail}</div>
    </div>
  );
}

const Point = ({ ok }: { ok: boolean | null }) => (
  <span className={`inline-block h-2 w-2 rounded-full ${ok === null ? "bg-ink-muted" : ok ? "bg-good" : "bg-bad"}`} aria-hidden />
);

function Tableau({ bornes, onDetail, finJournee }: { bornes: BorneSupervisee[]; onDetail: (b: BorneSupervisee) => void; finJournee: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-2">
          <tr>
            <th className="py-2 pr-3 font-medium">Lieu · borne</th>
            <th className="py-2 pr-3 font-medium">État</th>
            <th className="py-2 pr-3 font-medium">Dernière commande</th>
            <th className="py-2 pr-3 text-right font-medium">Papier</th>
            <th className="py-2 pr-3 font-medium">Dernière photo</th>
            <th className="py-2 pr-3 font-medium">Dernier signal</th>
            <th className="py-2 pr-3 font-medium">Terminal</th>
            <th className="py-2 pr-3 text-right font-medium">CA jour</th>
            <th className="py-2 pr-3 text-right font-medium">Commandes</th>
            <th />
          </tr>
        </thead>
        <tbody className="tabular">
          {bornes.map((b) => (
            <tr key={b.borneId} className="border-t border-line align-top">
              <td className="py-2 pr-3">
                {b.lieu ? <Link href={`/lieux/${b.lieu.id}`} className="font-medium hover:underline">{b.lieu.enseigne}</Link> : <span className="text-ink-muted">sans lieu</span>}
                <span className="block text-xs text-ink-2">{b.identifiant} · {b.gamme}</span>
              </td>
              <td className="py-2 pr-3">
                {b.etat === "eteinte" && b.prochaineOuverture && new Date(b.prochaineOuverture).getTime() < finJournee ? (
                  <Badge ton="warn">Pas encore allumée</Badge>
                ) : (
                  <Badge ton={ETATS[b.etat].ton}>{ETATS[b.etat].libelle}</Badge>
                )}
                {b.erreurs.length > 0 && (
                  <span className="block text-xs text-bad" title={b.enLigne ? undefined : "Au dernier signal de la borne"}>
                    {b.erreurs.map((e) => libelleErreurBorne(e.code)).join(" · ")}
                    {!b.enLigne && <span className="text-ink-muted"> (au dernier signal)</span>}
                  </span>
                )}
                {!b.lieuOuvert && b.lieu && b.prochaineOuverture && <span className="block text-xs text-ink-muted">ouvre {dateHeure(b.prochaineOuverture)}</span>}
              </td>
              <td className="py-2 pr-3">{depuis(b.derniereVente)}</td>
              <td className={`py-2 pr-3 text-right ${tonPapier(b.papier?.restant)}`}>{b.papier ? nombre(b.papier.restant) : "—"}</td>
              <td className="py-2 pr-3">{b.dernierePhoto ? depuis(b.dernierePhoto) : "—"}</td>
              <td className="py-2 pr-3">{depuis(b.dernierPing)}</td>
              <td className="py-2 pr-3">
                <span className="inline-flex items-center gap-1.5"><Point ok={b.terminalOk} /> {b.terminalOk === null ? "—" : b.terminalOk ? "Prêt" : "En erreur"}</span>
              </td>
              <td className="py-2 pr-3 text-right">{euros(b.journee.caTtcCents)}</td>
              <td className="py-2 pr-3 text-right">{nombre(b.journee.ventes)}</td>
              <td className="py-2 text-right">
                <button type="button" className="text-xs text-accent hover:underline" onClick={() => onDetail(b)}>Détail</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Le détail d'une borne, en cartes comme le monitoring des bornes : imprimante, terminal, appareil, réseau, soirée, machine */
function DetailBorne({ b }: { b: BorneSupervisee }) {
  const erreurs = (composant: string, prefixe: string) => b.erreurs.filter((e) => e.composant === composant || e.code.startsWith(prefixe));
  const carte = (titre: string, ok: boolean | null, valeur: string, lignes: (string | null | false)[], errs: BorneSupervisee["erreurs"] = []) => (
    <div className="rounded-md bg-surface-2 p-3 text-sm">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-2"><Point ok={errs.length ? false : ok} /> {titre}</div>
      <div className="mt-1 font-semibold">{errs.length ? libelleErreurBorne(errs[0].code) : valeur}</div>
      {[...errs.map((e) => e.message ?? e.code), ...lignes].filter(Boolean).map((l, i) => <div key={i} className="text-xs text-ink-2">{l}</div>)}
    </div>
  );
  const j = b.journee;
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">
        {ETATS[b.etat].libelle} · dernier signal {depuis(b.dernierPing)} · état relevé {b.etatLe ? dateHeure(b.etatLe) : "—"}
        {b.lieu && (b.lieuOuvert ? " · lieu ouvert" : b.prochaineOuverture ? ` · lieu fermé, ouvre ${dateHeure(b.prochaineOuverture)}` : " · lieu fermé")}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {carte("Imprimante", b.imprimanteOk, b.imprimanteOk === null ? "—" : b.imprimanteOk ? "Prête" : "En erreur", [
          b.papier && `${nombre(b.papier.restant)} tirages restants`,
          b.papier?.ruban !== null && b.papier?.ruban !== undefined && `ruban : ${nombre(b.papier.ruban)}`,
          b.papier && `relevé ${depuis(b.papier.le)}`,
        ], erreurs("imprimante", "PRN_"))}
        {carte("Terminal de paiement", b.terminalOk, b.terminalOk === null ? "—" : b.terminalOk ? "Prêt" : "En erreur", [b.etatLe && `sondé ${depuis(b.etatLe)}`, j.echecs > 0 && `${j.echecs} paiement(s) non abouti(s) aujourd'hui`], erreurs("module_paiement", "TPE_"))}
        {carte("Appareil photo", null, b.dernierePhoto ? "Photos prises" : "—", [b.dernierePhoto && `dernière photo ${depuis(b.dernierePhoto)}`], erreurs("camera", "CAM_"))}
        {carte("Réseau", b.enLigne, b.enLigne ? "Connectée" : "Hors ligne", [`dernier signal ${depuis(b.dernierPing)}`], erreurs("reseau", "NET_"))}
        {carte("La soirée", j.seances > 0 || null, `${nombre(j.seances)} séance${j.seances > 1 ? "s" : ""}`, [
          `${nombre(j.photos)} photo(s) · ${nombre(j.tirages)} tirage(s)`,
          `${nombre(j.ventes)} paiement(s) · ${euros(j.caTtcCents)}`,
          j.derniereSeance && `dernière séance ${depuis(j.derniereSeance.fin)} (${ISSUES[j.derniereSeance.issue] ?? j.derniereSeance.issue})`,
        ])}
        {carte("Machine", null, b.logicielVersion ? `Version ${b.logicielVersion}` : "—", [], erreurs("logiciel", "SW_").concat(erreurs("ecran", "ALIM_")))}
      </div>
      <p className="text-xs text-ink-muted">
        La borne n&apos;envoie pas encore le modèle d&apos;imprimante et d&apos;appareil photo, le type de réseau et sa latence, ni l&apos;alimentation et le processeur : à demander à
        l&apos;équipe des bornes pour compléter ces cartes.
      </p>
    </div>
  );
}
