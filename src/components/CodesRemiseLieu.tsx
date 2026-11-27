"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { date, dateHeure, jour, nombre } from "@/lib/format";
import { Gate } from "@/lib/perms";
import { Badge, Chargement, Erreur, Section, Vide } from "@/components/Etat";
import { Modale } from "@/components/Modale";
import { FormulaireLot } from "@/components/FormulaireLotCodes";

// Codes de remise donnés au lieu : onglet « Codes promo » de la fiche (retours de Sébastien des 05/11 et 27/11/2026) :
// les lots du lieu, leurs codes en dépliant un lot, et la génération d'un lot pour ce lieu.

interface LotLieu {
  id: number;
  libelle: string | null;
  remise: string;
  seulementLieu: boolean;
  expireLe: string;
  expire: boolean;
  creeLe: string;
  creePar: { prenom: string; nom: string } | null;
  nbCodes: number;
  codesUtilises: number;
  codesDesactives: number;
  impressionsRestantes: number;
}

type Etat = "a_utiliser" | "entame" | "epuise" | "expire" | "desactive";
const ETATS: Record<Etat, { libelle: string; ton: "ok" | "warn" | "crit" | "neutre" }> = {
  a_utiliser: { libelle: "À utiliser", ton: "ok" },
  entame: { libelle: "Utilisé en partie", ton: "warn" },
  epuise: { libelle: "Épuisé", ton: "neutre" },
  expire: { libelle: "Expiré", ton: "neutre" },
  desactive: { libelle: "Désactivé", ton: "crit" },
};

interface CodeLot {
  id: number;
  code: string;
  utilise: number;
  restant: number;
  etat: Etat;
  derniereUtilisation: string | null;
}

/** Lots de codes de remise du lieu, avec leurs codes ; génération d'un lot réservée au droit codes_remise.edit. */
export function CodesRemiseLieu({ lieuId }: { lieuId: number }) {
  const { data, error } = useQuery({ queryKey: ["lieu", lieuId, "codes-remise"], queryFn: () => api<LotLieu[]>(`/codes-remise/lots?lieuId=${lieuId}`) });
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [creation, setCreation] = useState(false);
  return (
    <Section
      titre="Codes promo"
      actions={
        <div className="flex items-center gap-3">
          <Link className="text-sm text-accent hover:underline" href={`/codes?lieuId=${lieuId}`}>
            Tous les codes
          </Link>
          <Gate perm="codes_remise.edit">
            <button type="button" className="bouton" onClick={() => setCreation(true)}>
              Créer des codes
            </button>
          </Gate>
        </div>
      }
    >
      <p className="mb-3 text-sm text-ink-2">Impressions offertes ou remisées, à saisir sur la borne. Cliquer un lot pour voir ses codes.</p>
      {error && <Erreur erreur={error} />}
      {!data && !error && <Chargement />}
      {data && !data.length && <Vide>Aucun code promo donné à ce lieu.</Vide>}
      {data && data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="py-2 pr-3 font-medium">Lot</th>
                <th className="py-2 pr-3 font-medium">Remise</th>
                <th className="py-2 pr-3 text-right font-medium">Codes</th>
                <th className="py-2 pr-3 text-right font-medium">Utilisés</th>
                <th className="py-2 pr-3 text-right font-medium" title="Impressions offertes restantes, ou utilisations restantes des codes en %">Restant</th>
                <th className="py-2 font-medium">Valables jusqu&apos;au</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {data.map((l) => (
                <Fragment key={l.id}>
                  <tr
                    className={`cursor-pointer border-t border-line align-top hover:bg-surface-2 ${ouvert === l.id ? "bg-surface-2" : ""}`}
                    onClick={() => setOuvert(ouvert === l.id ? null : l.id)}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && setOuvert(ouvert === l.id ? null : l.id)}
                    aria-expanded={ouvert === l.id}
                  >
                    <td className="py-2 pr-3">
                      <span className="font-medium">
                        <span aria-hidden className="mr-1 inline-block w-3 text-ink-muted">{ouvert === l.id ? "▾" : "▸"}</span>
                        #{l.id}
                        {l.libelle ? ` ${l.libelle}` : ""}
                      </span>
                      <span className="block pl-4 text-xs text-ink-muted">
                        créé le {date(l.creeLe)}
                        {l.creePar ? ` par ${[l.creePar.prenom, l.creePar.nom].filter(Boolean).join(" ")}` : ""}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      {l.remise}
                      <span className="block text-xs text-ink-muted">{l.seulementLieu ? "dans ce lieu seulement" : "sur toutes les bornes"}</span>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {nombre(l.nbCodes)}
                      {l.codesDesactives > 0 && <span className="block text-xs text-ink-muted">{nombre(l.codesDesactives)} désactivé{l.codesDesactives > 1 ? "s" : ""}</span>}
                    </td>
                    <td className="py-2 pr-3 text-right">{nombre(l.codesUtilises)}</td>
                    <td className="py-2 pr-3 text-right">{l.expire ? "—" : nombre(l.impressionsRestantes)}</td>
                    <td className="py-2">{l.expire ? <Badge ton="neutre">Expiré le {jour(l.expireLe)}</Badge> : jour(l.expireLe)}</td>
                  </tr>
                  {ouvert === l.id && (
                    <tr>
                      <td colSpan={6} className="bg-surface-2 px-4 pb-4 pt-1">
                        <CodesDuLot lotId={l.id} lieuId={lieuId} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modale titre="Créer des codes pour ce lieu" ouverte={creation} onFermer={() => setCreation(false)}>
        {creation && (
          <FormulaireLot
            lieuFixe={lieuId}
            onCree={(lot) => {
              setCreation(false);
              setOuvert(lot);
            }}
          />
        )}
      </Modale>
    </Section>
  );
}

/** Codes d'un lot (100 au plus ici ; la page Codes pour le reste, la recherche et le détail des utilisations). */
function CodesDuLot({ lotId, lieuId }: { lotId: number; lieuId: number }) {
  const { data, error } = useQuery({
    queryKey: ["codes-remise", `?lotId=${lotId}`],
    queryFn: () => api<{ total: number; lignes: CodeLot[] }>(`/codes-remise?lotId=${lotId}`),
  });
  if (error) return <Erreur erreur={error} />;
  if (!data) return <Chargement />;
  return (
    <div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {data.lignes.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2">
            <span>
              <span className="font-mono font-medium tracking-wider">{c.code}</span>
              <span className="block text-xs text-ink-muted">
                {c.utilise ? `${nombre(c.utilise)} utilisé${c.utilise > 1 ? "s" : ""} · ` : ""}
                {nombre(c.restant)} restant{c.restant > 1 ? "s" : ""}
                {c.derniereUtilisation ? ` · ${dateHeure(c.derniereUtilisation)}` : ""}
              </span>
            </span>
            <Badge ton={ETATS[c.etat].ton}>{ETATS[c.etat].libelle}</Badge>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs">
        <Link className="text-accent hover:underline" href={`/codes?lieuId=${lieuId}&lotId=${lotId}`}>
          {data.total > data.lignes.length ? `Voir les ${nombre(data.total)} codes` : "Ouvrir dans la page Codes"} (détail, désactivation, export)
        </Link>
      </p>
    </div>
  );
}
