"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { usePerm } from "@/lib/perms";
import { Erreur, Section } from "./Etat";
import { Modale } from "./Modale";

// Accès au lieu (retour de Sébastien) : où sont les clés (texte et photos), quand joindre les contacts
// (boîtes de nuit : souvent le soir seulement). Texte riche simple, nettoyé par l'API.

interface PhotoCles {
  id: number;
  legende: string | null;
  vignette: string;
  createdAt: string;
  creePar: { prenom: string; nom: string } | null;
}

export function AccesLieu({ lieuId, localisationCles, disponibiliteContacts }: { lieuId: number; localisationCles: string | null; disponibiliteContacts: string | null }) {
  const peutModifier = usePerm("lieux.edit");
  return (
    <Section titre="Accès et disponibilités">
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <ChampRiche lieuId={lieuId} cle="localisationCles" titre="Localisation des clés" valeur={localisationCles} peutModifier={peutModifier} vide="Pas encore renseignée : où trouver les clés, à qui les demander…" />
          <PhotosCles lieuId={lieuId} peutModifier={peutModifier} />
        </div>
        <ChampRiche
          lieuId={lieuId}
          cle="disponibiliteContacts"
          titre="Disponibilité du / des contacts"
          valeur={disponibiliteContacts}
          peutModifier={peutModifier}
          vide="Pas encore renseignée : quand joindre les contacts (ex. : seulement le soir, après 20 h)."
        />
      </div>
    </Section>
  );
}

/** Un texte riche de la fiche : affiché, et modifiable sur place avec un petit éditeur (gras, italique, liste) */
function ChampRiche({ lieuId, cle, titre, valeur, peutModifier, vide }: { lieuId: number; cle: "localisationCles" | "disponibiliteContacts"; titre: string; valeur: string | null; peutModifier: boolean; vide: string }) {
  const client = useQueryClient();
  const [edition, setEdition] = useState(false);
  const editeur = useRef<HTMLDivElement>(null);
  const enregistrer = useMutation({
    mutationFn: (html: string) => api(`/lieux/${lieuId}/acces`, { method: "PATCH", json: { [cle]: html } }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["lieu", lieuId] });
      setEdition(false);
    },
  });
  useEffect(() => {
    if (edition && editeur.current) {
      editeur.current.innerHTML = valeur ?? "";
      editeur.current.focus();
    }
  }, [edition, valeur]);
  // execCommand : déprécié mais partout disponible, et suffisant pour gras / italique / listes
  const commande = (c: string) => {
    document.execCommand(c);
    editeur.current?.focus();
  };

  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{titre}</h3>
        {peutModifier && !edition && (
          <button type="button" className="text-xs text-accent hover:underline" onClick={() => setEdition(true)}>
            Modifier
          </button>
        )}
      </div>
      {edition ? (
        <div className="space-y-2">
          <div className="flex gap-1" role="toolbar" aria-label={`Mise en forme : ${titre}`}>
            {[
              ["bold", "G", "Gras", "font-bold"],
              ["italic", "I", "Italique", "italic"],
              ["underline", "S", "Souligné", "underline"],
              ["insertUnorderedList", "•", "Liste", ""],
            ].map(([c, l, aide, cls]) => (
              // onMouseDown : garder la sélection dans l'éditeur
              <button key={c} type="button" title={aide} aria-label={aide} className={`bouton-second !px-2.5 !py-0.5 ${cls}`} onMouseDown={(e) => { e.preventDefault(); commande(c); }}>
                {l}
              </button>
            ))}
          </div>
          <div
            ref={editeur}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline
            aria-label={titre}
            className="champ texte-riche min-h-28"
          />
          {enregistrer.error && <Erreur erreur={enregistrer.error} />}
          <div className="flex gap-2">
            <button type="button" className="bouton" disabled={enregistrer.isPending} onClick={() => enregistrer.mutate(editeur.current?.innerHTML ?? "")}>
              Enregistrer
            </button>
            <button type="button" className="bouton-second" onClick={() => setEdition(false)}>
              Annuler
            </button>
          </div>
        </div>
      ) : valeur ? (
        // HTML nettoyé par l'API (balises de mise en forme seulement, sans attribut)
        <div className="texte-riche text-sm" dangerouslySetInnerHTML={{ __html: valeur }} />
      ) : (
        <p className="text-sm text-ink-muted">{vide}</p>
      )}
    </div>
  );
}

/** Photos de la localisation des clés : vignettes, agrandies au clic ; ajout et retrait avec lieux.edit */
function PhotosCles({ lieuId, peutModifier }: { lieuId: number; peutModifier: boolean }) {
  const client = useQueryClient();
  const fichier = useRef<HTMLInputElement>(null);
  const [ouverte, setOuverte] = useState<PhotoCles | null>(null);
  const photos = useQuery({ queryKey: ["photos-cles", lieuId], queryFn: () => api<PhotoCles[]>(`/lieux/${lieuId}/photos-cles`) });
  const grande = useQuery({
    queryKey: ["photo-cles", lieuId, ouverte?.id],
    queryFn: () => api<{ image: string }>(`/lieux/${lieuId}/photos-cles/${ouverte!.id}`),
    enabled: !!ouverte,
  });
  const ajouter = useMutation({
    mutationFn: async (f: File) => {
      const image = await new Promise<string>((ok, ko) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result));
        r.onerror = () => ko(new Error("Lecture du fichier impossible"));
        r.readAsDataURL(f);
      });
      return api(`/lieux/${lieuId}/photos-cles`, { method: "POST", json: { image } });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["photos-cles", lieuId] }),
  });
  const retirer = useMutation({
    mutationFn: (id: number) => api(`/lieux/${lieuId}/photos-cles/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setOuverte(null);
      client.invalidateQueries({ queryKey: ["photos-cles", lieuId] });
    },
  });
  const liste = photos.data ?? [];
  if (!liste.length && !peutModifier) return null;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {liste.map((p) => (
          <button key={p.id} type="button" onClick={() => setOuverte(p)} className="overflow-hidden rounded-md border border-line hover:border-accent" title={p.legende ?? "Agrandir"}>
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
            <img src={p.vignette} alt={p.legende ?? "Photo des clés"} className="h-20 w-20 object-cover" />
          </button>
        ))}
        {peutModifier && (
          <>
            <button
              type="button"
              className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed border-line-strong text-xs text-ink-2 hover:border-accent hover:text-accent"
              onClick={() => fichier.current?.click()}
              disabled={ajouter.isPending}
            >
              {ajouter.isPending ? "Envoi…" : "+ Photo"}
            </button>
            <input
              ref={fichier}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/bmp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) ajouter.mutate(f);
                e.target.value = "";
              }}
            />
          </>
        )}
      </div>
      {(ajouter.error || photos.error) && <Erreur erreur={ajouter.error ?? photos.error} />}
      <Modale titre={ouverte?.legende ?? "Localisation des clés"} large ouverte={ouverte !== null} onFermer={() => setOuverte(null)}>
        {grande.data ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL
          <img src={grande.data.image} alt={ouverte?.legende ?? "Photo des clés"} className="mx-auto max-h-[70vh] rounded-md" />
        ) : (
          <p className="text-sm text-ink-muted">Chargement…</p>
        )}
        <div className="mt-3 flex items-center justify-between text-xs text-ink-muted">
          <span>{ouverte?.creePar ? `Ajoutée par ${ouverte.creePar.prenom} ${ouverte.creePar.nom}` : ""}</span>
          {peutModifier && ouverte && (
            <button type="button" className="text-bad hover:underline" disabled={retirer.isPending} onClick={() => confirm("Retirer cette photo ?") && retirer.mutate(ouverte.id)}>
              Retirer la photo
            </button>
          )}
        </div>
      </Modale>
    </div>
  );
}
