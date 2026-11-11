"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { api, MAX_COMPOSITIONS, telecharger, type CadreEvenement, type FicheEvenementLieu, type LieuFiche, type LotJeu, type ReglagesEvenement } from "@/lib/api";
import { PageGuard } from "@/lib/perms";
import { Badge, Chargement, Erreur, Section } from "@/components/Etat";
import { dateHeure, parametreUrl } from "@/lib/format";
import { EditeurGrille, ResumeGrille } from "@/components/GrilleTarifs";
import { dates } from "@/components/EvenementsLieu";
import { IllustrationGabarit } from "@/components/IllustrationGabarit";
import { FilAriane } from "@/components/FilAriane";
import { IllustrationsEvenement } from "@/components/IllustrationsEvenement";
import { GABARITS, nouvelId } from "@/lib/gabaritsEvenement";

// Fiche événement d'un lieu (CDC page souvenir § 13) : créations graphiques, tarifs et options, puis
// « Créer l'événement » (la version que la borne charge avec son code) et le zip à télécharger.
// Un lieu a son événement par défaut (« habituel » dans le code) et d'autres événements (Halloween, une soirée…), chacun avec son
// code, ses cadres et ses tarifs : on passe de l'un à l'autre en tapant le code sur la borne.
// Mise en page (retour de Sébastien du 03/11, « aucune hiérarchie ») : fil d'Ariane, titre, une seule action
// principale (« Créer l'événement »), étapes numérotées avec leur avancement, cartes qui disent ce qui reste
// à faire, barre d'enregistrement seulement quand il y a quelque chose à enregistrer.

/** Chemins d'un événement : dans l'API, et la page de la fiche (eid absent = l'événement habituel). */
export const cheminsEvenement = (lieuId: number, eid?: number | null) =>
  eid
    ? { api: `/lieux/${lieuId}/evenements-ponctuels/${eid}`, page: `/lieux/${lieuId}/evenement/${eid}` }
    : { api: `/lieux/${lieuId}/evenement`, page: `/lieux/${lieuId}/evenement` };

export function FicheEvenement({ id, eid }: { id: number; eid?: number }) {
  return (
    <PageGuard perm="evenements.view">
      <Chargeur id={id} eid={eid} />
    </PageGuard>
  );
}

function Chargeur({ id, eid }: { id: number; eid?: number }) {
  const chemins = cheminsEvenement(id, eid);
  const lieu = useQuery({ queryKey: ["lieu", id], queryFn: () => api<LieuFiche>(`/lieux/${id}`) });
  const fiche = useQuery({ queryKey: ["evenement-lieu", id, eid ?? "habituel"], queryFn: () => api<FicheEvenementLieu>(chemins.api) });
  // Ici et non dans l'éditeur : l'éditeur repart des réglages enregistrés après chaque enregistrement.
  // ?ecran=tarifs : l'écran Tarifs et options (« lieu » : ancien écran, dans les liens déjà partagés) ;
  // sinon les créations graphiques, où revient le studio
  const demande = useSearchParams().get("ecran");
  const [ecran, setEcranEtat] = useState(() => (demande === "tarifs" || demande === "lieu" ? 1 : 0));
  const setEcran = (n: number) => {
    setEcranEtat(n);
    parametreUrl("ecran", n === 1 ? "tarifs" : null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  if (lieu.error || fiche.error) return <Erreur erreur={lieu.error ?? fiche.error} />;
  if (!lieu.data || !fiche.data) return <Chargement />;
  return <Editeur key={`${eid ?? "habituel"}-${fiche.dataUpdatedAt}`} lieuId={id} eid={eid} enseigne={lieu.data.enseigne} fiche={fiche.data} ecran={ecran} setEcran={setEcran} />;
}

// Deux étapes (retour de Sébastien du 03/11) : on commence par les créations graphiques ; les réglages
// propres à l'événement rejoignent les tarifs et options (les infos du lieu sont sur le lieu).
const ECRANS = ["Créations graphiques", "Tarifs et options"] as const;

function Editeur({ lieuId, eid, enseigne, fiche, ecran, setEcran }: { lieuId: number; eid?: number; enseigne: string; fiche: FicheEvenementLieu; ecran: number; setEcran: (n: number) => void }) {
  const client = useQueryClient();
  const router = useRouter();
  const chemins = cheminsEvenement(lieuId, eid);
  const cle = ["evenement-lieu", lieuId, eid ?? "habituel"];
  const [r, setR] = useState<ReglagesEvenement>(fiche.reglages);
  const [nom, setNom] = useState(fiche.nom ?? "");
  const modifie = JSON.stringify(r) !== JSON.stringify(fiche.reglages) || (!fiche.habituel && nom.trim() !== (fiche.nom ?? ""));
  const aEnregistrer = modifie || !fiche.enregistre;
  // Cadres dessinés au studio : relus à chaque retour du studio (avancement de l'étape 1 et cartes)
  const cadres = useQuery({ queryKey: ["cadres-evenement", chemins.api], queryFn: () => api<CadreEvenement[]>(`${chemins.api}/cadres`), staleTime: 0 });

  const apresEnregistrement = (f: FicheEvenementLieu) => {
    client.setQueryData(cle, f);
    client.invalidateQueries({ queryKey: ["evenements-ponctuels", lieuId] });
  };
  const sauver = () => api<FicheEvenementLieu>(chemins.api, { method: "PUT", json: { reglages: r, ...(fiche.habituel ? {} : { nom: nom.trim() }) } });
  const enregistrer = useMutation({ mutationFn: sauver, onSuccess: apresEnregistrement });
  const annuler = () => {
    setR(fiche.reglages);
    setNom(fiche.nom ?? "");
  };
  // « Créer l'événement » : enregistre ce qui ne l'est pas, puis fige la version que la borne charge
  const creer = useMutation({
    mutationFn: async () => {
      if (aEnregistrer) apresEnregistrement(await sauver());
      return api<FicheEvenementLieu>(`${chemins.api}/publier`, { method: "POST" });
    },
    onSuccess: apresEnregistrement,
  });
  const supprimer = useMutation({
    mutationFn: () => api(chemins.api, { method: "DELETE" }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["evenements-ponctuels", lieuId] });
      router.push(`/lieux/${lieuId}?onglet=configuration`);
    },
  });
  // Le studio s'ouvre sur une autre page : on enregistre d'abord ce qui ne l'est pas (composition tout juste ajoutée…)
  const ouvrirStudio = async (compositionId: string) => {
    if (aEnregistrer) await enregistrer.mutateAsync();
    router.push(`/lieux/${lieuId}/evenement/studio/${compositionId}${eid ? `?e=${eid}` : ""}`);
  };
  // « Dupliquer » un format : une composition du même gabarit juste après, avec une copie de son cadre
  // (côté API, rendu compris). La fiche est enregistrée d'abord : l'API ne copie que vers une composition
  // enregistrée.
  const dupliquer = useMutation({
    mutationFn: async (source: string) => {
      const { choisis, accueil } = r.gabarits;
      const i = choisis.findIndex((c) => c.id === source);
      const id = nouvelId(choisis[i].gabarit, choisis.map((c) => c.id));
      const nouveaux = [...choisis.slice(0, i + 1), { id, gabarit: choisis[i].gabarit }, ...choisis.slice(i + 1)];
      const avecAccueil = accueil.includes(source) ? nouveaux.map((c) => c.id).filter((x) => x === id || accueil.includes(x)) : accueil;
      const reglages = { ...r, gabarits: { ...r.gabarits, choisis: nouveaux, accueil: avecAccueil } };
      const f = await api<FicheEvenementLieu>(chemins.api, { method: "PUT", json: { reglages, ...(fiche.habituel ? {} : { nom: nom.trim() }) } });
      if (cadres.data?.some((x) => x.compositionId === source)) {
        await api(`${chemins.api}/cadres/${source}/dupliquer`, { method: "POST", json: { vers: id } });
      }
      return f;
    },
    onSuccess: (f) => {
      client.invalidateQueries({ queryKey: ["cadres-evenement", chemins.api] });
      apresEnregistrement(f);
    },
  });
  // Le zip (config.json, cadres du studio assemblés, éléments du kit) est refait à chaque fois côté API
  const [erreurTelechargement, setErreurTelechargement] = useState<unknown>(null);
  const [zipEnCours, setZipEnCours] = useState(false);
  const telechargerZip = async () => {
    setZipEnCours(true);
    setErreurTelechargement(null);
    try {
      if (aEnregistrer) await enregistrer.mutateAsync();
      await telecharger(`${chemins.api}/zip`);
    } catch (e) {
      setErreurTelechargement(e);
    } finally {
      setZipEnCours(false);
    }
  };

  const cree = fiche.version > 0;
  const aJour = cree && !fiche.modifieDepuisPublication && !modifie;
  const titre = fiche.habituel ? "Événement par défaut" : fiche.nom ?? "Événement";
  const formats = r.gabarits.choisis;
  const personnalises = formats.filter((c) => cadres.data?.some((x) => x.compositionId === c.id)).length;
  const t = r.tarifs;
  const etapes = [
    {
      etat: formats.length === 0 ? "Aucun format" : `${personnalises} cadre${personnalises > 1 ? "s" : ""} personnalisé${personnalises > 1 ? "s" : ""} sur ${formats.length}`,
      fait: formats.length > 0 && personnalises === formats.length,
    },
    { etat: `${t.herite ? "Tarifs du lieu" : "Tarifs propres"}${t.jeu.actif ? " · jeu actif" : ""}`, fait: false },
  ];
  const libelleCreer = creer.isPending ? "Création…" : !cree ? "Créer l'événement" : aJour ? "Événement à jour" : "Mettre à jour l'événement";

  return (
    <div className="pb-4">
      {/* En-tête : où l'on est, ce que c'est, l'action principale */}
      <header className="mb-6">
        <FilAriane lieuId={lieuId} enseigne={enseigne} page={titre} />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">{titre}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
              <span>{fiche.habituel ? `Toute l'année · ${dates(r.lieu)}` : dates(r.lieu)}</span>
              {!cree ? (
                <Badge ton="neutre">Pas encore créé : la borne ne le connaît pas</Badge>
              ) : aJour ? (
                <Badge ton="ok">Créé · version {fiche.version} à jour</Badge>
              ) : (
                <Badge ton="warn">Modifié depuis sa création : à mettre à jour</Badge>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`${chemins.page}/galerie`} className="bouton-second" title="Les photos et vidéos des séances de cet événement, reçues de PikCloud">
              <span aria-hidden>🖼</span> Galerie
            </Link>
            <button type="button" className="bouton-second" disabled={zipEnCours} onClick={telechargerZip} title="Le zip de l'événement : config.json, cadres et éléments du kit">
              <span aria-hidden>↓</span> {zipEnCours ? "Préparation…" : "Télécharger"}
            </button>
            <button type="button" className="bouton !px-5 !py-2.5 !text-base shadow-sm" disabled={creer.isPending || aJour} onClick={() => creer.mutate()}>
              {libelleCreer}
            </button>
          </div>
        </div>

        {/* Ce qu'on donne à l'exploitant : à part, en petit */}
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
          <div>
            <dt className="text-xs text-ink-muted">Code à taper sur la borne</dt>
            <dd className={fiche.code ? "font-mono text-base font-semibold tracking-wider" : "text-ink-2"}>{fiche.code ?? "attribué au premier enregistrement"}</dd>
          </div>
          {fiche.motDePasseTableau && (
            <div>
              <dt className="text-xs text-ink-muted">Mot de passe du tableau de bord</dt>
              <dd className="font-mono text-base font-semibold tracking-wider">{fiche.motDePasseTableau}</dd>
            </div>
          )}
          <p className="self-center text-xs text-ink-muted sm:ml-auto sm:max-w-xs">À donner à l&apos;exploitant : le code installe l&apos;événement, le mot de passe ouvre le tableau de bord de la borne.</p>
        </dl>
        {(creer.error || erreurTelechargement !== null) && (
          <div className="mt-4">
            <Erreur erreur={creer.error ?? erreurTelechargement} />
          </div>
        )}
      </header>

      <Etapes ecran={ecran} setEcran={setEcran} etapes={etapes} />

      {ecran === 0 && (
        <>
          <EcranCreations
            r={r}
            setR={setR}
            cadres={cadres}
            apiEvenement={chemins.api}
            ouvrirStudio={ouvrirStudio}
            ouverture={enregistrer.isPending}
            dupliquer={dupliquer}
          />
          {/* Ambiance : thème, ton des textes et photos d'illustration (retour de Sébastien, 05/11/2026) */}
          <section aria-labelledby="titre-theme" className="mt-10">
            <h2 id="titre-theme" className="mb-5 text-xl font-semibold">Ambiance de la borne</h2>
            <IllustrationsEvenement
              lieu={r.lieu}
              majLieu={(p) => setR((x) => ({ ...x, lieu: { ...x.lieu, ...p } }))}
              theme={r.theme}
              majTheme={(t) => setR((x) => ({ ...x, theme: t }))}
              gabarits={r.gabarits.choisis.map((c) => c.gabarit)}
              apiEvenement={chemins.api}
              enregistre={fiche.enregistre}
            />
          </section>
          <div className="mt-8 flex justify-end">
            <button type="button" className="bouton-second" onClick={() => setEcran(1)}>
              Étape suivante : {ECRANS[1]} <span aria-hidden>→</span>
            </button>
          </div>
        </>
      )}
      {ecran === 1 && (
        <>
          <div className="mb-5 max-w-2xl">
            <h2 className="text-xl font-semibold">Tarifs et options</h2>
            <p className="mt-1 text-sm text-ink-2">Les dates et l&apos;ambiance de l&apos;événement, puis ce que paient les invités et les options de la borne.</p>
          </div>
          <div className="space-y-4">
            <SectionEvenement r={r} setR={setR} lieuId={lieuId} fiche={fiche} nom={fiche.habituel ? null : nom} setNom={setNom} supprimer={supprimer} />
            <EcranTarifs r={r} setR={setR} tarifsLieu={fiche.tarifsLieu} lieuId={lieuId} />
          </div>
          {/* Fin du parcours : l'action principale, là où l'on arrive */}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-accent/30 bg-accent/5 p-5">
            <div className="min-w-0">
              <p className="font-semibold">{aJour ? "L'événement est à jour sur la borne" : cree ? "Prêt à mettre à jour l'événement ?" : "Tout est prêt ?"}</p>
              <p className="mt-1 text-sm text-ink-2">
                {aJour
                  ? "Rien à envoyer : la borne a la dernière version."
                  : `« ${libelleCreer} » enregistre et fige cette version${fiche.code ? ` ; la borne la charge quand on tape ${fiche.code}` : ""}.`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {modifie && (
                <button type="button" className="text-sm text-ink-2 hover:text-ink hover:underline" disabled={creer.isPending} onClick={annuler}>
                  Annuler mes modifications
                </button>
              )}
              <button type="button" className="bouton !px-5 !py-2.5 !text-base" disabled={creer.isPending || aJour} onClick={() => creer.mutate()}>
                {libelleCreer}
              </button>
            </div>
            {creer.error && <div className="w-full"><Erreur erreur={creer.error} /></div>}
          </div>
        </>
      )}

      {/* N'apparaît que s'il y a quelque chose à enregistrer ; reste visible en faisant défiler */}
      {/* Sur l'écran des tarifs, le bouton final enregistre aussi : une seule action (retour de Sébastien) */}
      {ecran !== 1 && (aEnregistrer || enregistrer.isPending || enregistrer.error) && (
        <div role="status" className="sticky bottom-4 z-20 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-strong bg-surface px-4 py-3 shadow-lg">
          <span className="flex items-center gap-2 text-sm font-medium">
            <span aria-hidden className="text-warn-ink">▲</span>
            {fiche.enregistre ? "Modifications non enregistrées" : "Événement pas encore enregistré"}
          </span>
          <div className="flex items-center gap-2">
            {modifie && (
              <button type="button" className="bouton-second" disabled={enregistrer.isPending} onClick={annuler}>
                Annuler
              </button>
            )}
            <button type="button" className="bouton" disabled={enregistrer.isPending} onClick={() => enregistrer.mutate()}>
              {enregistrer.isPending ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
          {enregistrer.error && <div className="w-full"><Erreur erreur={enregistrer.error} /></div>}
        </div>
      )}
    </div>
  );
}

/** Les étapes de la fiche : numéro, titre et avancement ; l'étape ouverte est soulignée. */
function Etapes({ ecran, setEcran, etapes }: { ecran: number; setEcran: (n: number) => void; etapes: { etat: string; fait: boolean }[] }) {
  return (
    <nav aria-label="Étapes de l'événement" className="mb-6">
      <ol className="grid gap-2 sm:grid-cols-2">
        {ECRANS.map((nom, i) => {
          const actif = ecran === i;
          const { etat, fait } = etapes[i];
          return (
            <li key={nom}>
              <button
                type="button"
                onClick={() => setEcran(i)}
                aria-current={actif ? "step" : undefined}
                className={`flex w-full items-center gap-3 border-b-[3px] px-1 pb-3 pt-1 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${actif ? "border-accent" : "border-line hover:border-line-strong"}`}
              >
                <span
                  aria-hidden
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${actif ? "bg-accent text-accent-ink" : fait ? "bg-ok-bg text-ok-ink" : "bg-surface-2 text-ink-2"}`}
                >
                  {fait && !actif ? "✓" : i + 1}
                </span>
                <span className="min-w-0">
                  <span className={`block font-semibold ${actif ? "text-ink" : "text-ink-2"}`}>
                    <span className="sr-only">Étape {i + 1} : </span>
                    {nom}
                  </span>
                  <span className={`block text-xs ${fait ? "text-ok-ink" : "text-ink-muted"}`}>{etat}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

type Maj = (f: (r: ReglagesEvenement) => ReglagesEvenement) => void;
interface PropsEcran {
  r: ReglagesEvenement;
  setR: Maj;
}

function Champ({ libelle, aide, children }: { libelle: string; aide?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="etiquette">{libelle}</span>
      {children}
      {aide && <span className="mt-1 block text-xs text-ink-muted">{aide}</span>}
    </label>
  );
}

function Case({ coche, onChange, libelle, aide }: { coche: boolean; onChange: (v: boolean) => void; libelle: string; aide?: ReactNode }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-accent" checked={coche} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {libelle}
        {aide && <span className="block text-xs text-ink-muted">{aide}</span>}
      </span>
    </label>
  );
}

// ─── L'événement (écran Tarifs et options) ──────────────────

/** Réglages propres à l'événement ; nom affiché, ville, avis, assistance et horaires sont ceux du lieu. */
function SectionEvenement({ r, setR, lieuId, fiche, nom, setNom, supprimer }: PropsEcran & {
  lieuId: number;
  fiche: FicheEvenementLieu;
  nom: string | null;
  setNom: (v: string) => void;
  supprimer: { mutate: () => void; isPending: boolean; error: unknown };
}) {
  const l = r.lieu;
  const maj = (p: Partial<ReglagesEvenement["lieu"]>) => setR((x) => ({ ...x, lieu: { ...x.lieu, ...p } }));
  return (
    <Section titre="L'événement">
      <div className="grid gap-3 sm:grid-cols-2">
        {nom !== null && (
          <div className="sm:col-span-2">
            <Champ libelle="Nom de l'événement *" aide="Pour s'y retrouver dans la Régie ; la borne l'affiche après le nom du lieu.">
              <input className="champ" required maxLength={80} value={nom} onChange={(e) => setNom(e.target.value)} />
            </Champ>
          </div>
        )}
        <Champ libelle="Début *">
          <span className="flex gap-2">
            <input className="champ" type="date" required value={l.dateDebut} onChange={(e) => maj({ dateDebut: e.target.value })} />
            {nom !== null && (
              <input className="champ w-32" type="time" aria-label="Heure de début" value={l.heureDebut ?? ""} onChange={(e) => maj({ heureDebut: e.target.value || null })} />
            )}
          </span>
        </Champ>
        <Champ
          libelle="Fin *"
          aide={nom === null ? "Une borne à l'année : plusieurs années." : "Sans heure : toute la journée. Une soirée finit le lendemain (20:00 → 06:00)."}
        >
          <span className="flex gap-2">
            <input className="champ" type="date" required value={l.dateFin} min={l.dateDebut} onChange={(e) => maj({ dateFin: e.target.value })} />
            {nom !== null && (
              <input className="champ w-32" type="time" aria-label="Heure de fin" value={l.heureFin ?? ""} onChange={(e) => maj({ heureFin: e.target.value || null })} />
            )}
          </span>
        </Champ>
      </div>
      <p className="mt-3 text-xs text-ink-muted">
        Nom affiché, ville, avis, assistance et horaires : ceux du lieu ({l.nom}
        {l.ville ? `, ${l.ville}` : ""}),{" "}
        <Link href={`/lieux/${lieuId}/modifier?onglet=communication`} className="text-accent hover:underline">à modifier dans sa fiche (onglet Communication)</Link>.
      </p>
      {!fiche.habituel && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-sm">
          <span className="text-ink-2">
            Pour l&apos;installer, tapez <strong className="font-mono">{fiche.code}</strong> sur la borne ; pour revenir à l&apos;événement par défaut, retapez son code.
          </span>
          <button
            type="button"
            className="text-crit-ink hover:underline"
            disabled={supprimer.isPending}
            onClick={() => confirm(`Supprimer l'événement « ${fiche.nom} » et ses cadres ? Son code ne fonctionnera plus.`) && supprimer.mutate()}
          >
            Supprimer cet événement
          </button>
        </div>
      )}
      {supprimer.error ? <div className="mt-3"><Erreur erreur={supprimer.error} /></div> : null}
    </Section>
  );
}

// ─── Écran 1 : créations graphiques ─────────────────────────

function EcranCreations({ r, setR, cadres, apiEvenement, ouvrirStudio, ouverture, dupliquer }: PropsEcran & {
  cadres: UseQueryResult<CadreEvenement[]>;
  apiEvenement: string;
  ouvrirStudio: (compositionId: string) => void;
  ouverture: boolean;
  dupliquer: { mutate: (compositionId: string) => void; isPending: boolean; error: unknown };
}) {
  const { choisis, accueil } = r.gabarits;
  const client = useQueryClient();
  const retirer = useMutation({
    mutationFn: (compositionId: string) => api(`${apiEvenement}/cadres/${compositionId}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["cadres-evenement", apiEvenement] }),
  });
  const maj = (g: Partial<ReglagesEvenement["gabarits"]>) => setR((x) => ({ ...x, gabarits: { ...x.gabarits, ...g } }));
  const ids = choisis.map((c) => c.id);
  const plein = choisis.length >= MAX_COMPOSITIONS;
  const enlever = (id: string, avecCadre: boolean) => {
    if (avecCadre && !confirm("Retirer ce format ? Son cadre personnalisé sera supprimé à l'enregistrement.")) return;
    maj({ choisis: choisis.filter((c) => c.id !== id), accueil: accueil.filter((a) => a !== id) });
  };
  const deplacer = (i: number, sens: -1 | 1) => {
    const n = [...choisis];
    [n[i], n[i + sens]] = [n[i + sens], n[i]];
    maj({ choisis: n });
  };
  // Glisser-déposer : l'ordre se réarrange en direct pendant le glissement (`ordre`), il n'est retenu qu'au
  // dépôt dans la grille ; lâché ailleurs ou Échap, tout revient comme avant
  const [ordre, setOrdre] = useState<typeof choisis | null>(null);
  const [glisse, setGlisse] = useState<string | null>(null);
  const liste = ordre ?? choisis;
  const survoler = (cible: string) => {
    if (!glisse || glisse === cible) return;
    setOrdre((o) => {
      const n = [...(o ?? choisis)];
      const de = n.findIndex((x) => x.id === glisse);
      const vers = n.findIndex((x) => x.id === cible);
      if (de < 0 || vers < 0) return o;
      const [x] = n.splice(de, 1);
      n.splice(vers, 0, x);
      return n;
    });
  };
  const deposer = () => {
    if (ordre && ordre.some((x, i) => x.id !== choisis[i]?.id)) maj({ choisis: ordre });
  };
  const mettreEnAvant = (id: string, oui: boolean) =>
    maj({ accueil: oui ? ids.filter((x) => x === id || accueil.includes(x)) : accueil.filter((x) => x !== id) });
  const personnalises = choisis.filter((c) => cadres.data?.some((x) => x.compositionId === c.id)).length;

  return (
    <section aria-labelledby="titre-creations">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h2 id="titre-creations" className="text-xl font-semibold">Les formats proposés sur la borne</h2>
        </div>
        {choisis.length > 0 && (
          <div className="w-56">
            <p className="mb-1.5 flex justify-between text-xs">
              <span className="text-ink-2">Cadres personnalisés</span>
              <span className="font-semibold tabular">{personnalises} / {choisis.length}</span>
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={choisis.length} aria-valuenow={personnalises} aria-label="Cadres personnalisés">
              <div className={`h-full rounded-full transition-all ${personnalises === choisis.length ? "bg-good" : "bg-accent"}`} style={{ width: `${(personnalises / choisis.length) * 100}%` }} />
            </div>
          </div>
        )}
      </div>

      <ul
        className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
        onDragOver={(e) => {
          if (!glisse) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => {
          if (!glisse) return;
          e.preventDefault();
          deposer();
        }}
      >
        {liste.map((c, rang) => {
          const g = GABARITS.find((x) => x.cle === c.gabarit)!;
          const memes = liste.filter((x) => x.gabarit === c.gabarit);
          const libelle = memes.length > 1 ? `${g.nom} · ${memes.indexOf(c) + 1}` : g.nom;
          const cadre = cadres.data?.find((x) => x.compositionId === c.id);
          return (
            <li
              key={c.id}
              draggable={!ouverture}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", c.id);
                // Après la capture de l'image glissée : sinon elle prendrait le style « en cours de glissement »
                setTimeout(() => {
                  setGlisse(c.id);
                  setOrdre(choisis);
                });
              }}
              onDragEnter={() => survoler(c.id)}
              onDragEnd={() => {
                setGlisse(null);
                setOrdre(null);
              }}
              className={`flex flex-col overflow-hidden rounded-xl border bg-surface shadow-sm transition hover:shadow-md ${
                glisse === c.id ? "border-2 border-dashed border-accent opacity-50" : "border-line"
              }`}
            >
              <div className="relative h-60">
                {/* L'aperçu ouvre le studio */}
                <button
                  type="button"
                  disabled={ouverture}
                  onClick={() => ouvrirStudio(c.id)}
                  aria-label={`${cadre ? "Modifier le cadre" : "Personnaliser au studio"} : ${libelle}`}
                  className="group/apercu relative flex h-full w-full items-center justify-center bg-gradient-to-br from-accent/5 to-accent/15 p-6 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
                >
                  {cadre?.vignette ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cadre.vignette} alt="" draggable={false} className="max-h-full max-w-full rounded bg-white object-contain shadow-md" />
                  ) : (
                    <IllustrationGabarit gabarit={c.gabarit} className="h-full max-w-full" />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-ink/0 opacity-0 transition group-hover/apercu:bg-ink/45 group-hover/apercu:opacity-100 group-focus-visible/apercu:bg-ink/45 group-focus-visible/apercu:opacity-100">
                    <span className="rounded-full bg-surface px-4 py-2 text-sm font-semibold text-accent shadow-md">
                      {ouverture ? "Enregistrement…" : cadre ? "✎ Modifier le cadre" : "✎ Personnaliser au studio"}
                    </span>
                  </span>
                </button>
                <span
                  className="absolute left-3 top-3 flex cursor-grab items-center gap-1 rounded-full bg-ink/75 py-0.5 pl-1.5 pr-2 text-xs font-semibold text-white active:cursor-grabbing"
                  title="Position dans l'écran de choix de la borne : glissez la carte pour la changer"
                >
                  <span aria-hidden className="text-sm leading-none opacity-80">⠿</span>
                  <span>{rang + 1}<sup>{rang === 0 ? "er" : "e"}</sup></span>
                </span>
                <div className="absolute right-3 top-3">
                  <MenuCarte
                    libelle={libelle}
                    actions={[
                      { libelle: cadre ? "Modifier le cadre" : "Personnaliser au studio", onClick: () => ouvrirStudio(c.id), desactive: ouverture },
                      {
                        libelle: "Dupliquer",
                        aide: cadre ? "Même format, copie du cadre" : "Même format, cadre du kit",
                        onClick: () => dupliquer.mutate(c.id),
                        desactive: plein || dupliquer.isPending,
                      },
                      { libelle: "Avancer dans l'écran de choix", onClick: () => deplacer(rang, -1), desactive: rang === 0, separe: true },
                      { libelle: "Reculer dans l'écran de choix", onClick: () => deplacer(rang, 1), desactive: rang === choisis.length - 1 },
                      ...(cadre
                        ? [{
                            libelle: "Revenir au cadre du kit",
                            onClick: () => confirm(`Revenir au cadre du kit pour « ${libelle} » ? Le cadre personnalisé sera supprimé.`) && retirer.mutate(c.id),
                            desactive: retirer.isPending,
                            separe: true,
                            danger: true,
                          }]
                        : []),
                      { libelle: "Retirer ce format", onClick: () => enlever(c.id, Boolean(cadre)), separe: !cadre, danger: true },
                    ]}
                  />
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-3 p-5">
                <div>
                  <h3 className="text-base font-semibold leading-snug">{libelle}</h3>
                  <p className="mt-1 text-sm text-ink-2">{g.detail}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {cadre ? <Badge ton="ok">Cadre personnalisé</Badge> : <Badge ton="warn">À personnaliser · cadre du kit</Badge>}
                  {g.qr && <Badge ton="neutre">QR de partage</Badge>}
                </div>
                <label className="mt-auto flex items-center gap-2 text-sm text-ink-2">
                  <input type="checkbox" className="h-4 w-4 accent-accent" checked={accueil.includes(c.id)} onChange={(e) => mettreEnAvant(c.id, e.target.checked)} />
                  Mis en avant sur l&apos;écran d&apos;accueil
                </label>
                {cadre && <p className="text-xs text-ink-muted">Cadre modifié le {dateHeure(cadre.updatedAt)}</p>}
              </div>
            </li>
          );
        })}

        {/* Ajouter un format : le studio s'ouvre sur le choix du format (étape 1) ; le format n'entre dans
            l'événement qu'au premier enregistrement de son cadre */}
        <li>
          <button
            type="button"
            disabled={plein || ouverture}
            onClick={() => ouvrirStudio("nouveau")}
            className="flex h-full min-h-48 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong p-6 text-center text-ink-2 transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-2xl shadow-sm">+</span>
            <span className="font-semibold">Ajouter un format</span>
            <span className="text-xs text-ink-muted">{plein ? `${MAX_COMPOSITIONS} formats au plus sur l'écran de choix` : `${choisis.length} / ${MAX_COMPOSITIONS} sur l'écran de choix`}</span>
          </button>
        </li>
      </ul>

      {choisis.length === 0 && (
        <p className="mt-4 rounded-md bg-warn-bg px-4 py-3 text-sm text-warn-ink">Aucun format : la borne n&apos;aurait rien à proposer. Ajoutez-en au moins un.</p>
      )}

      {(cadres.error || retirer.error || dupliquer.error) ? <div className="mt-3"><Erreur erreur={cadres.error ?? retirer.error ?? dupliquer.error} /></div> : null}
    </section>
  );
}

interface ActionCarte {
  libelle: string;
  aide?: string;
  onClick: () => void;
  desactive?: boolean;
  /** Trait au-dessus : un autre groupe d'actions */
  separe?: boolean;
  danger?: boolean;
}

/** Menu « ⋯ » d'une carte de format : toutes ses actions au même endroit. Échap et clic ailleurs le ferment. */
function MenuCarte({ libelle, actions }: { libelle: string; actions: ActionCarte[] }) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOuvert(false);
    const echap = (e: KeyboardEvent) => e.key === "Escape" && setOuvert(false);
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", echap);
    // Le premier choix prend le focus, pour le clavier
    ref.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")?.focus();
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-label={`Actions : ${libelle}`}
        title="Actions"
        onClick={() => setOuvert((v) => !v)}
        className={`flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none shadow-sm transition ${ouvert ? "bg-ink text-white" : "bg-surface/95 text-ink-2 hover:bg-surface hover:text-ink"}`}
      >
        <span aria-hidden>⋯</span>
      </button>
      {ouvert && (
        <div role="menu" aria-label={`Actions : ${libelle}`} className="absolute right-0 top-10 z-30 w-64 overflow-hidden rounded-lg border border-line bg-surface py-1 text-left shadow-xl">
          {actions.map((a) => (
            <div key={a.libelle}>
              {a.separe && <div role="separator" className="my-1 border-t border-line" />}
              <button
                type="button"
                role="menuitem"
                disabled={a.desactive}
                onClick={() => {
                  setOuvert(false);
                  a.onClick();
                }}
                className={`block w-full px-4 py-2 text-left text-sm hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${a.danger ? "text-crit-ink" : "text-ink"}`}
              >
                {a.libelle}
                {a.aide && <span className="block text-xs text-ink-muted">{a.aide}</span>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Écran 3 : tarifs et options ────────────────────────────

const GAGNANTS: { cle: Exclude<LotJeu, "none">; nom: string; couleur: string }[] = [
  { cle: "free", nom: "Photo offerte", couleur: "bg-accent" },
  { cle: "pct50", nom: "-50 % sur la prochaine photo", couleur: "bg-violet-400" },
  { cle: "pct30", nom: "-30 % sur la prochaine photo", couleur: "bg-violet-200" },
];

/**
 * Carte à gratter (retour de Sébastien : « je ne comprends même pas moi-même ») : on raisonne sur 100 cartes grattées.
 * Les cartes perdantes sont le reste ; les anciens poids relatifs sont ramenés à 100 à l'affichage.
 */
function ReglageCarte({ jeu, onChange }: { jeu: ReglagesEvenement["tarifs"]["jeu"]; onChange: (jeu: ReglagesEvenement["tarifs"]["jeu"]) => void }) {
  const total = Object.values(jeu.lots).reduce((s, v) => s + v, 0) || 100;
  const sur100 = (cle: LotJeu) => Math.round((jeu.lots[cle] / total) * 100);
  const gagnants = GAGNANTS.reduce((s, g) => s + sur100(g.cle), 0);
  const changer = (cle: Exclude<LotJeu, "none">, n: number) => {
    const lots = { free: sur100("free"), pct50: sur100("pct50"), pct30: sur100("pct30"), [cle]: Math.max(0, Math.min(100, n)) };
    const somme = lots.free + lots.pct50 + lots.pct30;
    if (somme > 100) return; // pas plus de 100 gagnants sur 100 cartes
    onChange({ ...jeu, lots: { ...lots, none: 100 - somme } });
  };
  return (
    <div className="space-y-4 rounded-md bg-surface-2 p-4">
      <div>
        <p className="text-sm font-medium">Sur 100 cartes grattées</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {GAGNANTS.map((g) => (
            <label key={g.cle} className="flex items-center gap-2 rounded-md bg-surface p-2 text-sm">
              <span aria-hidden className={`size-3 shrink-0 rounded-full ${g.couleur}`} />
              <input className="champ !w-16 tabular" type="number" min={0} max={100} value={sur100(g.cle)} onChange={(e) => changer(g.cle, Number(e.target.value))} />
              <span>{g.nom}</span>
            </label>
          ))}
        </div>
        {/* Répartition des 100 cartes */}
        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-surface" aria-hidden>
          {GAGNANTS.map((g) => <div key={g.cle} className={g.couleur} style={{ width: `${sur100(g.cle)}%` }} />)}
        </div>
        <p className="mt-1 text-xs text-ink-2">
          <strong className="text-ink">{gagnants}</strong> carte{gagnants > 1 ? "s" : ""} gagnante{gagnants > 1 ? "s" : ""} et <strong className="text-ink">{100 - gagnants}</strong> perdante{100 - gagnants > 1 ? "s" : ""} sur 100, tirées au hasard.
        </p>
      </div>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span>Au plus</span>
        <input className="champ !w-20 tabular" type="number" min={0} value={jeu.maxLotsParJour} onChange={(e) => onChange({ ...jeu, maxLotsParJour: Math.max(0, Number(e.target.value)) })} />
        <span>cartes gagnantes par jour ; au-delà, toutes les cartes du jour sont perdantes.</span>
      </label>
    </div>
  );
}

/** Groupe de réglages de l'étape 2 : sur la borne, ou sur la page souvenir (web). */
function Groupe({ titre, sousTitre, children }: { titre: string; sousTitre: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-ink">{titre}</h3>
        <p className="text-sm text-ink-2">{sousTitre}</p>
      </div>
      {children}
    </section>
  );
}

function EcranTarifs({ r, setR, tarifsLieu, lieuId }: PropsEcran & { tarifsLieu: FicheEvenementLieu["tarifsLieu"]; lieuId: number }) {
  const t = r.tarifs;
  const maj = (p: Partial<ReglagesEvenement["tarifs"]>) => setR((x) => ({ ...x, tarifs: { ...x.tarifs, ...p } }));

  return (
    <div className="space-y-8">
      <Groupe titre="Sur la borne" sousTitre="Ce que l'invité voit et paie devant la borne.">
      <Section titre="Prix des tirages">
        <div className="mb-3 flex flex-wrap gap-4 text-sm" role="radiogroup" aria-label="Tarifs de l'événement">
          <label className="flex items-center gap-2">
            <input type="radio" className="h-4 w-4 accent-accent" checked={t.herite} onChange={() => maj({ herite: true, ...tarifsLieu.grille })} />
            Reprendre les tarifs du lieu
            <span className="text-xs text-ink-muted">({tarifsLieu.origine === "LIEU" ? "tarifs propres au lieu" : "tarifs de base du parc"})</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" className="h-4 w-4 accent-accent" checked={!t.herite} onChange={() => maj({ herite: false })} />
            Tarifs propres à l&apos;événement
          </label>
        </div>
        {/* Repris du lieu : un résumé, pas des champs (on ne les modifie pas ici) */}
        {t.herite ? (
          <>
            <ResumeGrille grille={tarifsLieu.grille} />
            <p className="mt-3 text-xs text-ink-muted">
              Les tarifs du lieu se modifient dans{" "}
              <Link href={`/lieux/${lieuId}/modifier?onglet=tarifs`} className="text-accent hover:underline">la fiche du lieu (onglet Tarif du lieu)</Link>
              {" "}; pour d&apos;autres prix sur cet événement, choisissez « Tarifs propres à l&apos;événement ».
            </p>
          </>
        ) : (
          <EditeurGrille
            valeur={t}
            onChange={(g) => maj({ paliers: g.paliers, palierMisEnAvant: g.palierMisEnAvant, libelleMisEnAvant: g.libelleMisEnAvant, plusUnCents: g.plusUnCents })}
            nom="evenement"
          />
        )}
        <p className="mt-3 text-xs text-ink-muted">Paiement par le terminal Hexapay de la borne.</p>
      </Section>

      <Section titre="À la borne">
        <div className="space-y-3">
          <Case
            coche={t.codesPromo}
            onChange={(v) => maj({ codesPromo: v })}
            libelle="Accepter les codes promo"
            aide="Lien « J'ai un code promo » sur l'écran d'offre, où l'invité tape un code de remise (menu Codes de remise) ou un code gagné à la carte à gratter. Décoché : la borne n'accepte aucun code."
          />
          <Case coche={t.photoAppel.actif} onChange={(v) => maj({ photoAppel: { ...t.photoAppel, actif: v } })} libelle="Photo d'appel" aide="La borne prend une photo d'ambiance quand personne ne s'en sert." />
          {t.photoAppel.actif && (
            <div className="ml-6 w-48">
              <Champ libelle="Après (secondes sans activité)">
                <input className="champ tabular" type="number" min={10} max={3600} value={t.photoAppel.inactiviteSec} onChange={(e) => maj({ photoAppel: { ...t.photoAppel, inactiviteSec: Number(e.target.value) } })} />
              </Champ>
            </div>
          )}
          {/* Envoi postal si l'imprimante est en panne : retiré pour l'instant (retour de Sébastien, 06/11/2026) */}
        </div>
      </Section>
      </Groupe>

      <Groupe titre="Page souvenir (web)" sousTitre="Après la photo, sur le téléphone de l'invité (QR code du tirage).">
      <Section titre="Carte à gratter">
        <div className="space-y-3">
          <Case
            coche={t.jeu.actif}
            onChange={(v) => maj({ jeu: { ...t.jeu, actif: v }, ...(v ? { codesPromo: true } : {}) })}
            libelle="Proposer la carte à gratter"
            aide="Après l'envoi des photos : un code promo unique pour la prochaine photo, valable 30 jours sur toutes les bornes partenaires. Active aussi les codes promo à la borne."
          />
          {t.jeu.actif && <ReglageCarte jeu={t.jeu} onChange={(jeu) => maj({ jeu })} />}
        </div>
      </Section>
      <Section titre="Réimpression">
        <Case
          coche={t.reimpressionWeb}
          onChange={(v) => maj({ reimpressionWeb: v })}
          libelle="Réimpression payée depuis le mobile"
          aide="L'invité paie sur la page souvenir et récupère ses tirages à la borne avec son code. À activer quand l'API des crédits sera en production."
        />
      </Section>
      </Groupe>
    </div>
  );
}
