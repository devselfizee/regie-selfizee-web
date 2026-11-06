import { GalerieEvenement } from "../GalerieEvenement";

// Galerie de l'événement habituel du lieu : les photos et vidéos des séances, reçues de PikCloud
export default async function Page({ params }: PageProps<"/lieux/[id]/evenement/galerie">) {
  const { id } = await params;
  return <GalerieEvenement id={Number(id)} />;
}
