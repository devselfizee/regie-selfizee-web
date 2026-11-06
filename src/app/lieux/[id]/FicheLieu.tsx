"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, qs, type LieuFiche, type StatsLieu } from "@/lib/api";
import { MenuExport } from "@/components/BoutonExport";
import { peut, useMoi } from "@/lib/session";
import { date, dateHeure, depuis, euros, eurosRond, JOURS_SEMAINE, nombre, pct, parametreUrl } from "@/lib/format";
import { Filtres, filtresParDefaut, type ValeursFiltres } from "@/components/Filtres";
import { KpiCouleur } from "@/components/KpiCouleur";
import { GraphiqueCA } from "@/components/GraphiqueCA";
import { HeatmapHoraire, JoursSemaine, MoyensPaiement } from "@/components/GraphiquesLieu";
import { Badge, Chargement, EnTete, Erreur, Section, Vide } from "@/components/Etat";
import { SectionCommissions } from "@/components/SectionCommissions";
import { PrevisionLieuSection } from "@/components/SectionPrevision";
import { SectionPotentiel } from "@/components/Prospect";
import { JournalEvenements, superpositions, useContexteLieu, useEvenements } from "@/components/Contexte";
import { ListeAlertes } from "@/components/ListeAlertes";
import { Comportement } from "@/components/Entonnoir";
import { BasculeHt, htDepuisTtc, usePreferenceHt } from "@/components/BasculeHt";
import { ListePaiements } from "@/components/ListePaiements";
import { CarteLieux } from "@/components/CarteLieux";
import { SuiviLieu } from "@/components/SuiviLieu";
import { ConfigurationLieu } from "@/components/ConfigurationLieu";
import { CodesRemiseLieu } from "@/components/CodesRemiseLieu";
import { PageSouvenirLieu } from "@/components/PageSouvenirLieu";
import type { Alerte } from "@/lib/api";

export function FicheLieu({ id, ongletInitial }: { id: number; ongletInitial?: string }) {
  const moi = useMoi();
  const voitVentesRole = peut.voirVentes(moi.role);
  const [filtres, setFiltres] = useState<ValeursFiltres>(filtresParDefaut);
  const [ht, setHt] = usePreferenceHt();
  // « evenements » : ancien nom de l'onglet Configuration (liens déjà partagés)
  const demande = ongletInitial === "evenements" ? "configuration" : ongletInitial;
  const [onglet, setOnglet] = useState<Onglet>(ONGLETS.some((o) => o.cle === demande) ? (demande as Onglet) : "stats");
  const lieu = useQuery({ queryKey: ["lieu", id], queryFn: () => api<LieuFiche>(`/lieux/${id}`) });
  // Le lieu est déjà choisi : pas de filtre de parc
  const query = qs({ ...filtres, parc: undefined });
  const stats = useQuery({
    queryKey: ["stats-lieu", id, query],
    queryFn: () => api<StatsLieu>(`/stats/lieux/${id}${query}`),
    placeholderData: keepPreviousData,
    enabled: voitVentesRole && lieu.data?.statut !== "PROSPECT",
  });

  const alertes = useQuery({
    queryKey: ["alertes", "lieu", id],
    queryFn: () => api<Alerte[]>(`/alertes${qs({ lieuId: id, statut: "NOUVELLE,PRISE_EN_CHARGE" })}`),
    enabled: moi.role !== "PARTENAIRE",
  });

  if (lieu.error) return <Erreur erreur={lieu.error} />;
  if (!lieu.data) return <Chargement />;
  const l = lieu.data;
  // Un prospect n'a pas encore de ventes : on montre son potentiel estimé à la place
  const prospect = l.statut === "PROSPECT";
  const voitVentes = voitVentesRole && !prospect;
  const voitCommissions = moi.role === "ADMIN" || moi.role === "PARTENAIRE";
  const ongletsVisibles = ONGLETS.filter((o) => (o.cle === "stats" ? voitVentes || prospect : o.cle === "comportement" ? voitVentes : o.cle === "ventes" ? voitVentes && moi.role === "ADMIN" : o.cle === "commissions" ? voitCommissions : o.cle === "suivi" ? moi.role !== "PARTENAIRE" : o.cle === "configuration" ? peut.administrer(moi.role) : o.cle === "souvenir" ? !prospect && moi.role !== "TECHNICIEN" : true));
  const ongletActif = ongletsVisibles.some((o) => o.cle === onglet) ? onglet : ongletsVisibles[0].cle;

  return (
    <>
      <EnTete
        titre={l.enseigne}
        sousTitre={[l.typeLieu.libelle, l.sousType?.libelle, l.ville, l.saisonnalite === "SAISONNIER" ? "saisonnier" : null].filter(Boolean).join(" · ")}
        actions={
          <>
            {ongletActif === "stats" && voitVentes && <BasculeHt ht={ht} onChange={setHt} />}
            {voitVentes && (
              <MenuExport exports={[{ libelle: "Ventes du lieu", chemin: "/export/transactions", requete: qs({ ...filtres, parc: undefined, lieuId: id }) }]} />
            )}
            {peut.gererLieux(moi.role) && <Link href={`/lieux/${id}/modifier`} className="bouton">Modifier la fiche</Link>}
          </>
        }
      />

      {alertes.data && alertes.data.length > 0 && (
        <div className="mb-6">
          <Section titre={`Alertes ouvertes (${alertes.data.length})`}>
            <ListeAlertes alertes={alertes.data} compacte />
          </Section>
        </div>
      )}

      <nav className="mb-6 flex gap-1 border-b border-line" aria-label="Parties de la fiche">
        {ongletsVisibles.map((o) => (
          <button
            key={o.cle}
            type="button"
            aria-current={ongletActif === o.cle ? "page" : undefined}
            onClick={() => {
              setOnglet(o.cle);
              parametreUrl("onglet", o.cle);
            }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${ongletActif === o.cle ? "border-accent text-accent" : "border-transparent text-ink-2 hover:text-ink"}`}
          >
            {o.libelle}
          </button>
        ))}
      </nav>

      {ongletActif === "stats" && prospect && (moi.role === "ADMIN" || moi.role === "COMMERCIAL") && (
        <div className="mb-6">
          <SectionPotentiel lieuId={id} />
        </div>
      )}

      {ongletActif === "stats" && voitVentes && (
        <>
          <Filtres valeurs={filtres} onChange={setFiltres} filtresLieu={false} />
          {stats.error && <Erreur erreur={stats.error} />}
          {stats.isPending && !stats.error && <Chargement />}
          {stats.data && <Statistiques s={stats.data} lieuId={id} horaires={l.horaires} ht={ht} />}
        </>
      )}

      {/* Calendrier et météo : seulement dans Analyse (retour de Sébastien) ; la courbe garde vacances, fériés et météo en infobulle */}
      {/* Comportement des invités et projection, à part des statistiques (retour de Sébastien) */}
      {ongletActif === "comportement" && voitVentes && (
        <div className="space-y-6">
          {l.statut === "ACTIF" && <PrevisionLieuSection lieuId={id} />}
          <div>
            <Filtres valeurs={filtres} onChange={setFiltres} filtresLieu={false} />
            {stats.data && (
              <div className="mb-6">
                <ActiviteSansVente k={stats.data.kpis.courant} />
              </div>
            )}
            <Comportement lieuId={id} requete={qs({ du: filtres.du, au: filtres.au })} />
          </div>
        </div>
      )}

      {ongletActif === "stats" && (
        <div className="mt-6">
          <JournalEvenements lieuId={id} peutEcrire={moi.role !== "PARTENAIRE"} />
        </div>
      )}

      {ongletActif === "ventes" && <ListePaiements lieuIdFixe={id} />}

      {ongletActif === "suivi" && <SuiviLieu lieuId={id} />}

      {ongletActif === "commissions" && <SectionCommissions lieuId={id} />}

      {ongletActif === "configuration" && <ConfigurationLieu lieuId={id} />}

      {ongletActif === "souvenir" && <PageSouvenirLieu lieuId={id} />}

      {ongletActif === "infos" && (
      <>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section titre="Fiche">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <Info l="Raison sociale">
              {l.raisonSociale}
              {l.siret && <span className="text-ink-muted"> · {l.siret}</span>}
              {/* Fiche de l'entreprise sur Pappers, d'après le SIREN (9 premiers chiffres du SIRET) */}
              {l.siret && l.siret.replace(/\D/g, "").length >= 9 && (
                <a
                  href={`https://www.pappers.fr/entreprise/${l.siret.replace(/\D/g, "").slice(0, 9)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1.5 inline-flex align-middle text-accent hover:text-ink"
                  title="Voir l'entreprise sur Pappers"
                  aria-label="Voir l'entreprise sur Pappers (nouvel onglet)"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  </svg>
                </a>
              )}
            </Info>
            <Info l="Adresse">{[l.adresse, l.codePostal, l.ville].filter(Boolean).join(", ") || "—"}</Info>
            <Info l="Ville principale">{l.antenne?.libelle ?? "—"}</Info>
            {l.statut === "PROSPECT" && (
              <Info l="Concurrent en place">
                {l.concurrentEnPlace ? (l.concurrent ? `${l.concurrent.nom} (${l.concurrent.typeMateriel === "CABINE" ? "cabine" : "borne"})` : (l.concurrentNom ?? "Oui")) : l.concurrentEnPlace === false ? "Non" : "—"}
              </Info>
            )}
            <Info l="Vacances scolaires">{l.zoneScolaire ? (l.zoneScolaire === "CORSE" ? "Corse" : `Zone ${l.zoneScolaire}`) : <span className="text-ink-muted">code postal manquant</span>}</Info>
            <Info l="Papier">{l.papierSurPlace ? "Changé sur place par le lieu" : "Changé par Selfizee"}</Info>
            <Info l="Parc">{l.parc === "CLIENT" ? "Parc client (location financière)" : "Parc Selfizee"}</Info>
            <Info l="Standing">{l.standing?.libelle ?? "—"}</Info>
            <Info l="Clientèle">{l.clienteles.map((c) => c.libelle).join(", ") || "—"}</Info>
            <Info l="Capacité">{l.capaciteAccueil ? nombre(l.capaciteAccueil) : "—"}</Info>
            <Info l="Fréquentation">
              {[l.frequentationJour && `${nombre(l.frequentationJour)} / jour`, l.frequentationSemaine && `${nombre(l.frequentationSemaine)} / semaine`].filter(Boolean).join(" · ") || "—"}
            </Info>
            <Info l="Environnement">{[l.zoneGeo?.libelle, l.tailleCommune?.libelle].filter(Boolean).join(" · ") || "—"}</Info>
            <Info l="Concurrence photo">{l.concurrencePhoto === null ? "—" : l.concurrencePhoto ? `Oui${l.concurrencePhotoNotes ? ` (${l.concurrencePhotoNotes})` : ""}` : "Non"}</Info>
            <Info l="Emplacement">
              {[
                l.interieurExterieur && { INTERIEUR: "Intérieur", EXTERIEUR: "Extérieur", MIXTE: "Mixte" }[l.interieurExterieur],
                l.emplacementZone?.libelle,
                l.visibilite && `visibilité ${l.visibilite}/5`,
                l.eclairage && `éclairage ${l.eclairage.libelle.toLowerCase()}`,
              ].filter(Boolean).join(" · ") || "—"}
            </Info>
            <Info l="Commercial">
              {[l.commercial && `${l.commercial.prenom} ${l.commercial.nom}`, l.origineLead?.libelle].filter(Boolean).join(" · ") || "—"}
            </Info>
            <Info l="Contrat">
              {[l.dateSignature && `signé le ${date(l.dateSignature)}`, l.dateInstallation && `installé le ${date(l.dateInstallation)}`, l.dureeContratMois && `${l.dureeContratMois} mois`].filter(Boolean).join(" · ") || "—"}
            </Info>
          </dl>
          {l.contacts.length > 0 && (
            <div className="mt-4 border-t border-line pt-3 text-sm">
              {l.contacts.map((c) => (
                <div key={c.id} className="py-1">
                  <span className="font-medium">{[c.prenom, c.nom].filter(Boolean).join(" ")}</span>
                  <span className="text-ink-muted"> · {c.role.replace(/_/g, " ").toLowerCase()}</span>
                  {c.telephone && <> · <a className="text-accent" href={`tel:${c.telephone}`}>{c.telephone}</a></>}
                  {c.email && <> · <a className="text-accent" href={`mailto:${c.email}`}>{c.email}</a></>}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section titre="Horaires et saisons">
          {l.horaires.length ? (
            <table className="w-full text-sm">
              <tbody>
                {[1, 2, 3, 4, 5, 6, 7].map((j) => {
                  const creneaux = l.horaires.filter((h) => h.jourSemaine === j);
                  return (
                    <tr key={j} className="border-t border-line first:border-0">
                      <td className="py-1.5 pr-3 text-ink-2">{JOURS_SEMAINE[j]}</td>
                      <td className="py-1.5 tabular">{creneaux.length ? creneaux.map((h) => `${h.ouverture} – ${h.fermeture}`).join(", ") : <span className="text-ink-muted">fermé</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <Vide>Horaires non renseignés : ils servent au CA par heure d&apos;ouverture et aux alertes.</Vide>
          )}
          {l.saisonnalite === "SAISONNIER" && !l.saisons.length && (
            <p className="mt-3 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-ink">
              ▲ Lieu saisonnier sans saison renseignée : il est considéré ouvert toute l&apos;année pour les alertes, l&apos;analyse
              et les commissions par saison. Ajoutez ses dates de saison dans la fiche.
            </p>
          )}
          {l.saisons.length > 0 && (
            <p className="mt-3 text-sm text-ink-2">
              Saisons : {l.saisons.map((s) => `${s.libelle ? s.libelle + " " : ""}(${date(s.debut)} → ${date(s.fin)})`).join(", ")}
            </p>
          )}
          {l.fermetures.length > 0 && (
            <p className="mt-1 text-sm text-ink-2">
              Fermetures : {l.fermetures.map((f) => `${date(f.debut)} → ${date(f.fin)}${f.motif ? ` (${f.motif})` : ""}`).join(", ")}
            </p>
          )}
          <EmplacementLieu l={l} />
        </Section>
      </div>

      {moi.role === "ADMIN" && (
        <div className="mt-6">
          <CodesRemiseLieu lieuId={l.id} />
        </div>
      )}

      <div className="mt-6">
        <Section titre="Historique des bornes" actions={peut.gererBornes(moi.role) ? <Link className="text-sm text-accent hover:underline" href="/bornes">Gérer les bornes</Link> : undefined}>
          {l.affectations.length ? (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-2">
                <tr>
                  <th className="py-2 pr-3 font-medium">Borne</th>
                  <th className="py-2 pr-3 font-medium">Gamme</th>
                  <th className="py-2 pr-3 font-medium">Du</th>
                  <th className="py-2 font-medium">Au</th>
                </tr>
              </thead>
              <tbody>
                {l.affectations.map((a) => (
                  <tr key={a.id} className="border-t border-line">
                    <td className="py-2 pr-3 font-medium">{a.borne.identifiant}</td>
                    <td className="py-2 pr-3 text-ink-2">{a.borne.gamme.libelle}</td>
                    <td className="py-2 pr-3">{dateHeure(a.debut)}</td>
                    <td className="py-2">{a.fin ? dateHeure(a.fin) : <Badge ton="ok">en place</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Vide>Aucune borne affectée à ce lieu.</Vide>
          )}
        </Section>
      </div>
      </>
      )}
    </>
  );
}

type Onglet = "stats" | "comportement" | "ventes" | "infos" | "suivi" | "commissions" | "configuration" | "souvenir";
const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: "stats", libelle: "Statistiques" },
  { cle: "comportement", libelle: "Comportement" },
  { cle: "ventes", libelle: "Ventes" },
  { cle: "infos", libelle: "Informations" },
  { cle: "suivi", libelle: "Suivi" },
  { cle: "commissions", libelle: "Commissions" },
  // La borne du lieu : infos et tarif repris par chaque événement, puis les événements
  { cle: "configuration", libelle: "Configuration" },
  // Ce que les invités font de la page de leur QR : entonnoir et contacts opt-in lieu
  { cle: "souvenir", libelle: "Page souvenir" },
];

function Info({ l, children }: { l: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-2">{l}</dt>
      <dd>{children}</dd>
    </>
  );
}

function Statistiques({ s: brut, lieuId, horaires, ht }: { s: StatsLieu; lieuId: number; horaires: LieuFiche["horaires"]; ht: boolean }) {
  // En HT : montants convertis à 20 % de TVA quand l'API ne donne que le TTC (le CA des KPI et de la courbe, lui, est exact)
  const s = ht ? enHt(brut) : brut;
  const voitBornes = peut.gererBornes(useMoi().role);
  const suffixe = ht ? "HT" : "TTC";
  const { courant: c, precedente: p } = s.kpis;
  const contexte = useContexteLieu(lieuId, s.periode.du, s.periode.au);
  const evenements = useEvenements(lieuId);
  const sup = superpositions(contexte.data, evenements.data);
  // Jours fériés : seulement sur une semaine ou un mois (retour de Sébastien), illisibles sur plusieurs mois ; les vacances restent
  const longue = (new Date(s.periode.au).getTime() - new Date(s.periode.du).getTime()) / 86_400_000 + 1 > 31;
  const reperesCalendrier = longue ? sup.reperes.filter((x) => x.court !== "Férié") : sup.reperes;
  if (!c.nbVentes && !c.nbRefusees) {
    return (
      <div className="carte p-4">
        <Vide>Aucune vente sur la période pour ce lieu.</Vide>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCouleur
          teinte="vert"
          icone="billet"
          libelle={`CA ${suffixe}`}
          valeur={eurosRond(ht ? c.caHtCents : c.caTtcCents)}
          detail={ht ? `TTC : ${eurosRond(c.caTtcCents)}` : `HT : ${eurosRond(c.caHtCents)}`}
          courant={ht ? c.caHtCents : c.caTtcCents}
          precedente={ht ? p.caHtCents : p.caTtcCents}
        />
        <KpiCouleur teinte="bleu" icone="image" libelle="Ventes" valeur={nombre(c.nbVentes)} detail={`${nombre(c.photosAchetees)} photos achetées`} courant={c.nbVentes} precedente={p.nbVentes} />
        <KpiCouleur teinte="rose" icone="sac" libelle="Panier moyen" valeur={euros(c.panierMoyenCents)} detail={`${suffixe} par vente`} courant={c.panierMoyenCents} precedente={p.panierMoyenCents} />
        <KpiCouleur teinte="orange" icone="pourcent" libelle="Refus / annulations" valeur={pct(c.tauxRefus)} detail={`${nombre(c.nbRefusees)} refus · ${nombre(c.nbAnnulees)} annulation${c.nbAnnulees > 1 ? "s" : ""}`} />
      </div>

      <ActiviteNonFacturee k={c} />

      <Section titre={`Chiffre d'affaires ${suffixe}`}>
        <GraphiqueCA
          ht={ht}
          du={s.periode.du}
          au={s.periode.au}
          granularite={s.granularite}
          serie={s.serie}
          reperes={[...s.interventions.map((i) => ({ jour: i.jour, libelle: `Intervention ${i.borne} : ${i.motif}`, court: "SAV" })), ...reperesCalendrier]}
          bandes={sup.bandes}
          infosJour={sup.infosJour}
        />
        <p className="mt-2 text-xs text-ink-muted">
          Zones grisées : vacances scolaires{contexte.data?.zoneScolaire ? ` (zone ${contexte.data.zoneScolaire})` : ""}. En orange : calendrier marketing. Traits : {longue ? "" : "jours fériés, "}événements du journal
          {s.interventions.length > 0 && `, interventions SAV (${s.interventions.length})`}. La météo du jour est dans l&apos;infobulle (Météo-France, MET Norway).
        </p>
      </Section>

      <Section titre="Quand ça vend : CA par jour et par heure">
        <HeatmapHoraire cellules={s.heatmap} horaires={horaires} />
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section titre="CA moyen par jour de la semaine">
          <JoursSemaine jours={s.joursSemaine} />
        </Section>
        <Section titre="Moyens de paiement">
          {s.moyensPaiement.length ? <MoyensPaiement moyens={s.moyensPaiement} /> : <Vide>—</Vide>}
          {s.modulesPaiement.length > 1 && (
            <p className="mt-2 text-xs text-ink-2">
              Modules : {s.modulesPaiement.map((m) => `${m.libelle} ${euros(m.caTtcCents)}`).join(" · ")}
            </p>
          )}
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        {/* Formules et montants payés réunis (retour de Sébastien), des plus vendues aux moins vendues */}
        <Section titre="Formules vendues">
          <Tableau
            entetes={["Formule", "Montant", "Ventes", "% ventes", "CA", "% CA"]}
            lignes={(() => {
              // Part de chaque formule dans les ventes et dans le CA (retour de Sébastien)
              const nbTotal = s.formules.reduce((x, f) => x + f.nbVentes, 0);
              const caTotal = s.formules.reduce((x, f) => x + f.caTtcCents, 0);
              return s.formules.map((f) => [
                f.libelle ?? f.code,
                f.montantCents !== undefined ? euros(f.montantCents) : "—",
                nombre(f.nbVentes),
                <span key="pv" className="text-ink-2">{pct(nbTotal ? f.nbVentes / nbTotal : 0)}</span>,
                euros(f.caTtcCents),
                <span key="pc" className="text-ink-2">{pct(caTotal ? f.caTtcCents / caTotal : 0)}</span>,
              ]);
            })()}
          />
        </Section>
        <Section titre="Meilleures dates">
          <Tableau entetes={["Date", "Ventes", "CA"]} lignes={s.meilleuresDates.map((d) => [dateAvecJour(d.jour), nombre(d.nbVentes), euros(d.caTtcCents)])} />
        </Section>
      </div>

      <Section titre="Bornes sur la période">
        <Tableau
          entetes={["Borne", "Sur le lieu", "Disponibilité", "Coupures", "Pannes déclarées", "Papier restant", "Dernière vente", "Dernier signal"]}
          lignes={s.bornes.map((b) => {
            const d = b.disponibilite;
            return [
              <span key="b">
                {voitBornes ? <Link className="font-medium text-accent hover:underline" href={`/bornes/${b.borneId}`}>{b.identifiant}</Link> : b.identifiant}{" "}
                <span className="text-xs text-ink-muted">{b.gamme}</span>
              </span>,
              // Affectation de la borne au lieu : depuis quand (et jusqu'à quand si elle en est partie)
              <span key="a">
                {b.fin ? `du ${date(b.debut)} au ${date(b.fin)}` : `depuis le ${date(b.debut)}`}
                {!b.fin && <span className="block text-xs text-ink-muted">{anciennete(b.debut)}</span>}
              </span>,
              !b.dernierHeartbeat ? <span key="d" className="text-ink-muted" title="La borne n’a encore rien envoyé à Régie">pas encore synchronisée</span> : d.taux === null ? "—" : <Disponibilite key="d" taux={d.taux} />,
              d.coupures ? `${d.coupures} (max ${duree(d.plusLongueCoupureMin)})` : "—",
              d.pannes ? `${d.pannes} · ${duree(d.minutesPanne)}` : "—",
              <Papier key="p" restant={b.papierRestant} le={b.papierLe} />,
              depuis(b.derniereVente),
              depuis(b.dernierHeartbeat),
            ];
          })}
        />
      </Section>
    </div>
  );
}

/** Depuis combien de temps la borne est sur le lieu : « 12 jours », « 5 mois », « 2 ans et 3 mois » */
function anciennete(debut: string) {
  const jours = Math.floor((Date.now() - new Date(debut).getTime()) / 86_400_000);
  if (jours < 1) return "depuis aujourd'hui";
  if (jours < 60) return `${jours} jour${jours > 1 ? "s" : ""}`;
  const mois = Math.floor(jours / 30.44);
  if (mois < 24) return `${mois} mois`;
  const reste = mois % 12;
  return `${Math.floor(mois / 12)} ans${reste ? ` et ${reste} mois` : ""}`;
}

/** « 2 h 05 » ou « 45 min » */
const duree = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}` : `${min} min`);

/** Taux de disponibilité, coloré : ≥ 95 % bon, 80–95 % moyen, < 80 % mauvais (avec icône) */
function Disponibilite({ taux }: { taux: number }) {
  const ton = taux >= 0.95 ? "text-good" : taux >= 0.8 ? "text-warn-ink" : "text-bad";
  const icone = taux >= 0.95 ? "●" : taux >= 0.8 ? "▲" : "■";
  return (
    <span className={ton}>
      <span aria-hidden className="text-[0.6rem]">{icone}</span> {pct(taux)}
    </span>
  );
}

function Tableau({ entetes, lignes }: { entetes: string[]; lignes: ReactNode[][] }) {
  if (!lignes.length) return <Vide>—</Vide>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-2">
          <tr>
            {entetes.map((e, i) => (
              <th key={e} className={`py-2 pr-3 font-medium ${i > 0 ? "text-right" : ""}`}>{e}</th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular">
          {lignes.map((l, i) => (
            <tr key={i} className="border-t border-line">
              {l.map((c, j) => (
                <td key={j} className={`py-2 pr-3 ${j > 0 ? "text-right" : ""}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Hors chiffre d'affaires : seulement les ventes des cartes de test et le CA à confirmer (retour de Sébastien) ;
 * le reste de l'activité sans vente est dans l'onglet Comportement (ActiviteSansVente).
 */
function ActiviteNonFacturee({ k }: { k: StatsLieu["kpis"]["courant"] }) {
  const tests = k.tests?.nbVentes ? `${nombre(k.tests.nbVentes)} vente(s) avec les cartes de test (${euros(k.tests.caTtcCents)})` : null;
  // Le CA incertain est compté dans le CA : à confirmer au rapprochement, pas hors CA
  const incertain = k.nbIncertaines ? `${euros(k.caIncertainTtcCents ?? 0)} d'enregistrement incertain (${nombre(k.nbIncertaines)} vente(s)), compté(s) mais à vérifier au rapprochement` : null;
  if (!tests && !incertain) return null;
  return (
    <p className="text-sm text-ink-2">
      {tests && <><span className="font-medium text-ink">Hors chiffre d&apos;affaires :</span> {tests}.{" "}</>}
      {incertain && <><span className="font-medium text-ink">CA à confirmer :</span> {incertain}.</>}
    </p>
  );
}

/** Papier restant dans l'imprimante et ancienneté de l'information (dernier signe de vie qui l'a donnée) */
export function Papier({ restant, le }: { restant: number | null | undefined; le: string | null | undefined }) {
  if (restant === null || restant === undefined) return <span className="text-ink-muted">—</span>;
  const ton = restant < 50 ? "text-bad" : restant < 100 ? "text-warn-ink" : "";
  return (
    <span className={ton}>
      {nombre(restant)} tirage{restant > 1 ? "s" : ""}
      <span className="block text-xs text-ink-muted">{depuis(le ?? null)}</span>
    </span>
  );
}

/** « Ven. 09/10/26 » : jour de la semaine et année sur deux chiffres */
const jourCourtFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "UTC" });
function dateAvecJour(ymd: string): string {
  const [a, m, j] = ymd.slice(0, 10).split("-");
  const nom = jourCourtFmt.format(new Date(`${ymd.slice(0, 10)}T00:00:00Z`));
  return `${nom.charAt(0).toUpperCase()}${nom.slice(1)} ${j}/${m}/${a.slice(2)}`;
}

/** Le lieu sur la carte (coordonnées de la fiche), avec un lien vers l'itinéraire */
function EmplacementLieu({ l }: { l: LieuFiche }) {
  const lat = l.latitude ? Number(l.latitude) : NaN;
  const lng = l.longitude ? Number(l.longitude) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return <p className="mt-4 text-sm text-ink-muted">Lieu non localisé : complétez l&apos;adresse dans la fiche pour l&apos;afficher sur la carte.</p>;
  }
  return (
    <div className="mt-4">
      <div className="overflow-hidden rounded-md border border-line">
        <CarteLieux
          points={[{ id: l.id, latitude: lat, longitude: lng, couleur: "#4f46e5", titre: l.enseigne, lignes: [[l.adresse, l.codePostal, l.ville].filter(Boolean).join(", ")] }]}
          onClic={() => undefined}
          hauteur={260}
          zoomMax={15}
        />
      </div>
      <a className="mt-2 inline-block text-sm text-accent hover:underline" href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`} target="_blank" rel="noreferrer">
        Ouvrir l&apos;itinéraire ↗
      </a>
    </div>
  );
}

/** Statistiques du lieu en HT : le CA est exact (KPI, courbe) ; le reste n'existe qu'en TTC, converti à 20 % de TVA */
function enHt(s: StatsLieu): StatsLieu {
  const k = <K extends StatsLieu["kpis"]["courant"]>(x: K): K => ({ ...x, panierMoyenCents: x.nbVentes ? Math.round(x.caHtCents / x.nbVentes) : 0 });
  return {
    ...s,
    kpis: { ...s.kpis, courant: k(s.kpis.courant), precedente: k(s.kpis.precedente), n1: k(s.kpis.n1) },
    heatmap: s.heatmap.map((h) => ({ ...h, caTtcCents: htDepuisTtc(h.caTtcCents) })),
    joursSemaine: s.joursSemaine.map((j) => ({ ...j, caTtcCents: htDepuisTtc(j.caTtcCents), caMoyenCents: htDepuisTtc(j.caMoyenCents) })),
    moyensPaiement: s.moyensPaiement.map((m) => ({ ...m, caTtcCents: htDepuisTtc(m.caTtcCents) })),
    modulesPaiement: s.modulesPaiement.map((m) => ({ ...m, caTtcCents: htDepuisTtc(m.caTtcCents) })),
    formules: s.formules.map((f) => ({ ...f, caTtcCents: htDepuisTtc(f.caTtcCents), montantCents: f.montantCents === undefined ? undefined : htDepuisTtc(f.montantCents) })),
    meilleuresDates: s.meilleuresDates.map((d) => ({ ...d, caTtcCents: htDepuisTtc(d.caTtcCents) })),
  };
}

/** Activité sans vente : photos validées sans paiement, tirages offerts, paiements restés sans réponse */
function ActiviteSansVente({ k }: { k: StatsLieu["kpis"]["courant"] }) {
  const lignes = [
    { libelle: "Séances sans action (photo validée sans paiement)", nb: k.nbGratuites ?? 0 },
    { libelle: "Tirages offerts (imprimés sans débit)", nb: k.nbOffertes ?? 0 },
    { libelle: "Tirages non facturés", nb: k.tiragesNonFactures ?? 0 },
    { libelle: "Paiements expirés (terminal sans réponse)", nb: k.nbExpirees ?? 0 },
  ];
  return (
    <Section titre="Activité sans vente">
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {lignes.map((l) => (
          <div key={l.libelle} className="flex justify-between gap-3 border-b border-line py-1">
            <dt className="text-ink-2">{l.libelle}</dt>
            <dd className="tabular font-medium">{nombre(l.nb)}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
