"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, MAX_COMPOSITIONS, telecharger, type CadreEvenement, type EvenementPonctuel, type FicheEvenementLieu, type GabaritEvenement, type LieuFiche, type LotJeu, type ReglagesEvenement } from "@/lib/api";
import { Reserve } from "@/lib/session";
import { Badge, Chargement, EnTete, Erreur, Section } from "@/components/Etat";
import { dateHeure, jour, JOURS_SEMAINE, parametreUrl } from "@/lib/format";
import { ChampEuros, EditeurGrille } from "@/components/GrilleTarifs";

// Fiche événement d'un lieu (CDC page souvenir § 13) : trois écrans, puis le config.json de la borne.
// Un lieu a son événement habituel et des événements ponctuels (Halloween, une soirée…), chacun avec son
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
  // ?ecran=gabarits : retour du studio de cadres sur l'écran d'où on l'a ouvert.
  const demande = useSearchParams().get("ecran");
  const [ecran, setEcranEtat] = useState(() => Math.max(0, ["lieu", "gabarits", "tarifs"].indexOf(demande ?? "")));
  const setEcran = (n: number) => {
    setEcranEtat(n);
    parametreUrl("ecran", ["lieu", "gabarits", "tarifs"][n] ?? null);
  };
  if (lieu.error || fiche.error) return <Erreur erreur={lieu.error ?? fiche.error} />;
  if (!lieu.data || !fiche.data) return <Chargement />;
  return <Editeur key={`${eid ?? "habituel"}-${fiche.dataUpdatedAt}`} lieuId={id} eid={eid} enseigne={lieu.data.enseigne} fiche={fiche.data} ecran={ecran} setEcran={setEcran} />;
}

const ECRANS = ["Le lieu", "Gabarits", "Tarifs et options"] as const;

function Editeur({ lieuId, eid, enseigne, fiche, ecran, setEcran }: { lieuId: number; eid?: number; enseigne: string; fiche: FicheEvenementLieu; ecran: number; setEcran: (n: number) => void }) {
  const client = useQueryClient();
  const router = useRouter();
  const chemins = cheminsEvenement(lieuId, eid);
  const cle = ["evenement-lieu", lieuId, eid ?? "habituel"];
  const [r, setR] = useState<ReglagesEvenement>(fiche.reglages);
  const [nom, setNom] = useState(fiche.nom ?? "");
  const modifie = JSON.stringify(r) !== JSON.stringify(fiche.reglages) || (!fiche.habituel && nom.trim() !== (fiche.nom ?? ""));

  const enregistrer = useMutation({
    mutationFn: () => api<FicheEvenementLieu>(chemins.api, { method: "PUT", json: { reglages: r, ...(fiche.habituel ? {} : { nom: nom.trim() }) } }),
    onSuccess: (f) => {
      client.setQueryData(cle, f);
      client.invalidateQueries({ queryKey: ["evenements-ponctuels", lieuId] });
    },
  });
  const publier = useMutation({
    mutationFn: () => api<FicheEvenementLieu>(`${chemins.api}/publier`, { method: "POST" }),
    onSuccess: (f) => {
      client.setQueryData(cle, f);
      client.invalidateQueries({ queryKey: ["evenements-ponctuels", lieuId] });
    },
  });
  const supprimer = useMutation({
    mutationFn: () => api(chemins.api, { method: "DELETE" }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["evenements-ponctuels", lieuId] });
      router.push(cheminsEvenement(lieuId).page);
    },
  });
  const [erreurTelechargement, setErreurTelechargement] = useState<unknown>(null);
  // Le studio s'ouvre sur une autre page : on enregistre d'abord ce qui ne l'est pas (composition tout juste ajoutée…)
  const ouvrirStudio = async (compositionId: string) => {
    if (modifie || !fiche.enregistre) await enregistrer.mutateAsync();
    router.push(`/lieux/${lieuId}/evenement/studio/${compositionId}${eid ? `?e=${eid}` : ""}`);
  };
  const telechargerConfig = (publiee: boolean) =>
    telecharger(`${chemins.api}/config.json${publiee ? "?publiee=1" : ""}`).catch(setErreurTelechargement);
  // Le zip (config.json, cadres du studio assemblés, éléments du kit) est refait à chaque fois côté API
  const [zipEnCours, setZipEnCours] = useState(false);
  const telechargerZip = () => {
    setZipEnCours(true);
    setErreurTelechargement(null);
    telecharger(`${chemins.api}/zip`).catch(setErreurTelechargement).finally(() => setZipEnCours(false));
  };

  const erreurs = fiche.controles.filter((c) => c.niveau === "erreur");
  const avertissements = fiche.controles.filter((c) => c.niveau === "avertissement");

  return (
    <>
      <EnTete
        titre={fiche.habituel ? `Fiche événement · ${enseigne}` : `${fiche.nom ?? "Événement"} · ${enseigne}`}
        sousTitre={
          <span className="flex flex-wrap items-center gap-2">
            {fiche.code ? <span>Code d&apos;événement <strong className="font-mono">{fiche.code}</strong></span> : <span>Code attribué au premier enregistrement</span>}
            {fiche.motDePasseTableau && (
              <span title="À donner à l'exploitant : il ouvre le tableau de bord de la borne">
                Mot de passe du tableau de bord <strong className="font-mono">{fiche.motDePasseTableau}</strong>
              </span>
            )}
            {fiche.version > 0 ? (
              <Badge ton="ok">Version {fiche.version} publiée le {dateHeure(fiche.publieeLe)}</Badge>
            ) : (
              <Badge ton="neutre">Jamais publiée</Badge>
            )}
            {fiche.enregistre && fiche.modifieDepuisPublication && fiche.version > 0 && <Badge ton="warn">Modifiée depuis la publication</Badge>}
          </span>
        }
        actions={<Link href={`/lieux/${lieuId}`} className="bouton-second">← Fiche du lieu</Link>}
      />

      <BarreEvenements lieuId={lieuId} eid={eid} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-4">
          <nav className="flex flex-wrap gap-1 rounded-lg bg-surface-2 p-1" aria-label="Écrans de la fiche événement">
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

          {ecran === 0 && <EcranLieu r={r} setR={setR} horaires={fiche.horaires} lieuId={lieuId} nom={fiche.habituel ? null : nom} setNom={setNom} />}
          {ecran === 1 && <EcranGabarits r={r} setR={setR} apiEvenement={chemins.api} ouvrirStudio={ouvrirStudio} ouverture={enregistrer.isPending} />}
          {ecran === 2 && <EcranTarifs r={r} setR={setR} tarifsLieu={fiche.tarifsLieu} />}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              {ecran > 0 && <button type="button" className="bouton-second" onClick={() => setEcran(ecran - 1)}>← {ECRANS[ecran - 1]}</button>}
              {ecran < ECRANS.length - 1 && <button type="button" className="bouton-second" onClick={() => setEcran(ecran + 1)}>{ECRANS[ecran + 1]} →</button>}
            </div>
            <div className="flex items-center gap-3">
              {modifie && <span className="text-xs text-warn-ink">Modifications non enregistrées</span>}
              <button type="button" className="bouton" disabled={(!modifie && fiche.enregistre) || enregistrer.isPending} onClick={() => enregistrer.mutate()}>
                {enregistrer.isPending ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
          {enregistrer.error && <Erreur erreur={enregistrer.error} />}
        </div>

        <aside className="space-y-4">
          <Section titre="Générer et publier">
            <div className="space-y-3 text-sm">
              <p className="text-ink-2">
                Le <span className="font-mono">config.json</span> est ce que la borne charge avec le code d&apos;événement. Publier fige une nouvelle version.
              </p>
              {!fiche.enregistre && <p className="text-ink-muted">Enregistrez d&apos;abord la fiche.</p>}
              {erreurs.length > 0 && (
                <ul className="space-y-1">
                  {erreurs.map((c) => (
                    <li key={c.message} className="flex gap-2 text-crit-ink"><span aria-hidden>■</span>{c.message}</li>
                  ))}
                </ul>
              )}
              {avertissements.length > 0 && (
                <ul className="space-y-1">
                  {avertissements.map((c) => (
                    <li key={c.message} className="flex gap-2 text-warn-ink"><span aria-hidden>▲</span>{c.message}</li>
                  ))}
                </ul>
              )}
              {fiche.enregistre && modifie && <p className="text-xs text-ink-muted">Les contrôles portent sur la version enregistrée.</p>}
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  className="bouton"
                  disabled={!fiche.enregistre || modifie || erreurs.length > 0 || publier.isPending || (fiche.version > 0 && !fiche.modifieDepuisPublication)}
                  onClick={() => publier.mutate()}
                >
                  {publier.isPending ? "Publication…" : fiche.version > 0 ? `Publier la version ${fiche.version + 1}` : "Publier"}
                </button>
                <button type="button" className="bouton-second" disabled={!fiche.enregistre} onClick={() => telechargerConfig(false)}>
                  Télécharger le config.json
                </button>
                <button type="button" className="bouton-second" disabled={!fiche.enregistre || zipEnCours} onClick={telechargerZip}>
                  {zipEnCours ? "Préparation du zip…" : "Télécharger le zip de l'événement"}
                </button>
                {fiche.version > 0 && (
                  <button type="button" className="text-xs text-accent hover:underline" onClick={() => telechargerConfig(true)}>
                    Télécharger la version publiée ({fiche.version})
                  </button>
                )}
              </div>
              {publier.error && <Erreur erreur={publier.error} />}
              {erreurTelechargement !== null && <Erreur erreur={erreurTelechargement} />}
              <p className="text-xs text-ink-muted">
                Les cadres se dessinent au studio, depuis l&apos;écran Gabarits. Le config.json et le zip suivent les cadres enregistrés : sans
                cadre, un gabarit garde celui du kit.
              </p>
            </div>
          </Section>
          {!fiche.habituel && (
            <Section titre="Cet événement">
              <p className="mb-3 text-sm text-ink-2">
                Pour l&apos;installer, tapez <strong className="font-mono">{fiche.code}</strong> sur la borne ; pour revenir à l&apos;habituel, retapez le code du lieu.
              </p>
              <button
                type="button"
                className="text-sm text-crit-ink hover:underline"
                disabled={supprimer.isPending}
                onClick={() => confirm(`Supprimer l'événement « ${fiche.nom} » et ses cadres ? Son code ne fonctionnera plus.`) && supprimer.mutate()}
              >
                Supprimer cet événement
              </button>
              {supprimer.error && <Erreur erreur={supprimer.error} />}
            </Section>
          )}
        </aside>
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

// ─── Écran 1 : le lieu ──────────────────────────────────────

const TONS: Record<ReglagesEvenement["lieu"]["ton"], string> = {
  club: "Club (défaut) : festif, la nuit",
  bar: "Bar : décontracté",
  famille: "Famille : tous publics",
  pro: "Pro : soirée d'entreprise",
};

// Thèmes de l'interface de la borne (uiKit) : les autres viendront quand la borne saura les afficher
const THEMES: Record<ReglagesEvenement["theme"], string> = { nightlife: "Nightlife" };

function EcranLieu({ r, setR, horaires, lieuId, nom, setNom }: PropsEcran & { horaires: FicheEvenementLieu["horaires"]; lieuId: number; nom: string | null; setNom: (v: string) => void }) {
  const l = r.lieu;
  const maj = (p: Partial<ReglagesEvenement["lieu"]>) => setR((x) => ({ ...x, lieu: { ...x.lieu, ...p } }));
  const majAssistance = (p: Partial<ReglagesEvenement["lieu"]["assistance"]>) =>
    setR((x) => ({ ...x, lieu: { ...x.lieu, assistance: { ...x.lieu.assistance, ...p } } }));
  const texte = (v: string) => (v.trim() ? v : null);

  return (
    <div className="space-y-4">
      {nom !== null && (
        <Section titre="Événement">
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ libelle="Nom de l'événement *" aide="Pour s'y retrouver dans la Régie ; la borne l'affiche après le nom du lieu.">
              <input className="champ" required maxLength={80} value={nom} onChange={(e) => setNom(e.target.value)} />
            </Champ>
            <Champ libelle="Thème de la borne" aide="D'autres thèmes (Halloween, personnalisés) viendront.">
              <select className="champ" value={r.theme} onChange={(e) => setR((x) => ({ ...x, theme: e.target.value as ReglagesEvenement["theme"] }))}>
                {Object.entries(THEMES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </Champ>
          </div>
        </Section>
      )}
      <Section titre="Identité">
        <div className="grid gap-3 sm:grid-cols-2">
          {nom === null && (
            <Champ libelle="Thème de la borne" aide="D'autres thèmes (Halloween, personnalisés) viendront.">
              <select className="champ" value={r.theme} onChange={(e) => setR((x) => ({ ...x, theme: e.target.value as ReglagesEvenement["theme"] }))}>
                {Object.entries(THEMES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </Champ>
          )}
          <Champ libelle="Nom affiché *" aide="Sur l'accueil de la borne, la page souvenir et les mails.">
            <input className="champ" required value={l.nom} onChange={(e) => maj({ nom: e.target.value })} />
          </Champ>
          <Champ libelle="Ville">
            <input className="champ" value={l.ville ?? ""} onChange={(e) => maj({ ville: texte(e.target.value) })} />
          </Champ>
          <Champ libelle="Début *">
            <input className="champ" type="date" required value={l.dateDebut} onChange={(e) => maj({ dateDebut: e.target.value })} />
          </Champ>
          <Champ libelle="Fin *" aide="Une borne à l'année : plusieurs années.">
            <input className="champ" type="date" required value={l.dateFin} min={l.dateDebut} onChange={(e) => maj({ dateFin: e.target.value })} />
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
      </Section>

      <Section titre="Avis et réseaux">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Champ libelle="Lien d'avis Google" aide="Bouton « Je laisse mon avis » du mail de livraison ; sans lien, le bloc n'apparaît pas.">
              <input className="champ" type="url" placeholder="https://g.page/r/…/review" value={l.avisGoogleUrl ?? ""} onChange={(e) => maj({ avisGoogleUrl: texte(e.target.value) })} />
            </Champ>
          </div>
          <Champ libelle="Instagram du lieu" aide="Vide : le compte Selfizee.">
            <input className="champ" placeholder="@lieu" value={l.instagram ?? ""} onChange={(e) => maj({ instagram: texte(e.target.value) })} />
          </Champ>
          <Champ libelle="TikTok du lieu" aide="Vide : le compte Selfizee.">
            <input className="champ" placeholder="@lieu" value={l.tiktok ?? ""} onChange={(e) => maj({ tiktok: texte(e.target.value) })} />
          </Champ>
          <Champ libelle="À tagger dans les partages" aide="Vide : @selfizee.">
            <input className="champ" placeholder="@selfizee" value={l.hashtag ?? ""} onChange={(e) => maj({ hashtag: texte(e.target.value) })} />
          </Champ>
        </div>
      </Section>

      <Section titre="Assistance">
        <div className="grid gap-3 sm:grid-cols-3">
          <Champ libelle="Assurée par">
            <select className="champ" value={l.assistance.proprietaire} onChange={(e) => majAssistance({ proprietaire: e.target.value as "selfizee" | "client" })}>
              <option value="selfizee">Selfizee</option>
              <option value="client">Le client</option>
            </select>
          </Champ>
          <Champ libelle="Téléphone" aide="Vide : le numéro intégré au logiciel.">
            <input className="champ" type="tel" value={l.assistance.telephone ?? ""} onChange={(e) => majAssistance({ telephone: texte(e.target.value) })} />
          </Champ>
          <Champ libelle="E-mail" aide="Vide : contact@selfizee.fr.">
            <input className="champ" type="email" value={l.assistance.email ?? ""} onChange={(e) => majAssistance({ email: texte(e.target.value) })} />
          </Champ>
        </div>
      </Section>

      <Section titre="Horaires d'ouverture" actions={<Link className="text-sm text-accent hover:underline" href={`/lieux/${lieuId}/modifier`}>Modifier dans la fiche du lieu</Link>}>
        <p className="mb-2 text-xs text-ink-muted">Repris de la fiche du lieu (horaires de toute l&apos;année) : la borne se met en veille en dehors.</p>
        {horaires.length ? (
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {horaires.map((h, i) => (
              <li key={i} className="tabular">{JOURS_SEMAINE[h.jourSemaine]} : {h.ouverture} → {h.fermeture}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-2">Aucun horaire sur la fiche du lieu.</p>
        )}
      </Section>
    </div>
  );
}

// ─── Écran 2 : les gabarits ─────────────────────────────────

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

function EcranGabarits({ r, setR, apiEvenement, ouvrirStudio, ouverture }: PropsEcran & { apiEvenement: string; ouvrirStudio: (compositionId: string) => void; ouverture: boolean }) {
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
    <Section titre="Gabarits du kit nightlife">
      <p className="mb-3 text-sm text-ink-2">
        Les formats proposés par la borne, dans l&apos;ordre de l&apos;écran de choix ({choisis.length} / {MAX_COMPOSITIONS}). Un même gabarit peut
        revenir plusieurs fois (8 polas, 2 bandelettes…), chacun avec son cadre au studio ; sans cadre dessiné, la borne garde celui du kit.
      </p>
      {choisis.length === 0 && <p className="mb-3 rounded-md bg-surface-2 p-3 text-sm text-ink-2">Aucun format : ajoutez-en au moins un ci-dessous.</p>}
      <ul className="space-y-2">
        {choisis.map((c, rang) => {
          const g = GABARITS.find((x) => x.cle === c.gabarit)!;
          const memes = choisis.filter((x) => x.gabarit === c.gabarit);
          const libelle = memes.length > 1 ? `${g.nom} · ${memes.indexOf(c) + 1}` : g.nom;
          const cadre = cadres.data?.find((x) => x.compositionId === c.id);
          return (
            <li key={c.id} className="flex flex-wrap items-start gap-3 rounded-md border border-accent bg-surface p-3">
              <span className="mt-0.5 w-5 font-mono text-sm text-accent">{rang + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {libelle}
                  {g.qr && <span className="ml-2"><Badge ton="ok">QR · collecte</Badge></span>}
                </p>
                <p className="text-xs text-ink-2">{g.detail}</p>
                <label className="mt-2 flex items-center gap-2 text-xs">
                  <input type="checkbox" className="h-3.5 w-3.5 accent-accent" checked={accueil.includes(c.id)} onChange={(e) => mettreEnAvant(c.id, e.target.checked)} />
                  Mis en avant sur l&apos;écran d&apos;accueil
                </label>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {cadre?.vignette && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cadre.vignette} alt={`Cadre ${libelle}`} className="h-16 w-auto rounded border border-line bg-surface-2 object-contain" />
                  )}
                  <button type="button" className="bouton !py-1 text-xs" disabled={ouverture} onClick={() => ouvrirStudio(c.id)}>
                    {ouverture ? "Enregistrement…" : cadre ? "Modifier le cadre" : "Ouvrir le studio"}
                  </button>
                  {cadre && (
                    <>
                      <span className="text-xs text-ink-muted">Cadre enregistré le {dateHeure(cadre.updatedAt)}</span>
                      <button
                        type="button"
                        className="text-xs text-crit-ink hover:underline"
                        disabled={retirer.isPending}
                        onClick={() => confirm(`Retirer le cadre de « ${libelle} » ? La borne reprendra celui du kit.`) && retirer.mutate(c.id)}
                      >
                        Retirer le cadre
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-1">
                <button type="button" className="bouton-second !px-2 !py-1 text-xs" disabled={rang === 0} aria-label="Monter" onClick={() => deplacer(rang, -1)}>▲</button>
                <button type="button" className="bouton-second !px-2 !py-1 text-xs" disabled={rang === choisis.length - 1} aria-label="Descendre" onClick={() => deplacer(rang, 1)}>▼</button>
                <button type="button" className="bouton-second !px-2 !py-1 text-xs text-crit-ink" aria-label={`Retirer ${libelle}`} onClick={() => enlever(c.id, Boolean(cadre))}>✕</button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 rounded-md border border-dashed border-line-strong p-3">
        <p className="mb-2 text-xs font-medium text-ink-2">{plein ? `L'écran de choix de la borne affiche ${MAX_COMPOSITIONS} formats au plus.` : "Ajouter un format à l'écran de choix"}</p>
        <div className="flex flex-wrap gap-2">
          {GABARITS.map((g) => (
            <button key={g.cle} type="button" className="bouton-second !py-1 text-xs" disabled={plein} onClick={() => ajouter(g.cle)}>
              + {g.nom}
            </button>
          ))}
        </div>
      </div>
      {(cadres.error || retirer.error) && <div className="mt-3"><Erreur erreur={cadres.error ?? retirer.error} /></div>}
    </Section>
  );
}

// ─── Barre des événements du lieu ───────────────────────────

/** L'habituel, les ponctuels (Halloween, une soirée…) et la création d'un nouveau. */
function BarreEvenements({ lieuId, eid }: { lieuId: number; eid?: number }) {
  const client = useQueryClient();
  const router = useRouter();
  const liste = useQuery({ queryKey: ["evenements-ponctuels", lieuId], queryFn: () => api<EvenementPonctuel[]>(`/lieux/${lieuId}/evenements-ponctuels`) });
  const [creation, setCreation] = useState(false);
  const [nom, setNom] = useState("");
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const creer = useMutation({
    mutationFn: () => api<FicheEvenementLieu>(`/lieux/${lieuId}/evenements-ponctuels`, { method: "POST", json: { nom: nom.trim(), dateDebut: debut, dateFin: fin || debut } }),
    onSuccess: (f) => {
      client.invalidateQueries({ queryKey: ["evenements-ponctuels", lieuId] });
      setCreation(false);
      setNom("");
      router.push(cheminsEvenement(lieuId, f.id).page);
    },
  });
  const puce = (actif: boolean) => `rounded-full border px-3 py-1 text-sm ${actif ? "border-accent bg-accent text-accent-ink" : "border-line-strong bg-surface text-ink hover:border-accent"}`;

  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-ink-muted">Événements</span>
        <Link href={cheminsEvenement(lieuId).page} className={puce(!eid)}>Habituel</Link>
        {liste.data?.map((e) => (
          <Link key={e.id} href={cheminsEvenement(lieuId, e.id).page} className={puce(eid === e.id)} title={`Code ${e.code}`}>
            {e.nom} <span className="opacity-75">· {e.dateDebut === e.dateFin ? jour(e.dateDebut) : `${jour(e.dateDebut)} → ${jour(e.dateFin)}`}</span>
          </Link>
        ))}
        {!creation && (
          <button type="button" className="rounded-full border border-dashed border-line-strong px-3 py-1 text-sm text-accent hover:border-accent" onClick={() => setCreation(true)}>
            + Nouvel événement
          </button>
        )}
      </div>
      {creation && (
        <form
          className="flex flex-wrap items-end gap-3 rounded-md border border-line bg-surface p-3"
          onSubmit={(e) => {
            e.preventDefault();
            creer.mutate();
          }}
        >
          <label className="block">
            <span className="etiquette">Nom *</span>
            <input className="champ w-64" required maxLength={80} placeholder="Halloween, soirée étudiante…" value={nom} onChange={(e) => setNom(e.target.value)} />
          </label>
          <label className="block">
            <span className="etiquette">Début *</span>
            <input className="champ" type="date" required value={debut} onChange={(e) => setDebut(e.target.value)} />
          </label>
          <label className="block">
            <span className="etiquette">Fin</span>
            <input className="champ" type="date" min={debut} value={fin} onChange={(e) => setFin(e.target.value)} />
          </label>
          <button type="submit" className="bouton" disabled={creer.isPending || !nom.trim() || !debut}>
            {creer.isPending ? "Création…" : "Créer"}
          </button>
          <button type="button" className="bouton-second" onClick={() => setCreation(false)}>Annuler</button>
          <p className="w-full text-xs text-ink-muted">
            Il reprend les réglages de l&apos;événement habituel et les tarifs du lieu, sans les cadres ; il aura son propre code, à taper sur la borne.
            Sans date de fin : une seule soirée.
          </p>
          {creer.error && <div className="w-full"><Erreur erreur={creer.error} /></div>}
        </form>
      )}
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
