"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { WalletButton } from "@/components/wallet/WalletButton";
import { patchMe } from "@/lib/api";
import { pushSupported } from "@/lib/push";
import { usePet, type Language } from "@/lib/pet-store";
import { EnablePush } from "./EnablePush";
import { LanguagePicker } from "./LanguagePicker";
import { useWorker } from "./useWorker";

/** Everything a worker can change: identity, languages (routing), notifications, wallet, device sign-out. */
export function SettingsPanel() {
  const { ready, pet } = usePet();
  // mount the form only once the saved Scrappy is loaded, so its fields start from real values
  if (!ready || !pet) return null;
  return <SettingsForm key={pet.bornAt} />;
}

function SettingsForm() {
  const { pet, update, release } = usePet();
  const { token, profile, refresh } = useWorker();
  const { disconnect } = useWallet();
  const [name, setName] = useState(pet?.name ?? "");
  const [city, setCity] = useState(pet?.city ?? "");
  const [langs, setLangs] = useState<Language[]>(pet?.languages ?? []);
  const [state, setState] = useState<{ busy: boolean; msg: string; err: boolean }>({ busy: false, msg: "", err: false });

  if (!pet) return null;
  const dirty = name.trim() !== pet.name || city.trim() !== pet.city || langs.join() !== pet.languages.join();

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setState({ busy: false, msg: "Your Scrappy needs a name.", err: true });
    if (!langs.length) return setState({ busy: false, msg: "Keep at least one language: tasks are routed by language.", err: true });
    setState({ busy: true, msg: "", err: false });
    try {
      if (token) await patchMe(token, { pet_name: name.trim(), city: city.trim(), languages: langs });
      update({ name: name.trim(), city: city.trim(), languages: langs });
      refresh();
      setState({ busy: false, msg: "Saved. New tasks follow your languages.", err: false });
    } catch (err) {
      setState({ busy: false, msg: err instanceof Error ? err.message : "Could not save.", err: true });
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="font-display text-[clamp(1.9rem,4vw,2.6rem)] font-bold">Settings</h1>

      <form onSubmit={save} className="space-y-6 rounded-[26px] bg-ground-deep p-6 sm:p-8" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="s-name" className="block text-[15px] font-medium">Name</label>
            <input id="s-name" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} className="h-12 w-full rounded-[14px] bg-field px-4 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-leaf" />
          </div>
          <div className="space-y-2">
            <label htmlFor="s-city" className="block text-[15px] font-medium">City <span className="font-normal text-ink-soft">(for city ranks)</span></label>
            <input id="s-city" value={city} maxLength={40} onChange={(e) => setCity(e.target.value)} className="h-12 w-full rounded-[14px] bg-field px-4 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-leaf" />
          </div>
        </div>
        <fieldset className="space-y-3">
          <legend className="text-[15px] font-medium">Languages you can judge</legend>
          <LanguagePicker value={langs} onChange={setLangs} />
        </fieldset>
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={state.busy || !dirty}>{state.busy ? "Saving…" : "Save changes"}</Button>
          {state.msg && <p role={state.err ? "alert" : "status"} className={`text-[14px] ${state.err ? "text-[#ffb4a3]" : "text-ink-soft"}`}>{state.msg}</p>}
        </div>
      </form>

      <section className="space-y-3 rounded-[26px] bg-ground-deep p-6 sm:p-8">
        <h2 className="font-display text-[22px] font-bold">Notifications</h2>
        {!pushSupported() ? (
          <p className="text-ink-soft">This browser can&apos;t receive task notifications. Install the Scrappy app on Android to get them.</p>
        ) : profile?.push ? (
          <p className="text-ink-soft">On for this device. You get a buzz when an agent needs one of your languages.</p>
        ) : token ? (
          <EnablePush />
        ) : (
          <p className="text-ink-soft">Connect a wallet first.</p>
        )}
      </section>

      <section className="space-y-3 rounded-[26px] bg-ground-deep p-6 sm:p-8">
        <h2 className="font-display text-[22px] font-bold">Payout wallet</h2>
        <p className="text-ink-soft">Your Scrappy is tied to this wallet. To use another wallet, sign out and create a Scrappy with it.</p>
        <WalletButton />
      </section>

      <section className="space-y-3 rounded-[26px] bg-ground-deep p-6 sm:p-8">
        <h2 className="font-display text-[22px] font-bold">This device</h2>
        <p className="text-ink-soft">Signing out forgets {pet.name} on this device only. Your earnings and reputation stay with your wallet; connect it again to come back.</p>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Sign out of ${pet.name} on this device?`)) {
              disconnect().catch(() => {});
              release();
            }
          }}
          className="scrappy-focus h-11 rounded-[14px] bg-field px-5 font-semibold text-[#ffb4a3] transition-colors hover:bg-field-hover"
        >
          Sign out on this device
        </button>
      </section>
    </div>
  );
}
