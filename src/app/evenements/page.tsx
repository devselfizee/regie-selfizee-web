"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Parc } from "@/lib/api";
import { useMoi } from "@/lib/session";
import { date, dateHeure, depuis, nombre, PARCS } from "@/lib/format";
import { Badge, Chargement, EnTete, Erreur, Section, Vide } from "@/components/Etat";

// Tous les événements de borne (codes R…), tous lieux confondus : super admins seulement (demande du 13/11).
// Avec les médias reçus de PikCloud pour chacun : un événement sans média n'a pas de photo dans la Régie.

interface EvenementListe {
  id: number;
  lieu: { id: number; enseigne: string; ville: string | null; parc: Parc; demo: boolean };
  habituel: boolean;
  nom: string | null;
  code: string;
  dateDebut: string | null;
  dateFin: string | null;
  version: number;
  publieeLe: string | null;
  modifieDepuisPublication: boolean;
  creeLe: string;
  medias: { recus: number; telecharges: number; dernier: string | null };
}

interface ListeEvenements {
  evenements: EvenementListe[];
  codesInconnus: { code: string; medias: number; dernier: string | null }[];
}

/** Sans accents ni casse, pour la recherche */
const plat = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export default function PageEvenements() {
  const moi = useMoi();
  if (!moi.superAdmin) return <Vide>Cette page est réservée aux super admins.</Vide>;
  return <Evenements />;
}

function Evenements() {
  const { data, error, isPending } = useQuery({ queryKey: ["config-evenements"], queryFn: () => api<ListeEvenements>("/config-evenements") });
  const [q, setQ] = useState("");
  const [parc, setParc] = useState("SELFIZEE");
  const [type, setType] = useState("");
  if (error) return <Erreur erreur={error} />;
  if (isPending) return <Chargement />;

  const recherche = plat(q.trim());
  const liste = data.evenements
    .filter((e) => !parc || e.lieu.parc === parc)
    .filter((e) => !type || (type === "habituel") === e.habituel)
    .filter((e) => !recherche || plat(`${e.lieu.enseigne} ${e.lieu.ville ?? ""} ${e.nom ?? ""} ${e.code}`).includes(recherche));

  return (
    <>
      <EnTete
        titre="Événements"
        sousTitre="Tous les événements de borne, tous lieux confondus, avec les médias reçus de PikCloud. Réservé aux super admins."
        actions={
          <>
            <label className="block">
              <span className="etiquette">Recherche</span>
              <input className="champ !w-48" placeholder="Lieu, ville, nom, code…" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <label className="block">
              <span className="etiquette">Parc</span>
              <select className="champ !w-48" value={parc} onChange={(e) => setParc(e.target.value)}>
                <option value="SELFIZEE">Parc Selfizee</option>
                <option value="CLIENT">Parc client</option>
                <option value="TEST">Parc test</option>
                <option value="">Tous les parcs</option>
              </select>
            </label>
            <label className="block">
              <span className="etiquette">Type</span>
              <select className="champ !w-48" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">Tous</option>
                <option value="habituel">Habituels</option>
                <option value="ponctuel">Ponctuels</option>
              </select>
            </label>
          </>
        }
      />

      <Section titre={`Événements (${nombre(liste.length)}${liste.length !== data.evenements.length ? ` sur ${nombre(data.evenements.length)}` : ""})`}>
        {!liste.length ? (
          <p className="text-sm text-ink-2">Aucun événement pour ces filtres.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-2">
                <tr>
                  <th className="py-2 pr-3 font-medium">Lieu</th>
                  <th className="py-2 pr-3 font-medium">Événement</th>
                  <th className="py-2 pr-3 font-medium">Code</th>
                  <th className="py-2 pr-3 font-medium">Publication</th>
                  <th className="py-2 pr-3 text-right font-medium">Médias reçus</th>
                  <th className="py-2 pr-3 text-right font-medium">Photos visibles</th>
                  <th className="py-2 pr-3 font-medium">Dernier média</th>
                  <th />
                </tr>
              </thead>
              <tbody className="tabular">
                {liste.map((e) => (
                  <tr key={e.id} className="border-t border-line align-top">
                    <td className="py-2 pr-3">
                      <Link href={`/lieux/${e.lieu.id}`} className="font-medium hover:underline">{e.lieu.enseigne}</Link>
                      <span className="block text-xs text-ink-2">{[e.lieu.ville, PARCS[e.lieu.parc]].filter(Boolean).join(" · ")}{e.lieu.demo && " · démo"}</span>
                    </td>
                    <td className="py-2 pr-3">
                      {e.habituel ? "Habituel" : e.nom}
                      {!e.habituel && e.dateDebut && <span className="block text-xs text-ink-2">du {date(e.dateDebut)} au {date(e.dateFin)}</span>}
                    </td>
                    <td className="py-2 pr-3 font-mono">{e.code}</td>
                    <td className="py-2 pr-3">
                      {e.publieeLe ? (
                        <>
                          v{e.version} · {dateHeure(e.publieeLe)}
                          {e.modifieDepuisPublication && <span className="block"><Badge ton="warn">Modifié depuis</Badge></span>}
                        </>
                      ) : (
                        <Badge ton="neutre">Jamais publié</Badge>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right">{nombre(e.medias.recus)}</td>
                    <td className={`py-2 pr-3 text-right ${e.medias.recus > e.medias.telecharges ? "text-bad" : ""}`}>{nombre(e.medias.telecharges)}</td>
                    <td className="py-2 pr-3">{e.medias.dernier ? depuis(e.medias.dernier) : "—"}</td>
                    <td className="py-2 text-right">
                      <Link href={`/lieux/${e.lieu.id}?onglet=configuration`} className="text-xs text-accent hover:underline">Configuration</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {data.codesInconnus.length > 0 && (
        <div className="mt-6">
          <Section titre={`Codes reçus de PikCloud sans événement dans la Régie (${data.codesInconnus.length})`}>
            <p className="mb-3 text-sm text-ink-2">Médias stockés sans lieu : ils seront rattachés quand PikCloud les renverra après la création de l&apos;événement.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-ink-2">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Code</th>
                    <th className="py-2 pr-3 text-right font-medium">Médias</th>
                    <th className="py-2 pr-3 font-medium">Dernier reçu</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {data.codesInconnus.map((c) => (
                    <tr key={c.code} className="border-t border-line">
                      <td className="py-2 pr-3 font-mono">{c.code}</td>
                      <td className="py-2 pr-3 text-right">{nombre(c.medias)}</td>
                      <td className="py-2 pr-3">{c.dernier ? dateHeure(c.dernier) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}
    </>
  );
}
