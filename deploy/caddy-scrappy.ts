// Manages the Scrappy API site block in a shared Caddyfile (other sites untouched).
// The API is the only thing on the VPS now: the web app lives on Vercel.
// Serves https://<vps-ip-as-sslip>/v1/* and /health via reverse_proxy to the local API port.
//   bun deploy/caddy-scrappy.ts /etc/caddy/Caddyfile <api-port> [host]
import { readFileSync, writeFileSync } from "node:fs";

const [file = "/etc/caddy/Caddyfile", apiPort = "8795", host = "187.127.137.136.sslip.io"] = process.argv.slice(2);

const block = `${host} {
	encode zstd gzip
	reverse_proxy 127.0.0.1:${apiPort} {
		flush_interval -1
	}
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
	}
}`.split("\n");

const lines = readFileSync(file, "utf8").split("\n");

// A site block ends at the first column-0 "}".
const blockEnd = (start: number) => {
  let end = start + 1;
  while (end < lines.length && lines[end] !== "}") end++;
  return end;
};

const out: string[] = [];
for (let i = 0; i < lines.length; i++) {
  // Drop the retired kageai.me site block and any previous Scrappy block; everything else stays.
  if (/^(www\.)?kageai\.me[\s,{]/.test(lines[i]) || lines[i].startsWith(host)) {
    i = blockEnd(i);
    continue;
  }
  out.push(lines[i]);
}
out.push("", ...block);
writeFileSync(file, out.join("\n"));
console.log(`${host} block written; retired site blocks removed`);
