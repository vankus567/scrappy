import { type Element, elementOf, type Side, verifyReveal } from "./battle";
import { type Game, GAME_ROUNDS as ROUNDS, type Play, scoreGame, validMove } from "./games";
import { type Db, uid } from "./db";
import type { WorkerPush } from "./payments";
import type { WorkerRow } from "./tasks";

/**
 * Battle service: matches between two players' pets, played round by round with commit-reveal.
 * Each round: both players commit sha256(move:salt), then both reveal. A round that passes its
 * deadline counts a missing move as a loss for that player, so async battles always finish.
 * Food stakes are held in escrow (taken from both pets at join) and paid to the winner; a draw refunds.
 */

export const ROUND_MS = 12 * 3_600_000; // async: each round stays open up to 12 h
export const OPEN_MS = 48 * 3_600_000; // an unanswered challenge expires after 2 days
export const QUICK_MATCH_MS = 10 * 60_000; // quick-match invites older than this are not joined
export const MAX_STAKE = 3;

export type BattleRow = {
  id: string; mode: "friend" | "quick"; game: Game; a_id: string; b_id: string | null; a_species: string; b_species: string | null;
  a_name: string | null; b_name: string | null; stake_food: number; status: "open" | "active" | "done" | "cancelled";
  winner: "a" | "b" | "draw" | null; round: number; round_deadline: number | null; created_at: number; finished_at: number | null;
};
type MoveRow = { battle_id: string; round: number; side: Side; commit_hash: string | null; move: string | null; salt: string | null };

export function migrateBattles(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS battles (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL CHECK (mode IN ('friend', 'quick')),
      a_id TEXT NOT NULL REFERENCES workers(id),
      b_id TEXT REFERENCES workers(id),
      a_species TEXT NOT NULL, b_species TEXT,
      a_name TEXT, b_name TEXT,
      stake_food INTEGER NOT NULL DEFAULT 0 CHECK (stake_food BETWEEN 0 AND ${MAX_STAKE}),
      status TEXT NOT NULL CHECK (status IN ('open', 'active', 'done', 'cancelled')),
      winner TEXT CHECK (winner IN ('a', 'b', 'draw')),
      round INTEGER NOT NULL DEFAULT 1,
      round_deadline INTEGER,
      created_at INTEGER NOT NULL,
      finished_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS battles_a ON battles(a_id, status);
    CREATE INDEX IF NOT EXISTS battles_b ON battles(b_id, status);
    CREATE INDEX IF NOT EXISTS battles_open ON battles(status, mode, created_at);
    CREATE TABLE IF NOT EXISTS battle_moves (
      battle_id TEXT NOT NULL REFERENCES battles(id),
      round INTEGER NOT NULL,
      side TEXT NOT NULL CHECK (side IN ('a', 'b')),
      commit_hash TEXT,
      move TEXT,
      salt TEXT,
      committed_at INTEGER,
      revealed_at INTEGER,
      PRIMARY KEY (battle_id, round, side)
    );
  `);
  // game modes arrived after battles first shipped
  const cols = (db.query("PRAGMA table_info(battles)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("game")) db.exec("ALTER TABLE battles ADD COLUMN game TEXT NOT NULL DEFAULT 'duel'");
}

type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });

export function createBattleService(db: Db, push?: WorkerPush) {
  const ping = (workerId: string, battleId: string, title: string, body: string) =>
    push?.(workerId, { title, body, url: `/app/battle/${battleId}`, tag: `battle-${battleId}` });
  migrateBattles(db);

  const get = (id: string) => db.query("SELECT * FROM battles WHERE id = ?").get(id) as BattleRow | null;
  const movesOf = (id: string) => db.query("SELECT * FROM battle_moves WHERE battle_id = ? ORDER BY round, side").all(id) as MoveRow[];
  const sideOf = (b: BattleRow, workerId: string): Side | null => (b.a_id === workerId ? "a" : b.b_id === workerId ? "b" : null);

  const canFight = (w: WorkerRow, stake: number): Fail | null => {
    if (w.pet_dead) return fail(409, "pet_dead");
    if (!w.species) return fail(409, "hatch a pet first");
    if (w.pet_food < stake) return fail(409, `your pet needs ${stake} food to stake; it has ${w.pet_food}`);
    return null;
  };

  const takeFood = (workerId: string, n: number) => {
    if (n <= 0) return true;
    return db.query("UPDATE workers SET pet_food = pet_food - ? WHERE id = ? AND pet_food >= ?").run(n, workerId, n).changes === 1;
  };
  const giveFood = (workerId: string, n: number) => {
    if (n > 0) db.query("UPDATE workers SET pet_food = pet_food + ? WHERE id = ?").run(n, workerId);
  };

  /** Rounds played so far as {a, b} moves; a round counts once both revealed or its deadline passed. */
  const playedRounds = (b: BattleRow, now: number) => {
    const rows = movesOf(b.id);
    const out: { a: Play; b: Play }[] = [];
    const play = (m: MoveRow | undefined): Play => (m?.move ? m.move : m?.commit_hash ? "locked" : null);
    for (let r = 1; r <= b.round; r++) {
      const a = play(rows.find((m) => m.round === r && m.side === "a"));
      const bm = play(rows.find((m) => m.round === r && m.side === "b"));
      const bothRevealed = !!a && a !== "locked" && !!bm && bm !== "locked";
      const closed = r < b.round || bothRevealed || (b.round_deadline !== null && now >= b.round_deadline);
      if (closed) out.push({ a, b: bm });
    }
    return out;
  };

  const elements = (b: BattleRow): [Element, Element] => [elementOf(b.a_species), elementOf(b.b_species)];

  /** Advances a battle through finished rounds and expired deadlines; settles the stake when it ends. Idempotent. */
  const advance = (b: BattleRow, now = Date.now()): BattleRow => {
    if (b.status === "open" && now - b.created_at > OPEN_MS) {
      db.transaction(() => {
        if (db.query("UPDATE battles SET status = 'cancelled', finished_at = ? WHERE id = ? AND status = 'open'").run(now, b.id).changes) giveFood(b.a_id, b.stake_food);
      })();
      return get(b.id)!;
    }
    if (b.status !== "active") return b;
    for (;;) {
      const cur = get(b.id)!;
      if (cur.status !== "active") return cur;
      const played = playedRounds(cur, now);
      const s = scoreGame(cur.game, played, ...elements(cur));
      if (s.done) {
        db.transaction(() => {
          const r = db.query("UPDATE battles SET status = 'done', winner = ?, finished_at = ? WHERE id = ? AND status = 'active'").run(s.winner, now, cur.id);
          if (!r.changes) return;
          const pot = cur.stake_food * 2;
          if (s.winner === "a") giveFood(cur.a_id, pot);
          else if (s.winner === "b") giveFood(cur.b_id!, pot);
          else {
            giveFood(cur.a_id, cur.stake_food);
            giveFood(cur.b_id!, cur.stake_food);
          }
        })();
        return get(cur.id)!;
      }
      if (played.length < cur.round) return cur; // current round still open
      // current round closed: open the next one
      const next = cur.round + 1;
      if (next > ROUNDS) return cur;
      // closed by timeout: chain from the old deadline so an abandoned battle runs out; closed by play: fresh window
      const timedOut = cur.round_deadline !== null && now >= cur.round_deadline;
      const deadline = timedOut ? cur.round_deadline! + ROUND_MS : now + ROUND_MS;
      db.query("UPDATE battles SET round = ?, round_deadline = ? WHERE id = ? AND round = ?").run(next, deadline, cur.id, cur.round);
    }
  };

  const create = (w: WorkerRow, mode: "friend" | "quick", stake: number, game: Game = "duel", now = Date.now()): { ok: true; battle: BattleRow } | Fail => {
    const bad = canFight(w, stake);
    if (bad) return bad;
    const id = uid();
    const ok = db.transaction(() => {
      if (!takeFood(w.id, stake)) return false;
      db.query(
        `INSERT INTO battles (id, mode, game, a_id, a_species, a_name, stake_food, status, round, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', 1, ?)`,
      ).run(id, mode, game, w.id, w.species!, w.pet_name, stake, now);
      return true;
    })();
    return ok ? { ok: true, battle: get(id)! } : fail(409, "not enough food");
  };

  const join = (id: string, w: WorkerRow, now = Date.now()): { ok: true; battle: BattleRow } | Fail => {
    const b0 = get(id);
    if (!b0) return fail(404, "battle not found");
    const b = advance(b0, now);
    if (b.a_id === w.id) return fail(409, "you can't battle yourself");
    if (b.status !== "open") return fail(409, b.status === "cancelled" ? "this challenge expired" : "this battle already has two pets");
    const bad = canFight(w, b.stake_food);
    if (bad) return bad;
    const ok = db.transaction(() => {
      if (!takeFood(w.id, b.stake_food)) return false;
      return db.query(
        "UPDATE battles SET b_id = ?, b_species = ?, b_name = ?, status = 'active', round = 1, round_deadline = ? WHERE id = ? AND status = 'open'",
      ).run(w.id, w.species!, w.pet_name, now + ROUND_MS, id).changes === 1;
    })();
    if (!ok) return fail(409, "this battle was just taken");
    ping(b.a_id, id, `${w.pet_name ?? "A pet"} accepted your challenge`, "Round 1: pick your move.");
    return { ok: true, battle: get(id)! };
  };

  /** Join the oldest recent quick-match invite from someone else, or open a new one. */
  const quick = (w: WorkerRow, game: Game = "duel", now = Date.now()) => {
    const waiting = db.query(
      "SELECT id FROM battles WHERE status = 'open' AND mode = 'quick' AND game = ? AND stake_food = 0 AND a_id != ? AND created_at >= ? ORDER BY created_at LIMIT 1",
    ).get(game, w.id, now - QUICK_MATCH_MS) as { id: string } | null;
    if (waiting) {
      const r = join(waiting.id, w, now);
      if (r.ok) return r;
    }
    const mine = db.query("SELECT * FROM battles WHERE status = 'open' AND mode = 'quick' AND game = ? AND a_id = ? AND created_at >= ?").get(game, w.id, now - QUICK_MATCH_MS) as BattleRow | null;
    return mine ? { ok: true as const, battle: mine } : create(w, "quick", 0, game, now);
  };

  const cancel = (id: string, w: WorkerRow, now = Date.now()): { ok: true } | Fail => {
    const b = get(id);
    if (!b || b.a_id !== w.id) return fail(404, "battle not found");
    const done = db.transaction(() => {
      if (!db.query("UPDATE battles SET status = 'cancelled', finished_at = ? WHERE id = ? AND status = 'open'").run(now, id).changes) return false;
      giveFood(w.id, b.stake_food);
      return true;
    })();
    return done ? { ok: true } : fail(409, "only an open challenge can be cancelled");
  };

  const commit = (id: string, w: WorkerRow, round: number, hash: string, now = Date.now()): { ok: true } | Fail => {
    const b0 = get(id);
    if (!b0) return fail(404, "battle not found");
    const b = advance(b0, now);
    const side = sideOf(b, w.id);
    if (!side) return fail(404, "battle not found");
    if (b.status !== "active") return fail(409, "battle is not in play");
    if (round !== b.round) return fail(409, `it's round ${b.round}`);
    if (!/^[0-9a-f]{64}$/.test(hash)) return fail(400, "commit must be a sha256 hex hash");
    const r = db.query(
      `INSERT INTO battle_moves (battle_id, round, side, commit_hash, committed_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(battle_id, round, side) DO NOTHING`,
    ).run(id, round, side, hash, now);
    if (!r.changes) return fail(409, "you already locked in this round");
    const other = side === "a" ? b.b_id : b.a_id;
    const theirMove = db.query("SELECT 1 FROM battle_moves WHERE battle_id = ? AND round = ? AND side != ?").get(id, round, side);
    if (other && !theirMove) ping(other, id, `Your turn: round ${round}`, `${(side === "a" ? b.a_name : b.b_name) ?? "Your opponent"} locked in a move.`);
    return { ok: true };
  };

  const reveal = async (id: string, w: WorkerRow, round: number, move: unknown, salt: unknown, now = Date.now()): Promise<{ ok: true; battle: BattleRow } | Fail> => {
    const b0 = get(id);
    if (!b0) return fail(404, "battle not found");
    const b = advance(b0, now);
    const side = sideOf(b, w.id);
    if (!side) return fail(404, "battle not found");
    if (b.status !== "active") return fail(409, "battle is not in play");
    if (round !== b.round) return fail(409, `it's round ${b.round}`);
    const rows = movesOf(id).filter((m) => m.round === round);
    const mine = rows.find((m) => m.side === side);
    const theirs = rows.find((m) => m.side !== side);
    if (!mine?.commit_hash) return fail(409, "lock in your move first");
    if (!theirs?.commit_hash) return fail(409, "wait for your opponent to lock in");
    if (mine.move) return fail(409, "already revealed");
    if (!(await verifyReveal(mine.commit_hash, move, salt))) return fail(400, "reveal does not match your locked-in move");
    const earlier = movesOf(id).filter((m) => m.side === side && m.round < round).map((m) => m.move);
    if (!validMove(b.game, move as string, round, earlier)) return fail(400, "that move isn't allowed in this round");
    db.query("UPDATE battle_moves SET move = ?, salt = ?, revealed_at = ? WHERE battle_id = ? AND round = ? AND side = ? AND move IS NULL").run(
      move as string, salt as string, now, id, round, side,
    );
    const after = advance(get(id)!, now);
    const other = side === "a" ? after.b_id : after.a_id;
    const me = side === "a" ? after.a_name : after.b_name;
    if (other && after.status === "done") {
      const won = after.winner === (side === "a" ? "b" : "a");
      ping(other, after.id, after.winner === "draw" ? "Battle over: it's a draw" : won ? "You won the battle!" : `${me ?? "Your opponent"} won the battle`, "Tap to see how it went.");
    } else if (other && after.round > round) ping(other, after.id, `Round ${after.round}: your move`, `${me ?? "Your opponent"} is ready.`);
    return { ok: true, battle: after };
  };

  /** What one player sees. The opponent's move for the current round stays hidden until the round closes. */
  const view = (b0: BattleRow, workerId: string | null, now = Date.now()) => {
    const b = advance(b0, now);
    const side = workerId ? sideOf(b, workerId) : null;
    const played = b.status === "open" ? [] : playedRounds(b, now);
    const s = scoreGame(b.game, played, ...elements(b));
    const cur = movesOf(b.id).filter((m) => m.round === b.round);
    const mine = side ? cur.find((m) => m.side === side) : undefined;
    const theirs = side ? cur.find((m) => m.side !== side) : undefined;
    const pet = (sp: string | null, name: string | null) => (sp ? { name: name ?? "Scrappy", species: sp, element: elementOf(sp) } : null);
    const inRound = b.status === "active" && played.length < b.round;
    return {
      id: b.id,
      mode: b.mode,
      game: b.game,
      ...(s.state && { state: s.state }),
      status: b.status,
      you: side,
      a: pet(b.a_species, b.a_name),
      b: pet(b.b_species, b.b_name),
      stake_food: b.stake_food,
      round: b.round,
      round_deadline: b.round_deadline ? new Date(b.round_deadline).toISOString() : null,
      score: { a: s.a, b: s.b },
      rounds: s.rounds,
      winner: b.winner,
      ...(side && inRound && {
        turn: {
          you_locked: !!mine?.commit_hash,
          they_locked: !!theirs?.commit_hash,
          you_revealed: !!mine?.move,
          they_revealed: !!theirs?.move,
          next: !mine?.commit_hash ? "lock" : !theirs?.commit_hash ? "wait_lock" : !mine?.move ? "reveal" : "wait_reveal",
        },
      }),
      created_at: new Date(b.created_at).toISOString(),
    };
  };

  /** A player's battles: waiting on them first, then open challenges, then recent results. */
  const listFor = (w: WorkerRow, now = Date.now()) => {
    const rows = db.query(
      "SELECT * FROM battles WHERE (a_id = ? OR b_id = ?) AND (status IN ('open', 'active') OR finished_at >= ?) ORDER BY created_at DESC LIMIT 40",
    ).all(w.id, w.id, now - 7 * 86_400_000) as BattleRow[];
    const views = rows.map((r) => view(r, w.id, now));
    const rank = (v: ReturnType<typeof view>) => (v.turn?.next === "lock" || v.turn?.next === "reveal" ? 0 : v.status === "active" ? 1 : v.status === "open" ? 2 : 3);
    return views.sort((x, y) => rank(x) - rank(y));
  };

  const record = (workerId: string) => {
    const r = db.query(
      `SELECT
         SUM(CASE WHEN (a_id = ?1 AND winner = 'a') OR (b_id = ?1 AND winner = 'b') THEN 1 ELSE 0 END) AS wins,
         SUM(CASE WHEN (a_id = ?1 AND winner = 'b') OR (b_id = ?1 AND winner = 'a') THEN 1 ELSE 0 END) AS losses,
         SUM(CASE WHEN winner = 'draw' THEN 1 ELSE 0 END) AS draws
       FROM battles WHERE status = 'done' AND (a_id = ?1 OR b_id = ?1)`,
    ).get(workerId) as { wins: number | null; losses: number | null; draws: number | null };
    return { wins: r.wins ?? 0, losses: r.losses ?? 0, draws: r.draws ?? 0 };
  };

  return { get, create, join, quick, cancel, commit, reveal, view, listFor, record, advance };
}
export type BattleService = ReturnType<typeof createBattleService>;
