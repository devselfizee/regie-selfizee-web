import { notFound } from "next/navigation";
import { FicheEvenement } from "../FicheEvenement";

// Fiche d'un événement ponctuel du lieu (Halloween, une soirée…), à côté de l'événement habituel
export default async function Page({ params }: PageProps<"/lieux/[id]/evenement/[eid]">) {
  const { id, eid } = await params;
  if (!/^\d+$/.test(eid)) notFound();
  return <FicheEvenement id={Number(id)} eid={Number(eid)} />;
}
