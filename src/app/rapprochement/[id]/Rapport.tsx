"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type RapportReleve } from "@/lib/api";
import { dateHeure, euros, jour, nombre, pct } from "@/lib/format";
import { Reserve } from "@/lib/session";
import { BoutonExport } from "@/components/BoutonExport";
import { Chargement, EnTete, Erreur, Section, Vide } from "@/components/Etat";

export function Rapport({ id }: { id: number }) {
  return (
    <Reserve roles={["ADMIN"]}>
      <Contenu id={id} />
    </Reserve>
  );
}

type Borne = RapportReleve["parTerminal"][number]["borne"];

const LienBorne = ({ borne, terminal }: { borne: Borne; terminal: string }) =>
  borne ? (
    <>
      <Link className="hover:underline" href={`/bornes/${borne.id}`}>{borne.identifiant}</Link>
      {borne.lieu && <span className="text-ink-muted"> · {borne.lieu.enseigne}</span>}
    </>
  ) : (
    <span className="text-ink-muted">{terminal}</span>
  );

function Contenu({ id }: { id: number }) {
  const client = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  const { data: r, error } = useQuery({ queryKey: ["releve", id], queryFn: () => api<RapportReleve>(`/rapprochement/releves/${id}`) });
  const relancer = useMutation({
    mutationFn: () => api<RapportReleve>(`/rapprochement/releves/${id}/relancer`, { method: "POST" }),
    onSuccess: (d) => {
      client.setQueryData(["releve", id], d);
      client.invalidateQueries({ queryKey: ["releves"] });
    },
  });
  const supprimer = useMutation({
    mutationFn: () => api(`/rapprochement/releves/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["releves"] });
      router.push("/rapprochement");
    },
  });

  if (error) return <Erreur erreur={error} />;
  if (!r) return <Chargement />;
  const s = r.synthese;
  const anomalies = s.ecarts + s.nonRemontees + s.nonEncaissees;
  const importees = params.get("importees");

  return (
    <>
      <EnTete
        titre={`Relevé ${r.releve.fournisseur} · ${r.releve.periodeDebut === r.releve.periodeFin ? jour(r.releve.periodeDebut) : `${jour(r.releve.periodeDebut)} → ${jour(r.releve.periodeFin)}`}`}
        sousTitre={`${r.releve.fichierNom}, importé le ${dateHeure(r.releve.importeLe)}`}
        actions={
          <>
            <Link href="/rapprochement" className="bouton-second">← Tous les relevés</Link>
            <button className="bouton-second" disabled={relancer.isPending} onClick={() => relancer.mutate()}
              title="À relancer quand des ventes arrivent en retard (borne restée hors ligne)">
              {relancer.isPending ? "Rapprochement…" : "Relancer le rapprochement"}
            </button>
            {anomalies > 0 && <BoutonExport chemin={`/rapprochement/releves/${id}/anomalies.xlsx`}>Anomalies (Excel)</BoutonExport>}
            <button className="bouton-second text-bad" disabled={supprimer.isPending}
              onClick={() => confirm("Supprimer ce relevé ? Ses ventes redeviendront « non rapprochées ».") && supprimer.mutate()}>
              Supprimer
            </button>
          </>
        }
      />
      {(relancer.error || supprimer.error) && <Erreur erreur={relancer.error ?? supprimer.error} />}
      {importees !== null && (
        <p className="mb-4 text-sm text-ink-2">
          {nombre(Number(importees))} ligne(s) importée(s)
          {Number(params.get("doublons")) > 0 && `, ${params.get("doublons")} déjà importée(s) par un autre relevé et ignorée(s)`}
          {Number(params.get("rejetees")) > 0 && <span className="text-bad">, {params.get("rejetees")} illisible(s) (date ou montant) et ignorée(s)</span>}.
        </p>
      )}
      {relancer.data?.nouveaux !== undefined && (
        <p className="mb-4 text-sm text-ink-2">{relancer.data.nouveaux} nouvelle(s) ligne(s) rapprochée(s).</p>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tuile libelle="Rapprochées" valeur={pct(s.lignes ? s.rapprochees / s.lignes : 0)} detail={`${nombre(s.rapprochees)} sur ${nombre(s.lignes)} lignes · ${euros(s.montantCents)} au relevé`} />
        <Tuile libelle="Encaissé, non remonté" valeur={euros(s.nonRemonteesCents)} detail={`${nombre(s.nonRemontees)} paiement(s) absent(s) des bornes`} alerte={s.nonRemontees > 0} />
        <Tuile libelle="Remonté, non encaissé" valeur={euros(s.nonEncaisseesCents)} detail={`${nombre(s.nonEncaissees)} vente(s) absente(s) du relevé${s.nonEncaisseesIncertaines ? `, dont ${s.nonEncaisseesIncertaines} à l'enregistrement incertain` : ""}`} alerte={s.nonEncaissees > 0} />
        <Tuile libelle="Écarts de montant" valeur={euros(s.ecartCents)} detail={`${nombre(s.ecarts)} paiement(s), relevé − borne`} alerte={s.ecarts > 0} />
      </div>

      {s.terminauxInconnus.length > 0 && (
        <div role="alert" className="mb-6 rounded-md border border-line bg-warn-bg p-4 text-sm text-warn-ink">
          <strong>Terminaux inconnus :</strong> {s.terminauxInconnus.map((t) => `${t.terminal} (${t.lignes} ligne(s), ${euros(t.montantCents)})`).join(", ")}.
          Aucune borne n&apos;a ce n° de terminal : renseignez le TID sur la fiche de la borne concernée (module de paiement), puis relancez le rapprochement.
        </div>
      )}

      <div className="space-y-6">
        <Section titre="Par terminal">
          <Tableau
            entetes={["Terminal", "Borne", "Lignes", "Montant", "Rapprochées", "Écarts", "Non remontées", "Non encaissées"]}
            droite={[2, 3, 4, 5, 6, 7]}
            lignes={r.parTerminal.map((p) => [
              p.terminal,
              <LienBorne key="b" borne={p.borne} terminal="inconnu" />,
              nombre(p.lignes),
              euros(p.montantCents),
              nombre(p.rapprochees),
              <Compte key="e" n={p.ecarts} montant={p.ecartCents} />,
              p.borne ? <Compte key="r" n={p.nonRemontees} montant={p.nonRemonteesCents} /> : "—",
              <Compte key="n" n={p.nonEncaissees} montant={p.nonEncaisseesCents} />,
            ])}
          />
        </Section>

        {anomalies === 0 && s.terminauxInconnus.length === 0 && <Vide>Aucune anomalie : toutes les lignes du relevé correspondent aux ventes des bornes.</Vide>}

        {s.nonRemontees > 0 && (
          <Section titre="Encaissé, non remonté par la borne">
            <p className="mb-3 text-sm text-ink-2">Paiements présents sur le relevé sans vente correspondante : borne restée hors ligne (relancer plus tard), ou panne d&apos;envoi.</p>
            <Tableau
              entetes={["Date", "Borne", "Montant", "Autorisation"]}
              droite={[2]}
              lignes={r.nonRemontees.map((l) => [dateHeure(l.horodatage), <LienBorne key="b" borne={l.borne} terminal={l.terminal} />, euros(l.montantCents), l.reference ?? "—"])}
            />
          </Section>
        )}
        {s.nonEncaissees > 0 && (
          <Section titre="Remonté par la borne, non encaissé">
            <p className="mb-3 text-sm text-ink-2">Ventes carte déclarées par la borne mais absentes du relevé : paiement non abouti, ou relevé incomplet.</p>
            <Tableau
              entetes={["Date", "Borne", "Montant", "ID transaction"]}
              droite={[2]}
              lignes={r.nonEncaissees.map((v) => [
                dateHeure(v.horodatage),
                <LienBorne key="b" borne={v.borne} terminal={v.terminal} />,
                euros(v.montantCents),
                <span key="t">{v.transactionId}{v.incertain && <span className="ml-2 text-xs text-warn-ink">enregistrement incertain</span>}</span>,
              ])}
            />
          </Section>
        )}
        {s.ecarts > 0 && (
          <Section titre="Écarts de montant">
            <Tableau
              entetes={["Date", "Borne", "Relevé", "Borne", "Écart", "ID transaction"]}
              droite={[2, 3, 4]}
              lignes={r.ecarts.map((e) => [
                dateHeure(e.horodatage),
                <LienBorne key="b" borne={e.borne} terminal={e.terminal} />,
                euros(e.montantCents),
                euros(e.vente.montantCents),
                euros(e.montantCents - e.vente.montantCents),
                e.vente.transactionId,
              ])}
            />
          </Section>
        )}
        {r.tronque && <p className="text-sm text-ink-2">Liste limitée aux 500 premières lignes : l&apos;export Excel contient tout.</p>}
      </div>
    </>
  );
}

function Tuile({ libelle, valeur, detail, alerte = false }: { libelle: string; valeur: string; detail: string; alerte?: boolean }) {
  return (
    <div className="carte p-4">
      <div className="text-xs font-medium text-ink-2">{libelle}</div>
      <div className={`mt-1 text-2xl font-semibold ${alerte ? "text-bad" : "text-ink"}`}>
        {alerte && <span aria-hidden className="mr-1 text-base">▲</span>}
        {valeur}
      </div>
      <div className="mt-2 text-xs text-ink-2">{detail}</div>
    </div>
  );
}

const Compte = ({ n, montant }: { n: number; montant: number }) =>
  n ? <span className="text-bad">{nombre(n)} · {euros(montant)}</span> : <span className="text-ink-muted">0</span>;

function Tableau({ entetes, lignes, droite = [] }: { entetes: string[]; lignes: ReactNode[][]; droite?: number[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-2">
          <tr>{entetes.map((e, i) => <th key={i} className={`py-2 pr-4 font-medium ${droite.includes(i) ? "text-right" : ""}`}>{e}</th>)}</tr>
        </thead>
        <tbody className="tabular">
          {lignes.map((l, i) => (
            <tr key={i} className="border-t border-line">
              {l.map((c, j) => <td key={j} className={`py-2 pr-4 ${droite.includes(j) ? "text-right" : ""}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
