"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type NiveauAlerte, type RegleAlerte } from "@/lib/api";
import { Chargement, Erreur } from "./Etat";

// Libellés des paramètres de chaque règle, avec leur unité
const PARAMETRES: Record<string, { libelle: string; unite: string }> = {
  heures: { libelle: "Durée sans signal / sans vente", unite: "h" },
  minVentesAttendues: { libelle: "Ventes habituelles minimum sur le créneau", unite: "ventes" },
  fenetreJours: { libelle: "Période observée", unite: "jours" },
  referenceJours: { libelle: "Période de comparaison", unite: "jours" },
  seuilPct: { libelle: "Seuil", unite: "%" },
  seuilCritiquePct: { libelle: "Seuil critique", unite: "%" },
  minCaJourReferenceEuros: { libelle: "CA de référence minimum par jour", unite: "€" },
  minTentatives: { libelle: "Tentatives minimum sur 24 h", unite: "paiements" },
  facteur: { libelle: "Multiple de la moyenne", unite: "×" },
  minCaEuros: { libelle: "CA minimum de la journée", unite: "€" },
  minVentes: { libelle: "Ventes hors horaires minimum", unite: "ventes" },
  seuilTirages: { libelle: "Tirages restants", unite: "tirages" },
  seuilEuros: { libelle: "Total des anomalies d'une borne", unite: "€" },
};

const EXPLICATIONS: Record<string, string> = {
  BORNE_MUETTE: "Plus aucun signal de la borne, alors que le lieu est ouvert.",
  ZERO_VENTE: "Aucune vente sur un créneau qui vend d'habitude (même jour, mêmes heures, 4 dernières semaines).",
  BAISSE_CA: "CA moyen par jour ouvert de la période observée, comparé à la période précédente.",
  TAUX_REFUS: "Part de paiements refusés sur les dernières 24 h.",
  PIC_SUSPECT: "CA de la veille très au-dessus de la moyenne (doublon, fraude, événement).",
  VENTE_HORS_HORAIRES: "Ventes de la veille en dehors des horaires de la fiche lieu.",
  CONSOMMABLES: "Papier ou ruban presque épuisé (d'après le heartbeat de la borne).",
  ECART_RAPPROCHEMENT: "À l'import d'un relevé du prestataire monétique : paiements encaissés non remontés, ventes remontées non encaissées, écarts de montant.",
};

export function ReglesAlertes() {
  const { data, error } = useQuery({ queryKey: ["alertes", "regles"], queryFn: () => api<RegleAlerte[]>("/alertes/regles") });
  if (error) return <Erreur erreur={error} />;
  if (!data) return <Chargement />;
  return (
    <section className="carte p-4">
      <h2 className="text-base font-semibold">Règles d&apos;alerte</h2>
      <p className="mb-4 text-sm text-ink-2">
        Critique : e-mail et SMS. Warning : e-mail. Info : récapitulatif quotidien de 8 h seulement. Les lieux fermés (hors saison, fermetures,
        hors horaires) ne déclenchent pas d&apos;alerte.
      </p>
      <div className="space-y-3">
        {data.map((r) => (
          <Regle key={r.type} r={r} />
        ))}
      </div>
    </section>
  );
}

function Regle({ r }: { r: RegleAlerte }) {
  const client = useQueryClient();
  const [actif, setActif] = useState(r.actif);
  const [niveau, setNiveau] = useState<NiveauAlerte>(r.niveau);
  const [params, setParams] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(r.parametres).map(([k, v]) => [k, String(v)]))
  );
  const enregistrer = useMutation({
    mutationFn: () =>
      api(`/alertes/regles/${r.type}`, {
        method: "PUT",
        json: { actif, niveau, parametres: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Number(v.replace(",", "."))])) },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["alertes", "regles"] }),
  });
  const modifie =
    actif !== r.actif || niveau !== r.niveau || Object.entries(params).some(([k, v]) => Number(v.replace(",", ".")) !== r.parametres[k]);

  return (
    <form
      className={`rounded-md border border-line p-3 ${actif ? "" : "opacity-60"}`}
      onSubmit={(e) => {
        e.preventDefault();
        enregistrer.mutate();
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 font-medium">
          <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} />
          {r.libelle}
        </label>
        <select className="champ !w-auto !py-1" value={niveau} onChange={(e) => setNiveau(e.target.value as NiveauAlerte)} aria-label="Niveau">
          <option value="CRITIQUE">Critique</option>
          <option value="WARNING">Warning</option>
          <option value="INFO">Info</option>
        </select>
        {modifie && <button className="bouton ml-auto !py-1 text-xs" disabled={enregistrer.isPending}>Enregistrer</button>}
        {enregistrer.isSuccess && !modifie && <span className="ml-auto text-xs text-good">✓ Enregistré</span>}
      </div>
      <p className="mt-1 text-xs text-ink-muted">{EXPLICATIONS[r.type]}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
        {Object.keys(r.parametres).map((k) => (
          <label key={k} className="text-xs text-ink-2">
            {PARAMETRES[k]?.libelle ?? k}
            <span className="mt-1 flex items-center gap-1">
              <input
                className="champ !w-20 !py-1"
                inputMode="decimal"
                value={params[k]}
                onChange={(e) => setParams({ ...params, [k]: e.target.value })}
              />
              <span>{PARAMETRES[k]?.unite}</span>
              {r.defaut.parametres[k] !== Number(params[k]) && <span className="text-ink-muted">(défaut {r.defaut.parametres[k]})</span>}
            </span>
          </label>
        ))}
      </div>
      {enregistrer.error && <p className="mt-1 text-xs text-bad">{enregistrer.error.message}</p>}
    </form>
  );
}
