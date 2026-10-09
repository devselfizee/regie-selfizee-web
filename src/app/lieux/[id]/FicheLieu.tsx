"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, qs, type LieuFiche, type StatsLieu } from "@/lib/api";
import { Exporter } from "@/components/BoutonExport";
import { peut, useMoi } from "@/lib/session";
import { date, dateHeure, depuis, euros, eurosRond, JOURS_SEMAINE, jour, nombre, pct } from "@/lib/format";
import { Filtres, filtresParDefaut, type ValeursFiltres } from "@/components/Filtres";
import { Kpi } from "@/components/Kpi";
import { GraphiqueCA } from "@/components/GraphiqueCA";
import { HeatmapHoraire, JoursSemaine, MoyensPaiement } from "@/components/GraphiquesLieu";
import { Badge, Chargement, EnTete, Erreur, Section, Vide } from "@/components/Etat";
import { SectionCommissions } from "@/components/SectionCommissions";
import { PrevisionLieuSection } from "@/components/SectionPrevision";
import { SectionPotentiel } from "@/components/Prospect";
import { JournalEvenements, SectionContexte, superpositions, useContexteLieu, useEvenements } from "@/components/Contexte";
import { ListeAlertes } from "@/components/ListeAlertes";
import type { Alerte } from "@/lib/api";

export function FicheLieu({ id }: { id: number }) {
  const moi = useMoi();
  const voitVentesRole = peut.voirVentes(moi.role);
  const [filtres, setFiltres] = useState<ValeursFiltres>(filtresParDefaut);
  const lieu = useQuery({ queryKey: ["lieu", id], queryFn: () => api<LieuFiche>(`/lieux/${id}`) });
  const query = qs({ ...filtres });
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

  return (
    <>
      <EnTete
        titre={l.enseigne}
        sousTitre={[l.typeLieu.libelle, l.sousType?.libelle, l.ville, l.saisonnalite === "SAISONNIER" ? "saisonnier" : null].filter(Boolean).join(" · ")}
        actions={
          <>
            {voitVentes && (
              <Exporter libelle="Ventes" chemin="/export/transactions" requete={qs({ ...filtres, lieuId: id })} />
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

      {prospect && (moi.role === "ADMIN" || moi.role === "COMMERCIAL") && (
        <div className="mb-6">
          <SectionPotentiel lieuId={id} />
        </div>
      )}

      {voitVentes && (
        <>
          <Filtres valeurs={filtres} onChange={setFiltres} filtresLieu={false} />
          {stats.error && <Erreur erreur={stats.error} />}
          {stats.isPending && !stats.error && <Chargement />}
          {stats.data && <Statistiques s={stats.data} lieuId={id} />}
        </>
      )}

      {voitVentes && l.statut === "ACTIF" && (
        <div className="mt-6">
          <PrevisionLieuSection lieuId={id} />
        </div>
      )}

      {voitVentes && (
        <div className="mt-6">
          <SectionContexte lieuId={id} />
        </div>
      )}

      <div className="mt-6">
        <JournalEvenements lieuId={id} peutEcrire={moi.role !== "PARTENAIRE"} />
      </div>

      {(moi.role === "ADMIN" || moi.role === "PARTENAIRE") && (
        <div className="mt-6">
          <SectionCommissions lieuId={id} />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section titre="Fiche">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <Info l="Raison sociale">{l.raisonSociale}{l.siret && <span className="text-ink-muted"> · {l.siret}</span>}</Info>
            <Info l="Adresse">{[l.adresse, l.codePostal, l.ville].filter(Boolean).join(", ") || "—"}</Info>
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
        </Section>
      </div>

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
  );
}

function Info({ l, children }: { l: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-2">{l}</dt>
      <dd>{children}</dd>
    </>
  );
}

function Statistiques({ s, lieuId }: { s: StatsLieu; lieuId: number }) {
  const { courant: c, precedente: p, n1 } = s.kpis;
  const contexte = useContexteLieu(lieuId, s.periode.du, s.periode.au);
  const evenements = useEvenements(lieuId);
  const sup = superpositions(contexte.data, evenements.data);
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
        <Kpi libelle="CA TTC" valeur={eurosRond(c.caTtcCents)} courant={c.caTtcCents} precedente={p.caTtcCents} n1={n1.caTtcCents} />
        <Kpi libelle="Ventes" valeur={nombre(c.nbVentes)} courant={c.nbVentes} precedente={p.nbVentes} n1={n1.nbVentes} />
        <Kpi libelle="Panier moyen" valeur={euros(c.panierMoyenCents)} courant={c.panierMoyenCents} precedente={p.panierMoyenCents} n1={n1.panierMoyenCents} />
        <Kpi libelle="Refus / annulations" valeur={`${pct(c.tauxRefus)} · ${nombre(c.nbAnnulees)} annul.`} courant={c.tauxRefus} precedente={p.tauxRefus} inverse />
      </div>

      <Section titre="Chiffre d'affaires TTC">
        <GraphiqueCA
          du={s.periode.du}
          au={s.periode.au}
          granularite={s.granularite}
          serie={s.serie}
          reperes={[...s.interventions.map((i) => ({ jour: i.jour, libelle: `Intervention ${i.borne} : ${i.motif}`, court: "SAV" })), ...sup.reperes]}
          bandes={sup.bandes}
          infosJour={sup.infosJour}
        />
        <p className="mt-2 text-xs text-ink-muted">
          Zones grisées : vacances scolaires{contexte.data?.zoneScolaire ? ` (zone ${contexte.data.zoneScolaire})` : ""}. Traits : jours fériés, événements du journal
          {s.interventions.length > 0 && `, interventions SAV (${s.interventions.length})`}. La météo du jour est dans l&apos;infobulle.
        </p>
      </Section>

      <Section titre="Quand ça vend : CA par jour et par heure">
        <HeatmapHoraire cellules={s.heatmap} />
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

      <div className="grid gap-6 lg:grid-cols-3">
        <Section titre="Formules vendues">
          <Tableau
            entetes={["Formule", "Ventes", "CA"]}
            lignes={s.formules.map((f) => [f.libelle ?? f.code, nombre(f.nbVentes), euros(f.caTtcCents)])}
          />
        </Section>
        <Section titre="Montants payés">
          <Tableau entetes={["Montant", "Ventes"]} lignes={s.montants.map((m) => [euros(m.montantCents), nombre(m.nbVentes)])} />
        </Section>
        <Section titre="Meilleures dates">
          <Tableau entetes={["Date", "Ventes", "CA"]} lignes={s.meilleuresDates.map((d) => [jour(d.jour), nombre(d.nbVentes), euros(d.caTtcCents)])} />
        </Section>
      </div>

      <Section titre="Bornes sur la période">
        <Tableau
          entetes={["Borne", "Disponibilité", "Coupures", "Pannes déclarées", "Dernière vente", "Dernier signal"]}
          lignes={s.bornes.map((b) => {
            const d = b.disponibilite;
            return [
              <span key="b">{b.identifiant} <span className="text-xs text-ink-muted">{b.gamme}</span></span>,
              !b.dernierHeartbeat ? <span key="d" className="text-ink-muted">jamais connectée</span> : d.taux === null ? "—" : <Disponibilite key="d" taux={d.taux} />,
              d.coupures ? `${d.coupures} (max ${duree(d.plusLongueCoupureMin)})` : "—",
              d.pannes ? `${d.pannes} · ${duree(d.minutesPanne)}` : "—",
              depuis(b.derniereVente),
              depuis(b.dernierHeartbeat),
            ];
          })}
        />
      </Section>
    </div>
  );
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
