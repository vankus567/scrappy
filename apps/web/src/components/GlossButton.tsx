import Link from "next/link";

type Common = { children: React.ReactNode; className?: string };
type AsLink = Common & { href: string };
type AsButton = Common & React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

/**
 * Gloss button, adapted from RewampUI "gloss-button": a pill whose candy surface
 * (sunshine, peach, sky) drifts slowly under a fixed glossy highlight arc.
 * Pure CSS motion, stops under reduced motion. Navy label for contrast.
 */
export function GlossButton(props: AsLink | AsButton) {
  const base = `gloss-btn group relative inline-flex min-h-12 select-none items-center justify-center gap-2 overflow-hidden rounded-full px-8 text-[16px] font-semibold text-[#14213d] transition-transform active:translate-y-px disabled:opacity-60 ${props.className ?? ""}`;
  const inner = (
    <>
      <span aria-hidden className="gloss-surface absolute inset-0" />
      <span aria-hidden className="pointer-events-none absolute inset-x-3 top-1 h-1/2 rounded-full bg-white/45 blur-[3px]" />
      <span className="relative z-10 inline-flex items-center gap-2">{props.children}</span>
    </>
  );

  if (props.href !== undefined) {
    return (
      <Link href={props.href} className={base}>
        {inner}
      </Link>
    );
  }
  const { children: _c, className: _cl, ...rest } = props as AsButton;
  return (
    <button {...rest} className={base}>
      {inner}
    </button>
  );
}
