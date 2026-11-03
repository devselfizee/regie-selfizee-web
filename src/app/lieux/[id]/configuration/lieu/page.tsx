import { InfosLieu } from "./InfosLieu";

export default async function Page({ params }: PageProps<"/lieux/[id]/configuration/lieu">) {
  const { id } = await params;
  return <InfosLieu id={Number(id)} />;
}
