import { FicheLieu } from "./FicheLieu";

export default async function Page({ params }: PageProps<"/lieux/[id]">) {
  const { id } = await params;
  return <FicheLieu id={Number(id)} />;
}
