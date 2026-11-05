import { redirect } from "next/navigation";

// Ancienne page « Infos du lieu » (Configuration) : déplacée dans l'onglet Communication de l'édition du lieu
export default async function Page({ params }: PageProps<"/lieux/[id]/configuration/lieu">) {
  const { id } = await params;
  redirect(`/lieux/${id}/modifier?onglet=communication`);
}
