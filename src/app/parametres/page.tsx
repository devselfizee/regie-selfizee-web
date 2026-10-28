"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type RefValeur } from "@/lib/api";
import { Reserve } from "@/lib/session";
import { Badge, Chargement, EnTete, Erreur } from "@/components/Etat";
import { ReglesAlertes } from "@/components/ReglesAlertes";
import { DonneesDemo } from "@/components/DonneesDemo";

// Listes administrables de la fiche lieu (CDC §3.1) + gammes et types de module (CDC §2)
const LISTES: { cle: string; libelle: string; aide: string }[] = [
  { cle: "TYPE_LIEU", libelle: "Types et sous-types", aide: "Chaque type de lieu (camping, bar…) et ses sous-types (camping 3*, camping 4-5*…)." },
  { cle: "ANTENNE", libelle: "Villes principales", aide: "Ville principale à laquelle le lieu est rattaché, comme dans l'application Antennes : filtre de la liste des lieux, des statistiques et de la carte." },
  { cle: "STANDING", libelle: "Standing", aide: "Gamme du lieu" },
  { cle: "CLIENTELE", libelle: "Clientèles", aide: "Clientèle dominante (plusieurs choix possibles)" },
  { cle: "ZONE_GEO", libelle: "Zones", aide: "Urbaine, littoral, montagne…" },
  { cle: "TAILLE_COMMUNE", libelle: "Tailles de commune", aide: "Tranches de population" },
  { cle: "EMPLACEMENT_ZONE", libelle: "Zones dans le lieu", aide: "Où est placée la borne : entrée, piste…" },
  { cle: "ECLAIRAGE", libelle: "Éclairage", aide: "Éclairage de l'emplacement" },
  { cle: "ORIGINE_LEAD", libelle: "Origines du lead", aide: "Comment le lieu a été trouvé" },
  { cle: "TYPE_EVENEMENT", libelle: "Types d'événement", aide: "Journal d'événements du lieu" },
  { cle: "GAMMES", libelle: "Gammes de bornes", aide: "Spherik, Kalifun, Classic… Le code est un identifiant fixe : il ne change pas quand on renomme le libellé." },
  { cle: "MODULES", libelle: "Modules de paiement", aide: "Le code est celui que les bornes envoient (module.type) : il ne change pas quand on renomme le libellé." },
  { cle: "ALERTES", libelle: "Règles d'alerte", aide: "" },
  { cle: "DEMO", libelle: "Données de démonstration", aide: "" },
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
          {liste.cle === "ALERTES" ? <ReglesAlertes /> : liste.cle === "DEMO" ? <DonneesDemo /> : <Liste key={liste.cle} def={liste} data={data} />}
        </div>
      )}
    </>
  );
}

type Patch = { id: number; libelle?: string; actif?: boolean };

/**
 * Une liste administrable. Les codes sont des identifiants techniques fixes (ils ne suivent pas les
 * renommages : l'historique, les filtres et l'initialisation des listes s'appuient dessus) ; ils ne sont
 * montrés que pour les gammes et les modules de paiement, où ils comptent (envoyés par les bornes).
 */
function Liste({ def, data }: { def: (typeof LISTES)[number]; data: Referentiel }) {
  const client = useQueryClient();
  const technique = def.cle === "GAMMES" || def.cle === "MODULES";
  const elements: Element[] =
    def.cle === "GAMMES" ? data.gammes : def.cle === "MODULES" ? data.typesModule : (data.listes[def.cle] ?? []);
  const base = def.cle === "GAMMES" ? "/referentiel/gammes" : def.cle === "MODULES" ? "/referentiel/types-module" : "/referentiel/valeurs";
  const rafraichir = () => client.invalidateQueries({ queryKey: ["referentiel"] });

  const modifier = useMutation({
    mutationFn: ({ id, ...patch }: Patch) => api(`${base}/${id}`, { method: "PATCH", json: patch }),
    onSuccess: rafraichir,
  });
  const ordonner = useMutation({
    mutationFn: (ids: number[]) => api("/referentiel/valeurs/ordre", { method: "POST", json: { ids } }),
    onSuccess: rafraichir,
  });
  const erreur = modifier.error ?? ordonner.error;

  const sousTypes = data.listes.SOUS_TYPE_LIEU ?? [];
  const orphelins = def.cle === "TYPE_LIEU" ? sousTypes.filter((s) => !elements.some((t) => t.id === s.parentId)) : [];

  return (
    <section className="carte p-4">
      <h2 className="text-base font-semibold">{def.libelle}</h2>
      <p className="mb-4 text-sm text-ink-2">{def.aide}</p>

      <Lignes
        elements={elements}
        technique={technique}
        ordonnable={!technique}
        onModifier={(p) => modifier.mutate(p)}
        onOrdonner={(ids) => ordonner.mutate(ids)}
        enfants={
          def.cle === "TYPE_LIEU"
            ? (type) => (
                <div className="mt-1 mb-2 ml-8 border-l-2 border-line pl-3">
                  <Lignes
                    elements={sousTypes.filter((s) => s.parentId === type.id)}
                    technique={false}
                    ordonnable
                    petit
                    onModifier={(p) => modifier.mutate(p)}
                    onOrdonner={(ids) => ordonner.mutate(ids)}
                  />
                  <Ajout def={{ ...def, cle: "SOUS_TYPE_LIEU" }} base="/referentiel/valeurs" ordre={sousTypes.filter((s) => s.parentId === type.id).length} parentId={type.id} placeholder={`Nouveau sous-type de « ${type.libelle} »`} petit />
                </div>
              )
            : undefined
        }
      />
      {orphelins.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-ink-2">Sous-types sans type (à rattacher ou désactiver) :</p>
          <Lignes elements={orphelins} technique={false} ordonnable={false} petit onModifier={(p) => modifier.mutate(p)} onOrdonner={() => {}} />
        </div>
      )}

      <div className="mt-4 border-t border-line pt-4">
        <Ajout def={def} base={base} ordre={elements.length} technique={technique} placeholder={def.cle === "TYPE_LIEU" ? "Nouveau type de lieu" : "Libellé"} />
      </div>
      {erreur && <p role="alert" className="mt-2 text-sm text-bad">{erreur.message}</p>}
    </section>
  );
}

/** Lignes d'une liste : libellé modifiable, ↑ ↓ pour l'ordre, activer / désactiver. */
function Lignes({
  elements,
  technique,
  ordonnable,
  petit = false,
  onModifier,
  onOrdonner,
  enfants,
}: {
  elements: Element[];
  technique: boolean;
  ordonnable: boolean;
  petit?: boolean;
  onModifier: (p: Patch) => void;
  onOrdonner: (ids: number[]) => void;
  enfants?: (e: Element) => React.ReactNode;
}) {
  const deplacer = (i: number, sens: -1 | 1) => {
    const ids = elements.map((e) => e.id);
    [ids[i], ids[i + sens]] = [ids[i + sens], ids[i]];
    onOrdonner(ids);
  };
  if (!elements.length) return <p className={`text-ink-muted ${petit ? "py-1 text-xs" : "py-3 text-sm"}`}>Aucune valeur pour l&apos;instant.</p>;
  return (
    <ul className={petit ? "" : "divide-y divide-line"}>
      {elements.map((e, i) => (
        <li key={e.id} className={petit ? "py-1" : "py-2"}>
          <div className={`flex flex-wrap items-center gap-2 ${e.actif ? "" : "opacity-60"}`}>
            {ordonnable && (
              <span className="flex flex-col">
                <button type="button" className="px-1 text-xs leading-none text-ink-2 hover:text-ink disabled:opacity-30" disabled={i === 0} aria-label={`Monter ${e.libelle}`} onClick={() => deplacer(i, -1)}>▲</button>
                <button type="button" className="px-1 text-xs leading-none text-ink-2 hover:text-ink disabled:opacity-30" disabled={i === elements.length - 1} aria-label={`Descendre ${e.libelle}`} onClick={() => deplacer(i, 1)}>▼</button>
              </span>
            )}
            <input
              className={`champ !w-auto min-w-48 flex-1 ${petit ? "!py-1 text-sm" : ""}`}
              defaultValue={e.libelle}
              aria-label={`Libellé de ${e.libelle}`}
              onBlur={(ev) => ev.target.value.trim() && ev.target.value !== e.libelle && onModifier({ id: e.id, libelle: ev.target.value.trim() })}
            />
            {technique && <code className="text-xs text-ink-muted" title="Code fixe, utilisé par les bornes">{e.code}</code>}
            {!e.actif && <Badge ton="neutre">Désactivé</Badge>}
            <button className="bouton-second !px-2 !py-1 text-xs" onClick={() => onModifier({ id: e.id, actif: !e.actif })}>
              {e.actif ? "Désactiver" : "Réactiver"}
            </button>
          </div>
          {enfants?.(e)}
        </li>
      ))}
    </ul>
  );
}

/** Ajout d'une valeur ; le code est déduit du libellé (saisi seulement pour les gammes et modules). */
function Ajout({
  def,
  base,
  ordre,
  parentId,
  technique = false,
  petit = false,
  placeholder,
}: {
  def: { cle: string };
  base: string;
  ordre: number;
  parentId?: number;
  technique?: boolean;
  petit?: boolean;
  placeholder: string;
}) {
  const client = useQueryClient();
  const [libelle, setLibelle] = useState("");
  const [code, setCode] = useState("");
  const ajouter = useMutation({
    mutationFn: () =>
      api(base, {
        method: "POST",
        json: {
          code: code || versCode(libelle),
          libelle: libelle.trim(),
          ...(base === "/referentiel/valeurs" ? { categorie: def.cle, ordre } : {}),
          ...(parentId ? { parentId } : {}),
        },
      }),
    onSuccess: () => {
      setLibelle("");
      setCode("");
      client.invalidateQueries({ queryKey: ["referentiel"] });
    },
  });
  return (
    <form
      className={`flex flex-wrap items-end gap-2 ${petit ? "mt-1" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (libelle.trim()) ajouter.mutate();
      }}
    >
      <label className="min-w-48 flex-1">
        {!petit && <span className="etiquette">Nouvelle valeur</span>}
        <input className={`champ ${petit ? "!py-1 text-sm" : ""}`} value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      </label>
      {technique && (
        <label>
          <span className="etiquette">Code {def.cle === "MODULES" ? "(celui envoyé par les bornes)" : ""}</span>
          <input className="champ font-mono" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={versCode(libelle) || "CODE"} />
        </label>
      )}
      <button className={petit ? "bouton-second !px-2 !py-1 text-xs" : "bouton"} disabled={!libelle.trim() || ajouter.isPending}>
        Ajouter
      </button>
      {ajouter.error && (
        <span role="alert" className="w-full text-sm text-bad">
          {ajouter.error.message === "DEJA_EXISTANT" ? "Cette valeur existe déjà." : ajouter.error.message}
        </span>
      )}
    </form>
  );
}
