"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, MAX_COMPOSITIONS, telecharger, type CadreEvenement, type EvenementPonctuel, type FicheEvenementLieu, type GabaritEvenement, type LieuFiche, type LotJeu, type ReglagesEvenement } from "@/lib/api";
import { Reserve } from "@/lib/session";
import { Badge, Chargement, EnTete, Erreur, Section } from "@/components/Etat";
import { dateHeure, parametreUrl } from "@/lib/format";
import { ChampEuros, EditeurGrille } from "@/components/GrilleTarifs";
import { dates, FormNouvelEvenement, periode, trier } from "@/components/EvenementsLieu";
import { IllustrationGabarit } from "@/components/IllustrationGabarit";

// Fiche événement d'un lieu (CDC page souvenir § 13) : créations graphiques, tarifs et options, puis
// « Créer l'événement » (la version que la borne charge avec son code) et le zip à télécharger.
// Un lieu a son événement par défaut (« habituel » dans le code) et d'autres événements (Halloween, une soirée…), chacun avec son
// code, ses cadres et ses tarifs : on passe de l'un à l'autre en tapant le code sur la borne.

/** Chemins d'un événement : dans l'API, et la page de la fiche (eid absent = l'événement habituel). */
export const cheminsEvenement = (lieuId: number, eid?: number | null) =>
  eid
    ? { api: `/lieux/${lieuId}/evenements-ponctuels/${eid}`, page: `/lieux/${lieuId}/evenement/${eid}` }
    : { api: `/lieux/${lieuId}/evenement`, page: `/lieux/${lieuId}/evenement` };

export function FicheEvenement({ id, eid }: { id: number; eid?: number }) {
  return (
    <Reserve roles={["ADMIN"]}>
      <Chargeur id={id} eid={eid} />
    </Reserve>
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
  };
  if (lieu.error || fiche.error) return <Erreur erreur={lieu.error ?? fiche.error} />;
  if (!lieu.data || !fiche.data) return <Chargement />;
  return <Editeur key={`${eid ?? "habituel"}-${fiche.dataUpdatedAt}`} lieuId={id} eid={eid} enseigne={lieu.data.enseigne} fiche={fiche.data} ecran={ecran} setEcran={setEcran} />;
}

// Deux écrans (retour de Sébastien du 03/11) : on commence par les créations graphiques ; les réglages
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

  const apresEnregistrement = (f: FicheEvenementLieu) => {
    client.setQueryData(cle, f);
    client.invalidateQueries({ queryKey: ["evenements-ponctuels", lieuId] });
  };
  const sauver = () => api<FicheEvenementLieu>(chemins.api, { method: "PUT", json: { reglages: r, ...(fiche.habituel ? {} : { nom: nom.trim() }) } });
  const enregistrer = useMutation({ mutationFn: sauver, onSuccess: apresEnregistrement });
  // « Créer l'événement » : enregistre ce qui ne l'est pas, puis fige la version que la borne charge
  const creer = useMutation({
    mutationFn: async () => {
      if (modifie || !fiche.enregistre) apresEnregistrement(await sauver());
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
    if (modifie || !fiche.enregistre) await enregistrer.mutateAsync();
    router.push(`/lieux/${lieuId}/evenement/studio/${compositionId}${eid ? `?e=${eid}` : ""}`);
  };
  // Le zip (config.json, cadres du studio assemblés, éléments du kit) est refait à chaque fois côté API
  const [erreurTelechargement, setErreurTelechargement] = useState<unknown>(null);
  const [zipEnCours, setZipEnCours] = useState(false);
  const telechargerZip = async () => {
    setZipEnCours(true);
    setErreurTelechargement(null);
    try {
      if (modifie || !fiche.enregistre) await enregistrer.mutateAsync();
      await telecharger(`${chemins.api}/zip`);
    } catch (e) {
      setErreurTelechargement(e);
    } finally {
      setZipEnCours(false);
    }
  };

  const cree = fiche.version > 0;
  const aJour = cree && !fiche.modifieDepuisPublication && !modifie;

  return (
    <>
      <EnTete
        titre={fiche.habituel ? `Événement par défaut · ${enseigne}` : `${fiche.nom ?? "Événement"} · ${enseigne}`}
        sousTitre={
          <span className="flex flex-wrap items-center gap-2">
            {fiche.code ? <span>Code à taper sur la borne <strong className="font-mono">{fiche.code}</strong></span> : <span>Code attribué au premier enregistrement</span>}
            {fiche.motDePasseTableau && (
              <span title="À donner à l'exploitant : il ouvre le tableau de bord de la borne">
                Mot de passe du tableau de bord <strong className="font-mono">{fiche.motDePasseTableau}</strong>
              </span>
            )}
            {!cree ? <Badge ton="neutre">Pas encore créé</Badge> : aJour ? <Badge ton="ok">Créé · à jour</Badge> : <Badge ton="warn">Modifié depuis sa création</Badge>}
          </span>
        }
        actions={
          <>
            <button type="button" className="bouton-second" disabled={zipEnCours} onClick={telechargerZip}>
              {zipEnCours ? "Préparation…" : "Télécharger"}
            </button>
            <button type="button" className="bouton" disabled={creer.isPending || aJour} onClick={() => creer.mutate()}>
              {creer.isPending ? "Création…" : !cree ? "Créer l'événement" : aJour ? "Événement à jour" : "Mettre à jour l'événement"}
            </button>
          </>
        }
      />
      {(creer.error || erreurTelechargement !== null) && (
        <div className="mb-4">
          <Erreur erreur={creer.error ?? erreurTelechargement} />
        </div>
      )}

      <ChoixEvenement lieuId={lieuId} eid={eid} />

      <div className="space-y-4">
        <nav className="flex flex-wrap gap-1 rounded-lg bg-surface-2 p-1" aria-label="Écrans de l'événement">
          {ECRANS.map((nom, i) => (
            <button
              key={nom}
              type="button"
              onClick={() => setEcran(i)}
              aria-current={ecran === i ? "step" : undefined}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${ecran === i ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink"}`}
            >
              <span className="mr-1 text-ink-muted">{i + 1}.</span>
              {nom}
            </button>
          ))}
        </nav>

        {ecran === 0 && <EcranCreations r={r} setR={setR} apiEvenement={chemins.api} ouvrirStudio={ouvrirStudio} ouverture={enregistrer.isPending} />}
        {ecran === 1 && (
          <div className="space-y-4">
            <SectionEvenement r={r} setR={setR} lieuId={lieuId} fiche={fiche} nom={fiche.habituel ? null : nom} setNom={setNom} supprimer={supprimer} />
            <EcranTarifs r={r} setR={setR} tarifsLieu={fiche.tarifsLieu} />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            {ecran > 0 && <button type="button" className="bouton-second" onClick={() => setEcran(ecran - 1)}>← {ECRANS[ecran - 1]}</button>}
            {ecran < ECRANS.length - 1 && <button type="button" className="bouton-second" onClick={() => setEcran(ecran + 1)}>{ECRANS[ecran + 1]} →</button>}
          </div>
          <div className="flex items-center gap-3">
            {modifie && <span className="text-xs text-warn-ink">Modifications non enregistrées</span>}
            <button type="button" className="bouton-second" disabled={(!modifie && fiche.enregistre) || enregistrer.isPending} onClick={() => enregistrer.mutate()}>
              {enregistrer.isPending ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
        {enregistrer.error && <Erreur erreur={enregistrer.error} />}
      </div>
    </>
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

const TONS: Record<ReglagesEvenement["lieu"]["ton"], string> = {
  club: "Club (défaut) : festif, la nuit",
  bar: "Bar : décontracté",
  famille: "Famille : tous publics",
  pro: "Pro : soirée d'entreprise",
};

// Thèmes de l'interface de la borne (uiKit) : les autres viendront quand la borne saura les afficher
const THEMES: Record<ReglagesEvenement["theme"], string> = { nightlife: "Nightlife" };

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
          <input className="champ" type="date" required value={l.dateDebut} onChange={(e) => maj({ dateDebut: e.target.value })} />
        </Champ>
        <Champ libelle="Fin *" aide={nom === null ? "Une borne à l'année : plusieurs années." : "Le même jour que le début : une seule journée."}>
          <input className="champ" type="date" required value={l.dateFin} min={l.dateDebut} onChange={(e) => maj({ dateFin: e.target.value })} />
        </Champ>
        <Champ libelle="Thème de la borne" aide="D'autres thèmes (Halloween, personnalisés) viendront.">
          <select className="champ" value={r.theme} onChange={(e) => setR((x) => ({ ...x, theme: e.target.value as ReglagesEvenement["theme"] }))}>
            {Object.entries(THEMES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </Champ>
        <Champ libelle="Ton des textes" aide="Consignes de pose et phrases du « +1 pour un pote ».">
          <select className="champ" value={l.ton} onChange={(e) => maj({ ton: e.target.value as typeof l.ton })}>
            {Object.entries(TONS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </Champ>
        <Champ libelle="Illustrations de l'accueil">
          <select className="champ" value={l.illustrations} onChange={(e) => maj({ illustrations: e.target.value as typeof l.illustrations })}>
            <option value="festif">Festif (défaut)</option>
            <option value="chic">Chic</option>
          </select>
        </Champ>
      </div>
      <p className="mt-3 text-xs text-ink-muted">
        Nom affiché, ville, avis, assistance et horaires : ceux du lieu ({l.nom}
        {l.ville ? `, ${l.ville}` : ""}),{" "}
        <Link href={`/lieux/${lieuId}/configuration/lieu`} className="text-accent hover:underline">à modifier dans ses infos</Link>.
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

const GABARITS: { cle: GabaritEvenement; nom: string; detail: string; qr: boolean }[] = [
  { cle: "bandelette", nom: "Bandelette 4 poses + carte souvenir", detail: "10x15 coupé en deux ; QR et code de séance sur la carte.", qr: true },
  { cle: "pola", nom: "Pola 1 pose", detail: "10x15, une grande photo.", qr: false },
  { cle: "planche", nom: "Planche 4 poses", detail: "10x15, quatre cases carrées.", qr: false },
  { cle: "carte", nom: "Photo 10x15 + deux cartes à QR", detail: "Ruban 15x20 obligatoire ; même QR sur les deux cartes, une pour chaque invité.", qr: true },
];

/** Identifiant d'une nouvelle composition : le nom du gabarit la première fois, puis numéroté au hasard. */
function nouvelId(g: GabaritEvenement, existants: string[]): string {
  if (!existants.includes(g)) return g;
  for (;;) {
    const id = `${g}-${Math.random().toString(36).slice(2, 6)}`;
    if (!existants.includes(id)) return id;
  }
}

function EcranCreations({ r, setR, apiEvenement, ouvrirStudio, ouverture }: PropsEcran & { apiEvenement: string; ouvrirStudio: (compositionId: string) => void; ouverture: boolean }) {
  const { choisis, accueil } = r.gabarits;
  const client = useQueryClient();
  // Relue à chaque retour du studio
  const cadres = useQuery({ queryKey: ["cadres-evenement", apiEvenement], queryFn: () => api<CadreEvenement[]>(`${apiEvenement}/cadres`), staleTime: 0 });
  const retirer = useMutation({
    mutationFn: (compositionId: string) => api(`${apiEvenement}/cadres/${compositionId}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["cadres-evenement", apiEvenement] }),
  });
  const maj = (g: Partial<ReglagesEvenement["gabarits"]>) => setR((x) => ({ ...x, gabarits: { ...x.gabarits, ...g } }));
  const ids = choisis.map((c) => c.id);
  const plein = choisis.length >= MAX_COMPOSITIONS;
  const ajouter = (g: GabaritEvenement) => !plein && maj({ choisis: [...choisis, { id: nouvelId(g, ids), gabarit: g }] });
  const enlever = (id: string, avecCadre: boolean) => {
    if (avecCadre && !confirm("Retirer ce format ? Son cadre dessiné sera supprimé à l'enregistrement.")) return;
    maj({ choisis: choisis.filter((c) => c.id !== id), accueil: accueil.filter((a) => a !== id) });
  };
  const deplacer = (i: number, sens: -1 | 1) => {
    const n = [...choisis];
    [n[i], n[i + sens]] = [n[i + sens], n[i]];
    maj({ choisis: n });
  };
  const mettreEnAvant = (id: string, oui: boolean) =>
    maj({ accueil: oui ? ids.filter((x) => x === id || accueil.includes(x)) : accueil.filter((x) => x !== id) });

  return (
    <div className="space-y-4">
      <Section titre={`Formats de la borne (${choisis.length} / ${MAX_COMPOSITIONS})`}>
        <p className="mb-4 text-sm text-ink-2">
          Dans l&apos;ordre de l&apos;écran de choix de la borne. Créez le cadre de chacun au studio ; sans cadre, la borne garde celui du kit.
        </p>
        {choisis.length === 0 && <p className="mb-3 rounded-md bg-surface-2 p-3 text-sm text-ink-2">Aucun format : ajoutez-en au moins un ci-dessous.</p>}
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {choisis.map((c, rang) => {
            const g = GABARITS.find((x) => x.cle === c.gabarit)!;
            const memes = choisis.filter((x) => x.gabarit === c.gabarit);
            const libelle = memes.length > 1 ? `${g.nom} · ${memes.indexOf(c) + 1}` : g.nom;
            const cadre = cadres.data?.find((x) => x.compositionId === c.id);
            return (
              <li key={c.id} className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
                <div className="relative flex h-60 items-center justify-center bg-surface-2 p-5">
                  {cadre?.vignette ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cadre.vignette} alt={`Cadre ${libelle}`} className="max-h-full max-w-full rounded bg-white object-contain shadow-md" />
                  ) : (
                    <IllustrationGabarit gabarit={c.gabarit} className="h-full max-w-full" />
                  )}
                  <span className="absolute left-3 top-3 flex h-6 min-w-6 items-center justify-center rounded-full bg-surface px-1.5 text-xs font-semibold text-accent shadow-sm">{rang + 1}</span>
                  <span className="absolute right-3 top-3">{cadre ? <Badge ton="ok">Cadre créé</Badge> : <Badge ton="neutre">Cadre du kit</Badge>}</span>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <p className="font-medium">
                    {libelle}
                    {g.qr && <span className="ml-2"><Badge ton="ok">QR · collecte</Badge></span>}
                  </p>
                  <p className="text-xs text-ink-2">{g.detail}</p>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" className="h-3.5 w-3.5 accent-accent" checked={accueil.includes(c.id)} onChange={(e) => mettreEnAvant(c.id, e.target.checked)} />
                    Mis en avant sur l&apos;écran d&apos;accueil
                  </label>
                  <div className="mt-auto flex items-center gap-1 pt-2">
                    <button type="button" className="bouton flex-1 !py-1.5 text-sm" disabled={ouverture} onClick={() => ouvrirStudio(c.id)}>
                      {ouverture ? "Enregistrement…" : cadre ? "Modifier le cadre" : "Créer le cadre"}
                    </button>
                    <button type="button" className="bouton-second !px-2 !py-1.5 text-xs" disabled={rang === 0} aria-label="Avancer dans l'écran de choix" title="Avancer" onClick={() => deplacer(rang, -1)}>◀</button>
                    <button type="button" className="bouton-second !px-2 !py-1.5 text-xs" disabled={rang === choisis.length - 1} aria-label="Reculer dans l'écran de choix" title="Reculer" onClick={() => deplacer(rang, 1)}>▶</button>
                    <button type="button" className="bouton-second !px-2 !py-1.5 text-xs text-crit-ink" aria-label={`Retirer ${libelle}`} title="Retirer ce format" onClick={() => enlever(c.id, Boolean(cadre))}>✕</button>
                  </div>
                  {cadre && (
                    <p className="flex flex-wrap items-center justify-between gap-1 text-xs text-ink-muted">
                      <span>Cadre du {dateHeure(cadre.updatedAt)}</span>
                      <button
                        type="button"
                        className="text-crit-ink hover:underline"
                        disabled={retirer.isPending}
                        onClick={() => confirm(`Revenir au cadre du kit pour « ${libelle} » ? Le cadre créé sera supprimé.`) && retirer.mutate(c.id)}
                      >
                        Revenir au cadre du kit
                      </button>
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {(cadres.error || retirer.error) && <div className="mt-3"><Erreur erreur={cadres.error ?? retirer.error} /></div>}
      </Section>

      <Section titre="Ajouter un format">
        {plein && <p className="mb-3 text-sm text-ink-2">L&apos;écran de choix de la borne affiche {MAX_COMPOSITIONS} formats au plus.</p>}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {GABARITS.map((g) => (
            <button
              key={g.cle}
              type="button"
              disabled={plein}
              onClick={() => ajouter(g.cle)}
              className="group flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface p-3 text-center transition hover:border-accent hover:bg-accent/5 disabled:opacity-50"
            >
              <span className="flex h-28 items-center justify-center">
                <IllustrationGabarit gabarit={g.cle} className="h-full max-w-full transition group-hover:scale-105" />
              </span>
              <span className="text-xs font-medium">{g.nom}</span>
              <span className="text-xs text-accent">+ Ajouter</span>
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ─── Choix de l'événement ───────────────────────────────────

/**
 * Passer d'un événement du lieu à l'autre : une liste déroulante (en cours et à venir d'abord, passés
 * ensuite) qui tient même avec beaucoup d'événements ; la vue d'ensemble est l'onglet « Configuration » du lieu.
 */
function ChoixEvenement({ lieuId, eid }: { lieuId: number; eid?: number }) {
  const router = useRouter();
  const liste = useQuery({ queryKey: ["evenements-ponctuels", lieuId], queryFn: () => api<EvenementPonctuel[]>(`/lieux/${lieuId}/evenements-ponctuels`) });
  const [creation, setCreation] = useState(false);
  const tries = trier(liste.data ?? []);
  const actuels = tries.filter((e) => periode(e) !== "passe");
  const passes = tries.filter((e) => periode(e) === "passe");
  const option = (e: EvenementPonctuel) => (
    <option key={e.id} value={e.id}>
      {e.nom} · {dates(e)} · {e.code}
    </option>
  );

  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Événement</span>
          <select
            className="champ w-auto min-w-64"
            value={eid ?? ""}
            onChange={(e) => router.push(cheminsEvenement(lieuId, e.target.value ? Number(e.target.value) : null).page)}
          >
            <option value="">Par défaut</option>
            {actuels.length > 0 && <optgroup label="En cours et à venir">{actuels.map(option)}</optgroup>}
            {passes.length > 0 && <optgroup label="Passés">{passes.map(option)}</optgroup>}
          </select>
        </label>
        <Link href={`/lieux/${lieuId}?onglet=configuration`} className="text-sm text-accent hover:underline">
          ← Configuration du lieu{liste.data?.length ? ` (${liste.data.length + 1} événements)` : ""}
        </Link>
        {!creation && (
          <button type="button" className="text-sm text-accent hover:underline" onClick={() => setCreation(true)}>
            + Nouvel événement
          </button>
        )}
      </div>
      {creation && <FormNouvelEvenement lieuId={lieuId} onAnnuler={() => setCreation(false)} />}
      {liste.error && <Erreur erreur={liste.error} />}
    </div>
  );
}

// ─── Écran 3 : tarifs et options ────────────────────────────

const LOTS: { cle: LotJeu; nom: string }[] = [
  { cle: "free", nom: "Photo offerte" },
  { cle: "pct50", nom: "-50 % sur la prochaine" },
  { cle: "pct30", nom: "-30 % sur la prochaine" },
  { cle: "none", nom: "Perdu" },
];

function EcranTarifs({ r, setR, tarifsLieu }: PropsEcran & { tarifsLieu: FicheEvenementLieu["tarifsLieu"] }) {
  const t = r.tarifs;
  const maj = (p: Partial<ReglagesEvenement["tarifs"]>) => setR((x) => ({ ...x, tarifs: { ...x.tarifs, ...p } }));
  const totalLots = Object.values(t.jeu.lots).reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-4">
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
        <EditeurGrille
          valeur={t}
          onChange={(g) => maj({ paliers: g.paliers, palierMisEnAvant: g.palierMisEnAvant, libelleMisEnAvant: g.libelleMisEnAvant, plusUnCents: g.plusUnCents })}
          desactive={t.herite}
          nom="evenement"
        />
        {t.herite && <p className="mt-3 text-xs text-ink-muted">Les tarifs se modifient sur la fiche du lieu (onglet Informations) ou dans Paramètres → Tarifs de base.</p>}
        <p className="mt-3 text-xs text-ink-muted">Paiement par le terminal Hexapay de la borne.</p>
      </Section>

      <Section titre="Codes promo et jeu">
        <div className="space-y-3">
          <Case
            coche={t.codesPromo}
            onChange={(v) => maj({ codesPromo: v })}
            libelle="Accepter les codes promo à la borne"
            aide="Lien « J'ai un code promo » sur l'offre. Obligatoire si le jeu est actif : c'est là que se tapent les codes gagnés."
          />
          <Case
            coche={t.jeu.actif}
            onChange={(v) => maj({ jeu: { ...t.jeu, actif: v }, ...(v ? { codesPromo: true } : {}) })}
            libelle="Carte à gratter sur la page souvenir"
            aide="Après l'envoi des photos : un code promo unique pour la prochaine photo, valable 30 jours sur toutes les bornes partenaires."
          />
          {t.jeu.actif && (
            <div className="rounded-md bg-surface-2 p-3">
              <p className="mb-2 text-xs text-ink-2">Chances de chaque lot (poids relatifs).</p>
              <div className="grid gap-3 sm:grid-cols-4">
                {LOTS.map((lot) => (
                  <Champ key={lot.cle} libelle={lot.nom} aide={totalLots ? `${Math.round((t.jeu.lots[lot.cle] / totalLots) * 100)} %` : "—"}>
                    <input
                      className="champ tabular"
                      type="number"
                      min={0}
                      value={t.jeu.lots[lot.cle]}
                      onChange={(e) => maj({ jeu: { ...t.jeu, lots: { ...t.jeu.lots, [lot.cle]: Math.max(0, Number(e.target.value)) } } })}
                    />
                  </Champ>
                ))}
              </div>
              <div className="mt-3 w-48">
                <Champ libelle="Lots gagnants par jour, au plus">
                  <input className="champ tabular" type="number" min={0} value={t.jeu.maxLotsParJour} onChange={(e) => maj({ jeu: { ...t.jeu, maxLotsParJour: Math.max(0, Number(e.target.value)) } })} />
                </Champ>
              </div>
            </div>
          )}
        </div>
      </Section>

      <Section titre="Options">
        <div className="space-y-3">
          <Case
            coche={t.reimpressionWeb}
            onChange={(v) => maj({ reimpressionWeb: v })}
            libelle="Réimpression payée depuis le mobile"
            aide="L'invité paie sur la page souvenir et récupère ses tirages à la borne avec son code. À activer quand l'API des crédits sera en production."
          />
          <Case coche={t.photoAppel.actif} onChange={(v) => maj({ photoAppel: { ...t.photoAppel, actif: v } })} libelle="Photo d'appel" aide="La borne prend une photo d'ambiance quand personne ne s'en sert." />
          {t.photoAppel.actif && (
            <div className="ml-6 w-48">
              <Champ libelle="Après (secondes sans activité)">
                <input className="champ tabular" type="number" min={10} max={3600} value={t.photoAppel.inactiviteSec} onChange={(e) => maj({ photoAppel: { ...t.photoAppel, inactiviteSec: Number(e.target.value) } })} />
              </Champ>
            </div>
          )}
          <Case
            coche={t.envoiPostal.actif}
            onChange={(v) => maj({ envoiPostal: { ...t.envoiPostal, actif: v } })}
            libelle="Envoi postal si l'imprimante est en panne"
            aide="Engagement de l'exploitant : le tirage est envoyé par la poste."
          />
          {t.envoiPostal.actif && (
            <div className="ml-6 w-48">
              <Champ libelle="Frais de port (plan B)">
                <ChampEuros cents={t.envoiPostal.fraisCents} onChange={(c) => maj({ envoiPostal: { ...t.envoiPostal, fraisCents: c } })} />
              </Champ>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
