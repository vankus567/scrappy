import type { Metadata } from "next";
import { PetProvider } from "@/lib/pet-store";
import { AppNav } from "@/components/app/AppNav";
import { HeroClouds } from "@/components/backgrounds/HeroClouds";
import { ScrappyWalletProvider } from "@/components/wallet/ScrappyWalletProvider";

export const metadata: Metadata = { title: "Scrappy" };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PetProvider>
      <ScrappyWalletProvider>
        <div className="app-sky relative isolate min-h-[100dvh] pb-32 md:pb-0">
          {/* the landing hero's sky carries into the app, fading into the page below */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[80vh] [mask-image:linear-gradient(to_bottom,#000_55%,transparent)]">
            <HeroClouds />
          </div>
          <AppNav />
          <main className="mx-auto w-full max-w-[1400px] px-4 pt-5 sm:px-8 md:pt-6">{children}</main>
        </div>
      </ScrappyWalletProvider>
    </PetProvider>
  );
}
