import { mkdirSync } from "node:fs";
import { join as pathJoin } from "node:path";
import { type Db, uid } from "./db";
import { ANIMALS, animalByKey, animalFrames, animalMs, botContour, framesFromContour, melody, melodyFrames, MIMIC_ROUNDS, scoreContour } from "./mimic";
import type { WorkerPush } from "./payments";
import type { WorkerRow } from "./tasks";

/**
 * Mimic battles: 2 to 4 players, three clips. Each round everyone hears the same clip and submits one
 * recording (their pitch line). Entries stay hidden until the round closes; then the server scores
 * them. Highest total after three clips wins. Empty seats can be filled with Scrappy Bot.
 */

export const BOT_ID = "scrappy-bot";
export const ROUND_MS = 12 * 3_600_000; // async: a round stays open up to 12 h
export const OPEN_MS = 48 * 3_600_000; // an unstarted lobby expires after 2 days
export const QUICK_MS = 10 * 60_000; // quick-match lobbies older than this aren't joined
export const MAX_CLIP_BYTES = 1_500_000;
/** Practice opponents for when nobody else is online: pet-style names from around the world. */
export const PRACTICE_BOTS = [
  { key: "mango", name: "Mango · India", species: "ember" },
  { key: "taco", name: "Taco · Mexico", species: "zap" },
  { key: "kiwi", name: "Kiwi · New Zealand", species: "pip" },
  { key: "sushi", name: "Sushi · Japan", species: "kitsu" },
  { key: "baguette", name: "Baguette · France", species: "bun" },
  { key: "samba", name: "Samba · Brazil", species: "goo" },
  { key: "kimchi", name: "Kimchi · Korea", species: "neko" },
  { key: "maple", name: "Maple · Canada", species: "kumo" },
  { key: "pierogi", name: "Pierogi · Poland", species: "boo" },
  { key: "jollof", name: "Jollof · Nigeria", species: "drako" },
  { key: "gelato", name: "Gelato · Italy", species: "mochi" },
  { key: "koala", name: "Koala · Australia", species: "pengu" },
  { key: "biryani", name: "Biryani · Hyderabad", species: "ember" },
  { key: "dosa", name: "Dosa · Chennai", species: "pip" },
  { key: "churro", name: "Churro · Spain", species: "zap" },
  { key: "tulip", name: "Tulip · Netherlands", species: "bun" },
] as const;

const TUNE_NAMES = ["Bubble Pop", "Moon Hop", "Sleepy Cat", "Rocket Ride", "Jelly Wobble", "Rain Dance", "Bee Buzz", "Star Skip", "Frog Choir", "Snack Time", "Tiny Parade", "Cloud Nap"];

type Battle = {
  id: string; mode: "friend" | "quick"; host_id: string; max_players: number; status: "open" | "active" | "done" | "cancelled";
  round: number; round_deadline: number | null; clips: string; created_at: number; finished_at: number | null; winners: string | null;
};
type Player = { battle_id: string; worker_id: string; seat: number; name: string | null; species: string | null; is_bot: number; joined_at: number };
type Entry = { battle_id: string; round: number; worker_id: string; contour: string; score: number; submitted_at: number };
export const CATEGORIES = ["sound", "dialogue", "animal"] as const;
export type Category = (typeof CATEGORIES)[number];
type Clip = {
  id: string; title: string; kind: "tune" | "upload"; owner_id: string | null; file: string | null; mime: string | null; frames: string; duration_ms: number;
  reports: number; hidden: number; created_at: number; category: Category | null; quote: string | null; movie: string | null; owner_name: string | null;
};

type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });

export function createMimicService(db: Db, opts: { push?: WorkerPush; clipDir?: string } = {}) {
  const clipDir = opts.clipDir ?? process.env.CLIP_DIR ?? "clips";
  mkdirSync(clipDir, { recursive: true });
  db.exec(`
    CREATE TABLE IF NOT EXISTS clips (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('tune', 'upload')),
      owner_id TEXT REFERENCES workers(id), file TEXT, mime TEXT, frames TEXT NOT NULL, duration_ms INTEGER NOT NULL,
      reports INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mimic_battles (
      id TEXT PRIMARY KEY, mode TEXT NOT NULL CHECK (mode IN ('friend', 'quick')), host_id TEXT NOT NULL REFERENCES workers(id),
      max_players INTEGER NOT NULL CHECK (max_players BETWEEN 2 AND 4),
      status TEXT NOT NULL CHECK (status IN ('open', 'active', 'done', 'cancelled')),
      round INTEGER NOT NULL DEFAULT 0, round_deadline INTEGER, clips TEXT NOT NULL,
      created_at INTEGER NOT NULL, finished_at INTEGER, winners TEXT
    );
    CREATE TABLE IF NOT EXISTS mimic_players (
      battle_id TEXT NOT NULL REFERENCES mimic_battles(id), worker_id TEXT NOT NULL REFERENCES workers(id),
      seat INTEGER NOT NULL, name TEXT, species TEXT, is_bot INTEGER NOT NULL DEFAULT 0, joined_at INTEGER NOT NULL,
      PRIMARY KEY (battle_id, worker_id), UNIQUE (battle_id, seat)
    );
    CREATE TABLE IF NOT EXISTS mimic_entries (
      battle_id TEXT NOT NULL REFERENCES mimic_battles(id), round INTEGER NOT NULL, worker_id TEXT NOT NULL,
      contour TEXT NOT NULL, score INTEGER NOT NULL, submitted_at INTEGER NOT NULL,
      PRIMARY KEY (battle_id, round, worker_id)
    );
    CREATE INDEX IF NOT EXISTS mimic_open ON mimic_battles(status, mode, created_at);
    CREATE INDEX IF NOT EXISTS mimic_players_w ON mimic_players(worker_id);
  `);
  // clip categories (famous-line performances, animal impressions) arrived after clips first shipped
  const clipCols = (db.query("PRAGMA table_info(clips)").all() as { name: string }[]).map((c) => c.name);
  for (const col of ["category TEXT", "quote TEXT", "movie TEXT"]) if (!clipCols.includes(col.split(" ")[0])) db.exec(`ALTER TABLE clips ADD COLUMN ${col}`);
  db.query(
    `INSERT OR IGNORE INTO workers (id, wallet, token_hash, languages, pet_name, species, created_at)
     VALUES (?, 'ScrappyBot1111111111111111111111111111111', 'bot:no-login', '[]', 'Scrappy Bot', 'mochi', ?)`,
  ).run(BOT_ID, Date.now());
  // the old pet battle modes are retired: cancel unfinished ones and give staked food back
  const hasOld = db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'battles'").get();
  if (hasOld) {
    db.transaction(() => {
      for (const b of db.query("SELECT id, a_id, b_id, stake_food, status FROM battles WHERE status IN ('open', 'active')").all() as any[]) {
        db.query("UPDATE workers SET pet_food = pet_food + ? WHERE id = ?").run(b.stake_food, b.a_id);
        if (b.status === "active" && b.b_id) db.query("UPDATE workers SET pet_food = pet_food + ? WHERE id = ?").run(b.stake_food, b.b_id);
        db.query("UPDATE battles SET status = 'cancelled', finished_at = ? WHERE id = ?").run(Date.now(), b.id);
      }
    })();
  }

  const ping = (to: string, battleId: string, title: string, body: string) =>
    to !== BOT_ID && opts.push?.(to, { title, body, url: `/app/battle/${battleId}`, tag: `mimic-${battleId}` });

  // ---------------- clips ----------------

  const clipRow = (id: string) =>
    db.query("SELECT c.*, w.pet_name AS owner_name FROM clips c LEFT JOIN workers w ON w.id = c.owner_id WHERE c.id = ?").get(id) as Clip | null;

  /** A clip's pitch line (the scoring target). Tunes are generated; uploads are stored. */
  const targetOf = (clipId: string): number[] | null => {
    if (clipId.startsWith("tune:")) return melodyFrames(melody(clipId.slice(5)));
    if (clipId.startsWith("animal:")) {
      const a = animalByKey(clipId.slice(7));
      return a ? animalFrames(a) : null;
    }
    const c = clipRow(clipId);
    return c && !c.hidden ? (JSON.parse(c.frames) as number[]) : null;
  };

  const clipView = (clipId: string) => {
    if (clipId.startsWith("tune:")) {
      const seed = clipId.slice(5);
      const notes = melody(seed);
      const name = TUNE_NAMES[parseInt(seed.slice(0, 6), 36) % TUNE_NAMES.length] ?? "Scrappy Tune";
      return { id: clipId, kind: "tune" as const, title: name, notes, frames: melodyFrames(notes), duration_ms: notes.reduce((s, n) => s + n.ms, 0) };
    }
    if (clipId.startsWith("animal:")) {
      const a = animalByKey(clipId.slice(7));
      if (!a) return null;
      return { id: clipId, kind: "animal" as const, title: `${a.name}: ${a.call}`, animal: a, frames: animalFrames(a), duration_ms: animalMs(a) };
    }
    const c = clipRow(clipId);
    if (!c) return null;
    return {
      id: c.id, kind: "upload" as const, title: c.title, audio_url: `/v1/clips/${c.id}/audio`, frames: JSON.parse(c.frames) as number[], duration_ms: c.duration_ms,
      hidden: !!c.hidden, category: c.category ?? "sound", quote: c.quote, movie: c.movie, by: c.owner_name,
    };
  };

  /** Three different clips for a battle: player recordings when there are any, mixed with animal calls and fresh Scrappy Tunes. */
  const pickClips = () => {
    const uploads = (db.query("SELECT id FROM clips WHERE kind = 'upload' AND hidden = 0 ORDER BY RANDOM() LIMIT 3").all() as { id: string }[]).map((r) => r.id);
    const animals = [...ANIMALS].sort(() => Math.random() - 0.5);
    const out: string[] = [];
    for (let i = 0; i < MIMIC_ROUNDS; i++) {
      const r = Math.random();
      if (uploads[i] && r < 0.5) out.push(uploads[i]);
      else if (r < 0.75) out.push(`animal:${animals[i].key}`);
      else out.push(`tune:${Math.random().toString(36).slice(2, 10)}`);
    }
    return out;
  };

  const IMAGE_OK = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/aac"]);
  const uploadClip = async (
    w: WorkerRow, title: string, mime: string, base64: string, contour: string, durationMs: number,
    meta: { category?: Category; quote?: string; movie?: string } = {},
  ) => {
    if (!IMAGE_OK.has(mime.split(";")[0])) return fail(400, "clip must be an audio file");
    const frames = framesFromContour(contour);
    if (!frames) return fail(400, "we couldn't hear a clear sound in that clip; try one with a voice or a tune");
    const bytes = Uint8Array.from(Buffer.from(base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64, "base64"));
    if (bytes.length < 500 || bytes.length > MAX_CLIP_BYTES) return fail(400, "clip must be under 1.5 MB (about 10 seconds)");
    const id = uid();
    const file = `${id}.${mime.split("/")[1].split(";")[0]}`;
    await Bun.write(pathJoin(clipDir, file), bytes);
    db.query(
      "INSERT INTO clips (id, title, kind, owner_id, file, mime, frames, duration_ms, created_at, category, quote, movie) VALUES (?, ?, 'upload', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, title, w.id, file, mime.split(";")[0], JSON.stringify(frames), Math.round(durationMs), Date.now(), meta.category ?? "sound", meta.quote ?? null, meta.movie ?? null);
    return { ok: true as const, clip: clipView(id)! };
  };

  const clipAudio = (id: string) => {
    const c = clipRow(id);
    return c?.file && !c.hidden ? { file: Bun.file(pathJoin(clipDir, c.file)), mime: c.mime ?? "audio/webm" } : null;
  };

  /** Three reports hide a clip until someone reviews it. */
  const reportClip = (id: string) => {
    db.query("UPDATE clips SET reports = reports + 1, hidden = CASE WHEN reports + 1 >= 3 THEN 1 ELSE hidden END WHERE id = ? AND kind = 'upload'").run(id);
  };

  // ---------------- battles ----------------

  const get = (id: string) => db.query("SELECT * FROM mimic_battles WHERE id = ?").get(id) as Battle | null;
  const playersOf = (id: string) => db.query("SELECT * FROM mimic_players WHERE battle_id = ? ORDER BY seat").all(id) as Player[];
  const entriesOf = (id: string) => db.query("SELECT * FROM mimic_entries WHERE battle_id = ?").all(id) as Entry[];

  const seatUp = (b: Battle, w: { id: string; pet_name: string | null; species: string | null }, isBot = false, now = Date.now()) => {
    const taken = new Set(playersOf(b.id).map((p) => p.seat));
    let seat = 0;
    while (taken.has(seat)) seat++;
    db.query("INSERT INTO mimic_players (battle_id, worker_id, seat, name, species, is_bot, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      b.id, w.id, seat, w.pet_name, w.species, isBot ? 1 : 0, now,
    );
  };

  const canPlay = (w: WorkerRow): Fail | null => {
    if (w.pet_dead) return fail(409, "pet_dead");
    if (!w.species) return fail(409, "hatch a pet first");
    return null;
  };

  const create = (w: WorkerRow, mode: "friend" | "quick", maxPlayers: number, now = Date.now()) => {
    const bad = canPlay(w);
    if (bad) return bad;
    const id = uid();
    db.transaction(() => {
      db.query("INSERT INTO mimic_battles (id, mode, host_id, max_players, status, round, clips, created_at) VALUES (?, ?, ?, ?, 'open', 0, ?, ?)").run(
        id, mode, w.id, maxPlayers, JSON.stringify(pickClips()), now,
      );
      seatUp(get(id)!, w, false, now);
    })();
    return { ok: true as const, battle: get(id)! };
  };

  /** Bots sing as soon as a round opens, without hearing anyone else's entry. */
  const botsSing = (b: Battle, now: number) => {
    const clips = JSON.parse(b.clips) as string[];
    const target = targetOf(clips[b.round - 1]);
    if (!target) return;
    for (const p of playersOf(b.id).filter((p) => p.is_bot)) {
      const contour = botContour(target);
      db.query("INSERT OR IGNORE INTO mimic_entries (battle_id, round, worker_id, contour, score, submitted_at) VALUES (?, ?, ?, ?, ?, ?)").run(
        b.id, b.round, p.worker_id, contour, scoreContour(target, contour) ?? 0, now,
      );
    }
  };

  const start = (b: Battle, now = Date.now()) => {
    const r = db.query("UPDATE mimic_battles SET status = 'active', round = 1, round_deadline = ? WHERE id = ? AND status = 'open'").run(now + ROUND_MS, b.id);
    if (!r.changes) return;
    const cur = get(b.id)!;
    botsSing(cur, now);
    for (const p of playersOf(b.id)) ping(p.worker_id, b.id, "Mimic battle started", "Round 1: listen and copy the clip.");
  };

  const join = (id: string, w: WorkerRow, now = Date.now()) => {
    const b = advance(get(id), now);
    if (!b) return fail(404, "battle not found");
    if (playersOf(id).some((p) => p.worker_id === w.id)) return { ok: true as const, battle: b };
    if (b.status !== "open") return fail(409, b.status === "cancelled" ? "this battle expired" : "this battle already started");
    const bad = canPlay(w);
    if (bad) return bad;
    if (playersOf(id).length >= b.max_players) return fail(409, "this battle is full");
    seatUp(b, w, false, now);
    ping(b.host_id, id, `${w.pet_name ?? "A pet"} joined your battle`, `${playersOf(id).length} of ${b.max_players} players in.`);
    if (playersOf(id).length >= b.max_players) start(b, now);
    return { ok: true as const, battle: get(id)! };
  };

  const quick = (w: WorkerRow, now = Date.now()) => {
    const open = db.query(
      `SELECT b.id FROM mimic_battles b WHERE b.status = 'open' AND b.mode = 'quick' AND b.created_at >= ?
         AND NOT EXISTS (SELECT 1 FROM mimic_players p WHERE p.battle_id = b.id AND p.worker_id = ?)
       ORDER BY b.created_at LIMIT 1`,
    ).get(now - QUICK_MS, w.id) as { id: string } | null;
    if (open) {
      const r = join(open.id, w, now);
      if (r.ok) return r;
    }
    const mine = db.query(
      "SELECT b.* FROM mimic_battles b JOIN mimic_players p ON p.battle_id = b.id WHERE b.status = 'open' AND b.mode = 'quick' AND p.worker_id = ? AND b.created_at >= ?",
    ).get(w.id, now - QUICK_MS) as Battle | null;
    return mine ? { ok: true as const, battle: mine } : create(w, "quick", 2, now);
  };

  /** The host starts with who's there; with fill, empty seats go to Scrappy Bot first. */
  const hostStart = (id: string, w: WorkerRow, fill: boolean, now = Date.now()) => {
    const b = get(id);
    if (!b || b.host_id !== w.id) return fail(404, "battle not found");
    if (b.status !== "open") return fail(409, "this battle already started");
    if (fill) {
      // practice bots with pet-style names from around the world; always flagged as bots in the view
      let n = playersOf(id).length;
      const pool = [...PRACTICE_BOTS].sort(() => Math.random() - 0.5);
      for (let i = 0; n < b.max_players; i++, n++) seatUp(b, ensureBot(pool[i]), true, now);
    }
    if (playersOf(id).length < 2) return fail(409, "you need at least 2 players (or fill with practice bots)");
    start(b, now);
    return { ok: true as const, battle: get(id)! };
  };

  /** One account per practice bot so each keeps its name and pet. They can never log in or join staked battles. */
  const ensureBot = (p: (typeof PRACTICE_BOTS)[number]) => {
    const id = `${BOT_ID}-${p.key}`;
    db.query(
      `INSERT OR IGNORE INTO workers (id, wallet, token_hash, languages, pet_name, species, created_at)
       VALUES (?, ?, ?, '[]', ?, ?, ?)`,
    ).run(id, `Bot${p.key}`.padEnd(43, "1").slice(0, 44), `bot:no-login:${p.key}`, p.name, p.species, Date.now());
    return { id, pet_name: p.name, species: p.species };
  };

  const leave = (id: string, w: WorkerRow) => {
    const b = get(id);
    if (!b) return fail(404, "battle not found");
    if (b.status !== "open") return fail(409, "you can't leave a battle that started");
    if (b.host_id === w.id) {
      db.query("UPDATE mimic_battles SET status = 'cancelled', finished_at = ? WHERE id = ?").run(Date.now(), id);
    } else {
      db.query("DELETE FROM mimic_players WHERE battle_id = ? AND worker_id = ?").run(id, w.id);
    }
    return { ok: true as const };
  };

  const submit = (id: string, w: WorkerRow, round: number, contour: string, now = Date.now()) => {
    const b = advance(get(id), now);
    if (!b) return fail(404, "battle not found");
    if (!playersOf(id).some((p) => p.worker_id === w.id)) return fail(404, "battle not found");
    if (b.status !== "active") return fail(409, "battle is not in play");
    if (round !== b.round) return fail(409, `it's round ${b.round}`);
    const target = targetOf((JSON.parse(b.clips) as string[])[round - 1]);
    if (!target) return fail(409, "this clip was removed");
    const score = scoreContour(target, contour);
    if (score === null) return fail(400, "that recording didn't come through; try again");
    const r = db.query("INSERT OR IGNORE INTO mimic_entries (battle_id, round, worker_id, contour, score, submitted_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      id, round, w.id, contour, score, now,
    );
    if (!r.changes) return fail(409, "you already locked in this round");
    const after = advance(get(id), now)!;
    return { ok: true as const, battle: after };
  };

  /** Close rounds when everyone's in or time's up; open the next; finish after the last clip. Idempotent. */
  function advance(b0: Battle | null, now = Date.now()): Battle | null {
    if (!b0) return null;
    let b = b0;
    if (b.status === "open" && now - b.created_at > OPEN_MS) {
      db.query("UPDATE mimic_battles SET status = 'cancelled', finished_at = ? WHERE id = ? AND status = 'open'").run(now, b.id);
      return get(b.id);
    }
    while (b.status === "active") {
      const players = playersOf(b.id);
      const inRound = entriesOf(b.id).filter((e) => e.round === b.round).length;
      const closed = inRound >= players.length || (b.round_deadline !== null && now >= b.round_deadline);
      if (!closed) {
        botsSing(b, now);
        return get(b.id);
      }
      if (b.round >= MIMIC_ROUNDS) {
        const totals = totalsOf(b.id, players);
        const top = Math.max(...totals.map((t) => t.total));
        const winners = totals.filter((t) => t.total === top).map((t) => t.worker_id);
        const r = db.query("UPDATE mimic_battles SET status = 'done', finished_at = ?, winners = ? WHERE id = ? AND status = 'active'").run(now, JSON.stringify(winners), b.id);
        if (r.changes) {
          for (const p of players) ping(p.worker_id, b.id, winners.includes(p.worker_id) ? "You won the Mimic battle!" : "Mimic battle over", "Tap to see everyone's scores.");
        }
        return get(b.id);
      }
      const timedOut = b.round_deadline !== null && now >= b.round_deadline;
      const deadline = timedOut ? b.round_deadline! + ROUND_MS : now + ROUND_MS;
      db.query("UPDATE mimic_battles SET round = round + 1, round_deadline = ? WHERE id = ? AND round = ?").run(deadline, b.id, b.round);
      b = get(b.id)!;
      botsSing(b, now);
      for (const p of players) ping(p.worker_id, b.id, `Round ${b.round}: new clip`, "Listen and copy it.");
    }
    return b;
  }

  const totalsOf = (id: string, players: Player[]) => {
    const entries = entriesOf(id);
    return players.map((p) => ({ worker_id: p.worker_id, total: entries.filter((e) => e.worker_id === p.worker_id).reduce((s, e) => s + e.score, 0) }));
  };

  /** One player's view: seats, clips so far, scores of closed rounds only, who has sung this round. */
  const view = (b0: Battle, viewerId: string | null, now = Date.now()) => {
    const b = advance(b0, now)!;
    const players = playersOf(b.id);
    const entries = entriesOf(b.id);
    const clips = JSON.parse(b.clips) as string[];
    const closedRounds = b.status === "done" ? MIMIC_ROUNDS : Math.max(0, b.round - 1);
    const winners = b.winners ? (JSON.parse(b.winners) as string[]) : [];
    const mine = players.find((p) => p.worker_id === viewerId);
    return {
      id: b.id,
      mode: b.mode,
      status: b.status,
      host: players.find((p) => p.worker_id === b.host_id)?.seat ?? 0,
      you: mine ? mine.seat : null,
      max_players: b.max_players,
      round: b.round,
      rounds_total: MIMIC_ROUNDS,
      round_deadline: b.round_deadline ? new Date(b.round_deadline).toISOString() : null,
      players: players.map((p) => ({
        seat: p.seat,
        name: p.name ?? "Scrappy",
        species: p.species ?? "mochi",
        bot: !!p.is_bot,
        submitted: b.status === "active" && entries.some((e) => e.worker_id === p.worker_id && e.round === b.round),
        total: entries.filter((e) => e.worker_id === p.worker_id && e.round <= closedRounds).reduce((s, e) => s + e.score, 0),
        winner: winners.includes(p.worker_id),
      })),
      // the clip for the current round, and every earlier one
      clips: clips.slice(0, b.status === "done" ? MIMIC_ROUNDS : Math.max(b.round, 0)).map((c) => clipView(c)),
      results: Array.from({ length: closedRounds }, (_, i) => ({
        round: i + 1,
        scores: players.map((p) => ({ seat: p.seat, score: entries.find((e) => e.worker_id === p.worker_id && e.round === i + 1)?.score ?? 0 })),
      })),
      your_entry: viewerId ? entries.find((e) => e.worker_id === viewerId && e.round === b.round)?.score ?? null : null,
      created_at: new Date(b.created_at).toISOString(),
    };
  };

  const listFor = (w: WorkerRow, now = Date.now()) => {
    const rows = db.query(
      `SELECT b.* FROM mimic_battles b JOIN mimic_players p ON p.battle_id = b.id WHERE p.worker_id = ?
         AND (b.status IN ('open', 'active') OR b.finished_at >= ?) ORDER BY b.created_at DESC LIMIT 40`,
    ).all(w.id, now - 7 * 86_400_000) as Battle[];
    const views = rows.map((r) => view(r, w.id, now));
    const rank = (v: ReturnType<typeof view>) => {
      const me = v.players.find((p) => p.seat === v.you);
      return v.status === "active" && me && !me.submitted ? 0 : v.status === "active" ? 1 : v.status === "open" ? 2 : 3;
    };
    return views.sort((x, y) => rank(x) - rank(y));
  };

  const record = (workerId: string) => {
    const done = db.query(
      "SELECT b.winners FROM mimic_battles b JOIN mimic_players p ON p.battle_id = b.id WHERE p.worker_id = ? AND b.status = 'done'",
    ).all(workerId) as { winners: string }[];
    const wins = done.filter((d) => (JSON.parse(d.winners) as string[]).includes(workerId)).length;
    return { wins, played: done.length };
  };

  const leaderboard = (viewerId: string | null) => {
    const rows = db.query(
      `SELECT w.id, w.pet_name, w.species, w.city, b.winners FROM mimic_battles b
       JOIN mimic_players p ON p.battle_id = b.id JOIN workers w ON w.id = p.worker_id
       WHERE b.status = 'done' AND p.is_bot = 0`,
    ).all() as { id: string; pet_name: string | null; species: string | null; city: string | null; winners: string }[];
    const by = new Map<string, { id: string; pet_name: string | null; species: string | null; city: string | null; wins: number; battles: number }>();
    for (const r of rows) {
      const e = by.get(r.id) ?? { id: r.id, pet_name: r.pet_name, species: r.species, city: r.city, wins: 0, battles: 0 };
      e.battles++;
      if ((JSON.parse(r.winners) as string[]).includes(r.id)) e.wins++;
      by.set(r.id, e);
    }
    return [...by.values()].sort((a, b) => b.wins - a.wins || a.battles - b.battles).slice(0, 50)
      .map((e, i) => ({ rank: i + 1, pet_name: e.pet_name, species: e.species, city: e.city, wins: e.wins, battles: e.battles, you: e.id === viewerId }));
  };

  return { get, create, join, quick, hostStart, leave, submit, view, listFor, record, leaderboard, clipView, uploadClip, clipAudio, reportClip, advance };
}
export type MimicService = ReturnType<typeof createMimicService>;
