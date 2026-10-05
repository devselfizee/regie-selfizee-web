"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ErreurApi, type LieuFiche, type Referentiel } from "@/lib/api";
import { JOURS_SEMAINE } from "@/lib/format";
import { useReferentiel } from "./Filtres";
import { Chargement } from "./Etat";

// État du formulaire : tout en chaînes (champs HTML), converti à l'envoi.
type Horaire = { jourSemaine: number; ouverture: string; fermeture: string };
type Contact = { role: string; nom: string; prenom: string; email: string; telephone: string };
type Periode = { libelle?: string; motif?: string; debut: string; fin: string };

interface Etat {
  statut: string;
  raisonSociale: string; enseigne: string; siret: string;
  adresse: string; codePostal: string; ville: string; latitude: string; longitude: string;
  typeLieuId: string; sousTypeId: string; standingId: string;
  saisonnalite: string;
  capaciteAccueil: string; frequentationJour: string; frequentationSemaine: string;
  clienteleIds: number[];
  zoneGeoId: string; tailleCommuneId: string; concurrencePhoto: string; concurrencePhotoNotes: string;
  interieurExterieur: string; emplacementZoneId: string; visibilite: string; eclairageId: string;
  dateSignature: string; dateInstallation: string; dureeContratMois: string;
  commercialId: string; origineLeadId: string; notes: string;
  horaires: Horaire[];
  saisons: Periode[];
  fermetures: Periode[];
  contacts: Contact[];
}

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const jourIso = (v: string | null) => (v ? v.slice(0, 10) : "");

function depuisFiche(l?: LieuFiche): Etat {
  return {
    statut: l?.statut ?? "ACTIF",
    raisonSociale: s(l?.raisonSociale), enseigne: s(l?.enseigne), siret: s(l?.siret),
    adresse: s(l?.adresse), codePostal: s(l?.codePostal), ville: s(l?.ville),
    latitude: s(l?.latitude), longitude: s(l?.longitude),
    typeLieuId: s(l?.typeLieuId), sousTypeId: s(l?.sousTypeId), standingId: s(l?.standingId),
    saisonnalite: l?.saisonnalite ?? "ANNUEL",
    capaciteAccueil: s(l?.capaciteAccueil), frequentationJour: s(l?.frequentationJour), frequentationSemaine: s(l?.frequentationSemaine),
    clienteleIds: l?.clienteles.map((c) => c.id) ?? [],
    zoneGeoId: s(l?.zoneGeoId), tailleCommuneId: s(l?.tailleCommuneId),
    concurrencePhoto: l?.concurrencePhoto === null || l?.concurrencePhoto === undefined ? "" : l.concurrencePhoto ? "oui" : "non",
    concurrencePhotoNotes: s(l?.concurrencePhotoNotes),
    interieurExterieur: s(l?.interieurExterieur), emplacementZoneId: s(l?.emplacementZoneId),
    visibilite: s(l?.visibilite), eclairageId: s(l?.eclairageId),
    dateSignature: jourIso(l?.dateSignature ?? null), dateInstallation: jourIso(l?.dateInstallation ?? null),
    dureeContratMois: s(l?.dureeContratMois), commercialId: s(l?.commercialId), origineLeadId: s(l?.origineLeadId),
    notes: s(l?.notes),
    horaires: l?.horaires.map(({ jourSemaine, ouverture, fermeture }) => ({ jourSemaine, ouverture, fermeture })) ?? [],
    saisons: l?.saisons.map((x) => ({ libelle: s(x.libelle), debut: jourIso(x.debut), fin: jourIso(x.fin) })) ?? [],
    fermetures: l?.fermetures.map((x) => ({ motif: s(x.motif), debut: jourIso(x.debut), fin: jourIso(x.fin) })) ?? [],
    contacts: l?.contacts.map((c) => ({ role: c.role, nom: c.nom, prenom: s(c.prenom), email: s(c.email), telephone: s(c.telephone) })) ?? [],
  };
}

const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
const txt = (v: string) => (v.trim() === "" ? null : v.trim());

function versApi(e: Etat) {
  return {
    statut: e.statut,
    raisonSociale: e.raisonSociale, enseigne: e.enseigne, siret: txt(e.siret),
    adresse: txt(e.adresse), codePostal: txt(e.codePostal), ville: txt(e.ville),
    latitude: num(e.latitude), longitude: num(e.longitude),
    typeLieuId: num(e.typeLieuId), sousTypeId: num(e.sousTypeId), standingId: num(e.standingId),
    saisonnalite: e.saisonnalite,
    capaciteAccueil: num(e.capaciteAccueil), frequentationJour: num(e.frequentationJour), frequentationSemaine: num(e.frequentationSemaine),
    clienteleIds: e.clienteleIds,
    zoneGeoId: num(e.zoneGeoId), tailleCommuneId: num(e.tailleCommuneId),
    concurrencePhoto: e.concurrencePhoto === "" ? null : e.concurrencePhoto === "oui",
    concurrencePhotoNotes: txt(e.concurrencePhotoNotes),
    interieurExterieur: txt(e.interieurExterieur), emplacementZoneId: num(e.emplacementZoneId),
    visibilite: num(e.visibilite), eclairageId: num(e.eclairageId),
    dateSignature: txt(e.dateSignature), dateInstallation: txt(e.dateInstallation), dureeContratMois: num(e.dureeContratMois),
    commercialId: num(e.commercialId), origineLeadId: num(e.origineLeadId), notes: txt(e.notes),
    horaires: e.horaires,
    saisons: e.saisons.map((x) => ({ libelle: txt(x.libelle ?? ""), debut: x.debut, fin: x.fin })),
    fermetures: e.fermetures.map((x) => ({ motif: txt(x.motif ?? ""), debut: x.debut, fin: x.fin })),
    contacts: e.contacts.map((c) => ({ role: c.role, nom: c.nom, prenom: txt(c.prenom), email: txt(c.email), telephone: txt(c.telephone) })),
  };
}

export function FormLieu({ lieu }: { lieu?: LieuFiche }) {
  const { data: ref } = useReferentiel();
  if (!ref) return <Chargement />;
  return <Formulaire lieu={lieu} refs={ref} />;
}

function Formulaire({ lieu, refs }: { lieu?: LieuFiche; refs: Referentiel }) {
  const router = useRouter();
  const client = useQueryClient();
  const [e, setE] = useState<Etat>(() => depuisFiche(lieu));
  const set = (patch: Partial<Etat>) => setE((prev) => ({ ...prev, ...patch }));

  const enregistrer = useMutation({
    mutationFn: () =>
      lieu
        ? api<{ id: number }>(`/lieux/${lieu.id}`, { method: "PUT", json: versApi(e) })
        : api<{ id: number }>("/lieux", { method: "POST", json: versApi(e) }),
    onSuccess: (res) => {
      client.invalidateQueries({ queryKey: ["lieux"] });
      client.invalidateQueries({ queryKey: ["lieu", res.id] });
      router.push(`/lieux/${res.id}`);
    },
  });
  const erreurs = new Map(
    enregistrer.error instanceof ErreurApi ? (enregistrer.error.corps.champs ?? []).map((c) => [c.chemin, c.message]) : []
  );

  const options = (cat: string, parentId?: string) =>
    (refs.listes[cat] ?? [])
      .filter((v) => v.actif && (parentId === undefined || String(v.parentId) === parentId))
      .map((v) => ({ value: String(v.id), label: v.libelle }));

  const champ = (cle: keyof Etat, libelle: string, props: { type?: string; requis?: boolean; placeholder?: string } = {}) => (
    <Champ libelle={libelle} erreur={erreurs.get(cle)} requis={props.requis}>
      <input
        className="champ"
        type={props.type ?? "text"}
        placeholder={props.placeholder}
        required={props.requis}
        value={e[cle] as string}
        onChange={(ev) => set({ [cle]: ev.target.value } as Partial<Etat>)}
      />
    </Champ>
  );
  const select = (cle: keyof Etat, libelle: string, opts: { value: string; label: string }[], requis = false) => (
    <Champ libelle={libelle} erreur={erreurs.get(cle)} requis={requis}>
      <select className="champ" required={requis} value={e[cle] as string} onChange={(ev) => set({ [cle]: ev.target.value } as Partial<Etat>)}>
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Champ>
  );

  return (
    <form
      className="space-y-5"
      onSubmit={(ev) => {
        ev.preventDefault();
        enregistrer.mutate();
      }}
    >
      <Bloc titre="Identité">
        {champ("enseigne", "Enseigne", { requis: true })}
        {champ("raisonSociale", "Raison sociale", { requis: true })}
        {champ("siret", "SIRET", { placeholder: "14 chiffres" })}
        {select("statut", "Statut", [
          { value: "ACTIF", label: "Actif" },
          { value: "SUSPENDU", label: "Suspendu" },
          { value: "RESILIE", label: "Résilié" },
          { value: "PROSPECT", label: "Prospect" },
        ], true)}
        {champ("adresse", "Adresse")}
        {champ("codePostal", "Code postal")}
        {champ("ville", "Ville")}
        <div className="grid grid-cols-2 gap-2">
          {champ("latitude", "Latitude")}
          {champ("longitude", "Longitude")}
        </div>
      </Bloc>

      <Bloc titre="Segment">
        {select("typeLieuId", "Type de lieu", options("TYPE_LIEU"), true)}
        {select("sousTypeId", "Sous-type", options("SOUS_TYPE_LIEU", e.typeLieuId))}
        {select("standingId", "Standing", options("STANDING"))}
      </Bloc>

      <Bloc titre="Fréquentation">
        {champ("capaciteAccueil", "Capacité d'accueil", { type: "number" })}
        {champ("frequentationJour", "Fréquentation estimée / jour", { type: "number" })}
        {champ("frequentationSemaine", "Fréquentation estimée / semaine", { type: "number" })}
        <div className="sm:col-span-2 lg:col-span-3">
          <span className="etiquette">Clientèle dominante</span>
          <div className="flex flex-wrap gap-2">
            {options("CLIENTELE").map((o) => {
              const id = Number(o.value);
              const coche = e.clienteleIds.includes(id);
              return (
                <label key={o.value} className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${coche ? "border-accent bg-accent/10 text-ink" : "border-line-strong text-ink-2"}`}>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={coche}
                    onChange={() => set({ clienteleIds: coche ? e.clienteleIds.filter((x) => x !== id) : [...e.clienteleIds, id] })}
                  />
                  {coche ? "✓ " : ""}{o.label}
                </label>
              );
            })}
          </div>
        </div>
      </Bloc>

      <Bloc titre="Environnement">
        {select("zoneGeoId", "Zone", options("ZONE_GEO"))}
        {select("tailleCommuneId", "Taille de la commune", options("TAILLE_COMMUNE"))}
        {select("concurrencePhoto", "Concurrence photo à proximité", [
          { value: "oui", label: "Oui" },
          { value: "non", label: "Non" },
        ])}
        <div className="sm:col-span-2 lg:col-span-3">{champ("concurrencePhotoNotes", "Détail de la concurrence")}</div>
      </Bloc>

      <Bloc titre="Emplacement de la borne">
        {select("interieurExterieur", "Intérieur / extérieur", [
          { value: "INTERIEUR", label: "Intérieur" },
          { value: "EXTERIEUR", label: "Extérieur" },
          { value: "MIXTE", label: "Mixte" },
        ])}
        {select("emplacementZoneId", "Zone dans le lieu", options("EMPLACEMENT_ZONE"))}
        {select("visibilite", "Visibilité (1 à 5)", [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: "★".repeat(n) + ` (${n})` })))}
        {select("eclairageId", "Éclairage", options("ECLAIRAGE"))}
      </Bloc>

      <Bloc titre="Commercial">
        {champ("dateSignature", "Date de signature", { type: "date" })}
        {champ("dateInstallation", "Date d'installation", { type: "date" })}
        {champ("dureeContratMois", "Durée du contrat (mois)", { type: "number" })}
        {select("commercialId", "Commercial responsable", refs.commerciaux.map((c) => ({ value: String(c.id), label: `${c.prenom} ${c.nom}` })))}
        {select("origineLeadId", "Origine du lead", options("ORIGINE_LEAD"))}
      </Bloc>

      <Bloc titre="Activité" colonnes={1}>
        <div className="max-w-xs">
          {select("saisonnalite", "Saisonnalité", [
            { value: "ANNUEL", label: "Ouvert toute l'année" },
            { value: "SAISONNIER", label: "Saisonnier" },
          ], true)}
        </div>
        <Liste
          titre="Horaires d'ouverture"
          aide="Une fermeture avant l'ouverture signifie le lendemain (ex. 23:00 → 05:00)."
          lignes={e.horaires}
          nouvelle={{ jourSemaine: 1, ouverture: "10:00", fermeture: "19:00" }}
          onChange={(horaires) => set({ horaires })}
          rendu={(h, maj) => (
            <>
              <select className="champ" aria-label="Jour" value={h.jourSemaine} onChange={(ev) => maj({ jourSemaine: Number(ev.target.value) })}>
                {[1, 2, 3, 4, 5, 6, 7].map((j) => <option key={j} value={j}>{JOURS_SEMAINE[j]}</option>)}
              </select>
              <input className="champ" type="time" aria-label="Ouverture" value={h.ouverture} onChange={(ev) => maj({ ouverture: ev.target.value })} />
              <input className="champ" type="time" aria-label="Fermeture" value={h.fermeture} onChange={(ev) => maj({ fermeture: ev.target.value })} />
            </>
          )}
        />
        {e.saisonnalite === "SAISONNIER" && (
          <Liste
            titre="Saisons d'ouverture"
            lignes={e.saisons}
            nouvelle={{ libelle: "", debut: "", fin: "" }}
            onChange={(saisons) => set({ saisons })}
            rendu={(x, maj) => (
              <>
                <input className="champ" placeholder="Libellé (Été 2027)" aria-label="Libellé" value={x.libelle} onChange={(ev) => maj({ libelle: ev.target.value })} />
                <input className="champ" type="date" required aria-label="Début" value={x.debut} onChange={(ev) => maj({ debut: ev.target.value })} />
                <input className="champ" type="date" required aria-label="Fin" value={x.fin} onChange={(ev) => maj({ fin: ev.target.value })} />
              </>
            )}
          />
        )}
        <Liste
          titre="Fermetures exceptionnelles"
          lignes={e.fermetures}
          nouvelle={{ motif: "", debut: "", fin: "" }}
          onChange={(fermetures) => set({ fermetures })}
          rendu={(x, maj) => (
            <>
              <input className="champ" placeholder="Motif" aria-label="Motif" value={x.motif} onChange={(ev) => maj({ motif: ev.target.value })} />
              <input className="champ" type="date" required aria-label="Début" value={x.debut} onChange={(ev) => maj({ debut: ev.target.value })} />
              <input className="champ" type="date" required aria-label="Fin" value={x.fin} onChange={(ev) => maj({ fin: ev.target.value })} />
            </>
          )}
        />
      </Bloc>

      <Bloc titre="Contacts" colonnes={1}>
        <Liste
          titre=""
          lignes={e.contacts}
          nouvelle={{ role: "GERANT", nom: "", prenom: "", email: "", telephone: "" }}
          onChange={(contacts) => set({ contacts })}
          rendu={(c, maj) => (
            <>
              <select className="champ" aria-label="Rôle" value={c.role} onChange={(ev) => maj({ role: ev.target.value })}>
                <option value="GERANT">Gérant</option>
                <option value="REFERENT_SUR_PLACE">Référent sur place</option>
                <option value="COMPTABILITE">Comptabilité</option>
                <option value="AUTRE">Autre</option>
              </select>
              <input className="champ" placeholder="Nom" required aria-label="Nom" value={c.nom} onChange={(ev) => maj({ nom: ev.target.value })} />
              <input className="champ" placeholder="Prénom" aria-label="Prénom" value={c.prenom} onChange={(ev) => maj({ prenom: ev.target.value })} />
              <input className="champ" type="email" placeholder="E-mail" aria-label="E-mail" value={c.email} onChange={(ev) => maj({ email: ev.target.value })} />
              <input className="champ" placeholder="Téléphone" aria-label="Téléphone" value={c.telephone} onChange={(ev) => maj({ telephone: ev.target.value })} />
            </>
          )}
        />
      </Bloc>

      <Bloc titre="Notes" colonnes={1}>
        <textarea className="champ min-h-24" value={e.notes} onChange={(ev) => set({ notes: ev.target.value })} />
      </Bloc>

      {enregistrer.error && (
        <div role="alert" className="rounded-md bg-crit-bg px-4 py-3 text-sm text-crit-ink">
          {erreurs.size ? "Certains champs sont invalides : " + [...erreurs.entries()].map(([k, m]) => `${k} (${m})`).join(", ") : enregistrer.error.message}
        </div>
      )}
      <div className="sticky bottom-0 flex gap-2 border-t border-line bg-page/95 py-3 backdrop-blur">
        <button className="bouton" disabled={enregistrer.isPending}>
          {enregistrer.isPending ? "Enregistrement…" : lieu ? "Enregistrer" : "Créer le lieu"}
        </button>
        <button type="button" className="bouton-second" onClick={() => router.back()}>Annuler</button>
      </div>
    </form>
  );
}

function Bloc({ titre, children, colonnes = 3 }: { titre: string; children: ReactNode; colonnes?: 1 | 3 }) {
  return (
    <fieldset className="carte p-4">
      <legend className="px-1 text-sm font-semibold">{titre}</legend>
      <div className={colonnes === 3 ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3" : "space-y-4"}>{children}</div>
    </fieldset>
  );
}

function Champ({ libelle, erreur, requis, children }: { libelle: string; erreur?: string; requis?: boolean; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="etiquette">
        {libelle}
        {requis && <span className="text-bad"> *</span>}
      </span>
      {children}
      {erreur && <span className="mt-1 block text-xs text-bad">{erreur}</span>}
    </label>
  );
}

function Liste<T>({
  titre,
  aide,
  lignes,
  nouvelle,
  onChange,
  rendu,
}: {
  titre: string;
  aide?: string;
  lignes: T[];
  nouvelle: T;
  onChange: (l: T[]) => void;
  rendu: (ligne: T, maj: (patch: Partial<T>) => void) => ReactNode;
}) {
  return (
    <div>
      {titre && <div className="etiquette">{titre}</div>}
      {aide && <p className="mb-2 text-xs text-ink-muted">{aide}</p>}
      <div className="space-y-2">
        {lignes.map((l, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 [&>*]:min-w-32 [&>*]:flex-1">
            {rendu(l, (patch) => onChange(lignes.map((x, j) => (j === i ? { ...x, ...patch } : x))))}
            <button type="button" className="bouton-second !min-w-0 !flex-none" aria-label="Supprimer la ligne" onClick={() => onChange(lignes.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="mt-2 text-sm font-medium text-accent hover:underline" onClick={() => onChange([...lignes, nouvelle])}>
        + Ajouter
      </button>
    </div>
  );
}
