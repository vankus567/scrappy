import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { type Db, uid } from "./db";

/**
 * Proof-native tasks: an agent can require a photo and/or a GPS fix taken at a place.
 * The API checks the proof before the answer counts (and before the human is paid),
 * stores the photo with its sha256, and hands the agent the evidence with the answer.
 */

export const NEARBY_M = 10_000; // a located task is routed to workers within this distance
const MAX_GPS_SLACK_M = 150; // phone GPS accuracy we forgive on top of the task radius
const MAX_FIX_AGE_MS = 10 * 60_000; // the fix must be from the last 10 minutes
const MAX_PHOTO_BYTES = 2_500_000;

export const placeInput = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radius_m: z.number().int().min(25).max(5_000).default(250),
  name: z.string().trim().min(2).max(120).optional(),
});
export type Place = z.infer<typeof placeInput>;

export const proofInput = z.object({ photo: z.boolean().default(false), gps: z.boolean().default(false) });
export type ProofReq = z.infer<typeof proofInput>;

export const proofSubmit = z.object({
  photo: z.string().max(Math.ceil(MAX_PHOTO_BYTES * 1.4)).optional(), // data URL or bare base64
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  accuracy_m: z.number().min(0).max(10_000).optional(),
  captured_at: z.string().datetime().optional(),
});
export type ProofSubmit = z.infer<typeof proofSubmit>;

/** Great-circle distance in metres. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

const IMAGE_MAGIC: [string, number[]][] = [
  ["image/jpeg", [0xff, 0xd8, 0xff]],
  ["image/png", [0x89, 0x50, 0x4e, 0x47]],
  ["image/webp", [0x52, 0x49, 0x46, 0x46]],
];

/** Decodes a photo and checks it really is an image by its bytes, not its label. */
export function decodePhoto(raw: string): { ok: true; bytes: Uint8Array; mime: string } | { ok: false; error: string } {
  const b64 = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(Buffer.from(b64, "base64"));
  } catch {
    return { ok: false, error: "photo is not valid base64" };
  }
  if (bytes.length < 1_000) return { ok: false, error: "photo is too small to be a real photo" };
  if (bytes.length > MAX_PHOTO_BYTES) return { ok: false, error: "photo is larger than 2.5 MB" };
  const hit = IMAGE_MAGIC.find(([, m]) => m.every((v, i) => bytes[i] === v));
  if (!hit) return { ok: false, error: "photo must be a JPEG, PNG or WebP image" };
  return { ok: true, bytes, mime: hit[0] };
}

export type CheckedProof = {
  photo: { bytes: Uint8Array; mime: string } | null;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  distance_m: number | null;
  location_verified: boolean;
  captured_at: number | null;
};

/** Validates a worker's proof against what the task requires. Nothing is stored here. */
export function checkProof(req: ProofReq, place: Place | null, sub: ProofSubmit | undefined, now = Date.now()):
  { ok: true; proof: CheckedProof } | { ok: false; error: string } {
  const s = sub ?? {};
  let photo: CheckedProof["photo"] = null;
  if (s.photo) {
    const d = decodePhoto(s.photo);
    if (!d.ok) return d;
    photo = { bytes: d.bytes, mime: d.mime };
  }
  if (req.photo && !photo) return { ok: false, error: "this task needs a photo as proof" };

  const hasFix = s.lat !== undefined && s.lng !== undefined;
  if (req.gps && !hasFix) return { ok: false, error: "this task needs your location as proof: allow location and try again" };

  const capturedAt = s.captured_at ? Date.parse(s.captured_at) : null;
  if (hasFix && capturedAt !== null && (capturedAt > now + 60_000 || now - capturedAt > MAX_FIX_AGE_MS)) {
    return { ok: false, error: "your location fix is too old: refresh location and try again" };
  }

  let distance: number | null = null;
  let verified = false;
  if (hasFix && place) {
    distance = distanceM({ lat: s.lat!, lng: s.lng! }, place);
    const slack = Math.min(s.accuracy_m ?? MAX_GPS_SLACK_M, MAX_GPS_SLACK_M);
    verified = distance <= place.radius_m + slack;
    if (req.gps && !verified) {
      return { ok: false, error: `you are ${distance} m from ${place.name ?? "the place"}; get within ${place.radius_m} m and try again` };
    }
  }
  return {
    ok: true,
    proof: {
      photo, lat: s.lat ?? null, lng: s.lng ?? null, accuracy_m: s.accuracy_m ?? null,
      distance_m: distance, location_verified: verified, captured_at: capturedAt,
    },
  };
}

type ProofRow = {
  id: string; task_id: string; worker_id: string; photo_file: string | null; photo_mime: string | null; photo_sha256: string | null;
  lat: number | null; lng: number | null; accuracy_m: number | null; distance_m: number | null; location_verified: number;
  captured_at: number | null; created_at: number;
};

export function createProofStore(db: Db, dir = process.env.PROOF_DIR ?? "proofs") {
  mkdirSync(dir, { recursive: true });

  const save = async (taskId: string, workerId: string, p: CheckedProof, now = Date.now()) => {
    const id = uid();
    let file: string | null = null;
    let sha: string | null = null;
    if (p.photo) {
      file = `${id}.${p.photo.mime.split("/")[1]}`;
      sha = new Bun.CryptoHasher("sha256").update(p.photo.bytes).digest("hex");
      await Bun.write(join(dir, file), p.photo.bytes);
    }
    db.query(
      `INSERT INTO task_proofs (id, task_id, worker_id, photo_file, photo_mime, photo_sha256, lat, lng, accuracy_m, distance_m, location_verified, captured_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, taskId, workerId, file, p.photo?.mime ?? null, sha, p.lat, p.lng, p.accuracy_m, p.distance_m, p.location_verified ? 1 : 0, p.captured_at, now);
    return id;
  };

  const get = (id: string) => db.query("SELECT * FROM task_proofs WHERE id = ?").get(id) as ProofRow | null;

  const photo = (row: ProofRow) => (row.photo_file ? Bun.file(join(dir, row.photo_file)) : null);

  /** Undo a save when the answer it backed was refused. */
  const remove = async (id: string) => {
    const row = get(id);
    if (!row) return;
    db.query("DELETE FROM task_proofs WHERE id = ?").run(id);
    if (row.photo_file) await Bun.file(join(dir, row.photo_file)).delete().catch(() => {});
  };

  return { save, get, photo, remove };
}
export type ProofStore = ReturnType<typeof createProofStore>;

/** Evidence the agent gets back, one entry per human. Never exposes who the human is. */
export function proofsForTask(db: Db, taskId: string) {
  const rows = db.query("SELECT * FROM task_proofs WHERE task_id = ? ORDER BY created_at").all(taskId) as ProofRow[];
  return rows.map((r) => ({
    proof_id: r.id,
    ...(r.photo_file && { photo_url: `/v1/proofs/${r.id}/photo`, photo_sha256: r.photo_sha256 }),
    ...(r.lat !== null && { location: { lat: r.lat, lng: r.lng, accuracy_m: r.accuracy_m } }),
    ...(r.distance_m !== null && { distance_m: r.distance_m }),
    location_verified: !!r.location_verified,
    captured_at: new Date(r.captured_at ?? r.created_at).toISOString(),
    submitted_at: new Date(r.created_at).toISOString(),
  }));
}
