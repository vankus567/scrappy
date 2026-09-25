/** "scrappy" wordmark: the word casts its own shadow on the ground below it. */
export function Wordmark({ className = "text-[26px]" }: { className?: string }) {
  return (
    <span aria-label="Scrappy" className={`scrappy-mark font-display font-bold tracking-[0.01em] ${className}`} data-text="scrappy">
      scrappy
    </span>
  );
}
