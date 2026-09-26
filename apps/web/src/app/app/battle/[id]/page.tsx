import { BattleArena } from "@/components/app/BattleArena";

export default async function BattlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BattleArena id={id} />;
}
