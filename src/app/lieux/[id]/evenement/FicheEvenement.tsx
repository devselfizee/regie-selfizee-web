"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, telecharger, type CadreEvenement, type FicheEvenementLieu, type GabaritEvenement, type LieuFiche, type LotJeu, type ReglagesEvenement } from "@/lib/api";
import { Reserve } from "@/lib/session";
import { Badge, Chargement, EnTete, Erreur, Section } from "@/components/Etat";
import { dateHeure, euros, JOURS_SEMAINE } from "@/lib/format";

// Fiche événement d'un lieu (CDC page souvenir § 13) : trois écrans, puis le config.json de la borne.

export function FicheEvenement({ id }: { id: number }) {
  return (
    <Reserve roles={["ADMIN"]}>
      <Chargeur id={id} />
    </Reserve>
  );
}

function Chargeur({ id }: { id: number }) {
  const lieu = useQuery({ queryKey: ["lieu", id], queryFn: () => api<LieuFiche>(`/lieux/${id}`) });
  const fiche = useQuery({ queryKey: ["evenement-lieu", id], queryFn: () => api<FicheEvenementLieu>(`/lieux/${id}/evenement`) });
  // Ici et non dans l'éditeur : l'éditeur repart des réglages enregistrés après chaque enregistrement.
  // ?ecran=gabarits : retour du studio de cadres sur l'écran d'où on l'a ouvert.
  const demande = useSearchParams().get("ecran");
  const [ecran, setEcran] = useState(() => Math.max(0, ["lieu", "gabarits", "tarifs"].indexOf(demande ?? "")));
  if (lieu.error || fiche.error) return <Erreur erreur={lieu.error ?? fiche.error} />;
  if (!lieu.data || !fiche.data) return <Chargement />;
  return <Editeur key={fiche.dataUpdatedAt} lieuId={id} enseigne={lieu.data.enseigne} fiche={fiche.data} ecran={ecran} setEcran={setEcran} />;
}

const ECRANS = ["Le lieu", "Gabarits", "Tarifs et options"] as const;

function Editeur({ lieuId, enseigne, fiche, ecran, setEcran }: { lieuId: number; enseigne: string; fiche: FicheEvenementLieu; ecran: number; setEcran: (n: number) => void }) {
  const client = useQueryClient();
  const router = useRouter();
  const [r, setR] = useState<ReglagesEvenement>(fiche.reglages);
  const modifie = JSON.stringify(r) !== JSON.stringify(fiche.reglages);

  const enregistrer = useMutation({
    mutationFn: () => api<FicheEvenementLieu>(`/lieux/${lieuId}/evenement`, { method: "PUT", json: { reglages: r } }),
    onSuccess: (f) => client.setQueryData(["evenement-lieu", lieuId], f),
  });
  const publier = useMutation({
    mutationFn: () => api<FicheEvenementLieu>(`/lieux/${lieuId}/evenement/publier`, { method: "POST" }),
    onSuccess: (f) => client.setQueryData(["evenement-lieu", lieuId], f),
  });
  const [erreurTelechargement, setErreurTelechargement] = useState<unknown>(null);
  // Le studio s'ouvre sur une autre page : on enregistre d'abord ce qui ne l'est pas (gabarit tout juste coché…)
  const ouvrirStudio = async (g: GabaritEvenement) => {
    if (modifie || !fiche.enregistre) await enregistrer.mutateAsync();
    router.push(`/lieux/${lieuId}/evenement/studio/${g}`);
  };
  const telechargerConfig = (publiee: boolean) =>
    telecharger(`/lieux/${lieuId}/evenement/config.json${publiee ? "?publiee=1" : ""}`).catch(setErreurTelechargement);

  const erreurs = fiche.controles.filter((c) => c.niveau === "erreur");
  const avertissements = fiche.controles.filter((c) => c.niveau === "avertissement");

  return (
    <>
      <EnTete
        titre={`Fiche événement · ${enseigne}`}
        sousTitre={
          <span className="flex flex-wrap items-center gap-2">
            {fiche.code ? <span>Code d&apos;événement <strong className="font-mono">{fiche.code}</strong></span> : <span>Code attribué au premier enregistrement</span>}
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

          {ecran === 0 && <EcranLieu r={r} setR={setR} horaires={fiche.horaires} lieuId={lieuId} />}
          {ecran === 1 && <EcranGabarits r={r} setR={setR} lieuId={lieuId} ouvrirStudio={ouvrirStudio} ouverture={enregistrer.isPending} />}
          {ecran === 2 && <EcranTarifs r={r} setR={setR} />}

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
                {fiche.version > 0 && (
                  <button type="button" className="text-xs text-accent hover:underline" onClick={() => telechargerConfig(true)}>
                    Télécharger la version publiée ({fiche.version})
                  </button>
                )}
              </div>
              {publier.error && <Erreur erreur={publier.error} />}
              {erreurTelechargement !== null && <Erreur erreur={erreurTelechargement} />}
              <p className="text-xs text-ink-muted">
                Les cadres se dessinent au studio, depuis l&apos;écran Gabarits. Le zip de l&apos;événement (cadres, fonds) reste à générer.
              </p>
            </div>
          </Section>
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

function EcranLieu({ r, setR, horaires, lieuId }: PropsEcran & { horaires: FicheEvenementLieu["horaires"]; lieuId: number }) {
  const l = r.lieu;
  const maj = (p: Partial<ReglagesEvenement["lieu"]>) => setR((x) => ({ ...x, lieu: { ...x.lieu, ...p } }));
  const majAssistance = (p: Partial<ReglagesEvenement["lieu"]["assistance"]>) =>
    setR((x) => ({ ...x, lieu: { ...x.lieu, assistance: { ...x.lieu.assistance, ...p } } }));
  const texte = (v: string) => (v.trim() ? v : null);

  return (
    <div className="space-y-4">
      <Section titre="Identité">
        <div className="grid gap-3 sm:grid-cols-2">
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

function EcranGabarits({ r, setR, lieuId, ouvrirStudio, ouverture }: PropsEcran & { lieuId: number; ouvrirStudio: (g: GabaritEvenement) => void; ouverture: boolean }) {
  const { choisis, accueil } = r.gabarits;
  const client = useQueryClient();
  // Relue à chaque retour du studio
  const cadres = useQuery({ queryKey: ["cadres-evenement", lieuId], queryFn: () => api<CadreEvenement[]>(`/lieux/${lieuId}/evenement/cadres`), staleTime: 0 });
  const retirer = useMutation({
    mutationFn: (g: GabaritEvenement) => api(`/lieux/${lieuId}/evenement/cadres/${g}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["cadres-evenement", lieuId] }),
  });
  const maj = (g: Partial<ReglagesEvenement["gabarits"]>) => setR((x) => ({ ...x, gabarits: { ...x.gabarits, ...g } }));
  const basculer = (cle: GabaritEvenement, oui: boolean) =>
    maj(oui ? { choisis: [...choisis, cle] } : { choisis: choisis.filter((c) => c !== cle), accueil: accueil.filter((c) => c !== cle) });
  const deplacer = (i: number, sens: -1 | 1) => {
    const n = [...choisis];
    [n[i], n[i + sens]] = [n[i + sens], n[i]];
    maj({ choisis: n });
  };
  const ordonnes = [...choisis.map((c) => GABARITS.find((g) => g.cle === c)!), ...GABARITS.filter((g) => !choisis.includes(g.cle))];

  return (
    <Section titre="Gabarits du kit nightlife">
      <p className="mb-3 text-sm text-ink-2">
        Cochez les gabarits proposés par la borne, dans l&apos;ordre de l&apos;écran de choix. Pour chaque gabarit coché, le studio dessine son cadre
        aux formats du gabarit ; sans cadre dessiné, la borne garde celui du kit.
      </p>
      <ul className="space-y-2">
        {ordonnes.map((g) => {
          const rang = choisis.indexOf(g.cle);
          const actif = rang >= 0;
          const cadre = cadres.data?.find((c) => c.gabarit === g.cle);
          return (
            <li key={g.cle} className={`flex flex-wrap items-start gap-3 rounded-md border p-3 ${actif ? "border-accent bg-surface" : "border-line bg-surface-2"}`}>
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-accent"
                checked={actif}
                aria-label={`Proposer ${g.nom}`}
                onChange={(e) => basculer(g.cle, e.target.checked)}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {actif && <span className="mr-2 font-mono text-accent">{rang + 1}</span>}
                  {g.nom}
                  {g.qr && <span className="ml-2"><Badge ton="ok">QR · collecte</Badge></span>}
                </p>
                <p className="text-xs text-ink-2">{g.detail}</p>
                {actif && (
                  <label className="mt-2 flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-accent"
                      checked={accueil.includes(g.cle)}
                      onChange={(e) => maj({ accueil: e.target.checked ? choisis.filter((c) => c === g.cle || accueil.includes(c)) : accueil.filter((c) => c !== g.cle) })}
                    />
                    Mis en avant sur l&apos;écran d&apos;accueil
                  </label>
                )}
                {actif && (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {cadre?.vignette && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cadre.vignette} alt={`Cadre ${g.nom}`} className="h-16 w-auto rounded border border-line bg-surface-2 object-contain" />
                    )}
                    <button type="button" className="bouton !py-1 text-xs" disabled={ouverture} onClick={() => ouvrirStudio(g.cle)}>
                      {ouverture ? "Enregistrement…" : cadre ? "Modifier le cadre" : "Ouvrir le studio"}
                    </button>
                    {cadre && (
                      <>
                        <span className="text-xs text-ink-muted">Cadre enregistré le {dateHeure(cadre.updatedAt)}</span>
                        <button
                          type="button"
                          className="text-xs text-crit-ink hover:underline"
                          disabled={retirer.isPending}
                          onClick={() => confirm(`Retirer le cadre de « ${g.nom} » ? La borne reprendra celui du kit.`) && retirer.mutate(g.cle)}
                        >
                          Retirer le cadre
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {actif && (
                <div className="flex gap-1">
                  <button type="button" className="bouton-second !px-2 !py-1 text-xs" disabled={rang === 0} aria-label="Monter" onClick={() => deplacer(rang, -1)}>▲</button>
                  <button type="button" className="bouton-second !px-2 !py-1 text-xs" disabled={rang === choisis.length - 1} aria-label="Descendre" onClick={() => deplacer(rang, 1)}>▼</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {(cadres.error || retirer.error) && <div className="mt-3"><Erreur erreur={cadres.error ?? retirer.error} /></div>}
    </Section>
  );
}

// ─── Écran 3 : tarifs et options ────────────────────────────

/** Saisie d'un montant en euros (« 3,50 »), stocké en centimes. */
function ChampEuros({ cents, onChange, id }: { cents: number; onChange: (c: number) => void; id?: string }) {
  const [texte, setTexte] = useState((cents / 100).toFixed(2).replace(".", ","));
  return (
    <div className="relative">
      <input
        id={id}
        className="champ pr-7 text-right tabular"
        inputMode="decimal"
        value={texte}
        onChange={(e) => {
          setTexte(e.target.value);
          const v = Number(e.target.value.replace(",", ".").replace(/\s/g, ""));
          if (Number.isFinite(v) && v >= 0) onChange(Math.round(v * 100));
        }}
        onBlur={() => setTexte((cents / 100).toFixed(2).replace(".", ","))}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted">€</span>
    </div>
  );
}

const LOTS: { cle: LotJeu; nom: string }[] = [
  { cle: "free", nom: "Photo offerte" },
  { cle: "pct50", nom: "-50 % sur la prochaine" },
  { cle: "pct30", nom: "-30 % sur la prochaine" },
  { cle: "none", nom: "Perdu" },
];

function EcranTarifs({ r, setR }: PropsEcran) {
  const t = r.tarifs;
  const maj = (p: Partial<ReglagesEvenement["tarifs"]>) => setR((x) => ({ ...x, tarifs: { ...x.tarifs, ...p } }));
  const majPalier = (i: number, p: Partial<ReglagesEvenement["tarifs"]["paliers"][number]>) =>
    maj({ paliers: t.paliers.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const totalLots = Object.values(t.jeu.lots).reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-4">
      <Section titre="Prix des tirages">
        <p className="mb-3 text-xs text-ink-muted">Grille dégressive : le prix d&apos;un tirage selon le nombre commandé. Le premier palier est le prix unitaire.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-2">
                <th className="pb-2 font-medium">À partir de</th>
                <th className="pb-2 font-medium">Prix par tirage</th>
                <th className="pb-2 font-medium">Exemple</th>
                <th className="pb-2 font-medium">Mis en avant</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {t.paliers.map((p, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-2 pr-3">
                    <input
                      className="champ w-20 tabular"
                      type="number"
                      min={1}
                      max={50}
                      aria-label="À partir de (tirages)"
                      value={p.de}
                      disabled={i === 0}
                      onChange={(e) => majPalier(i, { de: Number(e.target.value) })}
                    />
                  </td>
                  <td className="py-2 pr-3 w-32"><ChampEuros cents={p.prixCents} onChange={(c) => majPalier(i, { prixCents: c })} /></td>
                  <td className="py-2 pr-3 text-ink-2 tabular">{p.de} × {euros(p.prixCents)} = {euros(p.de * p.prixCents)}</td>
                  <td className="py-2 pr-3">
                    <input type="radio" name="palier-en-avant" className="h-4 w-4 accent-accent" aria-label={`Mettre en avant ${p.de} tirages`} checked={t.palierMisEnAvant === p.de} onChange={() => maj({ palierMisEnAvant: p.de })} />
                  </td>
                  <td className="py-2 text-right">
                    {i > 0 && (
                      <button
                        type="button"
                        className="text-xs text-crit-ink hover:underline"
                        onClick={() => maj({ paliers: t.paliers.filter((_, j) => j !== i), palierMisEnAvant: t.palierMisEnAvant === p.de ? null : t.palierMisEnAvant })}
                      >
                        Retirer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="bouton-second !py-1 text-xs"
            disabled={t.paliers.length >= 10}
            onClick={() => {
              const dernier = t.paliers[t.paliers.length - 1];
              maj({ paliers: [...t.paliers, { de: dernier.de + 1, prixCents: dernier.prixCents }] });
            }}
          >
            + Ajouter un palier
          </button>
          <button type="button" className="text-xs text-accent hover:underline" disabled={t.palierMisEnAvant === null} onClick={() => maj({ palierMisEnAvant: null })}>
            Ne rien mettre en avant
          </button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Champ libelle="Libellé du palier mis en avant">
            <input className="champ" value={t.libelleMisEnAvant} onChange={(e) => maj({ libelleMisEnAvant: e.target.value })} />
          </Champ>
          <Champ libelle="« +1 pour un pote » pendant l'impression" aide="0 € : la question n'est pas posée.">
            <ChampEuros cents={t.plusUnCents} onChange={(c) => maj({ plusUnCents: c })} />
          </Champ>
        </div>
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
