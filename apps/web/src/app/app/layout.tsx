import type { Metadata } from "next";
import { PetProvider } from "@/lib/pet-store";
import { AppNav } from "@/components/app/AppNav";

export const metadata: Metadata = { title: "Scrappy" };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PetProvider>
      <div className="min-h-[100dvh] pb-32 md:pb-0">
        <AppNav />
        <main className="mx-auto w-full max-w-[1400px] px-4 pt-5 sm:px-8 md:pt-6">{children}</main>
      </div>
    </PetProvider>
  );
}
