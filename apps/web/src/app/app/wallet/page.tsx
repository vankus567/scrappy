import { EmptyState } from "@/components/app/EmptyState";

export default function WalletPage() {
  return (
    <EmptyState
      mood="happy"
      title="Nothing earned yet"
      body="Earnings land here in USDC, a digital dollar. You will be able to withdraw to UPI or your own wallet. Your money stays yours even if your pet dies."
    />
  );
}
