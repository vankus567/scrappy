import { createKeyPairSignerFromBytes, type KeyPairSigner } from "@solana/kit";

/**
 * The "cartridge": the player's own devnet key, made on this device and kept in IndexedDB.
 * It signs every move, so the creature (an Orca position NFT) belongs to the player, not to us.
 * Devnet only. On Seeker this is replaced by Mobile Wallet Adapter.
 */

const DB = "tidepool";
const STORE = "cartridge";
const KEY = "slot1";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readBytes(): Promise<Uint8Array | null> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result ? new Uint8Array(req.result as ArrayBuffer) : null);
    req.onerror = () => reject(req.error);
  });
}

async function writeBytes(bytes: Uint8Array): Promise<void> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(bytes.slice().buffer, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** 64 bytes: 32-byte seed + 32-byte public key, the format Solana CLIs use. */
async function newKeyBytes(): Promise<Uint8Array> {
  const kp = (await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"])) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const out = new Uint8Array(64);
  out.set(pkcs8.slice(-32), 0);
  out.set(pub, 32);
  return out;
}

export async function insertCartridge(): Promise<{ signer: KeyPairSigner; fresh: boolean }> {
  let bytes = await readBytes();
  const fresh = !bytes;
  if (!bytes) {
    bytes = await newKeyBytes();
    await writeBytes(bytes);
  }
  return { signer: await createKeyPairSignerFromBytes(bytes), fresh };
}

/** Backup of the save, as a Solana CLI keypair JSON the player can import anywhere. */
export async function exportSave(): Promise<string | null> {
  const bytes = await readBytes();
  return bytes ? JSON.stringify([...bytes]) : null;
}

export const shortId = (a: string) => `${a.slice(0, 4)}..${a.slice(-4)}`;
