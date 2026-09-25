"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> };

/**
 * One "Download Scrappy" entry point. On Android with a published APK it downloads the
 * signed app; on installable browsers it opens the native install prompt; everywhere
 * else it just opens the web app, which is already the whole product.
 */
export function InstallApp({ apkUrl, className = "scrappy-btn" }: { apkUrl?: string; className?: string }) {
  const router = useRouter();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const android = typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const install = async () => {
    if (deferred) {
      await deferred.prompt();
      return;
    }
    router.push("/app");
  };

  if (apkUrl && android) {
    return (
      <a href={apkUrl} download className={className}>
        Download Scrappy
      </a>
    );
  }
  return (
    <button type="button" onClick={install} className={className}>
      Download Scrappy
    </button>
  );
}
