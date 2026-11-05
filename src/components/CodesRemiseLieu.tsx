"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { date, jour, nombre } from "@/lib/format";
import { Badge, Erreur, Section, Vide } from "@/components/Etat";

// Codes de remise donnés au lieu (retour de Sébastien, 05/11/2026) : sur la fiche, onglet Informations.

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

/** Lots de codes de remise du lieu ; la page des codes est réservée aux admins, ce bloc aussi. */
export function CodesRemiseLieu({ lieuId }: { lieuId: number }) {
  const { data, error } = useQuery({ queryKey: ["lieu", lieuId, "codes-remise"], queryFn: () => api<LotLieu[]>(`/codes-remise/lots?lieuId=${lieuId}`) });
  return (
    <Section
      titre="Codes de remise"
      actions={<Link className="text-sm text-accent hover:underline" href={`/codes?lieuId=${lieuId}`}>Voir les codes</Link>}
    >
      {error && <Erreur erreur={error} />}
      {data && !data.length && <Vide>Aucun code de remise donné à ce lieu.</Vide>}
      {data && data.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-ink-2">
            <tr>
              <th className="py-2 pr-3 font-medium">Lot</th>
              <th className="py-2 pr-3 font-medium">Remise</th>
              <th className="py-2 pr-3 text-right font-medium">Codes</th>
              <th className="py-2 pr-3 text-right font-medium">Utilisés</th>
              <th className="py-2 pr-3 text-right font-medium">Impressions restantes</th>
              <th className="py-2 font-medium">Valables jusqu&apos;au</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {data.map((l) => (
              <tr key={l.id} className="border-t border-line align-top hover:bg-surface-2">
                <td className="py-2 pr-3">
                  <Link className="font-medium hover:underline" href={`/codes?lieuId=${lieuId}&lotId=${l.id}`}>
                    #{l.id}{l.libelle ? ` ${l.libelle}` : ""}
                  </Link>
                  <span className="block text-xs text-ink-muted">
                    créé le {date(l.creeLe)}{l.creePar ? ` par ${[l.creePar.prenom, l.creePar.nom].filter(Boolean).join(" ")}` : ""}
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
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}
