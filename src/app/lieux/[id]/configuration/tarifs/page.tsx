import { TarifLieu } from "./TarifLieu";

export default async function Page({ params }: PageProps<"/lieux/[id]/configuration/tarifs">) {
  const { id } = await params;
  return <TarifLieu id={Number(id)} />;
}
