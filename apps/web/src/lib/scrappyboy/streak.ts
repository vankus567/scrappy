/** Days-in-a-row streak, stored on this device. */
export function readStreak(): { day: string; count: number } {
  try {
    const v = JSON.parse(localStorage.getItem("scrappyboy.streak") ?? "null") as { day: string; count: number } | null;
    if (!v) return { day: "", count: 0 };
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    return v.day === today || v.day === yesterday ? v : { day: "", count: 0 };
  } catch {
    return { day: "", count: 0 };
  }
}

export function bumpStreak(): number {
  const today = new Date().toISOString().slice(0, 10);
  const cur = readStreak();
  const next = cur.day === today ? cur : { day: today, count: cur.count + 1 };
  try {
    localStorage.setItem("scrappyboy.streak", JSON.stringify(next));
  } catch {
    /* private mode */
  }
  return next.count;
}
