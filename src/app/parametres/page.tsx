"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type RefValeur } from "@/lib/api";
import { Reserve } from "@/lib/session";
import { Badge, Chargement, EnTete, Erreur } from "@/components/Etat";

// Listes administrables de la fiche lieu (CDC §3.1) + gammes et types de module (CDC §2)
const LISTES: { cle: string; libelle: string; aide: string }[] = [
  { cle: "TYPE_LIEU", libelle: "Types de lieu", aide: "Camping, boîte de nuit, bar…" },
  { cle: "SOUS_TYPE_LIEU", libelle: "Sous-types", aide: "Précision du type de lieu (ex. Camping 4-5*)" },
  { cle: "STANDING", libelle: "Standing", aide: "Gamme du lieu" },
  { cle: "CLIENTELE", libelle: "Clientèles", aide: "Clientèle dominante (plusieurs choix possibles)" },
  { cle: "ZONE_GEO", libelle: "Zones", aide: "Urbaine, littoral, montagne…" },
  { cle: "TAILLE_COMMUNE", libelle: "Tailles de commune", aide: "Tranches de population" },
  { cle: "EMPLACEMENT_ZONE", libelle: "Zones dans le lieu", aide: "Où est placée la borne : entrée, piste…" },
  { cle: "ECLAIRAGE", libelle: "Éclairage", aide: "Éclairage de l'emplacement" },
  { cle: "ORIGINE_LEAD", libelle: "Origines du lead", aide: "Comment le lieu a été trouvé" },
  { cle: "TYPE_EVENEMENT", libelle: "Types d'événement", aide: "Journal d'événements du lieu" },
  { cle: "GAMMES", libelle: "Gammes de bornes", aide: "Ma Trombine, Prestige…" },
  { cle: "MODULES", libelle: "Modules de paiement", aide: "Code envoyé par les bornes dans le JSON (module.type)" },
];

interface Element {
  id: number;
  code: string;
  libelle: string;
  actif: boolean;
  parentId?: number | null;
}
interface Referentiel {
  listes: Record<string, RefValeur[]>;
  gammes: Element[];
  typesModule: Element[];
}

/** "Camping 4-5*" → "CAMPING_4_5" */
const versCode = (libelle: string) =>
  libelle
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);

export default function PageParametres() {
  return (
    <Reserve roles={["ADMIN"]}>
      <Parametres />
    </Reserve>
  );
}

function Parametres() {
  const [liste, setListe] = useState(LISTES[0]);
  const { data, error } = useQuery({ queryKey: ["referentiel"], queryFn: () => api<Referentiel>("/referentiel") });

  return (
    <>
      <EnTete
        titre="Paramètres"
        sousTitre="Valeurs proposées dans les fiches lieux, les bornes et les filtres des statistiques. Une valeur utilisée ne se supprime pas : on la désactive (elle reste dans l'historique et les statistiques)."
      />
      {error && <Erreur erreur={error} />}
      {!data && !error && <Chargement />}
      {data && (
        <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
          <nav className="carte h-fit p-2" aria-label="Listes">
            {LISTES.map((l) => (
              <button
                key={l.cle}
                onClick={() => setListe(l)}
                className={`block w-full rounded-md px-3 py-2 text-left text-sm ${liste.cle === l.cle ? "bg-surface-2 font-medium" : "text-ink-2 hover:bg-surface-2"}`}
              >
                {l.libelle}
              </button>
            ))}
          </nav>
          <Liste key={liste.cle} def={liste} data={data} />
        </div>
      )}
    </>
  );
}

function Liste({ def, data }: { def: (typeof LISTES)[number]; data: Referentiel }) {
  const client = useQueryClient();
  const [nouveau, setNouveau] = useState("");
  const [code, setCode] = useState("");
  const [parentId, setParentId] = useState("");
  const typeLieux = data.listes.TYPE_LIEU ?? [];

  const elements: Element[] =
    def.cle === "GAMMES" ? data.gammes : def.cle === "MODULES" ? data.typesModule : (data.listes[def.cle] ?? []);
  const base = def.cle === "GAMMES" ? "/referentiel/gammes" : def.cle === "MODULES" ? "/referentiel/types-module" : "/referentiel/valeurs";
  const rafraichir = () => client.invalidateQueries({ queryKey: ["referentiel"] });

  const ajouter = useMutation({
    mutationFn: () =>
      api(base, {
        method: "POST",
        json: {
          code: code || versCode(nouveau),
          libelle: nouveau.trim(),
          ...(base === "/referentiel/valeurs" ? { categorie: def.cle, ordre: elements.length } : {}),
          ...(def.cle === "SOUS_TYPE_LIEU" && parentId ? { parentId: Number(parentId) } : {}),
        },
      }),
    onSuccess: () => {
      setNouveau("");
      setCode("");
      rafraichir();
    },
  });
  const modifier = useMutation({
    mutationFn: ({ id, ...patch }: { id: number; libelle?: string; actif?: boolean }) => api(`${base}/${id}`, { method: "PATCH", json: patch }),
    onSuccess: rafraichir,
  });

  return (
    <section className="carte p-4">
      <h2 className="text-base font-semibold">{def.libelle}</h2>
      <p className="mb-4 text-sm text-ink-2">{def.aide}</p>

      <ul className="divide-y divide-line">
        {elements.map((e) => (
          <li key={e.id} className={`flex flex-wrap items-center gap-2 py-2 ${e.actif ? "" : "opacity-60"}`}>
            <input
              className="champ !w-auto min-w-48 flex-1"
              defaultValue={e.libelle}
              aria-label={`Libellé de ${e.code}`}
              onBlur={(ev) => ev.target.value.trim() && ev.target.value !== e.libelle && modifier.mutate({ id: e.id, libelle: ev.target.value.trim() })}
            />
            <code className="text-xs text-ink-muted">{e.code}</code>
            {def.cle === "SOUS_TYPE_LIEU" && (
              <span className="text-xs text-ink-2">{typeLieux.find((t) => t.id === e.parentId)?.libelle ?? "—"}</span>
            )}
            {!e.actif && <Badge ton="neutre">Désactivé</Badge>}
            <button className="bouton-second !px-2 !py-1 text-xs" onClick={() => modifier.mutate({ id: e.id, actif: !e.actif })}>
              {e.actif ? "Désactiver" : "Réactiver"}
            </button>
          </li>
        ))}
        {!elements.length && <li className="py-3 text-sm text-ink-muted">Aucune valeur pour l&apos;instant.</li>}
      </ul>

      <form
        className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (nouveau.trim()) ajouter.mutate();
        }}
      >
        <label className="min-w-48 flex-1">
          <span className="etiquette">Nouvelle valeur</span>
          <input className="champ" value={nouveau} onChange={(e) => setNouveau(e.target.value)} placeholder="Libellé" />
        </label>
        {def.cle === "SOUS_TYPE_LIEU" && (
          <label>
            <span className="etiquette">Type de lieu</span>
            <select className="champ" required value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">—</option>
              {typeLieux.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
            </select>
          </label>
        )}
        <label>
          <span className="etiquette">Code {def.cle === "MODULES" ? "(celui envoyé par les bornes)" : "(automatique)"}</span>
          <input
            className="champ font-mono"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={versCode(nouveau) || "CODE"}
          />
        </label>
        <button className="bouton" disabled={!nouveau.trim() || ajouter.isPending}>Ajouter</button>
      </form>
      {(ajouter.error || modifier.error) && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {(ajouter.error ?? modifier.error)?.message === "DEJA_EXISTANT" ? "Ce code existe déjà." : (ajouter.error ?? modifier.error)?.message}
        </p>
      )}
    </section>
  );
}
