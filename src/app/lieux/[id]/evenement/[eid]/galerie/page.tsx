import { notFound } from "next/navigation";
import { GalerieEvenement } from "../../GalerieEvenement";

// Galerie d'un événement ponctuel du lieu
export default async function Page({ params }: PageProps<"/lieux/[id]/evenement/[eid]/galerie">) {
  const { id, eid } = await params;
  if (!/^\d+$/.test(eid)) notFound();
  return <GalerieEvenement id={Number(id)} eid={Number(eid)} />;
}
