import { notFound } from "next/navigation";
import { StudioLieu } from "./StudioLieu";

// Studio de cadres d'une composition d'un événement, ouvert depuis l'écran Gabarits de sa fiche (plein écran).
// ?e=<id> : événement ponctuel ; sans : l'événement habituel du lieu.
export default async function Page({ params, searchParams }: PageProps<"/lieux/[id]/evenement/studio/[composition]">) {
  const { id, composition } = await params;
  const { e } = await searchParams;
  const eid = typeof e === "string" && /^\d+$/.test(e) ? Number(e) : undefined;
  if (!/^\d+$/.test(id) || !/^[a-z0-9-]{1,40}$/.test(composition)) notFound();
  return <StudioLieu lieuId={Number(id)} compositionId={composition} eid={eid} />;
}
