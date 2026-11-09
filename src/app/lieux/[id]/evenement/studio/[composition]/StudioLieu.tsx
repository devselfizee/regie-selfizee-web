"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ErreurApi, MAX_COMPOSITIONS, type FicheEvenementLieu, type GabaritEvenement } from "@/lib/api";
import { PageGuard } from "@/lib/perms";
import { Chargement, Erreur } from "@/components/Etat";
import { nouvelId } from "@/lib/gabaritsEvenement";
import { StudioRegie, type CadreARouvrir, type Depart } from "@/studio/regie/StudioRegie";
import { ChoixDepartNouveau, ChoixFormatKit } from "@/studio/regie/ChoixFormatKit";
import { FORMATS_KIT } from "@/studio/regie/formatsKit";
import { cheminsEvenement } from "../../FicheEvenement";

/** `compositionId` « nouveau » : format ajouté depuis la fiche, choisi à l'étape 1 du studio. */
export function StudioLieu({ lieuId, compositionId, eid }: { lieuId: number; compositionId: string; eid?: number }) {
  return (
    <PageGuard perm="evenements.edit">
      <Chargeur lieuId={lieuId} compositionId={compositionId} eid={eid} />
    </PageGuard>
  );
}

/** Nom d'une composition : « Pola 1 pose », numéroté quand le gabarit revient (« Pola 1 pose · 2 »). */
const libelleDe = (gabarit: GabaritEvenement, rang: number, total: number) => (total > 1 ? `${FORMATS_KIT[gabarit].libelle} · ${rang}` : FORMATS_KIT[gabarit].libelle);

function Chargeur({ lieuId, compositionId, eid }: { lieuId: number; compositionId: string; eid?: number }) {
  const chemins = cheminsEvenement(lieuId, eid);
  const nouveau = compositionId === "nouveau";
  const cleFiche = ["evenement-lieu", lieuId, eid ?? "habituel"];
  const fiche = useQuery({ queryKey: cleFiche, queryFn: () => api<FicheEvenementLieu>(chemins.api) });
  // Pas encore de cadre pour cette composition : on part de zéro
  const cadre = useQuery({
    queryKey: ["cadre-evenement", chemins.api, compositionId],
    queryFn: () =>
      api<CadreARouvrir>(`${chemins.api}/cadres/${compositionId}`).catch((e) => {
        if (e instanceof ErreurApi && e.status === 404) return null;
        throw e;
      }),
    enabled: !nouveau,
    // Relu à chaque ouverture (« Modifier le cadre » doit rouvrir le dernier enregistré), jamais en
    // arrière-plan pendant qu'on dessine : le studio garde son propre état
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const composition = fiche.data?.reglages.gabarits.choisis.find((c) => c.id === compositionId);
  const retour = (
    <Link href={chemins.page} className="bouton-second">← Fiche événement</Link>
  );
  if (fiche.error || (!nouveau && cadre.error)) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-10">
        <Erreur erreur={fiche.error ?? cadre.error} />
        {retour}
      </div>
    );
  }
  if (!fiche.data || (!nouveau && cadre.data === undefined)) return <Chargement />;
  const nom = fiche.data.habituel ? fiche.data.reglages.lieu.nom : `${fiche.data.reglages.lieu.nom} · ${fiche.data.nom}`;
  if (nouveau) return <NouveauFormat fiche={fiche.data} nomLieu={nom} apiEvenement={chemins.api} pageRetour={chemins.page} cleFiche={cleFiche} />;
  if (!composition) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-10">
        <p className="text-sm text-ink-2">Ce format n&apos;est pas (ou plus) dans l&apos;événement : enregistrez la fiche avant d&apos;ouvrir le studio.</p>
        {retour}
      </div>
    );
  }
  const memes = fiche.data.reglages.gabarits.choisis.filter((c) => c.gabarit === composition.gabarit);

  return (
    <StudioRegie
      gabarit={composition.gabarit}
      nomLieu={nom}
      cadre={cadre.data ?? null}
      apiCadre={`${chemins.api}/cadres/${compositionId}`}
      pageRetour={chemins.page}
      libelle={libelleDe(composition.gabarit, memes.indexOf(composition) + 1, memes.length)}
    />
  );
}

/**
 * « Ajouter un format » : étape 1 (modèle vierge ou catalogue), étape 2 (format du kit), puis le studio à
 * l'étape 3 (modèle). Le format n'entre dans l'événement qu'au premier enregistrement de son cadre :
 * abandonner en route ne laisse pas de format vide dans la fiche.
 */
function NouveauFormat({ fiche, nomLieu, apiEvenement, pageRetour, cleFiche }: {
  fiche: FicheEvenementLieu;
  nomLieu: string;
  apiEvenement: string;
  pageRetour: string;
  cleFiche: unknown[];
}) {
  const router = useRouter();
  const client = useQueryClient();
  const [depart, setDepart] = useState<Depart | null>(null);
  const [gabarit, setGabarit] = useState<GabaritEvenement | null>(null);
  const choisis = fiche.reglages.gabarits.choisis;

  if (!depart) return <ChoixDepartNouveau nomLieu={nomLieu} onChoisir={setDepart} onRetour={() => router.push(pageRetour)} />;
  if (!gabarit) return <ChoixFormatKit nomLieu={nomLieu} nbFormats={choisis.length} depart={depart} onChoisir={setGabarit} onRetour={() => setDepart(null)} />;

  const memes = choisis.filter((c) => c.gabarit === gabarit).length + 1;
  // Ajout à la fin de l'écran de choix, sur la fiche relue (elle a pu changer depuis l'ouverture)
  const creerComposition = async () => {
    const actuelle = await api<FicheEvenementLieu>(apiEvenement);
    const liste = actuelle.reglages.gabarits.choisis;
    if (liste.length >= MAX_COMPOSITIONS) throw new Error(`${MAX_COMPOSITIONS} formats au plus sur l'écran de choix : retirez-en un dans la fiche.`);
    const id = nouvelId(gabarit, liste.map((c) => c.id));
    const reglages = { ...actuelle.reglages, gabarits: { ...actuelle.reglages.gabarits, choisis: [...liste, { id, gabarit }] } };
    const f = await api<FicheEvenementLieu>(apiEvenement, { method: "PUT", json: { reglages, ...(actuelle.habituel || !actuelle.nom ? {} : { nom: actuelle.nom }) } });
    client.setQueryData(cleFiche, f);
    client.invalidateQueries({ queryKey: ["cadres-evenement", apiEvenement] });
    return `${apiEvenement}/cadres/${id}`;
  };

  return (
    <StudioRegie
      key={`${depart}-${gabarit}`}
      gabarit={gabarit}
      nomLieu={nomLieu}
      cadre={null}
      apiCadre={null}
      creerComposition={creerComposition}
      departInitial={depart}
      onRetourFormat={() => setGabarit(null)}
      pageRetour={pageRetour}
      libelle={libelleDe(gabarit, memes, memes)}
    />
  );
}
