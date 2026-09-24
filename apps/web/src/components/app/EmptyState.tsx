import { Pet, type PetMood } from "@/components/Pet";

export function EmptyState({ mood, title, body }: { mood: PetMood; title: string; body: string }) {
  return (
    <div className="grid items-center gap-6 rounded-[28px] bg-ground-deep p-8 md:grid-cols-[220px_1fr] md:p-12">
      <Pet mood={mood} className="mx-auto w-40 md:w-full" />
      <div>
        <h1 className="font-display tracking-[-0.005em] text-[clamp(1.8rem,3vw,2.4rem)] font-bold leading-[1.1]">{title}</h1>
        <p className="mt-3 max-w-[52ch] text-[16px] leading-relaxed text-ink-soft">{body}</p>
      </div>
    </div>
  );
}
