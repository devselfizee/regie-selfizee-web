"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, fichierProtege, libelleTypeMedia, qs, telecharger, type MediaDetail, type MediaResume, type PageMedias, type ResumeMedias } from "@/lib/api";
import { Badge, Chargement, Erreur, Vide } from "@/components/Etat";
import { Modale } from "@/components/Modale";
import { date, dateHeure, euros, libelleMoyen, nombre } from "@/lib/format";

// Galerie des médias reçus de PikCloud pour un lieu (onglet Galerie de la fiche lieu) : les photos et vidéos
// des séances, par événement. Les vignettes arrivent avec la liste ; le fichier en taille réelle est lu avec
// le jeton à l'ouverture (fichierProtege), jamais par un lien direct.

const PAR_PAGE = 48;

const STATUTS: Record<MediaResume["statut"], string> = {
  ABSENT: "Pas encore annoncé",
  A_TELECHARGER: "En attente de téléchargement",
  TELECHARGE: "Reçu",
  ERREUR: "Téléchargement en erreur",
  PURGE: "Fichier purgé",
};

const octets = (n: number | null) => (n === null ? "—" : n < 1024 * 1024 ? `${Math.round(n / 1024)} Ko` : `${(n / 1024 / 1024).toFixed(1)} Mo`);

const libelleEvenement = (e: { code: string; nom: string | null; habituel: boolean }) => (e.habituel ? `Événement habituel · ${e.code}` : `${e.nom ?? "Événement"} · ${e.code}`);

/** Paramètre « evenement » de l'adresse, posé par le lien « Galerie » de la fiche événement. */
const evenementDemande = () => (typeof window === "undefined" ? "" : new URL(window.location.href).searchParams.get("evenement") ?? "");

export function GalerieMedias({ lieuId }: { lieuId: number }) {
  const [evenement, setEvenement] = useState(evenementDemande);
  const [type, setType] = useState("");
  const [du, setDu] = useState("");
  const [au, setAu] = useState("");
  const [tests, setTests] = useState(false);
  const [page, setPage] = useState(1);
  const [ouvert, setOuvert] = useState<string | null>(null);

  const resume = useQuery({ queryKey: ["medias-resume", lieuId], queryFn: () => api<ResumeMedias>(`/lieux/${lieuId}/medias/resume`) });
  const filtres = { evenement, type, du, au, tests: tests ? "1" : "", page, parPage: PAR_PAGE };
  const liste = useQuery({
    queryKey: ["medias", lieuId, filtres],
    queryFn: () => api<PageMedias>(`/lieux/${lieuId}/medias${qs(filtres)}`),
    placeholderData: keepPreviousData,
  });

  const changer = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const r = resume.data;
  const pages = liste.data ? Math.max(1, Math.ceil(liste.data.total / PAR_PAGE)) : 1;

  return (
    <div className="space-y-4">
      {r && (
        <p className="text-sm text-ink-2">
          <span className="font-semibold tabular text-ink">{nombre(r.total)}</span> {r.total > 1 ? "médias reçus" : "média reçu"}
          {r.derniere && <> · dernière séance le {dateHeure(r.derniere)}</>}
          {r.parType.length > 0 && <> · {r.parType.map((t) => `${nombre(t.total)} ${libelleTypeMedia(t.type).toLowerCase()}`).join(", ")}</>}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="etiquette">Événement</span>
          <select id="galerie-evenement" className="champ" value={evenement} onChange={(e) => changer(setEvenement)(e.target.value)}>
            <option value="">Tous</option>
            {r?.parEvenement.map((e) => (
              <option key={e.id} value={e.id}>
                {libelleEvenement(e)} ({e.total})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="etiquette">Type</span>
          <select id="galerie-type" className="champ" value={type} onChange={(e) => changer(setType)(e.target.value)}>
            <option value="">Tous</option>
            {r?.parType.map((t) => (
              <option key={t.type} value={t.type}>
                {libelleTypeMedia(t.type)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="etiquette">Du</span>
          <input type="date" className="champ" value={du} onChange={(e) => changer(setDu)(e.target.value)} />
        </label>
        <label className="block">
          <span className="etiquette">Au</span>
          <input type="date" className="champ" value={au} onChange={(e) => changer(setAu)(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={tests} onChange={(e) => changer(setTests)(e.target.checked)} />
          Montrer les séances de test
        </label>
      </div>

      {liste.error ? (
        <Erreur erreur={liste.error} />
      ) : !liste.data ? (
        <Chargement />
      ) : liste.data.medias.length === 0 ? (
        <Vide>{r && r.total === 0 ? "Aucun média reçu pour ce lieu. Ils arrivent de PikCloud quelques minutes après chaque séance sur la borne." : "Aucun média ne correspond à ces filtres."}</Vide>
      ) : (
        <>
          <ul className={`grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 ${liste.isPlaceholderData ? "opacity-60" : ""}`}>
            {liste.data.medias.map((m) => (
              <li key={m.uuid}>
                <button
                  type="button"
                  onClick={() => setOuvert(m.uuid)}
                  className="group relative block w-full overflow-hidden rounded-md border border-line bg-surface-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  title={`${libelleTypeMedia(m.type)} · ${dateHeure(m.datePhoto)}`}
                >
                  <Vignette m={m} />
                  <span className="absolute bottom-1 left-1 flex gap-1">
                    <span className="rounded bg-ink/70 px-1.5 py-0.5 text-[0.65rem] font-medium text-white">{libelleTypeMedia(m.type)}</span>
                    {m.test && <span className="rounded bg-warn-bg px-1.5 py-0.5 text-[0.65rem] font-medium text-warn-ink">test</span>}
                  </span>
                  {m.nbTirages !== null && m.nbTirages > 0 && (
                    <span className="absolute right-1 top-1 rounded bg-surface/90 px-1.5 py-0.5 text-[0.65rem] text-ink shadow" title="Tirages">
                      {m.nbTirages} 🖨
                    </span>
                  )}
                </button>
                <p className="mt-1 truncate text-xs text-ink-muted">{m.datePhoto ? dateHeure(m.datePhoto) : "Date inconnue"}</p>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <button type="button" className="bouton-second" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                ← Précédents
              </button>
              <span className="text-ink-2">
                Page {page} / {pages} · {nombre(liste.data.total)} médias
              </span>
              <button type="button" className="bouton-second" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Suivants →
              </button>
            </div>
          )}
        </>
      )}

      {ouvert && <DetailMedia uuid={ouvert} onFermer={() => setOuvert(null)} />}
    </div>
  );
}

function Vignette({ m }: { m: MediaResume }) {
  if (m.vignette) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={m.vignette} alt="" className="aspect-square w-full object-cover transition group-hover:scale-105" />;
  }
  return (
    <span className="flex aspect-square w-full flex-col items-center justify-center gap-1 text-ink-muted">
      <span aria-hidden className="text-3xl">{m.video ? "▶" : m.statut === "TELECHARGE" ? "🖼" : "⏳"}</span>
      <span className="px-2 text-center text-[0.7rem]">{m.video && m.statut === "TELECHARGE" ? "Vidéo" : STATUTS[m.statut]}</span>
    </span>
  );
}

function DetailMedia({ uuid, onFermer }: { uuid: string; onFermer: () => void }) {
  const detail = useQuery({ queryKey: ["media", uuid], queryFn: () => api<MediaDetail>(`/medias/${uuid}`) });
  const m = detail.data;
  const [url, setUrl] = useState<string | null>(null);
  const [erreurFichier, setErreurFichier] = useState<unknown>(null);

  // Le fichier en taille réelle, lu avec le jeton ; l'URL d'objet est libérée à la fermeture
  useEffect(() => {
    if (!m || m.statut !== "TELECHARGE") return;
    let actif = true;
    let courante: string | null = null;
    fichierProtege(`/medias/${uuid}/fichier`)
      .then((u) => {
        if (!actif) return URL.revokeObjectURL(u);
        courante = u;
        setUrl(u);
      })
      .catch((e) => actif && setErreurFichier(e));
    return () => {
      actif = false;
      if (courante) URL.revokeObjectURL(courante);
    };
  }, [uuid, m]);

  const titre = m ? `${libelleTypeMedia(m.type)} · ${m.datePhoto ? dateHeure(m.datePhoto) : m.filename}` : "Média";

  return (
    <Modale titre={titre} ouverte onFermer={onFermer} large>
      <div className="p-4">
        {detail.error ? (
          <Erreur erreur={detail.error} />
        ) : !m ? (
          <Chargement />
        ) : (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="flex min-h-64 items-center justify-center rounded-md bg-surface-2">
              {m.statut !== "TELECHARGE" ? (
                <p className="p-6 text-center text-sm text-ink-muted">{STATUTS[m.statut]}{m.derniereErreur ? ` : ${m.derniereErreur}` : ""}</p>
              ) : erreurFichier ? (
                <Erreur erreur={erreurFichier} />
              ) : !url ? (
                <Chargement texte="Chargement du fichier…" />
              ) : m.video ? (
                <video src={url} controls className="max-h-[60vh] w-full rounded-md" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" className="max-h-[60vh] w-full rounded-md object-contain" />
              )}
            </div>
            <dl className="space-y-2 text-sm">
              <Ligne l="Événement">{m.evenement ? libelleEvenement(m.evenement) : <span className="text-warn-ink">Inconnu ({m.codeEvent})</span>}</Ligne>
              <Ligne l="Borne">{m.borne}</Ligne>
              <Ligne l="Prise de vue">{dateHeure(m.datePhoto)}</Ligne>
              <Ligne l="Premier tirage">{m.datePrint ? dateHeure(m.datePrint) : "Aucun"}</Ligne>
              <Ligne l="Tirages">{m.nbTirages ?? "—"}</Ligne>
              <Ligne l="Fichier">
                {m.nomFichier ?? (m.extension ? `${m.filename}.${m.extension}` : m.filename)}
                {m.taille !== null && <span className="text-xs text-ink-muted"> · {octets(m.taille)}</span>}
              </Ligne>
              <Ligne l="État">
                <Badge ton={m.statut === "TELECHARGE" ? "ok" : m.statut === "ERREUR" ? "crit" : "neutre"}>{STATUTS[m.statut]}</Badge>
                {m.test && <Badge ton="warn">Séance de test</Badge>}
              </Ligne>
              <Ligne l="Vente">
                {m.vente ? (
                  <>
                    {euros(m.vente.montantTtcCents)} · {libelleMoyen(m.vente.moyenPaiement, m.vente.statut)} · {m.vente.statut.toLowerCase()}
                    <span className="block text-xs text-ink-muted">{dateHeure(m.vente.horodatage)}</span>
                  </>
                ) : m.photoUuid ? (
                  <span className="text-ink-muted">Aucune vente avec ce photo_uuid</span>
                ) : (
                  <span className="text-ink-muted">JSON de séance pas encore reçu</span>
                )}
              </Ligne>
              {m.parcours && <Ligne l="Parcours invité">{m.parcours.issue} · {m.parcours.dureeS} s</Ligne>}
              <Ligne l="Reçu le">{date(m.recuLe)}</Ligne>
              {m.photoUuid && (
                <Ligne l="photo_uuid">
                  <span className="break-all font-mono text-xs">{m.photoUuid}</span>
                </Ligne>
              )}
            </dl>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          {m?.statut === "TELECHARGE" && (
            <button type="button" className="bouton-second" onClick={() => telecharger(`/medias/${uuid}/fichier?telecharger=1`)}>
              <span aria-hidden>↓</span> Télécharger
            </button>
          )}
          <button type="button" className="bouton" onClick={onFermer}>
            Fermer
          </button>
        </div>
      </div>
    </Modale>
  );
}

function Ligne({ l, children }: { l: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{l}</dt>
      <dd className="flex flex-wrap items-center gap-1">{children}</dd>
    </div>
  );
}
