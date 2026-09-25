/** "kage" (影, shadow): the word casts its own shadow on the ground below it. */
export function Wordmark({ className = "text-[26px]" }: { className?: string }) {
  return (
    <span aria-label="Kage" className={`kage-mark font-display font-bold tracking-[0.01em] ${className}`} data-text="kage">
      kage
    </span>
  );
}
