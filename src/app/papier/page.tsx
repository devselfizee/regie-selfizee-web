"use client";

import Link from "next/link";
import { useState } from "react";
import { dateHeure, depuis, nombre, prochainement } from "@/lib/format";
import { PageGuard } from "@/lib/perms";
import { Chargement, EnTete, Erreur, Vide } from "@/components/Etat";
import { tonPapier, useSupervision, type BorneSupervisee } from "@/components/Supervision";

// État du papier de chaque borne (demande de Sébastien, 02/11/2026) : de la moins fournie à la plus fournie,
// avec l'âge de l'information et la prochaine fois où la borne doit servir (horaires du lieu).
// Retour du 05/11 : recherche, filtre par quantité, « ouvert aujourd'hui », qui change le papier.

const SEUILS = [50, 100, 150, 200];

export default function PagePapier() {
  return (
    <PageGuard perm="pages.papier.view">
      <Papier />
    </PageGuard>
  );
}

/** Sans accents ni casse, pour la recherche */
const plat = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function Papier() {
  const { data, error, isPending } = useSupervision();
  const [q, setQ] = useState("");
  const [seuil, setSeuil] = useState("");
  const [ouvertAujourdhui, setOuvertAujourdhui] = useState(false);
  if (error) return <Erreur erreur={error} />;
  if (isPending) return <Chargement />;

  // Le lieu ouvre dans la journée d'exploitation en cours (jusqu'à 6 h demain), comme le Monitoring live
  const finJournee = new Date(data.debutJournee).getTime() + 86_400_000;
  const ouvreCeJour = (b: BorneSupervisee) => b.lieuOuvert || (!!b.prochaineOuverture && new Date(b.prochaineOuverture).getTime() < finJournee);
  const recherche = plat(q.trim());
  const max = seuil ? Number(seuil) : null;

  // Bornes en lieu ; sans relevé de papier en dernier
  const enLieu = data.bornes.filter((b) => b.lieu);
  const bornes = enLieu
    .filter((b) => !recherche || plat(`${b.lieu!.enseigne} ${b.lieu!.ville ?? ""} ${b.identifiant}`).includes(recherche))
    .filter((b) => max === null || (b.papier !== null && b.papier.restant < max))
    .filter((b) => !ouvertAujourdhui || ouvreCeJour(b))
    .sort((a, b) => (a.papier?.restant ?? Infinity) - (b.papier?.restant ?? Infinity) || a.identifiant.localeCompare(b.identifiant));

  return (
    <>
      <EnTete titre="État papier" sousTitre="Tirages restants dans chaque imprimante, de la moins fournie à la plus fournie. Relevé : le dernier signe de vie qui a donné le niveau." />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="etiquette">Recherche</span>
          <input className="champ !w-72" placeholder="Lieu, ville, n° de borne…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="block">
          <span className="etiquette">Tirages restants</span>
          <select className="champ !w-44" value={seuil} onChange={(e) => setSeuil(e.target.value)}>
            <option value="">Tous</option>
            {SEUILS.map((s) => <option key={s} value={s}>moins de {s}</option>)}
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={ouvertAujourdhui} onChange={(e) => setOuvertAujourdhui(e.target.checked)} />
          Ouvert aujourd&apos;hui
        </label>
        <span className="pb-2 text-sm text-ink-2">{nombre(bornes.length)} borne{bornes.length > 1 ? "s" : ""}{bornes.length !== enLieu.length && ` sur ${nombre(enLieu.length)}`}</span>
      </div>

      {!enLieu.length ? (
        <Vide>Aucune borne installée dans un lieu.</Vide>
      ) : !bornes.length ? (
        <Vide>Aucune borne pour ces filtres.</Vide>
      ) : (
        <div className="carte overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="px-4 py-3 font-medium">Lieu · borne</th>
                <th className="px-4 py-3 text-right font-medium">Tirages restants</th>
                <th className="px-4 py-3 font-medium">Papier changé par</th>
                <th className="px-4 py-3 font-medium">Relevé</th>
                <th className="px-4 py-3 font-medium">Dernier signal</th>
                <th className="px-4 py-3 font-medium">Prochaine utilisation</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {bornes.map((b) => {
                // Relevé de plus de 2 jours : le niveau a pu changer depuis
                const ancien = b.papier && new Date(data.maintenant).getTime() - new Date(b.papier.le).getTime() > 2 * 86_400_000;
                const critique = b.papier !== null && b.papier.restant < 50;
                return (
                  <tr key={b.borneId} className="border-t border-line transition-colors hover:bg-surface-2">
                    <td className="px-4 py-2.5">
                      <Link href={`/lieux/${b.lieu!.id}`} className="font-medium hover:underline">{b.lieu!.enseigne}</Link>
                      <span className="block text-xs text-ink-2">{b.identifiant} · {b.gamme}{b.lieu!.ville && ` · ${b.lieu!.ville}`}</span>
                    </td>
                    <td className={`px-4 py-2.5 text-right text-base font-semibold ${tonPapier(b.papier?.restant)}`}>
                      {/* Sous 50 : pastille rouge, pour sauter aux yeux */}
                      <span className={critique ? "rounded-md bg-crit-bg px-2 py-0.5 text-lg" : ""}>{b.papier ? nombre(b.papier.restant) : "—"}</span>
                      {b.papier?.ruban !== null && b.papier?.ruban !== undefined && <span className="block text-xs font-normal text-ink-2">ruban {nombre(b.papier.ruban)}</span>}
                    </td>
                    <td className="px-4 py-2.5">{b.lieu!.papierSurPlace ? "le lieu" : "Selfizee"}</td>
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
                      {b.lieuOuvert ? <span className="font-medium text-good">en ce moment</span> : b.prochaineOuverture ? prochainement(b.prochaineOuverture) : <span className="text-ink-muted">pas d&apos;ouverture prévue</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-ink-muted">
        Rouge gras : moins de 100 tirages · sur fond rouge : moins de 50. Papier changé par : le lieu lui-même, ou Selfizee (fiche du lieu). Prochaine utilisation : d&apos;après les horaires, saisons
        et fermetures de la fiche du lieu.
      </p>
    </>
  );
}
