import { MimicArena } from "@/components/app/MimicArena";

export default async function BattlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MimicArena id={id} />;
}
