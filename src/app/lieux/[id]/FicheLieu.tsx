"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, qs, type LieuFiche, type StatsLieu } from "@/lib/api";
import { MenuExport } from "@/components/BoutonExport";
import { Gate, useDroits } from "@/lib/perms";
import { date, dateHeure, JOURS_SEMAINE, nombre, parametreUrl, telephoneLisible } from "@/lib/format";
import { Filtres, filtresParDefaut, type ValeursFiltres } from "@/components/Filtres";
import { GraphiqueCA } from "@/components/GraphiqueCA";
import { Badge, Chargement, EnTete, Erreur, Section, Vide } from "@/components/Etat";
import { SectionCommissions } from "@/components/SectionCommissions";
import { PrevisionLieuSection } from "@/components/SectionPrevision";
import { SectionPotentiel } from "@/components/Prospect";
import { JournalEvenements, superpositions, useContexteLieu, useEvenements } from "@/components/Contexte";
import { Comportement } from "@/components/Entonnoir";
import { BasculeHt, htDepuisTtc, usePreferenceHt } from "@/components/BasculeHt";
import { ListePaiements } from "@/components/ListePaiements";
import { CarteLieux } from "@/components/CarteLieux";
import { SuiviLieu } from "@/components/SuiviLieu";
import { ConfigurationLieu } from "@/components/ConfigurationLieu";
import { CodesRemiseLieu } from "@/components/CodesRemiseLieu";
import { PageSouvenirLieu } from "@/components/PageSouvenirLieu";
import { AccesLieu } from "@/components/AccesLieu";
import type { Alerte } from "@/lib/api";
import { AlertesLieu, Bloc, CarteSoirees, FaceAuxAutres, FormulesVendues, heuresAvecVentes, JoursSemaineBarres, LegendeCourbe, MeilleuresDates, TuilesLieu, useStatsFicheLieu } from "@/components/StatistiquesLieu";

export function FicheLieu({ id, ongletInitial }: { id: number; ongletInitial?: string }) {
  // Droits Konitys (Admin Panel) : onglets et boutons
  const a = useDroits();
  const voitVentesRole = a("ventes.view");
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
    enabled: a("alertes.ventes_view") || a("alertes.techniques_view"),
  });

  if (lieu.error) return <Erreur erreur={lieu.error} />;
  if (!lieu.data) return <Chargement />;
  const l = lieu.data;
  // Un prospect n'a pas encore de ventes : on montre son potentiel estimé à la place
  const prospect = l.statut === "PROSPECT";
  const voitVentes = voitVentesRole && !prospect;
  const voitCommissions = a("commissions.view");
  const ongletsVisibles = ONGLETS.filter((o) => (o.cle === "stats" ? voitVentes || prospect : o.cle === "comportement" ? voitVentes : o.cle === "ventes" ? voitVentes && a("paiements.view") : o.cle === "commissions" ? voitCommissions : o.cle === "suivi" ? a("suivi.view") : o.cle === "configuration" ? a("evenements.view") : o.cle === "souvenir" ? !prospect && a("souvenir.contacts_view") : true));
  const ongletActif = ongletsVisibles.some((o) => o.cle === onglet) ? onglet : ongletsVisibles[0].cle;

  return (
    <>
      <EnTete
        titre={l.enseigne}
        sousTitre={[l.typeLieu.libelle, l.sousType?.libelle, l.ville, l.saisonnalite === "SAISONNIER" ? "saisonnier" : null].filter(Boolean).join(" · ")}
        actions={
          <>
            {["stats", "comportement", "ventes"].includes(ongletActif) && voitVentes && <BasculeHt ht={ht} onChange={setHt} />}
            {voitVentes && a("ventes.export") && (
              <MenuExport exports={[{ libelle: "Ventes du lieu", chemin: "/export/transactions", requete: qs({ ...filtres, parc: undefined, lieuId: id }) }]} />
            )}
            <Gate perm="lieux.edit">
              <Link href={`/lieux/${id}/modifier`} className="bouton">Modifier la fiche</Link>
            </Gate>
          </>
        }
      />

      {/* Alertes ouvertes : une ligne chacune, avec ses actions (maquette du 10/11) */}
      {alertes.data && <AlertesLieu alertes={alertes.data} />}

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

      {ongletActif === "stats" && prospect && a("prospects.view") && (
        <div className="mb-6">
          <SectionPotentiel lieuId={id} />
        </div>
      )}

      {ongletActif === "stats" && voitVentes && (
        <>
          <Filtres valeurs={filtres} onChange={setFiltres} filtresLieu={false} />
          {stats.error && <Erreur erreur={stats.error} />}
          {stats.isPending && !stats.error && <Chargement />}
          {stats.data && <Statistiques s={stats.data} lieuId={id} l={l} ht={ht} requete={query} />}
        </>
      )}

      {/* Calendrier et météo : seulement dans Analyse (retour de Sébastien) ; la courbe garde vacances, fériés et météo en infobulle */}
      {/* Comportement des invités, à part des statistiques (retour de Sébastien) ; la prévision du mois est dans Statistiques (maquette du 10/11) */}
      {ongletActif === "comportement" && voitVentes && (
        <div>
          <Filtres valeurs={filtres} onChange={setFiltres} filtresLieu={false} />
          {stats.data && (
            <div className="mb-6">
              <ActiviteSansVente k={stats.data.kpis.courant} />
            </div>
          )}
          <Comportement lieuId={id} requete={qs({ du: filtres.du, au: filtres.au })} />
        </div>
      )}

      {ongletActif === "ventes" && <ListePaiements lieuIdFixe={id} ht={ht} />}

      {/* Journal d'événements : dans le suivi plutôt que sous les statistiques (retour de Sébastien du 10/11) */}
      {ongletActif === "suivi" && <SuiviLieu lieuId={id} journal={<JournalEvenements lieuId={id} peutEcrire={a("contexte.edit")} />} />}

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
                  {c.telephone && <> · <a className="text-accent" href={`tel:${c.telephone.replace(/[^\d+]/g, "")}`}>{telephoneLisible(c.telephone)}</a></>}
                  {c.email && <> · <a className="text-accent" href={`mailto:${c.email}`}>{c.email}</a></>}
                  {c.commentaire && <span className="block text-xs text-ink-2">{c.commentaire}</span>}
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

      <div className="mt-6">
        <AccesLieu lieuId={l.id} localisationCles={l.localisationCles ?? null} disponibiliteContacts={l.disponibiliteContacts ?? null} />
      </div>

      <Gate perm="codes_remise.view">
        <div className="mt-6">
          <CodesRemiseLieu lieuId={l.id} />
        </div>
      </Gate>

      <div className="mt-6">
        <Section titre="Historique des bornes" actions={a("bornes.view") ? <Link className="text-sm text-accent hover:underline" href="/bornes">Gérer les bornes</Link> : undefined}>
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
// Ordre demandé par Sébastien le 13/11
const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: "stats", libelle: "Statistiques" },
  { cle: "ventes", libelle: "Ventes" },
  { cle: "infos", libelle: "Informations" },
  // La borne du lieu : infos et tarif repris par chaque événement, puis les événements
  { cle: "configuration", libelle: "Configuration" },
  { cle: "suivi", libelle: "Suivi" },
  { cle: "commissions", libelle: "Commissions" },
  { cle: "comportement", libelle: "Comportements" },
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

const GRANULARITES: Record<StatsLieu["granularite"], string> = { jour: "jour", semaine: "semaine", mois: "mois", annee: "année" };

function Statistiques({ s: brut, lieuId, l, ht, requete }: { s: StatsLieu; lieuId: number; l: LieuFiche; ht: boolean; requete: string }) {
  // En HT : montants convertis à 20 % de TVA quand l'API ne donne que le TTC (le CA des KPI et de la courbe, lui, est exact)
  const s = ht ? enHt(brut) : brut;
  const suffixe = ht ? "HT" : "TTC";
  const { courant: c, precedente: p } = s.kpis;
  // Soirées (6 h → 6 h), comparaison aux lieux du même type, période précédente comparable ou non
  const fiche = useStatsFicheLieu(lieuId, requete);
  const f = fiche.data;
  const contexte = useContexteLieu(lieuId, s.periode.du, s.periode.au);
  const evenements = useEvenements(lieuId);
  const sup = superpositions(contexte.data, evenements.data);
  // Jours fériés : seulement sur une semaine ou un mois (retour de Sébastien), illisibles sur plusieurs mois ; les vacances restent
  const longue = (new Date(s.periode.au).getTime() - new Date(s.periode.du).getTime()) / 86_400_000 + 1 > 31;
  const reperesCalendrier = longue ? sup.reperes.filter((x) => x.court !== "Férié") : sup.reperes;
  const prevision = l.statut === "ACTIF" && <PrevisionLieuSection lieuId={lieuId} ht={ht} />;
  if (!c.nbVentes && !c.nbRefusees) {
    return (
      <div className="space-y-6">
        <div className="carte p-4">
          <Vide>Aucune vente sur la période pour ce lieu.</Vide>
        </div>
        {prevision}
      </div>
    );
  }
  // Beaucoup d'heures avec des ventes (lieu de jour et de nuit) : la carte prend toute la largeur, sans défilement
  const large = f ? heuresAvecVentes(f).length > 12 : false;
  return (
    <div className="space-y-6">
      <TuilesLieu k={c} p={p} f={f} ht={ht} />

      <Bloc
        titre={`Chiffre d'affaires ${suffixe} par ${GRANULARITES[s.granularite]}`}
        actions={<LegendeCourbe zone={contexte.data?.zoneScolaire} feries={!longue} interventions={s.interventions.length} />}
      >
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
      </Bloc>

      {prevision}

      {fiche.error && <Erreur erreur={fiche.error} />}
      {!f && !fiche.error && <Chargement />}
      {f && (
        <div className={`grid items-start gap-6 ${large ? "" : "lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"}`}>
          <Bloc titre="Quand ça vend : CA moyen par soirée et par heure" sousTitre={`Moyenne par soirée ouverte, ${suffixe} (soirée de ${f.heureBascule} h à ${f.heureBascule} h le lendemain).`}>
            <CarteSoirees f={f} ht={ht} />
          </Bloc>
          <Bloc
            titre={`Face aux autres lieux « ${f.comparaison.typeLieu} » du parc`}
            sousTitre={
              f.comparaison.medianes
                ? `${f.comparaison.nbLieux} lieux · barre = ${l.enseigne}, trait = médiane${f.comparaison.lieuDemo ? " (lieu de démonstration, hors médiane)" : ""}`
                : undefined
            }
          >
            <FaceAuxAutres f={f} ht={ht} enseigne={l.enseigne} />
          </Bloc>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Bloc titre="CA moyen par jour de la semaine">
          <JoursSemaineBarres jours={s.joursSemaine} horaires={l.horaires} />
        </Bloc>
        <Bloc titre="Meilleures dates">
          <MeilleuresDates dates={s.meilleuresDates} />
        </Bloc>
      </div>

      <Bloc titre="Formules vendues">
        <FormulesVendues s={s} />
      </Bloc>
    </div>
  );
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
