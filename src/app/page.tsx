"use client";

import Link from "next/link";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, API_URL, qs, type StatsGlobales } from "@/lib/api";
import { depuis, euros, eurosRond, jour, nombre, pct } from "@/lib/format";
import { Filtres, filtresParDefaut, type ValeursFiltres } from "@/components/Filtres";
import { Kpi } from "@/components/Kpi";
import { GraphiqueCA } from "@/components/GraphiqueCA";
import { Badge, Chargement, EnTete, Erreur, Section, Vide } from "@/components/Etat";

export default function VueGlobale() {
  const [filtres, setFiltres] = useState<ValeursFiltres>(filtresParDefaut);
  const query = qs({ ...filtres });
  const { data, error, isPending, isFetching } = useQuery({
    queryKey: ["stats-global", query],
    queryFn: () => api<StatsGlobales>(`/stats/global${query}`),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <EnTete
        titre="Vue globale"
        sousTitre={data ? `Du ${jour(data.periode.du)} au ${jour(data.periode.au)}${isFetching ? " · mise à jour…" : ""}` : undefined}
        actions={
          <>
            <a className="bouton-second" href={`${API_URL}/export/transactions.csv${query}`}>Exporter les ventes (CSV)</a>
            <a className="bouton-second" href={`${API_URL}/export/classement.csv${query}`}>Exporter le classement</a>
          </>
        }
      />
      <Filtres valeurs={filtres} onChange={setFiltres} />

      {error && <Erreur erreur={error} />}
      {isPending && !error && <Chargement />}
      {data && <Contenu data={data} />}
    </>
  );
}

function Contenu({ data }: { data: StatsGlobales }) {
  const { courant: c, precedente: p, n1 } = data.kpis;
  const top = data.classement.filter((l) => l.caTtcCents > 0).slice(0, 10);
  const flop = [...data.classement].reverse().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi libelle="CA TTC" valeur={eurosRond(c.caTtcCents)} courant={c.caTtcCents} precedente={p.caTtcCents} n1={n1.caTtcCents} />
        <Kpi libelle="Ventes" valeur={nombre(c.nbVentes)} courant={c.nbVentes} precedente={p.nbVentes} n1={n1.nbVentes} />
        <Kpi libelle="Panier moyen" valeur={euros(c.panierMoyenCents)} courant={c.panierMoyenCents} precedente={p.panierMoyenCents} n1={n1.panierMoyenCents} />
        <Kpi libelle="Taux de refus paiement" valeur={pct(c.tauxRefus)} courant={c.tauxRefus} precedente={p.tauxRefus} inverse />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="carte p-4">
          <div className="text-xs font-medium text-ink-2">CA HT</div>
          <div className="mt-1 text-lg font-semibold">{eurosRond(c.caHtCents)}</div>
        </div>
        <div className="carte p-4">
          <div className="text-xs font-medium text-ink-2">Remboursements</div>
          <div className="mt-1 text-lg font-semibold">{euros(c.rembourseTtcCents)}</div>
        </div>
        <div className="carte p-4">
          <div className="text-xs font-medium text-ink-2">Commissions dues · CA net Selfizee</div>
          <div className="mt-1 text-sm text-ink-muted">Disponible avec le moteur de commissions (V1.1)</div>
        </div>
      </div>

      <Section titre="Chiffre d'affaires TTC">
        <GraphiqueCA du={data.periode.du} au={data.periode.au} granularite={data.granularite} serie={data.serie} serieN1={data.serieN1} />
      </Section>

      {data.classement.length <= 10 ? (
        <Section titre="Classement des lieux">
          {data.classement.length ? <TableauLieux lignes={data.classement} /> : <Vide>Aucun lieu actif.</Vide>}
        </Section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Section titre="Top 10 des lieux">
            {top.length ? <TableauLieux lignes={top} /> : <Vide>Aucune vente sur la période.</Vide>}
          </Section>
          <Section titre="Flop 10 des lieux">
            <TableauLieux lignes={flop} />
          </Section>
        </div>
      )}

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

function TableauLieux({ lignes }: { lignes: StatsGlobales["classement"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-2">
          <tr>
            <th className="py-2 pr-3 font-medium">Lieu</th>
            <th className="py-2 pr-3 font-medium">Type</th>
            <th className="py-2 pr-3 text-right font-medium">CA TTC</th>
            <th className="py-2 text-right font-medium" title="CA divisé par le nombre de jours avec au moins une vente">CA / jour de vente</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {lignes.map((l) => (
            <tr key={l.lieuId} className="border-t border-line">
              <td className="py-2 pr-3">
                <Link className="font-medium hover:underline" href={`/lieux/${l.lieuId}`}>{l.enseigne}</Link>
                {l.ville && <div className="text-xs text-ink-muted">{l.ville}</div>}
              </td>
              <td className="py-2 pr-3 text-ink-2">{l.typeLieu}</td>
              <td className="py-2 pr-3 text-right">{euros(l.caTtcCents)}</td>
              <td className="py-2 text-right text-ink-2">{l.joursAvecVente ? euros(l.caParJourVenteCents) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
