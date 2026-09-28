import { VersionedTransaction } from "@solana/web3.js";
import { address, getTransactionDecoder, getTransactionEncoder, type Transaction, type TransactionModifyingSigner } from "@solana/kit";

/**
 * Wraps the player's own wallet (Phantom, Solflare, Backpack, or the Seeker wallet via Mobile Wallet
 * Adapter) as a Solana Kit signer. Every SCRAPPY BOY transaction is approved in the player's wallet;
 * the game never holds a key.
 *
 * It is a "modifying" signer because wallets may add instructions (e.g. priority fees) before signing,
 * so we take back the wallet's version of the transaction instead of assuming it is unchanged.
 */
export function walletSigner(
  pubkey: string,
  sign: (tx: VersionedTransaction) => Promise<VersionedTransaction>,
): TransactionModifyingSigner {
  const enc = getTransactionEncoder();
  const dec = getTransactionDecoder();
  return {
    address: address(pubkey),
    modifyAndSignTransactions: async (txs: readonly Transaction[]) =>
      Promise.all(
        txs.map(async (tx: Transaction) => {
          const v = VersionedTransaction.deserialize(new Uint8Array(enc.encode(tx)));
          const signed = await sign(v);
          const back = dec.decode(signed.serialize());
          return { ...tx, ...back };
        }),
      ),
  } as unknown as TransactionModifyingSigner;
}
