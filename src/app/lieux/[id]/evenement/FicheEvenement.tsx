"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, telecharger, type CadreEvenement, type EvenementPonctuel, type FicheEvenementLieu, type LieuFiche, type ReglagesEvenement } from "@/lib/api";
import { PageGuard, usePerm } from "@/lib/perms";
import { Chargement, Erreur } from "@/components/Etat";
import { FilAriane } from "@/components/FilAriane";
import { Segments } from "@/components/EvenementsLieu";
import { ApercuChoixFormat } from "@/components/IllustrationsEvenement";
import { Bloc } from "@/components/evenement/Blocs";
import { CadresEvenement, resumeCadres } from "@/components/evenement/CadresEvenement";
import { AmbianceEvenement, useIllustrations } from "@/components/evenement/AmbianceEvenement";
import { ALaBorne, ChoixTarifs, PageSouvenir, TarifsEvenement } from "@/components/evenement/OptionsEvenement";
import { nouvelId } from "@/lib/gabaritsEvenement";
import { affiche, duAu, instantLisible, instants, maintenantParis, periode } from "@/lib/programmation";

// Page d'un événement d'un lieu (CDC page souvenir § 13), mise en page d'après les maquettes
// « configuration-evenements » du 10/11/2026 : une seule page, un sommaire à gauche (clic = défilement
// jusqu'au bloc) avec l'aperçu de l'écran de la borne dessous, six blocs numérotés. En-tête : nom, état,
// code borne, mot de passe du tableau de bord ; à droite Galerie, Télécharger et Publier, grisé tant qu'il
// n'y a rien à publier. Un lieu a son événement par défaut (« habituel » dans le code) et des événements
// programmés (Halloween, une soirée…), chacun avec son code, ses cadres et ses tarifs.

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
  // Les autres événements : pour dire si celui-ci est sur la borne d'après la programmation
  const programmes = useQuery({ queryKey: ["evenements-ponctuels", id], queryFn: () => api<EvenementPonctuel[]>(`/lieux/${id}/evenements-ponctuels`) });
  if (lieu.error || fiche.error) return <Erreur erreur={lieu.error ?? fiche.error} />;
  if (!lieu.data || !fiche.data) return <Chargement />;
  // L'éditeur repart des réglages enregistrés après chaque enregistrement
  return (
    <Editeur key={`${eid ?? "habituel"}-${fiche.dataUpdatedAt}`} lieuId={id} eid={eid} enseigne={lieu.data.enseigne} fiche={fiche.data} programmes={programmes.data ?? []} />
  );
}

const BLOCS = [
  { id: "programmation", titre: "Programmation" },
  { id: "cadres", titre: "Cadres" },
  { id: "ambiance", titre: "Ambiance et style" },
  { id: "tarifs", titre: "Tarifs" },
  { id: "borne", titre: "À la borne" },
  { id: "souvenir", titre: "Page souvenir" },
] as const;
type IdBloc = (typeof BLOCS)[number]["id"];

const jourMois = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" }) : "");

/** Pastille d'état (en-tête) : point coloré + libellé. */
function Etat({ ton, children }: { ton: "ok" | "warn" | "neutre" | "noir"; children: ReactNode }) {
  const couleurs = { ok: "bg-ok-bg text-ok-ink", warn: "bg-warn-bg text-warn-ink", neutre: "bg-surface-2 text-ink-2", noir: "bg-ink text-white" };
  const points = { ok: "bg-ok-ink", warn: "bg-warn-ink", neutre: "bg-ink-muted", noir: "bg-[#22c55e]" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${couleurs[ton]}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${points[ton]}`} />
      {children}
    </span>
  );
}

function Editeur({ lieuId, eid, enseigne, fiche, programmes }: { lieuId: number; eid?: number; enseigne: string; fiche: FicheEvenementLieu; programmes: EvenementPonctuel[] }) {
  const client = useQueryClient();
  const router = useRouter();
  const peutModifier = usePerm("evenements.edit");
  const chemins = cheminsEvenement(lieuId, eid);
  const cle = ["evenement-lieu", lieuId, eid ?? "habituel"];
  const [r, setR] = useState<ReglagesEvenement>(fiche.reglages);
  const [nom, setNom] = useState(fiche.nom ?? "");
  const modifie = JSON.stringify(r) !== JSON.stringify(fiche.reglages) || (!fiche.habituel && nom.trim() !== (fiche.nom ?? ""));
  const aEnregistrer = modifie || !fiche.enregistre;
  // Cadres dessinés au studio : relus à chaque retour du studio
  const cadres = useQuery({ queryKey: ["cadres-evenement", chemins.api], queryFn: () => api<CadreEvenement[]>(`${chemins.api}/cadres`), staleTime: 0 });
  const ill = useIllustrations({ lieu: r.lieu, apiEvenement: chemins.api, lieuId, enregistre: fiche.enregistre });

  const apresEnregistrement = (f: FicheEvenementLieu) => {
    client.setQueryData(cle, f);
    client.invalidateQueries({ queryKey: ["evenements-ponctuels", lieuId] });
  };
  const corps = (reglages: ReglagesEvenement) => ({ reglages, ...(fiche.habituel ? {} : { nom: nom.trim() }) });
  const sauver = () => api<FicheEvenementLieu>(chemins.api, { method: "PUT", json: corps(r) });
  const enregistrer = useMutation({ mutationFn: sauver, onSuccess: apresEnregistrement });
  const annuler = () => {
    setR(fiche.reglages);
    setNom(fiche.nom ?? "");
  };
  // « Publier » : enregistre ce qui ne l'est pas, puis fige la version que la borne charge
  const publier = useMutation({
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
  // Le studio s'ouvre sur une autre page : on enregistre d'abord ce qui ne l'est pas
  const ouvrirStudio = async (compositionId: string) => {
    if (aEnregistrer) await enregistrer.mutateAsync();
    router.push(`/lieux/${lieuId}/evenement/studio/${compositionId}${eid ? `?e=${eid}` : ""}`);
  };
  // « Dupliquer » un cadre : une composition du même gabarit juste après, avec une copie de son dessin (côté
  // API). La fiche est enregistrée d'abord : l'API ne copie que vers une composition enregistrée.
  const dupliquer = useMutation({
    mutationFn: async (source: string) => {
      const { choisis, accueil } = r.gabarits;
      const i = choisis.findIndex((c) => c.id === source);
      const id = nouvelId(choisis[i].gabarit, choisis.map((c) => c.id));
      const nouveaux = [...choisis.slice(0, i + 1), { id, gabarit: choisis[i].gabarit }, ...choisis.slice(i + 1)];
      const f = await api<FicheEvenementLieu>(chemins.api, { method: "PUT", json: corps({ ...r, gabarits: { choisis: nouveaux, accueil } }) });
      if (cadres.data?.some((x) => x.compositionId === source)) await api(`${chemins.api}/cadres/${source}/dupliquer`, { method: "POST", json: { vers: id } });
      return f;
    },
    onSuccess: (f) => {
      client.invalidateQueries({ queryKey: ["cadres-evenement", chemins.api] });
      apresEnregistrement(f);
    },
  });
  // Le zip (config.json, cadres assemblés, éléments du kit) est refait à chaque fois côté API
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

  // ?ecran=tarifs (anciens liens) : on descend au bloc des tarifs
  const ecran = useSearchParams().get("ecran");
  useEffect(() => {
    if (ecran === "tarifs" || ecran === "lieu") document.getElementById("tarifs")?.scrollIntoView();
  }, [ecran]);

  // État de l'événement d'après la programmation (la borne ne remonte pas encore l'événement installé)
  const maintenant = maintenantParis();
  const affiche_ = affiche(programmes, maintenant);
  const programme = !fiche.habituel && fiche.id ? programmes.find((p) => p.id === fiche.id) : undefined;
  let etat: ReactNode;
  if (fiche.habituel) {
    etat = affiche_ ? <Etat ton="neutre">Remplacé par « {affiche_.nom} » jusqu&apos;au {instantLisible(instants(affiche_).fin)}</Etat> : <Etat ton="noir">Sur la borne</Etat>;
  } else if (programme) {
    const p = periode(programme, maintenant);
    const quand = `du ${instantLisible(instants(programme).debut)} au ${instantLisible(instants(programme).fin)}`;
    etat =
      p === "passe" ? <Etat ton="neutre">Passé · {quand}</Etat>
      : p === "a-venir" ? <Etat ton="neutre">À venir · {quand}</Etat>
      : affiche_?.id === programme.id ? <Etat ton="noir">Sur la borne</Etat>
      : <Etat ton="warn">En cours, masqué par « {affiche_?.nom} »</Etat>;
  }

  const cree = fiche.version > 0;
  const aJour = cree && !fiche.modifieDepuisPublication && !modifie;
  const publication = aJour ? (
    <Etat ton="ok">Publié · version {fiche.version} du {jourMois(fiche.publieeLe)} · rien à publier</Etat>
  ) : cree ? (
    <Etat ton="warn">Modifications non publiées · version {fiche.version} du {jourMois(fiche.publieeLe)} sur la borne</Etat>
  ) : (
    <Etat ton="warn">Jamais publié : la borne ne le connaît pas</Etat>
  );
  const titre = fiche.habituel ? "Événement par défaut" : nom.trim() || fiche.nom || "Événement";

  // Sommaire : avancement de chaque bloc
  const formats = r.gabarits.choisis;
  const t = r.tarifs;
  const sourcePhotos: Record<ReglagesEvenement["lieu"]["illustrations"], string> = {
    festif: "série festive",
    chic: "série chic",
    serie: ill.serie ? `bibliothèque « ${ill.serie.nom} »` : "bibliothèque",
    client: "photos du client",
    photos: "photos de l'événement",
    camera: "caméra en direct",
    aucune: "sans photo",
  };
  const resumeAmbiance = `Nightlife · ${sourcePhotos[r.lieu.illustrations]}`;
  const sommaire: Record<IdBloc, { detail: string; ok: boolean }> = {
    programmation: { detail: fiche.habituel ? "par défaut · sans date de fin" : duAu(r.lieu), ok: fiche.habituel || instants(r.lieu).fin > instants(r.lieu).debut },
    cadres: { detail: formats.length ? `${formats.length} cadre${formats.length > 1 ? "s" : ""}` : "aucun cadre", ok: formats.length > 0 },
    ambiance: { detail: resumeAmbiance, ok: !(r.lieu.illustrations === "serie" && !r.lieu.illustrationsSerieId) },
    tarifs: { detail: t.herite ? "ceux du lieu" : "propres à l'événement", ok: true },
    borne: { detail: t.codesPromo ? "codes promo acceptés" : "codes promo refusés", ok: true },
    souvenir: { detail: t.jeu.actif ? "carte à gratter active" : "carte à gratter coupée", ok: true },
  };
  const actif = useBlocActif();
  const majTarifs = (p: Partial<ReglagesEvenement["tarifs"]>) => setR((x) => ({ ...x, tarifs: { ...x.tarifs, ...p } }));
  const majLieu = (p: Partial<ReglagesEvenement["lieu"]>) => setR((x) => ({ ...x, lieu: { ...x.lieu, ...p } }));

  return (
    <div className="pb-4">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <FilAriane lieuId={lieuId} enseigne={enseigne} page={titre} />
          <h1 className="text-3xl font-bold tracking-tight">{titre}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-2">
            {etat}
            <span>
              Code borne <b className="ml-1 font-mono text-ink">{fiche.code ?? "attribué au premier enregistrement"}</b>
            </span>
            {fiche.motDePasseTableau && (
              <span title="À donner à l'exploitant : il ouvre le tableau de bord de la borne">
                Mot de passe du tableau de bord <b className="ml-1 font-mono text-ink">{fiche.motDePasseTableau}</b>
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link href={`${chemins.page}/galerie`} className="bouton-second" title="Les photos et vidéos des séances de cet événement">Galerie</Link>
            <button type="button" className="bouton-second" disabled={zipEnCours} onClick={telechargerZip} title="Le zip de l'événement : config.json, cadres et éléments du kit">
              {zipEnCours ? "Préparation…" : "Télécharger"}
            </button>
            {peutModifier && (
              <button
                type="button"
                className="bouton"
                disabled={publier.isPending || aJour}
                title={aJour ? "Rien à publier : la borne a la dernière version" : `Fige cette version${fiche.code ? ` ; la borne la charge quand on tape ${fiche.code}` : ""}`}
                onClick={() => publier.mutate()}
              >
                {publier.isPending ? "Publication…" : "Publier"}
              </button>
            )}
          </div>
          {publication}
        </div>
        {(publier.error || erreurTelechargement !== null) && (
          <div className="w-full"><Erreur erreur={publier.error ?? erreurTelechargement} /></div>
        )}
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-4">
          <nav aria-label="Sommaire de l'événement" className="carte p-2">
            <ol>
              {BLOCS.map((b, i) => {
                const s = sommaire[b.id];
                return (
                  <li key={b.id}>
                    <a
                      href={`#${b.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById(b.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      aria-current={actif === b.id ? "location" : undefined}
                      className={`flex gap-2.5 rounded-lg px-2.5 py-2 ${actif === b.id ? "bg-accent/10" : "hover:bg-surface-2"}`}
                    >
                      <span aria-hidden className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[0.6rem] font-bold text-white ${s.ok ? "bg-ok-ink" : "bg-warn-ink"}`}>
                        {s.ok ? "✓" : "!"}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{i + 1} · {b.titre}</span>
                        <span className="block text-xs text-ink-muted">{s.detail}</span>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ol>
          </nav>
          <div className="carte p-3">
            <p className="mb-2 text-xs font-bold tracking-[0.08em] text-ink-2 uppercase">Aperçu de la borne</p>
            <ApercuChoixFormat
              gabarits={formats.map((c) => c.gabarit)}
              remplissage={ill.remplissage}
              legende={r.lieu.illustrations === "festif" || r.lieu.illustrations === "chic" ? "Aperçu indicatif : la borne a ses propres photos de la série." : "Page « Choisis ton format »."}
            />
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          <Bloc
            id="programmation"
            numero={1}
            titre="Programmation"
            actions={
              <Segments<"defaut" | "programme">
                libelle="Cas de l'événement"
                valeur={fiche.habituel ? "defaut" : "programme"}
                onChange={() => undefined}
                choix={[
                  { cle: "defaut", libelle: "Par défaut", desactive: !fiche.habituel, aide: fiche.habituel ? undefined : "Un seul événement par défaut par lieu : le remplacer n'est pas encore possible ici" },
                  { cle: "programme", libelle: "Programmé", desactive: fiche.habituel, aide: fiche.habituel ? "L'événement par défaut ne se programme pas : créez un événement depuis l'onglet Configuration" : undefined },
                ]}
              />
            }
          >
            {fiche.habituel ? (
              <>
                <p className="text-sm"><b>S&apos;affiche tout le temps</b>, sauf quand un événement programmé prend sa place.</p>
                <p className="mt-1.5 text-sm text-ink-muted">Sans date de fin · un seul événement par défaut par lieu</p>
              </>
            ) : (
              <Programmation r={r} majLieu={majLieu} nom={nom} setNom={setNom} code={fiche.code} supprimer={peutModifier ? supprimer : null} nomEvenement={fiche.nom} />
            )}
          </Bloc>

          <Bloc id="cadres" numero={2} titre="Cadres proposés" actions={<span className="text-sm text-ink-muted">{resumeCadres(formats.length)}</span>}>
            <CadresEvenement r={r} setR={setR} cadres={cadres} apiEvenement={chemins.api} ouvrirStudio={ouvrirStudio} ouverture={enregistrer.isPending} dupliquer={dupliquer} />
          </Bloc>

          <Bloc id="ambiance" numero={3} titre="Ambiance et style">
            <AmbianceEvenement r={r} setR={setR} apiEvenement={chemins.api} lieuId={lieuId} enseigne={enseigne} enregistre={fiche.enregistre} />
          </Bloc>

          <Bloc id="tarifs" numero={4} titre="Tarifs" actions={<ChoixTarifs t={t} maj={majTarifs} tarifsLieu={fiche.tarifsLieu} />}>
            <TarifsEvenement t={t} maj={majTarifs} tarifsLieu={fiche.tarifsLieu} enseigne={enseigne} />
          </Bloc>

          <Bloc id="borne" numero={5} titre="À la borne">
            <ALaBorne t={t} maj={majTarifs} />
          </Bloc>

          <Bloc id="souvenir" numero={6} titre="Page souvenir (web)">
            <PageSouvenir t={t} maj={majTarifs} />
          </Bloc>
        </div>
      </div>

      {/* N'apparaît que s'il y a quelque chose à enregistrer ; reste visible en faisant défiler */}
      {(aEnregistrer || enregistrer.isPending || enregistrer.error) && peutModifier && (
        <div role="status" className="sticky bottom-4 z-20 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-strong bg-surface px-4 py-3 shadow-lg">
          <span className="flex items-center gap-2 text-sm font-medium">
            <span aria-hidden className="text-warn-ink">▲</span>
            {fiche.enregistre ? "Modifications non enregistrées" : "Événement pas encore enregistré"}
            <span className="font-normal text-ink-muted">· « Publier » enregistre aussi</span>
          </span>
          <div className="flex items-center gap-2">
            {modifie && (
              <button type="button" className="bouton-second" disabled={enregistrer.isPending} onClick={annuler}>Annuler</button>
            )}
            <button type="button" className="bouton-second" disabled={enregistrer.isPending} onClick={() => enregistrer.mutate()}>
              {enregistrer.isPending ? "Enregistrement…" : "Enregistrer le brouillon"}
            </button>
          </div>
          {enregistrer.error && <div className="w-full"><Erreur erreur={enregistrer.error} /></div>}
        </div>
      )}
    </div>
  );
}

/** Le bloc en haut de l'écran, pour le sommaire. */
function useBlocActif() {
  const [actif, setActif] = useState<IdBloc>("programmation");
  useEffect(() => {
    const calculer = () => {
      let courant: IdBloc = "programmation";
      for (const b of BLOCS) {
        const el = document.getElementById(b.id);
        if (el && el.getBoundingClientRect().top <= 120) courant = b.id;
      }
      // Tout en bas de la page : le dernier bloc, même s'il ne remonte pas jusqu'en haut
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) courant = BLOCS[BLOCS.length - 1].id;
      setActif(courant);
    };
    calculer();
    window.addEventListener("scroll", calculer, { passive: true });
    window.addEventListener("resize", calculer);
    return () => {
      window.removeEventListener("scroll", calculer);
      window.removeEventListener("resize", calculer);
    };
  }, []);
  return actif;
}

/** Bloc 1 d'un événement programmé : nom, début et fin avec leur heure. */
function Programmation({ r, majLieu, nom, setNom, code, supprimer, nomEvenement }: {
  r: ReglagesEvenement;
  majLieu: (p: Partial<ReglagesEvenement["lieu"]>) => void;
  nom: string;
  setNom: (v: string) => void;
  code: string | null;
  supprimer: { mutate: () => void; isPending: boolean; error: unknown } | null;
  nomEvenement: string | null;
}) {
  const l = r.lieu;
  const finAvantDebut = instants(l).fin <= instants(l).debut;
  return (
    <div className="space-y-3">
      <label className="block max-w-md">
        <span className="etiquette">Nom</span>
        <input className="champ" required maxLength={80} value={nom} onChange={(e) => setNom(e.target.value)} />
      </label>
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem_1fr_9rem]">
        <label className="block">
          <span className="etiquette">Début</span>
          <input className="champ" type="date" required value={l.dateDebut} onChange={(e) => majLieu({ dateDebut: e.target.value })} />
        </label>
        <label className="block">
          <span className="etiquette">à</span>
          <input className="champ" type="time" value={l.heureDebut ?? ""} onChange={(e) => majLieu({ heureDebut: e.target.value || null })} />
        </label>
        <label className="block">
          <span className="etiquette">Fin</span>
          <input className="champ" type="date" required min={l.dateDebut} value={l.dateFin} onChange={(e) => majLieu({ dateFin: e.target.value })} />
        </label>
        <label className="block">
          <span className="etiquette">à</span>
          <input className="champ" type="time" value={l.heureFin ?? ""} onChange={(e) => majLieu({ heureFin: e.target.value || null })} />
        </label>
      </div>
      {finAvantDebut && <p role="alert" className="text-sm text-crit-ink">La fin est avant le début.</p>}
      <p className="text-sm text-ink-muted">
        La borne passe sur cet événement au début et revient à l&apos;événement par défaut à la fin
        {code ? <> ; en attendant qu&apos;elle le fasse seule, on tape <b className="font-mono text-ink-2">{code}</b> sur la borne</> : null}. Sans heure : toute la journée.
      </p>
      {supprimer && (
        <div className="border-t border-line pt-3 text-right">
          <button
            type="button"
            className="text-sm text-crit-ink hover:underline"
            disabled={supprimer.isPending}
            onClick={() => confirm(`Supprimer l'événement « ${nomEvenement} » et ses cadres ? Son code ne fonctionnera plus.`) && supprimer.mutate()}
          >
            Supprimer cet événement
          </button>
          {supprimer.error ? <div className="mt-2 text-left"><Erreur erreur={supprimer.error} /></div> : null}
        </div>
      )}
    </div>
  );
}
