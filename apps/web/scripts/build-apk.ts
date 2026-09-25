// Builds the signed Android TWA APK with Bubblewrap, answering its prompts non-interactively.
// Needs: android.keystore + android-signing.local.json in this dir, Android SDK at
// ANDROID_HOME or %LOCALAPPDATA%/Android/Sdk, and Bubblewrap config at ~/.bubblewrap/config.json.
//   bun scripts/build-apk.ts
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// argv[2] can point at a scratch dir (e.g. ../../android-twa) that holds its own twa-manifest.json + keystore
const dir = join(dirname(fileURLToPath(import.meta.url)), "..", process.argv[2] ?? "");
const signing = JSON.parse(readFileSync(join(dir, "android-signing.local.json"), "utf8"));

const child = spawn("cmd", ["/c", "bunx", "@bubblewrap/cli", "build", "--skipPwaValidation"], {
  cwd: dir,
  env: {
    ...process.env,
    BUBBLEWRAP_KEYSTORE_PASSWORD: signing.storePassword,
    BUBBLEWRAP_KEY_PASSWORD: signing.keyPassword,
  },
});

let out = "";
const answered = new Set<string>();
const answer = (match: string, value: string) => {
  if (answered.has(match) || !out.includes(match)) return;
  answered.add(match);
  child.stdin.write(value + "\n");
};

child.stdout.on("data", (d) => {
  out += d.toString();
  answer("would you like to regenerate", "y");
  answer("versionName for the new App version", "0.1.0");
  answer("install the JDK", "y");
  process.stdout.write(d);
});
child.stderr.on("data", (d) => process.stderr.write(d));
child.on("exit", (code) => process.exit(code ?? 1));
