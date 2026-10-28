"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, ErreurApi, type FicheEvenementLieu } from "@/lib/api";
import { Reserve } from "@/lib/session";
import { Chargement, Erreur } from "@/components/Etat";
import { StudioRegie, type CadreARouvrir } from "@/studio/regie/StudioRegie";
import { FORMATS_KIT } from "@/studio/regie/formatsKit";
import { cheminsEvenement } from "../../FicheEvenement";

export function StudioLieu({ lieuId, compositionId, eid }: { lieuId: number; compositionId: string; eid?: number }) {
  return (
    <Reserve roles={["ADMIN"]}>
      <Chargeur lieuId={lieuId} compositionId={compositionId} eid={eid} />
    </Reserve>
  );
}

function Chargeur({ lieuId, compositionId, eid }: { lieuId: number; compositionId: string; eid?: number }) {
  const chemins = cheminsEvenement(lieuId, eid);
  const fiche = useQuery({ queryKey: ["evenement-lieu", lieuId, eid ?? "habituel"], queryFn: () => api<FicheEvenementLieu>(chemins.api) });
  // Pas encore de cadre pour cette composition : on part de zéro
  const cadre = useQuery({
    queryKey: ["cadre-evenement", chemins.api, compositionId],
    queryFn: () =>
      api<CadreARouvrir>(`${chemins.api}/cadres/${compositionId}`).catch((e) => {
        if (e instanceof ErreurApi && e.status === 404) return null;
        throw e;
      }),
    // Relu à chaque ouverture (« Modifier le cadre » doit rouvrir le dernier enregistré), jamais en
    // arrière-plan pendant qu'on dessine : le studio garde son propre état
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const composition = fiche.data?.reglages.gabarits.choisis.find((c) => c.id === compositionId);
  const retour = (
    <Link href={`${chemins.page}?ecran=gabarits`} className="bouton-second">← Fiche événement</Link>
  );
  if (fiche.error || cadre.error) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-10">
        <Erreur erreur={fiche.error ?? cadre.error} />
        {retour}
      </div>
    );
  }
  if (!fiche.data || cadre.data === undefined) return <Chargement />;
  if (!composition) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-10">
        <p className="text-sm text-ink-2">Ce format n&apos;est pas (ou plus) dans l&apos;événement : enregistrez la fiche avant d&apos;ouvrir le studio.</p>
        {retour}
      </div>
    );
  }
  const memes = fiche.data.reglages.gabarits.choisis.filter((c) => c.gabarit === composition.gabarit);
  const kit = FORMATS_KIT[composition.gabarit];
  const libelle = memes.length > 1 ? `${kit.libelle} · ${memes.indexOf(composition) + 1}` : kit.libelle;
  const nom = fiche.data.habituel ? fiche.data.reglages.lieu.nom : `${fiche.data.reglages.lieu.nom} · ${fiche.data.nom}`;

  return (
    <StudioRegie
      gabarit={composition.gabarit}
      nomLieu={nom}
      cadre={cadre.data}
      apiCadre={`${chemins.api}/cadres/${compositionId}`}
      pageRetour={chemins.page}
      libelle={libelle}
    />
  );
}
