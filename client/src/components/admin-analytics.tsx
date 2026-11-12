/**
 * Admin > Analytics: what is being read, at a glance.
 *
 * One request (GET /api/v1/admin/analytics, api/_lib/analytics.js) feeds the
 * whole screen. Reads are article_views rows (a reader's first visit to an
 * article); the public "shown on site" counters are reported apart because
 * they can be set by hand.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Info,
  Minus,
  RefreshCw,
} from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

/* ------------------------------------------------------------------ types */

type RangeKey = "24h" | "7d" | "30d" | "90d";

interface Totals {
  reads: number;
  readers: number;
  signedInReaders: number;
  newUsers: number | null;
  newFollowers: number | null;
  comments: number;
  articlesPublished: number;
}

interface Traffic {
  views: number;
  visitors: number;
  referrers: { host: string | null; kind: string; views: number }[];
  sourceKinds: { kind: string; views: number }[];
  countries: { country: string | null; views: number }[];
  devices: { device: string; views: number }[];
  bots: {
    total: number;
    errors: number;
    lastSeen: string | null;
    daysWithoutHits: number | null;
    list: { name: string; ai: boolean; hits: number; errors: number; lastSeen: string | null }[];
  };
  readThrough: {
    events: number;
    medianEngagedSeconds: number | null;
    medianScrollPct: number | null;
    finishedShare: number | null;
  };
}

export interface AnalyticsData {
  range: { key: RangeKey; from: string; to: string; days: number; bucket: "hour" | "day"; tz: number };
  generatedAt: string;
  truncated: boolean;
  totals: Totals;
  previous: Totals;
  series: { date: string; reads: number; readers: number; previousReads: number; articlesPublished: number; comments: number }[];
  topArticles: {
    id: number; title: string; slug: string | null; channelName: string | null;
    reads: number; shownOnSite: number | null; comments: number;
  }[];
  topChannels: { id: number; name: string; reads: number; articlesPublished: number; newFollowers: number | null }[];
  freshArticles: {
    id: number; title: string; slug: string | null; channelName: string | null;
    publishedAt: string; reads: number; hasCover: boolean | null;
  }[];
  readers: { returning: number; new: number; signedIn: number; anonymous: number; articlesPerReader: number | null };
  health: { lastApiPublishAt: string | null; articlesWithoutCover: number; crawlerErrors: number | null; crawlerHits: number | null };
  traffic: Traffic | null;
}

const RANGES: { key: RangeKey; label: string; long: string; previous: string }[] = [
  { key: "24h", label: "24 hours", long: "the last 24 hours", previous: "the 24 hours before" },
  { key: "7d", label: "7 days", long: "the last 7 days", previous: "the previous 7 days" },
  { key: "30d", label: "30 days", long: "the last 30 days", previous: "the previous 30 days" },
  { key: "90d", label: "90 days", long: "the last 90 days", previous: "the previous 90 days" },
];

/* --------------------------------------------------------------- helpers */

const nf = new Intl.NumberFormat();
const fmt = (n: number | null | undefined) => (n == null ? "–" : nf.format(n));

function change(cur: number | null, prev: number | null): { pct: number | null; dir: "up" | "down" | "flat" | "new" | "none" } {
  if (cur == null || prev == null) return { pct: null, dir: "none" };
  if (prev === 0) return cur === 0 ? { pct: 0, dir: "flat" } : { pct: null, dir: "new" };
  const pct = Math.round(((cur - prev) / prev) * 100);
  return { pct, dir: pct > 0 ? "up" : pct < 0 ? "down" : "flat" };
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400 * 2) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

function axisLabel(date: string, bucket: "hour" | "day"): string {
  if (bucket === "hour") return date.slice(11, 16);
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
}

const articleHref = (a: { id: number; slug: string | null }) => (a.slug ? `/articles/${a.id}/${a.slug}` : `/articles/${a.id}`);

const COUNTRY_NAMES = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(undefined, { type: "region" }) : null;
const countryName = (code: string | null) => {
  if (!code) return "Unknown";
  try {
    return COUNTRY_NAMES?.of(code) || code;
  } catch {
    return code;
  }
};

const SOURCE_KIND_LABEL: Record<string, string> = {
  ai: "AI assistant",
  search: "Search",
  social: "Social",
  campaign: "Campaign",
  direct: "Direct",
  other: "Link",
};

const DEVICE_LABEL: Record<string, string> = { mobile: "Phone", desktop: "Computer", tablet: "Tablet", unknown: "Unknown" };

/* ------------------------------------------------------------ primitives */

function Panel({ title, hint, children, className }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-[hsl(var(--edition-border))] bg-[hsl(var(--edition-bg))] p-4 sm:p-5", className)}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="font-display text-lg font-bold leading-tight text-[hsl(var(--edition-text))]">{title}</h3>
        {hint && <span className="text-right text-xs text-[hsl(var(--edition-text-muted))]">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Empty({ children = "No readers recorded yet in this period" }: { children?: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-[hsl(var(--edition-text-muted))]">{children}</p>;
}

function Delta({ cur, prev, previousLabel }: { cur: number | null; prev: number | null; previousLabel: string }) {
  const c = change(cur, prev);
  if (c.dir === "none") return <span className="text-xs text-[hsl(var(--edition-text-dim))]">Not tracked yet</span>;
  const label =
    c.dir === "new" ? `New (none ${previousLabel.replace(/^the /, "in the ")})` :
    c.dir === "flat" ? `Same as ${previousLabel}` :
    `${Math.abs(c.pct!)}% ${c.dir === "up" ? "up" : "down"} on ${previousLabel}`;
  const Icon = c.dir === "up" || c.dir === "new" ? ArrowUpRight : c.dir === "down" ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        c.dir === "up" || c.dir === "new" ? "text-[hsl(var(--edition-positive))]" : c.dir === "down" ? "text-[hsl(var(--edition-negative))]" : "text-[hsl(var(--edition-text-muted))]"
      )}
    >
      <Icon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
      <span className="sm:hidden">{c.dir === "new" ? "New" : c.dir === "flat" ? "No change" : `${Math.abs(c.pct!)}% ${c.dir}`}</span>
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

function Tile({ label, value, prev, previousLabel, empty, primary }: {
  label: string; value: number | null; prev: number | null; previousLabel: string; empty: boolean; primary?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-xl border p-3.5 sm:p-4",
      primary ? "border-[hsl(var(--edition-accent))]/40 bg-[hsl(var(--edition-accent))]/5" : "border-[hsl(var(--edition-border))] bg-[hsl(var(--edition-panel))]"
    )}>
      <div className="text-[13px] font-medium text-[hsl(var(--edition-text-secondary))]">{label}</div>
      <div className={cn("mt-1 font-display font-bold tabular-nums leading-none text-[hsl(var(--edition-text))]", primary ? "text-4xl" : "text-3xl", (empty || value == null) && "text-[hsl(var(--edition-text-dim))]")}>
        {value == null ? "–" : empty && value === 0 ? "None" : fmt(value)}
      </div>
      <div className="mt-2 min-h-[1rem]">
        {value == null ? (
          <span className="text-xs text-[hsl(var(--edition-text-dim))]">Not tracked yet</span>
        ) : empty && value === 0 && !prev ? (
          <span className="text-xs text-[hsl(var(--edition-text-dim))]">None in either period</span>
        ) : (
          <Delta cur={value} prev={prev} previousLabel={previousLabel} />
        )}
      </div>
    </div>
  );
}

/** Horizontal bar list: label, bar, value. */
function BarList({ rows, emptyText }: { rows: { key: string; label: React.ReactNode; value: number; tag?: React.ReactNode }[]; emptyText?: string }) {
  if (!rows.length) return <Empty>{emptyText}</Empty>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} className="text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[hsl(var(--edition-text))]">
              {r.label}
              {r.tag}
            </span>
            <span className="flex-shrink-0 tabular-nums font-medium text-[hsl(var(--edition-text))]">{fmt(r.value)}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-[hsl(var(--edition-border-hair))]" aria-hidden>
            <div className="h-1.5 rounded-full bg-[hsl(var(--edition-accent))]" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Tag({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "accent" | "negative" }) {
  return (
    <span className={cn(
      "ml-2 inline-block rounded px-1.5 py-px align-middle text-[10px] font-semibold uppercase tracking-wide",
      tone === "accent" ? "bg-[hsl(var(--edition-accent))]/10 text-[hsl(var(--edition-accent))]" :
      tone === "negative" ? "bg-[hsl(var(--edition-negative))]/10 text-[hsl(var(--edition-negative))]" :
      "bg-[hsl(var(--edition-border-hair))] text-[hsl(var(--edition-text-muted))]"
    )}>
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------- pieces */

function Headline({ data, range }: { data: AnalyticsData; range: (typeof RANGES)[number] }) {
  const { totals, previous, topArticles } = data;
  if (!totals.reads) {
    return (
      <p className="font-display text-xl font-bold leading-snug text-[hsl(var(--edition-text))] sm:text-2xl">
        No readers recorded yet in {range.long}.
      </p>
    );
  }
  const c = change(totals.reads, previous.reads);
  const trend =
    c.dir === "up" ? <span className="text-[hsl(var(--edition-positive))]">up {c.pct}%</span> :
    c.dir === "down" ? <span className="text-[hsl(var(--edition-negative))]">down {Math.abs(c.pct!)}%</span> :
    c.dir === "new" ? <span className="text-[hsl(var(--edition-positive))]">up from none</span> :
    <span>level</span>;
  const top = topArticles[0];
  return (
    <div className="space-y-1">
      <p className="font-display text-xl font-bold leading-snug text-[hsl(var(--edition-text))] sm:text-2xl">
        {fmt(totals.reads)} reads by {fmt(totals.readers)} {totals.readers === 1 ? "reader" : "readers"}, {trend} on {range.previous}.
      </p>
      {top && (
        <p className="text-[15px] text-[hsl(var(--edition-text-secondary))]">
          Top story:{" "}
          <Link href={articleHref(top)} className="font-semibold text-[hsl(var(--edition-text))] hover:text-[hsl(var(--edition-accent))] hover:underline">
            {top.title}
          </Link>{" "}
          <span className="whitespace-nowrap">({fmt(top.reads)} {top.reads === 1 ? "read" : "reads"})</span>
        </p>
      )}
    </div>
  );
}

const chartConfig = {
  reads: { label: "Reads", theme: { light: "#2563eb", dark: "#3b82f6" } },
  readers: { label: "Readers", theme: { light: "#ea580c", dark: "#ea580c" } },
  previousReads: { label: "Reads, previous period", theme: { light: "#a3a3a3", dark: "#737373" } },
} satisfies ChartConfig;

function ReadsChart({ data }: { data: AnalyticsData }) {
  const bucket = data.range.bucket;
  const points = useMemo(
    () =>
      data.series.map((s, i, all) => ({
        ...s,
        label: i === all.length - 1 ? (bucket === "hour" ? "Now" : "Today") : axisLabel(s.date, bucket),
      })),
    [data.series, bucket]
  );
  if (!data.totals.reads && !data.previous.reads) return <Empty />;
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full sm:h-[260px]">
      <LineChart data={points} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-[hsl(var(--edition-border-hair))]" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={44} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Line dataKey="reads" type="monotone" stroke="var(--color-reads)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
        <Line dataKey="readers" type="monotone" stroke="var(--color-readers)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        <Line dataKey="previousReads" type="monotone" stroke="var(--color-previousReads)" strokeWidth={2} strokeDasharray="4 4" dot={false} />
      </LineChart>
    </ChartContainer>
  );
}

function MostRead({ data }: { data: AnalyticsData }) {
  if (!data.topArticles.length) return <Empty />;
  return (
    <ol className="divide-y divide-[hsl(var(--edition-border-hair))]">
      <li className="flex items-center gap-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--edition-text-dim))]" aria-hidden>
        <span className="w-5" />
        <span className="flex-1">Story</span>
        <span className="w-14 text-right">Reads</span>
        <span className="hidden w-20 text-right sm:block">Shown on site</span>
      </li>
      {data.topArticles.map((a, i) => (
        <li key={a.id} className="flex items-start gap-3 py-2.5">
          <span className="w-5 pt-0.5 text-right font-display text-sm font-bold tabular-nums text-[hsl(var(--edition-text-dim))]">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <Link href={articleHref(a)} className="line-clamp-2 text-[15px] font-semibold leading-snug text-[hsl(var(--edition-text))] hover:text-[hsl(var(--edition-accent))] hover:underline">
              {a.title}
            </Link>
            <div className="mt-0.5 text-xs text-[hsl(var(--edition-text-muted))]">
              {a.channelName || "No channel"}
              {a.comments > 0 && ` · ${a.comments} ${a.comments === 1 ? "comment" : "comments"}`}
              <span className="sm:hidden"> · shown on site {fmt(a.shownOnSite)}</span>
            </div>
          </div>
          <span className="w-14 text-right font-display text-lg font-bold tabular-nums text-[hsl(var(--edition-text))]">{fmt(a.reads)}</span>
          <span className="hidden w-20 pt-1 text-right text-sm tabular-nums text-[hsl(var(--edition-text-muted))] sm:block">{fmt(a.shownOnSite)}</span>
        </li>
      ))}
    </ol>
  );
}

function Channels({ data }: { data: AnalyticsData }) {
  if (!data.topChannels.length) return <Empty />;
  const followers = data.topChannels.some((c) => c.newFollowers != null);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--edition-text-dim))]">
          <th className="pb-2 text-left font-semibold">Channel</th>
          <th className="pb-2 text-right font-semibold">Reads</th>
          <th className="pb-2 text-right font-semibold">Published</th>
          {followers && <th className="pb-2 text-right font-semibold">New followers</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-[hsl(var(--edition-border-hair))]">
        {data.topChannels.map((c) => (
          <tr key={c.id}>
            <td className="max-w-0 truncate py-2 pr-2 font-medium text-[hsl(var(--edition-text))]">{c.name}</td>
            <td className="py-2 text-right font-semibold tabular-nums">{fmt(c.reads)}</td>
            <td className="py-2 text-right tabular-nums text-[hsl(var(--edition-text-secondary))]">{fmt(c.articlesPublished)}</td>
            {followers && <td className="py-2 text-right tabular-nums text-[hsl(var(--edition-text-secondary))]">{fmt(c.newFollowers)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Fresh({ data }: { data: AnalyticsData }) {
  if (!data.freshArticles.length) return <Empty>Nothing published in this period</Empty>;
  return (
    <ul className="divide-y divide-[hsl(var(--edition-border-hair))]">
      {data.freshArticles.map((a) => (
        <li key={a.id} className="flex items-start gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <Link href={articleHref(a)} className="line-clamp-2 text-[15px] font-semibold leading-snug text-[hsl(var(--edition-text))] hover:text-[hsl(var(--edition-accent))] hover:underline">
              {a.title}
            </Link>
            <div className="mt-0.5 text-xs text-[hsl(var(--edition-text-muted))]">
              {timeAgo(a.publishedAt)}
              {a.channelName && ` · ${a.channelName}`}
              {a.hasCover === false && <Tag tone="negative">No cover</Tag>}
            </div>
          </div>
          <span className={cn("w-16 text-right tabular-nums", a.reads ? "font-display text-lg font-bold text-[hsl(var(--edition-text))]" : "pt-1 text-sm text-[hsl(var(--edition-text-dim))]")}>
            {a.reads ? fmt(a.reads) : "No reads"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="text-sm text-[hsl(var(--edition-text-secondary))]">
        {label}
        {note && <span className="block text-xs text-[hsl(var(--edition-text-dim))]">{note}</span>}
      </span>
      <span className="flex-shrink-0 font-semibold tabular-nums text-[hsl(var(--edition-text))]">{value}</span>
    </div>
  );
}

function Readers({ data, range }: { data: AnalyticsData; range: (typeof RANGES)[number] }) {
  const r = data.readers;
  if (!data.totals.readers) return <Empty />;
  const rt = data.traffic?.readThrough;
  return (
    <div className="divide-y divide-[hsl(var(--edition-border-hair))]">
      <Stat label="New readers" value={fmt(r.new)} note={`Did not read anything in ${range.previous}`} />
      <Stat label="Returning readers" value={fmt(r.returning)} note={`Also read in ${range.previous}`} />
      <Stat label="Signed in" value={fmt(r.signedIn)} />
      <Stat label="Not signed in" value={fmt(r.anonymous)} />
      <Stat label="Stories per reader" value={r.articlesPerReader == null ? "–" : r.articlesPerReader.toFixed(1)} />
      {rt && rt.events > 0 && (
        <>
          <Stat label="Typical time on a story" value={rt.medianEngagedSeconds == null ? "–" : rt.medianEngagedSeconds >= 60 ? `${Math.floor(rt.medianEngagedSeconds / 60)} min ${rt.medianEngagedSeconds % 60} s` : `${rt.medianEngagedSeconds} s`} note="Median, while the tab was open and in use" />
          <Stat label="Read to the end" value={rt.finishedShare == null ? "–" : `${Math.round(rt.finishedShare * 100)}%`} note="Scrolled at least 90% of the page" />
        </>
      )}
    </div>
  );
}

function Health({ data }: { data: AnalyticsData }) {
  const h = data.health;
  const ok = (good: boolean, text: React.ReactNode) => (
    <li className="flex items-start gap-2 py-2 text-sm">
      {good ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--edition-positive))]" aria-label="OK" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--edition-negative))]" aria-label="Needs attention" />
      )}
      <span className="text-[hsl(var(--edition-text))]">{text}</span>
    </li>
  );
  const apiFresh = !!h.lastApiPublishAt && Date.now() - Date.parse(h.lastApiPublishAt) < 2 * 86400_000;
  return (
    <ul className="divide-y divide-[hsl(var(--edition-border-hair))]">
      {ok(apiFresh, <>Last publish through the Content API: <strong>{timeAgo(h.lastApiPublishAt)}</strong></>)}
      {data.totals.articlesPublished === 0 ? null : ok(h.articlesWithoutCover === 0, h.articlesWithoutCover === 0 ? "Every new story has a cover image" : <><strong>{h.articlesWithoutCover}</strong> new {h.articlesWithoutCover === 1 ? "story has" : "stories have"} no cover image</>)}
      {h.crawlerHits != null &&
        ok(h.crawlerHits > 0 && !h.crawlerErrors, h.crawlerHits === 0 ? "No search or AI crawler visits recorded" : h.crawlerErrors ? <><strong>{h.crawlerErrors}</strong> crawler {h.crawlerErrors === 1 ? "visit" : "visits"} got an error page</> : "Crawlers are getting pages without errors")}
      <li className="py-2 text-sm">
        <a
          href="https://search.google.com/test/rich-results?url=https%3A%2F%2Fwww.newsplatform.org%2F"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[hsl(var(--edition-accent))] hover:underline"
        >
          Check how Google sees the site
        </a>
        <span className="block text-xs text-[hsl(var(--edition-text-dim))]">After each deploy, also run <code>npm run check:live</code></span>
      </li>
    </ul>
  );
}

const PAGE_EVENTS_SQL = `create table if not exists public.page_events (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  kind text not null, path text not null,
  article_id integer references public.articles(id) on delete set null,
  channel_id integer, visitor text, user_id integer,
  referrer_host text, utm_source text, utm_medium text, utm_campaign text,
  country text, device text, browser text,
  bot text, status integer, engaged_ms integer, scroll_pct smallint
);
alter table public.page_events enable row level security;`;

function TrafficPanels({ data }: { data: AnalyticsData }) {
  const t = data.traffic;
  if (!t) {
    return (
      <Panel title="Sources, countries, devices and crawlers" className="lg:col-span-2">
        <p className="text-sm text-[hsl(var(--edition-text-secondary))]">
          These switch on when the <code>page_events</code> table exists in the database. It adds where readers come from
          (including AI assistants such as ChatGPT and Perplexity), their countries and devices, how far they read, and which
          search and AI crawlers fetched which stories. No IP addresses are stored. Nothing needs redeploying.
        </p>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-[hsl(var(--edition-accent))]">Show the SQL</summary>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-[hsl(var(--edition-panel))] p-3 text-xs leading-relaxed">{PAGE_EVENTS_SQL}</pre>
        </details>
      </Panel>
    );
  }
  const noHumans = t.views === 0;
  const sources = t.referrers.map((r) => ({
    key: r.host || "direct",
    label: r.host ? r.host.replace(/^utm:/, "") : "Direct or unknown",
    value: r.views,
    tag: r.host ? <Tag tone={r.kind === "ai" ? "accent" : "muted"}>{SOURCE_KIND_LABEL[r.kind] || r.kind}</Tag> : null,
  }));
  const bots = t.bots;
  return (
    <>
      <Panel title="Where readers come from" hint={noHumans ? undefined : `${fmt(t.views)} page views`}>
        <BarList rows={sources} emptyText="No page views recorded yet in this period, so no sources, countries or devices to show" />
      </Panel>
      <Panel title="Crawlers and AI bots" hint={bots.total ? `${fmt(bots.total)} visits, last ${timeAgo(bots.lastSeen)}` : undefined}>
        {bots.total === 0 ? (
          <div className="flex items-start gap-2 rounded-lg bg-[hsl(var(--edition-negative))]/10 p-3 text-sm text-[hsl(var(--edition-text))]">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--edition-negative))]" aria-hidden />
            <span>No crawler visits recorded in this period. If this lasts more than a day, search engines and AI assistants may not be able to read the site.</span>
          </div>
        ) : (
          <>
            {bots.daysWithoutHits ? (
              <p className="mb-3 text-xs text-[hsl(var(--edition-text-muted))]">{bots.daysWithoutHits} {bots.daysWithoutHits === 1 ? "day" : "days"} in this period with no crawler visits.</p>
            ) : null}
            <BarList
              rows={bots.list.map((b) => ({
                key: b.name,
                label: (
                  <>
                    <Bot className="mr-1.5 inline h-3.5 w-3.5 align-[-2px] text-[hsl(var(--edition-text-dim))]" aria-hidden />
                    {b.name}
                  </>
                ),
                value: b.hits,
                tag: (
                  <>
                    {b.ai && <Tag tone="accent">AI</Tag>}
                    {b.errors > 0 && <Tag tone="negative">{b.errors} errors</Tag>}
                  </>
                ),
              }))}
            />
            <p className="mt-3 text-xs text-[hsl(var(--edition-text-dim))]">Counts are a minimum: visits answered from the edge cache are not seen.</p>
          </>
        )}
      </Panel>
      {!noHumans && (
      <>
      <Panel title="Countries">
        <BarList rows={t.countries.map((c) => ({ key: c.country || "unknown", label: countryName(c.country), value: c.views }))} emptyText="No page views recorded yet in this period" />
      </Panel>
      <Panel title="Devices">
        <BarList rows={t.devices.map((d) => ({ key: d.device, label: DEVICE_LABEL[d.device] || d.device, value: d.views }))} emptyText="No page views recorded yet in this period" />
      </Panel>
      </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ main */

function RangeSwitch({ value, onChange }: { value: RangeKey; onChange: (r: RangeKey) => void }) {
  return (
    <div role="radiogroup" aria-label="Period" className="inline-flex rounded-lg border border-[hsl(var(--edition-border))] bg-[hsl(var(--edition-panel))] p-0.5">
      {RANGES.map((r) => (
        <button
          key={r.key}
          type="button"
          role="radio"
          aria-checked={value === r.key}
          onClick={() => onChange(r.key)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--edition-accent))]",
            value === r.key
              ? "bg-[hsl(var(--edition-bg))] text-[hsl(var(--edition-text))] shadow-sm"
              : "text-[hsl(var(--edition-text-muted))] hover:text-[hsl(var(--edition-text))]"
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

async function fetchAnalytics(range: RangeKey, fresh: boolean): Promise<AnalyticsData> {
  const tz = -new Date().getTimezoneOffset();
  const res = await apiRequest("GET", `/api/v1/admin/analytics?range=${range}&tz=${tz}${fresh ? `&fresh=1&t=${Date.now()}` : ""}`);
  return res.json();
}

export function AdminAnalytics() {
  const [range, setRange] = useState<RangeKey>("7d");
  const [fresh, setFresh] = useState(0);
  const r = RANGES.find((x) => x.key === range)!;
  const q = useQuery<AnalyticsData>({
    queryKey: ["/api/v1/admin/analytics", range, fresh],
    queryFn: () => fetchAnalytics(range, fresh > 0),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
    retry: 1,
  });
  const data = q.data;
  const empty = !!data && data.totals.reads === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <RangeSwitch value={range} onChange={setRange} />
        <div className="flex items-center gap-3 text-xs text-[hsl(var(--edition-text-muted))]">
          {data && <span>Updated {new Date(data.generatedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>}
          <button
            type="button"
            onClick={() => setFresh((n) => n + 1)}
            disabled={q.isFetching}
            className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--edition-border))] px-2.5 py-1.5 font-medium text-[hsl(var(--edition-text))] hover:bg-[hsl(var(--edition-panel))] disabled:opacity-60"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", q.isFetching && "animate-spin")} aria-hidden />
            Refresh
          </button>
        </div>
      </div>

      {q.isError && !data && (
        <div className="rounded-xl border border-[hsl(var(--edition-negative))]/40 bg-[hsl(var(--edition-negative))]/5 p-4 text-sm">
          <p className="font-semibold text-[hsl(var(--edition-text))]">Analytics could not be loaded.</p>
          <p className="mt-1 text-[hsl(var(--edition-text-secondary))]">{(q.error as Error)?.message || "Please try again."}</p>
          <button type="button" onClick={() => q.refetch()} className="mt-2 font-medium text-[hsl(var(--edition-accent))] hover:underline">Try again</button>
        </div>
      )}

      {!data && q.isLoading && (
        <div className="space-y-4" aria-busy="true" aria-label="Loading analytics">
          <div className="h-8 w-2/3 animate-pulse rounded bg-[hsl(var(--edition-border-hair))]" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-[hsl(var(--edition-border-hair))]" />)}
          </div>
          <div className="h-64 animate-pulse rounded-xl bg-[hsl(var(--edition-border-hair))]" />
        </div>
      )}

      {data && (
        <div className={cn("space-y-5 transition-opacity", q.isFetching && q.isPlaceholderData && "opacity-60")}>
          <Headline data={data} range={r} />

          {data.truncated && (
            <p className="flex items-start gap-2 rounded-lg bg-[hsl(var(--edition-panel))] p-3 text-sm text-[hsl(var(--edition-text-secondary))]">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
              A very busy period: only the first 50,000 records of a kind were counted, so these numbers are a minimum. A shorter period gives exact numbers.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="col-span-2 lg:col-span-1">
              <Tile primary label="Readers" value={data.totals.readers} prev={data.previous.readers} previousLabel={r.previous} empty={empty} />
            </div>
            <Tile label="Article reads" value={data.totals.reads} prev={data.previous.reads} previousLabel={r.previous} empty={empty} />
            <Tile label="New followers" value={data.totals.newFollowers} prev={data.previous.newFollowers} previousLabel={r.previous} empty={empty} />
            <Tile label="Comments" value={data.totals.comments} prev={data.previous.comments} previousLabel={r.previous} empty={empty} />
            <Tile label="Stories published" value={data.totals.articlesPublished} prev={data.previous.articlesPublished} previousLabel={r.previous} empty={empty} />
          </div>

          <p className="flex items-start gap-2 text-xs leading-relaxed text-[hsl(var(--edition-text-muted))]">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
            <span>
              A read is a real first visit: one per reader per story. The view counts shown on the site can be set by hand in
              Manage Articles, so they appear here only as "shown on site". Readers who are not signed in are counted by
              network and browser, so people sharing a network may count as one.
            </span>
          </p>

          {empty ? (
            // Nothing read: one honest message instead of a page of empty cards.
            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="Fresh stories" hint="Published in this period">
                <Fresh data={data} />
              </Panel>
              <Panel title="Site health">
                <Health data={data} />
              </Panel>
            </div>
          ) : (
            <>
            <Panel title={data.range.bucket === "hour" ? "Reads and readers by hour" : "Reads and readers by day"} hint={data.range.bucket === "hour" ? "Dashed: the 24 hours before" : "Today is so far · dashed: the previous period"}>
              <ReadsChart data={data} />
            </Panel>

            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="Most read" hint={`Reads in ${r.long}`}>
                <MostRead data={data} />
              </Panel>
              <Panel title="Fresh stories" hint="Published in this period">
                <Fresh data={data} />
              </Panel>
            </div>

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              <Panel title="Channels">
                <Channels data={data} />
              </Panel>
              <Panel title="Readers">
                <Readers data={data} range={r} />
              </Panel>
              <Panel title="Site health" className="md:col-span-2 xl:col-span-1">
                <Health data={data} />
              </Panel>
            </div>
            </>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <TrafficPanels data={data} />
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminAnalytics;
