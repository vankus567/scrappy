import { ScrappyWalletProvider } from "@/components/wallet/ScrappyWalletProvider";
import { Handheld } from "./Handheld";

export const metadata = {
  title: "TIDEPOOL",
  description: "Keep the price in your net. A handheld game where every move is a real Orca liquidity position, signed by your own wallet.",
};

export default function TidepoolPage() {
  return (
    <ScrappyWalletProvider
      copy={{
        title: "Insert your cartridge",
        body: "Your wallet is your save. Set it to devnet. Every move asks your approval, and coins you collect land straight in it.",
      }}
    >
      <Handheld />
    </ScrappyWalletProvider>
  );
}
