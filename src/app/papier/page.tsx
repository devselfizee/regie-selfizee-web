"use client";

import Link from "next/link";
import { dateHeure, depuis, nombre } from "@/lib/format";
import { Reserve } from "@/lib/session";
import { Chargement, EnTete, Erreur, Vide } from "@/components/Etat";
import { tonPapier, useSupervision } from "@/components/Supervision";

// État du papier de chaque borne (demande de Sébastien, 02/11/2026) : de la moins fournie à la plus fournie,
// avec l'âge de l'information et la prochaine fois où la borne doit servir (horaires du lieu).

export default function PagePapier() {
  return (
    <Reserve roles={["ADMIN", "TECHNICIEN"]}>
      <Papier />
    </Reserve>
  );
}

function Papier() {
  const { data, error, isPending } = useSupervision();
  if (error) return <Erreur erreur={error} />;
  if (isPending) return <Chargement />;
  // Bornes en lieu ; sans relevé de papier en dernier
  const bornes = data.bornes
    .filter((b) => b.lieu)
    .sort((a, b) => (a.papier?.restant ?? Infinity) - (b.papier?.restant ?? Infinity) || a.identifiant.localeCompare(b.identifiant));

  return (
    <>
      <EnTete titre="Papier" sousTitre="Tirages restants dans chaque imprimante, de la moins fournie à la plus fournie. Relevé : le dernier signe de vie qui a donné le niveau." />
      {!bornes.length ? (
        <Vide>Aucune borne installée dans un lieu.</Vide>
      ) : (
        <div className="carte overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="px-4 py-3 font-medium">Lieu · borne</th>
                <th className="px-4 py-3 text-right font-medium">Tirages restants</th>
                <th className="px-4 py-3 font-medium">Relevé</th>
                <th className="px-4 py-3 font-medium">Dernier signal</th>
                <th className="px-4 py-3 font-medium">Prochaine utilisation</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {bornes.map((b) => {
                // Relevé de plus de 2 jours : le niveau a pu changer depuis
                const ancien = b.papier && new Date(data.maintenant).getTime() - new Date(b.papier.le).getTime() > 2 * 86_400_000;
                return (
                  <tr key={b.borneId} className="border-t border-line">
                    <td className="px-4 py-2.5">
                      <Link href={`/lieux/${b.lieu!.id}`} className="font-medium hover:underline">{b.lieu!.enseigne}</Link>
                      <span className="block text-xs text-ink-2">{b.identifiant} · {b.gamme}</span>
                    </td>
                    <td className={`px-4 py-2.5 text-right text-base font-semibold ${tonPapier(b.papier?.restant)}`}>
                      {b.papier ? nombre(b.papier.restant) : "—"}
                      {b.papier?.ruban !== null && b.papier?.ruban !== undefined && <span className="block text-xs font-normal text-ink-2">ruban {nombre(b.papier.ruban)}</span>}
                    </td>
                    <td className={`px-4 py-2.5 ${ancien ? "text-warn-ink" : ""}`}>
                      {b.papier ? (
                        <>
                          {depuis(b.papier.le)}
                          <span className="block text-xs text-ink-muted">{dateHeure(b.papier.le)}</span>
                        </>
                      ) : (
                        <span className="text-ink-muted">jamais remonté</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">{depuis(b.dernierPing)}</td>
                    <td className="px-4 py-2.5">
                      {b.lieuOuvert ? <span className="font-medium text-good">en ce moment</span> : b.prochaineOuverture ? dateHeure(b.prochaineOuverture) : <span className="text-ink-muted">pas d&apos;ouverture prévue</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-ink-muted">Rouge : moins de 50 tirages · orange : moins de 100. Prochaine utilisation : d&apos;après les horaires, saisons et fermetures de la fiche du lieu.</p>
    </>
  );
}
