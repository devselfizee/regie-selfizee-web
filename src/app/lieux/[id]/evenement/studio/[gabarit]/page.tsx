import { notFound } from "next/navigation";
import { StudioLieu } from "./StudioLieu";

const GABARITS = ["bandelette", "pola", "planche", "carte"] as const;

// Studio de cadres d'un gabarit du kit, ouvert depuis l'écran Gabarits de la fiche événement (plein écran)
export default async function Page({ params }: PageProps<"/lieux/[id]/evenement/studio/[gabarit]">) {
  const { id, gabarit } = await params;
  const g = GABARITS.find((x) => x === gabarit);
  if (!g || !/^\d+$/.test(id)) notFound();
  return <StudioLieu lieuId={Number(id)} gabarit={g} />;
}
