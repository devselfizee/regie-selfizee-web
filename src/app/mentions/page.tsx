"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, type MesMentions } from "@/lib/api";
import { dateHeure } from "@/lib/format";
import { Reserve } from "@/lib/session";
import { Badge, Chargement, EnTete, Erreur, Vide } from "@/components/Etat";

export default function PageMentions() {
  return (
    <Reserve roles={["ADMIN", "COMMERCIAL", "TECHNICIEN"]}>
      <Mentions />
    </Reserve>
  );
}

function Mentions() {
  const { data, error } = useQuery({ queryKey: ["mentions"], queryFn: () => api<MesMentions>("/commentaires/mentions") });
  return (
    <>
      <EnTete titre="Mes mentions" sousTitre="Les commentaires où l'on vous a mentionné. Ouvrir le suivi du lieu marque ses mentions comme lues." />
      {error ? (
        <Erreur erreur={error} />
      ) : !data ? (
        <Chargement />
      ) : !data.mentions.length ? (
        <Vide>Personne ne vous a encore mentionné.</Vide>
      ) : (
        <ul className="carte divide-y divide-line">
          {data.mentions.map(({ luLe, commentaire: c }) => (
            <li key={c.id}>
              <Link href={`/lieux/${c.lieu.id}?onglet=suivi`} className="block px-4 py-3 hover:bg-surface-2">
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium">{c.lieu.enseigne}</span>
                  {c.lieu.ville && <span className="text-ink-2">{c.lieu.ville}</span>}
                  {!luLe && <Badge ton="warn">Non lue</Badge>}
                  <span className="ml-auto text-xs text-ink-muted">
                    {c.auteur ? `${c.auteur.prenom} ${c.auteur.nom}` : "Utilisateur supprimé"} · {dateHeure(c.createdAt)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm whitespace-pre-wrap text-ink-2">{c.texte}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
