import { redirect } from "next/navigation";

// Ancienne page « Tarif du lieu » (Configuration) : le tarif se modifie dans l'onglet Tarifs de l'édition du lieu
export default async function Page({ params }: PageProps<"/lieux/[id]/configuration/tarifs">) {
  const { id } = await params;
  redirect(`/lieux/${id}/modifier?onglet=tarifs`);
}
