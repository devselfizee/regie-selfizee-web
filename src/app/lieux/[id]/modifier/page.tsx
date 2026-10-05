import { ModifierLieu } from "./ModifierLieu";

export default async function Page({ params }: PageProps<"/lieux/[id]/modifier">) {
  const { id } = await params;
  return <ModifierLieu id={Number(id)} />;
}
