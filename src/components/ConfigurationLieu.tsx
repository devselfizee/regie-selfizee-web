"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, type EvenementPonctuel, type FicheEvenementLieu, type GrilleTarifs, type TarifsLieu } from "@/lib/api";
import { euros } from "@/lib/format";
import { usePerm } from "@/lib/perms";
import { maintenantParis } from "@/lib/programmation";
import { Chargement, Erreur } from "./Etat";
import { EvenementsLieu } from "./EvenementsLieu";
import { FriseProgrammation, SurLaBorne } from "./ProgrammationLieu";

// Onglet « Configuration » de la fiche lieu, mis en page d'après les maquettes « configuration-evenements » du
// 10/11/2026 : ce qui est prévu sur la borne en ce moment, la frise de la programmation, la liste des
// événements programmés, le tarif du lieu et sa chaîne d'héritage (parc → lieu → événements). Le tarif ne se
// modifie que dans l'édition du lieu (onglet Tarifs) ; les infos de la borne, dans son onglet Communication.

/** Onglet « Configuration » de la fiche lieu. */
export function ConfigurationLieu({ lieuId, enseigne }: { lieuId: number; enseigne: string }) {
  const defaut = useQuery({ queryKey: ["evenement-lieu", lieuId, "habituel"], queryFn: () => api<FicheEvenementLieu>(`/lieux/${lieuId}/evenement`) });
  const liste = useQuery({ queryKey: ["evenements-ponctuels", lieuId], queryFn: () => api<EvenementPonctuel[]>(`/lieux/${lieuId}/evenements-ponctuels`) });
  if (defaut.error || liste.error) return <Erreur erreur={defaut.error ?? liste.error} />;
  if (!defaut.data || !liste.data) return <Chargement />;
  const maintenant = maintenantParis();
  return (
    <div className="space-y-5">
      <SurLaBorne lieuId={lieuId} defaut={defaut.data} liste={liste.data} maintenant={maintenant} />
      <FriseProgrammation lieuId={lieuId} defaut={defaut.data} liste={liste.data} maintenant={maintenant} />
      <EvenementsLieu lieuId={lieuId} liste={liste.data} />
      <TarifLieu lieuId={lieuId} enseigne={enseigne} defaut={defaut.data} liste={liste.data} />
    </div>
  );
}

/** Une case de la grille : « 1 tirage 3,50 € », « ★ dès 2 3,00 € » (mis en avant). */
function CasesTarif({ grille: g }: { grille: GrilleTarifs }) {
  const cases = g.paliers.map((p) => ({ cle: `${p.de}`, libelle: p.de === 1 ? "1 tirage" : `dès ${p.de}`, prix: euros(p.prixCents), avant: g.palierMisEnAvant === p.de }));
  cases.push({ cle: "pote", libelle: "+1 pour un pote", prix: g.plusUnCents ? euros(g.plusUnCents) : "non posé", avant: false });
  return (
    <ul className="flex flex-wrap gap-3">
      {cases.map((c) => (
        <li
          key={c.cle}
          title={c.avant ? g.libelleMisEnAvant || "Mis en avant sur l'écran d'offre de la borne" : undefined}
          className={`min-w-[7.5rem] rounded-lg border px-3 py-2 ${c.avant ? "border-accent bg-accent/5" : "border-line"}`}
        >
          <span className={`block text-xs ${c.avant ? "font-semibold text-accent" : "text-ink-2"}`}>{c.avant ? `★ ${c.libelle}` : c.libelle}</span>
          <span className="tabular text-lg font-semibold">{c.prix}</span>
        </li>
      ))}
    </ul>
  );
}

/** Bloc « Tarif du lieu » : la grille appliquée, d'où elle vient, et combien d'événements la reprennent. */
function TarifLieu({ lieuId, enseigne, defaut, liste }: { lieuId: number; enseigne: string; defaut: FicheEvenementLieu; liste: EvenementPonctuel[] }) {
  const peutModifier = usePerm("lieux.tarifs_edit");
  const { data, error } = useQuery({ queryKey: ["tarifs-lieu", lieuId], queryFn: () => api<TarifsLieu>(`/lieux/${lieuId}/tarifs`) });
  const propres = Boolean(data?.propre);
  const evenements = [...(defaut.enregistre ? [defaut.reglages.tarifs.herite] : []), ...liste.map((e) => e.tarifsHerites)];
  const heritent = evenements.filter(Boolean).length;
  const segment = (actif: boolean) => `px-3.5 py-2 text-sm font-medium whitespace-nowrap ${actif ? "bg-ink text-white" : "text-ink-2"}`;
  const pastille = "rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold";
  return (
    <section className="carte px-6 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Tarif du lieu</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* L'origine du tarif : se change dans l'édition du lieu, un seul endroit (règle du 05/11) */}
          <div className="flex overflow-hidden rounded-lg border border-line-strong bg-surface" aria-label="Origine du tarif">
            <span className={segment(!propres)} aria-current={!propres || undefined}>Tarifs du parc</span>
            <span className={segment(propres)} aria-current={propres || undefined}>Tarifs propres au lieu</span>
          </div>
          {peutModifier && <Link href={`/lieux/${lieuId}/modifier?onglet=tarifs`} className="bouton-second h-9">Modifier</Link>}
        </div>
      </div>
      {error ? <Erreur erreur={error} /> : !data ? <Chargement /> : <CasesTarif grille={data.propre ?? data.base} />}
      <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-line pt-4 text-ink-2">
        <span className={pastille}>Parc</span>
        <span aria-hidden>→</span>
        <span className={`${pastille} ${propres ? "bg-warn-bg text-warn-ink" : "bg-accent/10 text-accent"}`}>
          {enseigne} · {propres ? "tarifs propres" : "hérite du parc"}
        </span>
        <span aria-hidden>→</span>
        <span className={pastille}>
          {evenements.length} événement{evenements.length > 1 ? "s" : ""} · {heritent} hérite{heritent > 1 ? "nt" : ""} du lieu
        </span>
      </div>
    </section>
  );
}
