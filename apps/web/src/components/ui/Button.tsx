import Link from "next/link";

type Common = { children: React.ReactNode; className?: string; arrow?: boolean };

/** Up-and-out arrow: the one arrow Kage uses everywhere. */
export function Arrow({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={`arrow ${className}`}>
      <path d="M4.5 11.5l7-7M6 4.5h5.5V10" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function Button({ children, className = "", arrow, ...rest }: Common & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className={`kage-btn ${className}`}>
      {children}
      {arrow && <Arrow />}
    </button>
  );
}

export function LinkButton({ href, children, className = "", arrow = true }: Common & { href: string }) {
  return (
    <Link href={href} className={`kage-btn ${className}`}>
      {children}
      {arrow && <Arrow />}
    </Link>
  );
}
