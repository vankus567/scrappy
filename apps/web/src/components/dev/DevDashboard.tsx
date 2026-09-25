"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { NetworkStats } from "@/components/scrappy/NetworkStats";
import { Button } from "@/components/ui/Button";
import {
  ApiError, createKey, createProject, creditDeposit, getConfig, getKeys, getPayments, getProject, getProjectTasks, patchProject, pct,
  revokeKey, secs, txUrl, usd, type ProjectOverview, type ProjectTask,
} from "@/lib/api";

const KEY = "scrappy.dev.key";
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const write = (k: string | null) => { try { if (k) localStorage.setItem(KEY, k); else localStorage.removeItem(KEY); } catch { /* blocked storage: session only */ } };

const TABS = ["Overview", "Tasks", "Funding", "Keys", "Integrations", "Network"] as const;
type Tab = (typeof TABS)[number];

export function DevDashboard() {
  const [key, setKey] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // hydrate from localStorage after mount (server render has no storage)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setKey(read()); setReady(true); }, []);
  if (!ready) return <div aria-busy="true" className="h-64 animate-pulse rounded-[24px] bg-ground-deep" />;
  if (!key) return <Onboard onKey={(k) => { write(k); setKey(k); }} />;
  return <Dashboard apiKey={key} signOut={() => { write(null); setKey(null); }} />;
}

// ---------------- onboarding ----------------
function Onboard({ onKey }: { onKey: (k: string) => void }) {
  const [name, setName] = useState("");
  const [wallet, setWallet] = useState("");
  const [paste, setPaste] = useState("");
  const [created, setCreated] = useState<{ api_key: string; webhook_secret: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (created) {
    return (
      <section className="mx-auto max-w-2xl rounded-[26px] bg-ground-deep p-6 sm:p-8">
        <h1 className="font-display text-[30px] font-bold">Your project is ready</h1>
        <p className="mt-2 text-ink-soft">Copy both now. They are shown once and stored only as hashes.</p>
        <Secret label="API key" value={created.api_key} />
        <Secret label="Webhook secret" value={created.webhook_secret} />
        <Button className="mt-6" arrow onClick={() => onKey(created.api_key)}>Open dashboard</Button>
      </section>
    );
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await createProject(name.trim(), wallet.trim() || undefined);
      setCreated(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the project.");
    } finally {
      setBusy(false);
    }
  };

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await getProject(paste.trim());
      onKey(paste.trim());
    } catch {
      setError("That key was not accepted.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-[1.2fr_1fr]">
      <form onSubmit={create} className="space-y-4 rounded-[26px] bg-ground-deep p-6 sm:p-8">
        <h1 className="font-display text-[30px] font-bold leading-tight">Give your agent a human</h1>
        <p className="text-ink-soft">Create a project to get an API key. Free to create; you pay only for human answers.</p>
        <Field id="pname" label="Project name" value={name} onChange={setName} />
        <Field id="pwallet" label="Funding wallet (optional, the Solana address you'll deposit USDC from)" value={wallet} onChange={setWallet} mono />
        <Button type="submit" disabled={busy || name.trim().length < 2} arrow>Create project</Button>
      </form>
      <form onSubmit={signIn} className="space-y-4 rounded-[26px] bg-ground-deep p-6 sm:p-8">
        <h2 className="font-display text-[24px] font-bold">Have a key?</h2>
        <Field id="pkey" label="API key" value={paste} onChange={setPaste} mono />
        <Button type="submit" disabled={busy || !paste.trim()}>Sign in</Button>
        <p className="text-[13px] text-ink-faint">Stored in this browser only.</p>
      </form>
      {error && <p role="alert" className="text-[15px] text-[#ffb4a3] md:col-span-2">{error}</p>}
    </div>
  );
}

// ---------------- dashboard ----------------
function Dashboard({ apiKey, signOut }: { apiKey: string; signOut: () => void }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [o, setO] = useState<ProjectOverview | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setO(await getProject(apiKey));
      setError("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) signOut();
      else setError("Can't reach Scrappy right now.");
    }
  }, [apiKey, signOut]);

  useEffect(() => {
    // async: state is set after the request resolves
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const t = window.setInterval(load, 10_000);
    return () => window.clearInterval(t);
  }, [load]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[14px] text-ink-faint">Project</p>
          <h1 className="font-display text-[clamp(1.8rem,4vw,2.6rem)] font-bold leading-tight">{o?.project.name ?? "…"}</h1>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <p className="text-[13px] text-ink-faint">Balance</p>
            <p className="money font-display text-[26px] font-bold tabular-nums">{o ? usd(o.balance_usdc) : "…"}</p>
          </div>
          <button type="button" onClick={signOut} className="scrappy-focus rounded text-[14px] text-ink-faint hover:text-ink-soft">Sign out</button>
        </div>
      </header>

      <div role="tablist" aria-label="Dashboard" className="flex gap-1 overflow-x-auto rounded-[16px] bg-ground-deep p-1.5">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`scrappy-focus shrink-0 rounded-[12px] px-4 py-2 text-[14px] font-semibold transition-colors ${tab === t ? "bg-field text-ink" : "text-ink-faint hover:text-ink-soft"}`}
          >
            {t}
          </button>
        ))}
        <Link href="/docs" className="scrappy-focus ml-auto shrink-0 rounded-[12px] px-4 py-2 text-[14px] font-semibold text-leaf hover:text-leaf-hover">Docs</Link>
      </div>

      {error && <p role="alert" className="text-ink-soft">{error}</p>}
      <div role="tabpanel">
        {tab === "Overview" && <Overview o={o} />}
        {tab === "Tasks" && <Tasks apiKey={apiKey} />}
        {tab === "Funding" && <Funding key={o?.project.funding_wallet ?? "none"} apiKey={apiKey} o={o} onCredit={load} />}
        {tab === "Keys" && <Keys apiKey={apiKey} />}
        {tab === "Integrations" && <Integrations />}
        {tab === "Network" && (
          <div className="space-y-3">
            <p className="text-[15px] text-ink-soft">Network-wide quality and capacity. Individual humans are never exposed.</p>
            <NetworkStats dense />
          </div>
        )}
      </div>
    </div>
  );
}

function Overview({ o }: { o: ProjectOverview | null }) {
  if (!o) return <div aria-busy="true" className="h-40 animate-pulse rounded-[22px] bg-ground-deep" />;
  const tiles: [string, string][] = [
    ["Tasks today", String(o.tasks.today)],
    ["Completed", String(o.tasks.completed)],
    ["Active now", String(o.tasks.active)],
    ["Avg time to answer", secs(o.avg_latency_ms)],
    ["Avg agreement", pct(o.avg_agreement)],
    ["Consensus rate", pct(o.consensus_rate)],
    ["Human spend", usd(o.human_spend_usdc)],
    ["All tasks", String(o.tasks.total)],
  ];
  return (
    <>
      <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {tiles.map(([k, v]) => (
          <div key={k} className="rounded-[20px] bg-ground-deep p-5">
            <dt className="text-[14px] text-ink-soft">{k}</dt>
            <dd className="mt-2 font-display text-[28px] font-bold leading-none tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {o.tasks.total === 0 && (
        <p className="mt-4 rounded-[20px] bg-ground-deep p-5 text-ink-soft">
          No tasks yet. Fund the project, then send your first call from the <b className="text-ink">Integrations</b> tab.
        </p>
      )}
    </>
  );
}

const STATUS: Record<string, string> = {
  completed: "Completed", low_confidence: "Low agreement", insufficient_capacity: "Not enough humans",
  matching: "Finding humans", collecting: "Answering", cancelled: "Cancelled",
};

function Tasks({ apiKey }: { apiKey: string }) {
  const [rows, setRows] = useState<ProjectTask[] | null>(null);
  useEffect(() => {
    let alive = true;
    const pull = () => getProjectTasks(apiKey).then((r) => alive && setRows(r.tasks)).catch(() => {});
    pull();
    const t = window.setInterval(pull, 5000);
    return () => { alive = false; window.clearInterval(t); };
  }, [apiKey]);
  if (!rows) return <div aria-busy="true" className="h-40 animate-pulse rounded-[22px] bg-ground-deep" />;
  if (!rows.length) return <p className="rounded-[20px] bg-ground-deep p-5 text-ink-soft">No tasks yet.</p>;
  return (
    <div className="overflow-x-auto rounded-[22px] bg-ground-deep">
      <table className="w-full min-w-[760px] text-left text-[14px]">
        <thead className="text-ink-faint">
          <tr>{["Task", "Status", "Answer", "Agreement", "Humans", "Time", "Cost", "When"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-edge">
          {rows.map((t) => (
            <tr key={t.task_id}>
              <td className="max-w-[260px] truncate px-4 py-3" title={t.prompt}>{t.prompt}</td>
              <td className="px-4 py-3 text-ink-soft">{STATUS[t.status] ?? t.status}</td>
              <td className="px-4 py-3 font-semibold">{t.answer ?? "–"}</td>
              <td className="px-4 py-3 tabular-nums">{pct(t.agreement)}</td>
              <td className="px-4 py-3 tabular-nums">{t.humans}/{t.humans_requested}</td>
              <td className="px-4 py-3 tabular-nums">{secs(t.latency_ms)}</td>
              <td className="px-4 py-3 tabular-nums">{usd(t.price_usdc - t.refund_usdc)}</td>
              <td className="px-4 py-3 text-ink-faint">{new Date(t.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Funding({ apiKey, o, onCredit }: { apiKey: string; o: ProjectOverview | null; onCredit: () => void }) {
  const [platform, setPlatform] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [wallet, setWallet] = useState(o?.project.funding_wallet ?? "");
  const [sig, setSig] = useState("");
  const [deposits, setDeposits] = useState<{ amount_usdc: number; tx_sig: string; at: string }[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const pull = useCallback(() => getPayments(apiKey).then((r) => setDeposits(r.deposits)).catch(() => {}), [apiKey]);
  useEffect(() => {
    getConfig().then((c) => { setPlatform(c.platform_wallet); setNetwork(c.network); }).catch(() => {});
    pull();
  }, [pull]);

  const saveWallet = async () => {
    setBusy(true);
    try { await patchProject(apiKey, { funding_wallet: wallet.trim() }); setMsg("Funding wallet saved."); onCredit(); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Could not save."); }
    finally { setBusy(false); }
  };
  const credit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await creditDeposit(apiKey, sig.trim());
      setMsg(`Credited ${usd(r.credited_usdc)}.`);
      setSig("");
      pull();
      onCredit();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not verify that transaction.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="space-y-4 rounded-[22px] bg-ground-deep p-6">
        <h2 className="font-display text-[22px] font-bold">Add USDC</h2>
        <ol className="list-decimal space-y-2 pl-5 text-[15px] text-ink-soft">
          <li>Set the wallet you&apos;ll pay from.</li>
          <li>Send USDC{network?.includes("EtWTRABZ") ? " (devnet)" : ""} to Scrappy: <span className="break-all font-mono text-[13px] text-ink">{platform ?? "…"}</span></li>
          <li>Paste the transaction signature. Scrappy checks it on-chain and credits it once.</li>
        </ol>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input aria-label="Funding wallet" value={wallet} onChange={(e) => setWallet(e.target.value)} spellCheck={false} className="h-11 min-w-0 flex-1 rounded-[12px] bg-field px-3 font-mono text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-leaf" />
          <Button type="button" disabled={busy || !wallet.trim()} onClick={saveWallet}>Save wallet</Button>
        </div>
        <form onSubmit={credit} className="flex flex-col gap-2 sm:flex-row">
          <input aria-label="Transaction signature" placeholder="Transaction signature" value={sig} onChange={(e) => setSig(e.target.value)} spellCheck={false} className="h-11 min-w-0 flex-1 rounded-[12px] bg-field px-3 font-mono text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-leaf" />
          <Button type="submit" disabled={busy || !sig.trim()}>Credit</Button>
        </form>
        {msg && <p role="status" className="text-[14px] text-ink-soft">{msg}</p>}
      </section>
      <section className="rounded-[22px] bg-ground-deep p-6">
        <h2 className="font-display text-[22px] font-bold">Deposits</h2>
        {deposits.length ? (
          <ul className="mt-3 divide-y divide-edge">
            {deposits.map((d) => (
              <li key={d.tx_sig} className="flex items-center justify-between gap-3 py-3 text-[14px]">
                <span className="money font-semibold tabular-nums">+{usd(d.amount_usdc)}</span>
                <span className="text-ink-faint">{new Date(d.at).toLocaleString()}</span>
                <a href={txUrl(d.tx_sig)} target="_blank" rel="noreferrer" className="font-semibold text-leaf hover:text-leaf-hover">Receipt</a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-ink-soft">No deposits yet. Or skip deposits: call without a key and pay per task over x402.</p>
        )}
      </section>
    </div>
  );
}

function Keys({ apiKey }: { apiKey: string }) {
  const [keys, setKeys] = useState<Awaited<ReturnType<typeof getKeys>>["keys"]>([]);
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const pull = useCallback(() => getKeys(apiKey).then((r) => setKeys(r.keys)).catch(() => {}), [apiKey]);
  useEffect(() => { pull(); }, [pull]);

  return (
    <section className="space-y-4 rounded-[22px] bg-ground-deep p-6">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await createKey(apiKey, label.trim() || "key");
          setFresh(r.api_key);
          setLabel("");
          pull();
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <input aria-label="Key label" placeholder="Label, e.g. production" value={label} onChange={(e) => setLabel(e.target.value)} className="h-11 min-w-0 flex-1 rounded-[12px] bg-field px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-leaf" />
        <Button type="submit">New key</Button>
      </form>
      {fresh && <Secret label="New key (shown once)" value={fresh} />}
      <ul className="divide-y divide-edge">
        {keys.map((k) => (
          <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-[14px]">
            <span className="font-mono">{k.prefix}…</span>
            <span className="text-ink-soft">{k.label}{k.current && " · this browser"}</span>
            <span className="text-ink-faint">{k.last_used_at ? `used ${new Date(k.last_used_at).toLocaleDateString()}` : "never used"}</span>
            {k.revoked_at ? (
              <span className="text-ink-faint">revoked</span>
            ) : (
              <button
                type="button"
                disabled={k.current}
                onClick={async () => { if (window.confirm("Revoke this key? Agents using it stop working immediately.")) { await revokeKey(apiKey, k.id); pull(); } }}
                className="scrappy-focus rounded font-semibold text-[#ffb4a3] disabled:text-ink-faint"
              >
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Integrations() {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {[
        ["SDK", `import { Scrappy } from "@scrappy/sdk";\nconst scrappy = new Scrappy({ apiKey: process.env.SCRAPPY_API_KEY });\nconst r = await scrappy.consensus({ task, humans: 3, budget: 0.3, deadline: 30 });`],
        ["MCP", `{ "mcpServers": { "scrappy": {\n  "command": "bun",\n  "args": ["<repo>/apps/mcp/src/index.ts"],\n  "env": { "SCRAPPY_API_KEY": "scrappy_sk_..." } } } }`],
        ["curl", `curl https://scrappypet.vercel.app/v1/consensus \\\n  -H "authorization: Bearer $SCRAPPY_API_KEY" \\\n  -H "content-type: application/json" \\\n  -d '{"task":"Is this reply safe to send?","humans":3,"budget":0.3}'`],
        ["Webhook check", `import { verifyWebhook } from "@scrappy/sdk";\nawait verifyWebhook(secret, rawBody, req.headers["x-scrappy-signature"]);`],
      ].map(([t, code]) => (
        <section key={t} className="rounded-[22px] bg-ground-deep p-5">
          <h3 className="font-semibold">{t}</h3>
          <pre className="mt-3 overflow-x-auto font-mono text-[12.5px] leading-relaxed text-ink-soft">{code}</pre>
        </section>
      ))}
    </div>
  );
}

// ---------------- bits ----------------
function Field({ id, label, value, onChange, mono }: { id: string; label: string; value: string; onChange: (v: string) => void; mono?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[14px] text-ink-soft">{label}</label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} autoComplete="off" className={`h-12 w-full rounded-[14px] bg-field px-4 outline-none focus-visible:ring-2 focus-visible:ring-leaf ${mono ? "font-mono text-[13px]" : "text-[16px]"}`} />
    </div>
  );
}

function Secret({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-4">
      <p className="text-[13px] text-ink-faint">{label}</p>
      <div className="mt-1 flex items-center gap-2 rounded-[12px] bg-field p-2 pl-3">
        <code className="min-w-0 flex-1 break-all font-mono text-[13px]">{value}</code>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(value).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); })}
          className="scrappy-focus shrink-0 rounded-[10px] px-3 py-1.5 text-[13px] font-semibold text-leaf hover:bg-field-hover"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
