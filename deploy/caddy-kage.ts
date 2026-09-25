// Replaces only the kageai.me site block in a shared Caddyfile (other sites untouched). Appends it if missing.
//   bun deploy/caddy-kage.ts /etc/caddy/Caddyfile <api-port> <web-port>
import { readFileSync, writeFileSync } from "node:fs";

const [file = "/etc/caddy/Caddyfile", apiPort = "8795", webPort = "3100"] = process.argv.slice(2);

const block = `kageai.me, www.kageai.me {
	encode zstd gzip
	@api path /v1/* /health
	handle @api {
		reverse_proxy 127.0.0.1:${apiPort} {
			flush_interval -1
		}
	}
	handle {
		reverse_proxy 127.0.0.1:${webPort}
	}
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
	}
}`.split("\n");

const lines = readFileSync(file, "utf8").split("\n");
const start = lines.findIndex((l) => /^(www\.)?kageai\.me[\s,{]/.test(l));
let out: string[];
if (start === -1) {
  out = [...lines, "", ...block];
} else {
  let end = start + 1;
  while (end < lines.length && lines[end] !== "}") end++;
  if (end >= lines.length) throw new Error("kageai.me block has no closing brace at column 0");
  out = [...lines.slice(0, start), ...block, ...lines.slice(end + 1)];
}
writeFileSync(file, out.join("\n"));
console.log(start === -1 ? "kageai.me block appended" : `kageai.me block replaced (lines ${start + 1}+)`);
