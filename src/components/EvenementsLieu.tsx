"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type EvenementPonctuel, type FicheEvenementLieu, type GrilleTarifs } from "@/lib/api";
import { euros, jour } from "@/lib/format";
import { usePerm } from "@/lib/perms";
import { affiche, duAu, etatPublication, instants, maintenantParis, periode, type Periode } from "@/lib/programmation";
import { Badge, Erreur } from "./Etat";
import { MenuActions } from "./MenuActions";
import { Modale } from "./Modale";

// Événements d'un lieu (maquettes « configuration-evenements » du 10/11/2026, retour du 12/11) : un seul bloc dans
// l'onglet Configuration, la ligne « Par défaut » puis les événements personnalisés groupés par mois, filtrés (en
// cours et à venir, passés, tous) avec une recherche qui porte sur tous ; chaque ligne montre les tarifs pratiqués.
// La fenêtre « Nouvel événement » (nom, début et fin avec leur heure), la copie d'un événement, et la conversion
// d'un événement personnalisé en événement par défaut.

/** « 12/11/2026 à 20:00 → 13/11/2026 à 06:00 » (en-tête de la fiche événement). */
export function dates(e: { dateDebut: string; dateFin: string; heureDebut?: string | null; heureFin?: string | null }) {
  const h = (d: string, heure?: string | null) => `${jour(d)}${heure ? ` à ${heure}` : ""}`;
  if (e.dateDebut === e.dateFin && !e.heureDebut && !e.heureFin) return jour(e.dateDebut);
  return `${h(e.dateDebut, e.heureDebut)} → ${h(e.dateFin, e.heureFin)}`;
}

const pageEvenement = (lieuId: number, eid?: number | null) => (eid ? `/lieux/${lieuId}/evenement/${eid}` : `/lieux/${lieuId}/evenement`);

/** L'événement à copier : `eid` null = celui par défaut. */
export interface SourceCopie {
  eid: number | null;
  nom: string;
  dateDebut?: string;
  dateFin?: string;
  heureDebut?: string | null;
  heureFin?: string | null;
}

/** Lendemain d'un jour « AAAA-MM-JJ ». */
const lendemain = (ymd: string) => new Date(Date.parse(`${ymd}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * Fenêtre « Nouvel événement » : nom, début et fin avec leur heure ; ouvre la page de l'événement une fois créé.
 * Avec `source`, c'est une copie de cet événement (cadres, tarifs, options). Sans date de fin : une seule
 * soirée, qui finit le lendemain si l'heure de fin est avant celle du début.
 */
export function FormNouvelEvenement({ lieuId, onAnnuler, source }: { lieuId: number; onAnnuler: () => void; source?: SourceCopie }) {
  const client = useQueryClient();
  const router = useRouter();
  const [nom, setNom] = useState(source ? `${source.nom} (copie)`.slice(0, 80) : "");
  const [debut, setDebut] = useState(source?.dateDebut ?? "");
  const [heureDebut, setHeureDebut] = useState(source ? source.heureDebut ?? "" : "20:00");
  const [fin, setFin] = useState(source?.dateFin && source.dateFin !== source.dateDebut ? source.dateFin : "");
  const [heureFin, setHeureFin] = useState(source ? source.heureFin ?? "" : "06:00");

  // Sans date de fin : le même jour, ou le lendemain matin pour une soirée (20:00 → 06:00)
  const dateFin = fin || (debut && heureDebut && heureFin && heureFin <= heureDebut ? lendemain(debut) : debut);
  const saisie = { nom: nom.trim(), dateDebut: debut, dateFin, heureDebut: heureDebut || null, heureFin: heureFin || null };
  const finAvantDebut = Boolean(debut) && instants(saisie).fin <= instants(saisie).debut;

  const url = source
    ? `${source.eid ? `/lieux/${lieuId}/evenements-ponctuels/${source.eid}` : `/lieux/${lieuId}/evenement`}/dupliquer`
    : `/lieux/${lieuId}/evenements-ponctuels`;
  const creer = useMutation({
    mutationFn: () => api<{ id: number | null }>(url, { method: "POST", json: saisie }),
    onSuccess: (f) => {
      client.invalidateQueries({ queryKey: ["evenements-ponctuels", lieuId] });
      router.push(pageEvenement(lieuId, f.id));
    },
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        creer.mutate();
      }}
    >
      <label className="block">
        <span className="etiquette">Nom *</span>
        <input className="champ" required maxLength={80} placeholder="Halloween, Noël…" value={nom} onChange={(e) => setNom(e.target.value)} />
      </label>
      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <label className="block">
          <span className="etiquette">Début *</span>
          <input className="champ" type="date" required value={debut} onChange={(e) => setDebut(e.target.value)} />
        </label>
        <label className="block">
          <span className="etiquette">à</span>
          <input className="champ" type="time" value={heureDebut} onChange={(e) => setHeureDebut(e.target.value)} />
        </label>
        <label className="block">
          <span className="etiquette">Fin</span>
          <input className="champ" type="date" min={debut || undefined} value={fin} onChange={(e) => setFin(e.target.value)} />
        </label>
        <label className="block">
          <span className="etiquette">à</span>
          <input className="champ" type="time" value={heureFin} onChange={(e) => setHeureFin(e.target.value)} />
        </label>
      </div>
      <p className="text-xs text-ink-muted">
        Sans date de fin : une seule soirée, jusqu&apos;au lendemain si l&apos;heure de fin est avant celle du début. Sans heure : toute la journée.
        {source && <> Copie de « {source.nom} » : mêmes cadres, tarifs et options, avec son propre code. L&apos;original ne change pas.</>}
      </p>
      {finAvantDebut && <p role="alert" className="text-sm text-crit-ink">La fin est avant le début.</p>}
      {creer.error && <Erreur erreur={creer.error} />}
      <div className="-mx-4 -mb-4 flex justify-end gap-2 border-t border-line px-4 py-3">
        <button type="button" className="bouton-second" onClick={onAnnuler}>Annuler</button>
        <button type="submit" className="bouton" disabled={creer.isPending || !nom.trim() || !debut || finAvantDebut}>
          {creer.isPending ? (source ? "Copie…" : "Création…") : source ? "Dupliquer" : "Créer l'événement"}
        </button>
      </div>
    </form>
  );
}

/** Boutons collés (filtre, échelle de la frise) : celui choisi en noir. */
export function Segments<T extends string>({ choix, valeur, onChange, libelle }: {
  choix: { cle: T; libelle: ReactNode; desactive?: boolean; aide?: string }[];
  valeur: T;
  onChange: (v: T) => void;
  libelle: string;
}) {
  return (
    <div role="group" aria-label={libelle} className="flex overflow-hidden rounded-lg border border-line-strong bg-surface">
      {choix.map((c) => (
        <button
          key={c.cle}
          type="button"
          aria-pressed={valeur === c.cle}
          disabled={c.desactive}
          title={c.aide}
          onClick={() => onChange(c.cle)}
          className={`h-9 px-3.5 text-sm font-medium whitespace-nowrap disabled:cursor-not-allowed ${valeur === c.cle ? "bg-ink text-white" : "text-ink hover:bg-surface-2 disabled:text-ink-muted disabled:hover:bg-transparent"}`}
        >
          {c.libelle}
        </button>
      ))}
    </div>
  );
}

/** État de publication d'un événement, dans la liste. */
export function Publication({ e, maintenant }: { e: EvenementPonctuel; maintenant: string }) {
  const etat = etatPublication(e, maintenant);
  if (etat === "brouillon") return <Badge ton="neutre">Brouillon</Badge>;
  if (etat === "jamais") return <Badge ton="warn">Jamais publié</Badge>;
  const le = e.publieeLe ? new Date(e.publieeLe).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" }) : "";
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Badge ton="ok">Publié · v{e.version} du {le}</Badge>
      {e.modifieDepuisPublication && <Badge ton="warn">Modifications non publiées</Badge>}
    </span>
  );
}

type Filtre = "avenir" | "passes" | "tous";
const MOTS: Record<Periode, string> = { "en-cours": "en cours", "a-venir": "à venir", passe: "passé" };
const sansAccents = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const moisFmt = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const mois = (ymd: string) => moisFmt.format(new Date(`${ymd.slice(0, 7)}-01T00:00:00Z`));
const COLONNES = 5;
const TITRE_GROUPE = "px-3 pt-5 pb-2 text-left text-xs font-semibold tracking-wider text-ink-2 uppercase";

/** Tarifs pratiqués, sur une ligne : « 3,50 € · ★ dès 2 : 3,00 € · dès 3 : 2,50 € · +1 pote : 2,00 € ». */
export function TarifsCourts({ grille: g, herite }: { grille: GrilleTarifs; herite: boolean }) {
  const cases = g.paliers.map((p) => ({ cle: `${p.de}`, libelle: p.de === 1 ? null : `dès ${p.de}`, prix: euros(p.prixCents), avant: g.palierMisEnAvant === p.de }));
  if (g.plusUnCents) cases.push({ cle: "pote", libelle: "+1 pote", prix: euros(g.plusUnCents), avant: false });
  return (
    <span className="flex items-center gap-x-2 text-xs whitespace-nowrap" title={herite ? "Tarifs du lieu" : "Tarifs propres à l'événement"}>
      {cases.map((c, i) => (
        <span key={c.cle} className="whitespace-nowrap">
          {i > 0 && <span aria-hidden className="mr-2 text-ink-muted">·</span>}
          {c.libelle && <span className={c.avant ? "font-semibold text-accent" : "text-ink-2"}>{c.avant ? `★ ${c.libelle}` : c.libelle} : </span>}
          <span className="tabular font-semibold">{c.prix}</span>
        </span>
      ))}
      {herite && <span className="text-ink-muted">(lieu)</span>}
    </span>
  );
}

/** État de publication de l'événement par défaut. */
function PublicationDefaut({ d }: { d: FicheEvenementLieu }) {
  if (!d.enregistre) return <Badge ton="warn">Pas encore enregistré</Badge>;
  if (d.version === 0) return <Badge ton="warn">Jamais publié</Badge>;
  const le = d.publieeLe ? new Date(d.publieeLe).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" }) : "";
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Badge ton="ok">Publié · v{d.version} du {le}</Badge>
      {d.modifieDepuisPublication && <Badge ton="warn">Modifications non publiées</Badge>}
    </span>
  );
}

/**
 * « Utiliser comme événement par défaut » : le par défaut reprend le contenu de l'événement (réglages, cadres,
 * photos d'exemple) et garde son code ; l'événement d'origine peut être supprimé dans la foulée.
 */
function DevenirDefaut({ lieuId, e, onFermer }: { lieuId: number; e: EvenementPonctuel; onFermer: () => void }) {
  const client = useQueryClient();
  const router = useRouter();
  const [supprimer, setSupprimer] = useState(false);
  const convertir = useMutation({
    mutationFn: () => api(`/lieux/${lieuId}/evenements-ponctuels/${e.id}/devenir-defaut`, { method: "POST", json: { supprimer } }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["evenements-ponctuels", lieuId] });
      client.invalidateQueries({ queryKey: ["evenement-lieu", lieuId] });
      router.push(pageEvenement(lieuId));
    },
  });
  return (
    <div className="space-y-4 text-sm">
      <p>
        L&apos;événement par défaut reprend les cadres, tarifs et options de « {e.nom} ». Il <b>garde son code</b> : les bornes réglées
        sur le par défaut n&apos;ont rien à retaper. Le contenu actuel du par défaut est remplacé. Pensez ensuite à le publier.
      </p>
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-0.5" checked={supprimer} onChange={(ev) => setSupprimer(ev.target.checked)} />
        <span>
          Supprimer « {e.nom} » ensuite <span className="text-ink-muted">(son code {e.code} ne fonctionnera plus)</span>
        </span>
      </label>
      {convertir.error && <Erreur erreur={convertir.error} />}
      <div className="-mx-4 -mb-4 flex justify-end gap-2 border-t border-line px-4 py-3">
        <button type="button" className="bouton-second" onClick={onFermer}>Annuler</button>
        <button type="button" className="bouton" disabled={convertir.isPending} onClick={() => convertir.mutate()}>
          {convertir.isPending ? "Conversion…" : "Utiliser comme événement par défaut"}
        </button>
      </div>
    </div>
  );
}

/** Bloc « Événements » de l'onglet Configuration : la ligne « Par défaut », puis les événements personnalisés. */
export function EvenementsLieu({ lieuId, defaut, liste }: { lieuId: number; defaut: FicheEvenementLieu; liste: EvenementPonctuel[] }) {
  const client = useQueryClient();
  const peutModifier = usePerm("evenements.edit");
  const [filtre, setFiltre] = useState<Filtre>("avenir");
  const [recherche, setRecherche] = useState("");
  const [creation, setCreation] = useState(false);
  const [copie, setCopie] = useState<SourceCopie | null>(null);
  const [versDefaut, setVersDefaut] = useState<EvenementPonctuel | null>(null);
  const supprimer = useMutation({
    mutationFn: (eid: number) => api(`/lieux/${lieuId}/evenements-ponctuels/${eid}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["evenements-ponctuels", lieuId] }),
  });

  const maintenant = maintenantParis();
  const defautAffiche = affiche(liste, maintenant) === null;
  const passes = liste.filter((e) => periode(e, maintenant) === "passe");
  const aVenir = liste.filter((e) => periode(e, maintenant) !== "passe");
  const q = sansAccents(recherche.trim());
  // La recherche porte sur tous les événements, quel que soit le filtre
  const visibles = (q ? liste.filter((e) => sansAccents(`${e.nom} ${e.code}`).includes(q)) : filtre === "avenir" ? aVenir : filtre === "passes" ? passes : liste)
    .slice()
    .sort((a, b) => (filtre === "passes" && !q ? -1 : 1) * instants(a).debut.localeCompare(instants(b).debut));
  const groupes: { mois: string; evenements: EvenementPonctuel[] }[] = [];
  for (const e of visibles) {
    const m = mois(e.dateDebut);
    if (groupes.at(-1)?.mois !== m) groupes.push({ mois: m, evenements: [] });
    groupes.at(-1)!.evenements.push(e);
  }
  const copier = (e: EvenementPonctuel) => setCopie({ eid: e.id, nom: e.nom, dateDebut: e.dateDebut, dateFin: e.dateFin, heureDebut: e.heureDebut, heureFin: e.heureFin });

  return (
    <section className="carte p-5 sm:p-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3.5">
          <h2 className="text-lg font-semibold">Événements</h2>
          {/* Filtre des événements personnalisés (la ligne « Par défaut » est toujours là) ; la recherche porte sur tous */}
          <Segments<Filtre>
            libelle="Filtre des événements personnalisés"
            valeur={filtre}
            onChange={(f) => {
              setFiltre(f);
              setRecherche("");
            }}
            choix={[
              { cle: "avenir", libelle: `En cours et à venir · ${aVenir.length}` },
              { cle: "passes", libelle: `Passés · ${passes.length}` },
              { cle: "tous", libelle: `Tous · ${liste.length}` },
            ]}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            className="champ h-9 !w-60"
            placeholder="Chercher un nom ou un code…"
            aria-label="Chercher un événement"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
          {peutModifier && (
            <button type="button" className="bouton h-9" aria-haspopup="dialog" onClick={() => setCreation(true)}>+ Nouvel événement</button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[50rem] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-2">
              <th className="px-3 py-3 font-medium">Événement</th>
              <th className="px-3 py-3 font-medium">Du … au …</th>
              <th className="px-3 py-3 font-medium">Tarifs pratiqués</th>
              <th className="px-3 py-3 font-medium">Publication</th>
              <th className="px-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {!q && (
              <>
                <tr>
                  <th colSpan={COLONNES} scope="colgroup" className={TITRE_GROUPE}>Par défaut</th>
                </tr>
                <tr className="bg-[#0E9F8A]/[0.06]">
                  <td className="rounded-l-lg border-l-4 border-l-[#0E9F8A] px-3 py-2.5 whitespace-nowrap">
                    <Link href={pageEvenement(lieuId)} className="font-semibold text-accent underline underline-offset-2 hover:opacity-80">Par défaut</Link>
                    {defaut.code && <span className="ml-2 rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs font-bold" title="Code à taper sur la borne">{defaut.code}</span>}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="text-ink-2" title="Affiché quand aucun événement personnalisé n'est programmé">Hors programmation</span>
                    {defautAffiche && <span className="ml-1.5 font-semibold">en ce moment</span>}
                  </td>
                  <td className="px-3 py-2.5"><TarifsCourts grille={defaut.reglages.tarifs} herite={defaut.reglages.tarifs.herite} /></td>
                  <td className="px-3 py-2.5"><PublicationDefaut d={defaut} /></td>
                  <td className="rounded-r-lg px-3 py-2.5">
                    <div className="flex items-center justify-end gap-4 whitespace-nowrap">
                      <Link href={pageEvenement(lieuId)} className="font-medium text-accent hover:underline">Ouvrir →</Link>
                      {peutModifier && defaut.enregistre ? (
                        <MenuActions
                          libelle="Actions sur l'événement par défaut"
                          actions={[{ libelle: "Dupliquer", aide: "Mêmes cadres, tarifs et options", onClick: () => setCopie({ eid: null, nom: "Événement par défaut" }) }]}
                        />
                      ) : (
                        <span className="w-8" />
                      )}
                    </div>
                  </td>
                </tr>
              </>
            )}
            <tr>
              <th colSpan={COLONNES} scope="colgroup" className={TITRE_GROUPE}>
                {q ? "Recherche" : `Personnalisés · ${filtre === "avenir" ? "en cours et à venir" : filtre === "passes" ? "passés" : "tous"}`}
              </th>
            </tr>
            {groupes.map((g) => (
              <Fragment key={g.mois}>
                <tr>
                  <th colSpan={COLONNES} scope="colgroup" className="px-3 pt-3 pb-1.5 text-left text-xs font-medium text-ink-muted first-letter:uppercase">{g.mois}</th>
                </tr>
                {g.evenements.map((e, i) => {
                  const p = periode(e, maintenant);
                  const fond = i % 2 ? "bg-surface-2" : "";
                  return (
                    <tr key={e.id} className={fond}>
                      <td className="rounded-l-lg px-3 py-2.5">
                        <Link href={pageEvenement(lieuId, e.id)} className="font-medium text-accent underline underline-offset-2 hover:opacity-80">{e.nom}</Link>
                        <span className="ml-2 rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs font-bold whitespace-nowrap" title="Code à taper sur la borne">{e.code}</span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="tabular">{duAu(e)}</span>{" "}
                        <span className={p === "en-cours" ? "ml-1 font-semibold" : "ml-1 text-ink-muted"}>{MOTS[p]}</span>
                      </td>
                      <td className="px-3 py-2.5"><TarifsCourts grille={e.tarifs} herite={e.tarifsHerites} /></td>
                      <td className="px-3 py-2.5"><Publication e={e} maintenant={maintenant} /></td>
                      <td className="rounded-r-lg px-3 py-2.5">
                        <div className="flex items-center justify-end gap-4 whitespace-nowrap">
                          {p === "passe" && peutModifier && (
                            <button type="button" className="font-medium text-accent hover:underline" aria-haspopup="dialog" onClick={() => copier(e)}>Dupliquer</button>
                          )}
                          <Link href={pageEvenement(lieuId, e.id)} className="font-medium text-accent hover:underline">Ouvrir →</Link>
                          {peutModifier ? (
                            <MenuActions
                              libelle={`Actions sur ${e.nom}`}
                              actions={[
                                { libelle: "Dupliquer", aide: "Mêmes cadres, tarifs et options", onClick: () => copier(e) },
                                { libelle: "Utiliser comme événement par défaut", aide: "Le par défaut reprend son contenu et garde son code", onClick: () => setVersDefaut(e) },
                                {
                                  libelle: "Supprimer",
                                  danger: true,
                                  onClick: () => confirm(`Supprimer l'événement « ${e.nom} » et ses cadres ? Son code ne fonctionnera plus.`) && supprimer.mutate(e.id),
                                },
                              ]}
                            />
                          ) : (
                            <span className="w-8" />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {visibles.length === 0 && (
        <p className="py-6 text-center text-sm text-ink-muted">
          {q ? "Aucun événement ne correspond à cette recherche." : filtre === "passes" ? "Aucun événement passé." : "Aucun événement personnalisé à venir (Halloween, Noël, une soirée…)."}
        </p>
      )}
      {supprimer.error && <div className="mt-3"><Erreur erreur={supprimer.error} /></div>}

      <Modale titre={copie ? `Dupliquer « ${copie.nom} »` : "Dupliquer"} ouverte={copie !== null} onFermer={() => setCopie(null)}>
        {/* Clé : un formulaire neuf, prérempli, pour chaque événement copié */}
        {copie && <FormNouvelEvenement key={`${copie.eid}`} lieuId={lieuId} source={copie} onAnnuler={() => setCopie(null)} />}
      </Modale>
      <Modale titre="Nouvel événement" ouverte={creation} onFermer={() => setCreation(false)}>
        {creation && <FormNouvelEvenement lieuId={lieuId} onAnnuler={() => setCreation(false)} />}
      </Modale>
      <Modale titre={versDefaut ? `« ${versDefaut.nom} » comme événement par défaut` : "Événement par défaut"} ouverte={versDefaut !== null} onFermer={() => setVersDefaut(null)}>
        {versDefaut && <DevenirDefaut key={versDefaut.id} lieuId={lieuId} e={versDefaut} onFermer={() => setVersDefaut(null)} />}
      </Modale>
    </section>
  );
}
