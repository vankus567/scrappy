import { ScrappyWalletProvider } from "@/components/wallet/ScrappyWalletProvider";
import { Handheld } from "./Handheld";

export const metadata = {
  title: "SCRAPPY BOY",
  description: "Keep the price in your net. A handheld where every button is a trade, signed on-device by your play key.",
};

export default function ScrappyBoyPage() {
  return (
    <ScrappyWalletProvider
      copy={{
        title: "Load a coin",
        body: "Your wallet only tops up the coin slot. After that every move signs on-device with your play key, no popups.",
      }}
    >
      <Handheld />
    </ScrappyWalletProvider>
  );
}
