import { createKeyPairSignerFromBytes, type TransactionSigner } from "@solana/kit";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, VersionedTransaction } from "@solana/web3.js";

/**
 * The play key: an ephemeral keypair minted on this device the first time the console boots.
 *
 * It is the game's scoped session key. The player's real wallet signs exactly one transaction -
 * the top-up - and from then on every move (devnet LP ops, mainnet meme swaps, auto-sells) is
 * signed on-device by the play key. Hard scope: it can only ever spend what was deposited into
 * the coin slot. A kid's phrase for it is "the coins in the machine"; on-chain it is a fresh
 * address whose game activity is not tied to the player's main wallet.
 *
 * Honesty note: the secret lives in localStorage. That is fine for pocket change (the design
 * caps exposure at the deposited amount) and becomes a Seed Vault key when a native build needs it.
 */
const STORE = "scrappyboy.session.v1";
const TX_FEE = BigInt(10_000); // headroom over the ~5k lamport base fee

async function confirm(conn: Connection, sig: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const { value } = await conn.getSignatureStatuses([sig]);
    const s = value[0];
    if (s?.err) throw new Error("transaction failed on-chain");
    if (s?.confirmationStatus === "confirmed" || s?.confirmationStatus === "finalized") return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("transaction not confirmed in 60 s");
}

export class SessionWallet {
  private constructor(readonly keypair: Keypair) {}

  /** Load the device's play key, or mint and store a fresh one. */
  static load(): SessionWallet {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) return new SessionWallet(Keypair.fromSecretKey(Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))));
    } catch {
      /* corrupt entry -> mint a fresh key below */
    }
    const kp = Keypair.generate();
    try {
      localStorage.setItem(STORE, btoa(String.fromCharCode(...kp.secretKey)));
    } catch {
      /* private mode: session lives in memory only */
    }
    return new SessionWallet(kp);
  }

  get address(): string {
    return this.keypair.publicKey.toBase58();
  }

  /** Sign + send a swap transaction (base64 v0) with the play key. No wallet popup. */
  async send(conn: Connection, b64: string): Promise<string> {
    const tx = VersionedTransaction.deserialize(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    tx.sign([this.keypair]);
    const sig = await conn.sendRawTransaction(tx.serialize());
    await confirm(conn, sig);
    return sig;
  }

  async solBalance(conn: Connection): Promise<bigint> {
    return BigInt(await conn.getBalance(this.keypair.publicKey));
  }

  async tokenBalance(conn: Connection, mint: string): Promise<bigint> {
    const accs = await conn.getParsedTokenAccountsByOwner(this.keypair.publicKey, { mint: new PublicKey(mint) });
    return accs.value.reduce((sum, a) => sum + BigInt((a.account.data.parsed.info.tokenAmount as { amount: string }).amount), BigInt(0));
  }

  /** Cash out: everything in the coin slot (minus fee) back to the player's real wallet. The play key signs. */
  async sweep(conn: Connection, to: PublicKey): Promise<string> {
    const bal = await conn.getBalance(this.keypair.publicKey);
    const amount = BigInt(bal) - TX_FEE;
    if (amount <= BigInt(0)) throw new Error("coin slot is empty");
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: this.keypair.publicKey, toPubkey: to, lamports: amount }),
    );
    tx.feePayer = this.keypair.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    tx.sign(this.keypair);
    const sig = await conn.sendRawTransaction(tx.serialize());
    await confirm(conn, sig);
    return sig;
  }

  /** The same key as a Solana Kit signer, so devnet cartridge moves sign silently too. */
  kitSigner(): Promise<TransactionSigner> {
    return createKeyPairSignerFromBytes(this.keypair.secretKey) as Promise<TransactionSigner>;
  }
}
