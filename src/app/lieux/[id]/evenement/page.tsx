import { FicheEvenement } from "./FicheEvenement";

export default async function Page({ params }: PageProps<"/lieux/[id]/evenement">) {
  const { id } = await params;
  return <FicheEvenement id={Number(id)} />;
}
