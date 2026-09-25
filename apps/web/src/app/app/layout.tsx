import type { Metadata } from "next";
import { PetProvider } from "@/lib/pet-store";
import { AppNav } from "@/components/app/AppNav";
import { PetGate } from "@/components/app/PetGate";
import { KageWalletProvider } from "@/components/wallet/KageWalletProvider";
import { WalletLinkProvider } from "@/components/wallet/WalletLink";

export const metadata: Metadata = { title: "Kage" };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PetProvider>
      <KageWalletProvider>
        <WalletLinkProvider>
          <div className="min-h-[100dvh] pb-32 md:pb-10">
            <AppNav />
            <main className="mx-auto w-full max-w-[1400px] px-4 pt-4 sm:px-8 md:pt-6"><PetGate>{children}</PetGate></main>
          </div>
        </WalletLinkProvider>
      </KageWalletProvider>
    </PetProvider>
  );
}
