/**
 * Single source of truth for NewsPlatform's public marketing pages.
 *
 * This module has **no imports** on purpose: it is consumed both by the React
 * app (client/src/pages/marketing-page.tsx) and by the build-time prerenderer
 * (scripts/prerender.ts, run with tsx after `vite build`). Both render the
 * exact same HTML, so crawlers and humans see identical content.
 *
 * Everything here must be factually true of NewsPlatform. Competitor facts are
 * general, publicly published, hedged and dated.
 */

export const SITE_URL = "https://www.newsplatform.org";
export const LAST_UPDATED = "October 2026";
export const LAST_UPDATED_ISO = "2026-10-21";

/* ------------------------------------------------------------------ types */

export type Block =
  | { t: "p"; text: string }
  | { t: "ul"; items: string[] }
  | { t: "ol"; items: string[] }
  | { t: "h3"; text: string }
  | { t: "table"; head: string[]; rows: string[][] };

export interface Section {
  h2?: string;
  id?: string;
  blocks: Block[];
}

export interface FaqItem {
  q: string;
  /** Plain text answer (may contain inline anchors). */
  a: string;
}

export interface MarketingPage {
  /** Absolute path, no trailing slash (home is "/"). */
  path: string;
  title: string;
  description: string;
  h1: string;
  kicker?: string;
  /** First visible paragraph: what it is + who it's for. */
  lead: string;
  sections: Section[];
  faq?: FaqItem[];
  /** Show a visible "Last updated" line (comparison pages). */
  dated?: boolean;
  /** Trail after Home, excluding the page itself. */
  trail?: { name: string; path: string }[];
  /** Label used in the site footer / prerendered header nav. */
  navLabel?: string;
}

/* ------------------------------------------------------- shared link lists */

export const FOOTER_LINKS: { label: string; path: string }[] = [
  { label: "Home", path: "/" },
  { label: "About", path: "/about" },
  { label: "How it works", path: "/how-it-works" },
  { label: "For writers", path: "/for-writers" },
  { label: "FAQ", path: "/faq" },
  { label: "Compare", path: "/compare" },
  { label: "vs Substack", path: "/compare/substack" },
  { label: "vs Medium", path: "/compare/medium" },
  { label: "vs Ghost", path: "/compare/ghost" },
  { label: "Alternatives", path: "/alternatives" },
  { label: "Channels", path: "/channels" },
  { label: "Content API", path: "/api" },
  { label: "Advertise", path: "/advertise" },
  { label: "Privacy", path: "/privacy" },
  { label: "Terms", path: "/terms" },
];

/** The one-sentence definition reused across pages, llms.txt and JSON-LD. */
export const ONE_LINER =
  "NewsPlatform is a free, independent news publishing platform where writers, newsrooms and organisations run their own channels, publish articles, and readers follow the channels they trust.";

const CATEGORIES =
  "Politics, Business, Tech, AI, Science, Sports, Culture, Lifestyle, Education, Environment, Opinion and Law";

/* ------------------------------------------------------------------ pages */

const home: MarketingPage = {
  path: "/",
  navLabel: "Home",
  title: "NewsPlatform — Independent news publishing platform",
  description:
    "NewsPlatform is a free independent news publishing platform. Writers and newsrooms run their own channels, readers follow the channels they trust and get the day's top stories.",
  h1: "NewsPlatform — an independent news publishing platform",
  kicker: "What is NewsPlatform?",
  lead: ONE_LINER,
  sections: [
    {
      h2: "Who NewsPlatform is for",
      blocks: [
        {
          t: "ul",
          items: [
            "<strong>Readers</strong> who want the day's stories from independent writers and smaller newsrooms in one place, in a chronological feed with no algorithmic ranking.",
            "<strong>Independent writers and journalists</strong> who want a free place to publish articles under their own channel, with a proper rich-text editor and a public URL for every story.",
            "<strong>Small newsrooms, newsletters and organisations</strong> that want a branded channel and a read/write API they can publish into programmatically.",
            "<strong>Developers and AI tools</strong> that need a public, read-only JSON feed of recent articles.",
          ],
        },
      ],
    },
    {
      h2: "What you can do on NewsPlatform",
      blocks: [
        {
          t: "ul",
          items: [
            "<strong>Read the front page.</strong> The homepage shows the latest published articles from every channel, newest first.",
            "<strong>Browse by category.</strong> Articles are filed under " +
              CATEGORIES +
              ", with a category ribbon across the top of the site.",
            "<strong>Follow channels.</strong> Subscribe to a channel to keep track of a writer and to grow their public subscriber count.",
            "<strong>Publish your own articles.</strong> Create a free account, create a channel, and write with a rich-text editor that supports headings, lists, links, tables, images with captions, charts and location tags.",
            "<strong>Subscribe by RSS.</strong> The whole site has a feed at <a href=\"/rss.xml\">/rss.xml</a>, and every channel has its own feed at <code>/channels/&lt;id&gt;/rss.xml</code>.",
            "<strong>Use the Content API.</strong> A public read-only endpoint returns recent articles as JSON; an authenticated write API lets you publish into channels you own. See the <a href=\"/api\">Content API docs</a>.",
          ],
        },
      ],
    },
    {
      h2: "How it works",
      blocks: [
        {
          t: "ol",
          items: [
            "<strong>Create a free account.</strong> Email and password, or sign in with Google.",
            "<strong>Create a channel.</strong> Give it a name, a description, images and a category focus. A channel is your publishing space on NewsPlatform.",
            "<strong>Write and publish.</strong> Articles get a permanent URL of the form <code>/articles/&lt;id&gt;/&lt;slug&gt;</code>, are listed on the homepage and your channel page, and appear in the site sitemap and RSS feed.",
            "<strong>Build an audience.</strong> Readers subscribe to your channel; your subscriber count is public on the channel page. You can edit, unpublish or delete anything you publish at any time.",
          ],
        },
        {
          t: "p",
          text: 'There is a longer walk-through on the <a href="/how-it-works">How it works</a> page, and a writer-focused guide on <a href="/for-writers">Publishing on NewsPlatform</a>.',
        },
      ],
    },
    {
      h2: "What makes NewsPlatform different",
      blocks: [
        {
          t: "ul",
          items: [
            "<strong>Chronological, not algorithmic.</strong> Newest published articles come first. A channel with three subscribers can lead the homepage.",
            "<strong>Free to publish.</strong> There is no subscription fee and no upfront cost to create a channel or publish articles.",
            "<strong>Channels, not single-author blogs.</strong> One account can run several channels, and a channel can represent a person, a newsroom or a topic desk.",
            "<strong>Built to be read by machines too.</strong> Article pages are prerendered for crawlers with NewsArticle structured data, and there is a public JSON API and RSS.",
            "<strong>Clearly labelled sponsorship.</strong> The only advertising is labelled sponsored placements, described on the <a href=\"/advertise\">Advertise</a> page. No pop-ups, no autoplay audio, no interstitials.",
          ],
        },
      ],
    },
    {
      h2: "Learn more",
      blocks: [
        {
          t: "ul",
          items: [
            '<a href="/about">About NewsPlatform</a> — what it is, who it is for, and how it is funded.',
            '<a href="/how-it-works">How it works</a> — the step-by-step guide for readers and writers.',
            '<a href="/for-writers">Publishing on NewsPlatform</a> — what writers get, and what the platform deliberately does not do.',
            '<a href="/faq">FAQ</a> — the questions people ask most often.',
            '<a href="/compare">Comparisons</a> — how NewsPlatform differs from <a href="/compare/substack">Substack</a>, <a href="/compare/medium">Medium</a> and <a href="/compare/ghost">Ghost</a>.',
            '<a href="/alternatives">Best platforms for independent journalists</a> — an honest round-up, including when another platform is the better answer.',
            '<a href="/channels">Channel directory</a> and the <a href="/api">Content API</a>.',
          ],
        },
      ],
    },
  ],
  faq: [
    {
      q: "Is NewsPlatform free?",
      a: "Yes. Reading is free and no account is required. Creating an account, creating a channel and publishing articles are also free — there are no subscription fees or upfront costs for writers.",
    },
    {
      q: "Is NewsPlatform a news aggregator?",
      a: "No. NewsPlatform is a publishing platform. The articles on it are written and published by the people who run the channels, not scraped or syndicated from other news sites.",
    },
    {
      q: "Do I need an account to read?",
      a: "No. Every published article and channel page is public and readable without signing in. You only need an account to subscribe to channels or to publish.",
    },
  ],
};

const about: MarketingPage = {
  path: "/about",
  navLabel: "About",
  title: "About NewsPlatform — what it is and who it is for",
  description:
    "NewsPlatform is a free independent news publishing platform where writers and newsrooms run their own channels. Learn what it is, who it is for, and how it is funded.",
  h1: "About NewsPlatform",
  kicker: "About",
  lead: ONE_LINER,
  trail: [],
  sections: [
    {
      h2: "What NewsPlatform is",
      blocks: [
        {
          t: "p",
          text: "NewsPlatform is a place to publish and read journalism. Writers create a channel — their own branded space on the site — and publish articles to it. Those articles appear on the NewsPlatform homepage alongside everyone else's, newest first, so a one-person channel sits in the same feed as a larger newsroom.",
        },
        {
          t: "p",
          text: "It is not a news aggregator. NewsPlatform does not scrape, syndicate or re-publish articles from other news sites, and it does not score outlets for political bias. Everything on the site was published to the site by the person or organisation that runs the channel it appears under.",
        },
      ],
    },
    {
      h2: "Who it is for",
      blocks: [
        {
          t: "h3",
          text: "Readers",
        },
        {
          t: "p",
          text: "If you want to read work from independent writers and smaller newsrooms without an algorithmic feed deciding what you see, NewsPlatform gives you a chronological front page, category sections covering " +
            CATEGORIES +
            ", and the ability to subscribe to the channels you trust. Reading is free and does not require an account.",
        },
        { t: "h3", text: "Independent writers and journalists" },
        {
          t: "p",
          text: 'If you write and want somewhere to publish that is free, gives every article a clean public URL, and puts your work in front of readers who are already on the site, you can create a channel in a couple of minutes. See <a href="/for-writers">Publishing on NewsPlatform</a>.',
        },
        { t: "h3", text: "Small newsrooms and organisations" },
        {
          t: "p",
          text: 'A channel can represent an organisation rather than a person, with its own logo, description and subscriber list. Organisations publishing at volume can use the authenticated write endpoints in the <a href="/api">Content API</a> instead of the web editor.',
        },
      ],
    },
    {
      h2: "What is on the site",
      blocks: [
        {
          t: "ul",
          items: [
            "<strong>Channels.</strong> Browse every channel in the <a href=\"/channels\">channel directory</a>. Each channel page lists its articles and its public subscriber count.",
            "<strong>Articles.</strong> Rich articles with headings, lists, tables, images and captions, charts, embedded links and optional location tags.",
            "<strong>Categories.</strong> A category ribbon across the top of the site covering " +
              CATEGORIES +
              ".",
            "<strong>Feeds and APIs.</strong> Site-wide RSS at <a href=\"/rss.xml\">/rss.xml</a>, per-channel RSS, a sitemap at <a href=\"/sitemap.xml\">/sitemap.xml</a>, and a public read-only JSON endpoint for recent articles.",
            "<strong>Light and dark themes</strong>, and a reading view that works the same on phones and desktops.",
          ],
        },
      ],
    },
    {
      h2: "How NewsPlatform is funded",
      blocks: [
        {
          t: "p",
          text: 'Publishing and reading are free. The platform sells clearly labelled sponsorship placements — a sponsored homepage lead story and channel sponsorships — which are listed with their prices on the <a href="/advertise">Advertise</a> page. Sponsored items are always labelled as such. There are no pop-ups, autoplay audio or takeover interstitials.',
        },
        {
          t: "p",
          text: "NewsPlatform does not currently run paid reader subscriptions or pay writers a share of revenue. If that matters to you, the comparison pages below are honest about which platforms do.",
        },
      ],
    },
    {
      h2: "How NewsPlatform compares",
      blocks: [
        {
          t: "ul",
          items: [
            '<a href="/compare/substack">NewsPlatform vs Substack</a> — newsletters and paid subscriptions versus a free open front page.',
            '<a href="/compare/medium">NewsPlatform vs Medium</a> — a general-interest writing platform versus a news-shaped one.',
            '<a href="/compare/ghost">NewsPlatform vs Ghost</a> — self-hosted software you run versus a hosted platform you join.',
            '<a href="/alternatives">Best platforms for independent journalists</a> — the honest round-up, including when NewsPlatform is the wrong choice.',
          ],
        },
      ],
    },
    {
      h2: "Technical notes",
      blocks: [
        {
          t: "p",
          text: "NewsPlatform is a React and TypeScript front end with a serverless API, backed by Supabase (PostgreSQL). Marketing pages are prerendered to static HTML at build time, and article pages are prerendered on request for crawlers with NewsArticle structured data, so the site is readable without JavaScript.",
        },
      ],
    },
  ],
};

const howItWorks: MarketingPage = {
  path: "/how-it-works",
  navLabel: "How it works",
  title: "How NewsPlatform works — for readers and writers",
  description:
    "A step-by-step guide to NewsPlatform: how to read and follow channels, how to create a channel and publish articles, how discovery works, and how the API and RSS feeds fit in.",
  h1: "How NewsPlatform works",
  kicker: "How it works",
  lead: "NewsPlatform has two sides: readers who browse and follow channels, and writers who run channels and publish articles. This page walks through both, step by step.",
  trail: [],
  sections: [
    {
      h2: "For readers",
      blocks: [
        { t: "h3", text: "1. Browse the front page" },
        {
          t: "p",
          text: "The homepage lists the most recently published articles from every channel on the platform, newest first. You do not need an account and there is no algorithmic ranking: publication time decides the order.",
        },
        { t: "h3", text: "2. Filter by category" },
        {
          t: "p",
          text: "A category ribbon runs across the top of the site covering " +
            CATEGORIES +
            ". Selecting a category filters the feed to articles filed under it.",
        },
        { t: "h3", text: "3. Find channels" },
        {
          t: "p",
          text: 'The <a href="/channels">channel directory</a> lists every channel on the platform. A channel is one independent voice — a single writer, a small newsroom, or a topic desk. Channel pages show the channel description, its articles and how many subscribers it has.',
        },
        { t: "h3", text: "4. Subscribe" },
        {
          t: "ul",
          items: [
            "Subscribing keeps track of the writers you want to follow.",
            "It raises the channel's public subscriber count, which is how writers see their audience grow.",
            "Subscriptions require a free account; reading does not.",
          ],
        },
        { t: "h3", text: "5. Or read it somewhere else" },
        {
          t: "p",
          text: 'Everything published is also available as RSS: the whole site at <a href="/rss.xml">/rss.xml</a>, and each channel at <code>/channels/&lt;id&gt;/rss.xml</code>. Articles are listed in <a href="/sitemap.xml">/sitemap.xml</a> so search engines and AI assistants can find them.',
        },
      ],
    },
    {
      h2: "For writers",
      blocks: [
        { t: "h3", text: "1. Create a free account" },
        {
          t: "p",
          text: 'Sign up at <a href="/auth">newsplatform.org/auth</a> with an email and password or with Google. There is no subscription fee and no upfront cost.',
        },
        { t: "h3", text: "2. Create your channel" },
        {
          t: "ul",
          items: [
            "Channel name and description",
            "Profile and banner images",
            "Category focus",
            "Location, if your coverage is geographic",
          ],
        },
        { t: "h3", text: "3. Write and publish" },
        {
          t: "p",
          text: "The editor supports headings, bold and italic, bullet and numbered lists, links, tables, images with captions, charts, pull quotes and callouts. You can tag an article with a category and a location. Publishing gives the article a permanent URL at <code>/articles/&lt;id&gt;/&lt;slug&gt;</code>.",
        },
        { t: "h3", text: "4. Build an audience" },
        {
          t: "p",
          text: "Published articles appear on the homepage feed, in the category they are filed under, on your channel page, in the RSS feeds and in the sitemap. Readers who like your work subscribe to the channel.",
        },
        { t: "h3", text: "5. Stay in control" },
        {
          t: "p",
          text: "You can edit, unpublish or delete any article you have published, at any time. Channel owners can see and manage their subscriber list.",
        },
      ],
    },
    {
      h2: "How discovery works",
      blocks: [
        {
          t: "ul",
          items: [
            "The feed is chronological, so small channels get the same shot at the front page as large ones.",
            "Breaking stories surface immediately rather than waiting for an algorithm to pick them up.",
            "Nothing published is hidden from the feed; all published articles are discoverable.",
            "Article pages are prerendered for search engines and AI crawlers with structured data, so stories are indexable the moment they go live.",
          ],
        },
      ],
    },
    {
      h2: "Quality and moderation",
      blocks: [
        {
          t: "ul",
          items: [
            "Articles must be original or properly attributed.",
            'Content must comply with the <a href="/terms">Terms of Service</a>.',
            "Spam and malicious content is removed.",
            "Readers can report problematic content for review.",
          ],
        },
      ],
    },
    {
      h2: "Publishing through the API",
      blocks: [
        {
          t: "p",
          text: 'Developers and organisations can read recent articles from a public, key-free JSON endpoint, and publish into channels they own using an API key. Keys are generated from your profile, shown once, stored as SHA-256 hashes and revocable at any time. Full reference: <a href="/api">Content API documentation</a>.',
        },
      ],
    },
  ],
};

const forWriters: MarketingPage = {
  path: "/for-writers",
  navLabel: "For writers",
  title: "Publishing on NewsPlatform — a free home for independent writers",
  description:
    "NewsPlatform is a free publishing platform for independent journalists and small newsrooms: your own channel, a rich editor, permanent article URLs, RSS, and a publishing API.",
  h1: "Publishing on NewsPlatform",
  kicker: "For writers",
  lead: "NewsPlatform is a free publishing platform for independent journalists, bloggers and small newsrooms: you run a channel, you publish articles, and your work appears on a shared front page next to everyone else's.",
  trail: [],
  sections: [
    {
      h2: "What you get",
      blocks: [
        {
          t: "ul",
          items: [
            "<strong>Your own channel.</strong> A named, described, branded page with a profile image, banner, category focus and public subscriber count. One account can run more than one channel.",
            "<strong>A real editor.</strong> Headings, bold and italic, bullet and numbered lists, links, tables, images with captions, charts, pull quotes and callout boxes.",
            "<strong>Clean, permanent URLs.</strong> Every article lives at <code>/articles/&lt;id&gt;/&lt;slug&gt;</code> and keeps working after edits.",
            "<strong>A front page you are actually on.</strong> Publishing puts you at the top of the chronological homepage feed, not behind an algorithm.",
            "<strong>Distribution plumbing.</strong> Site-wide and per-channel RSS, an XML sitemap, and prerendered article HTML with <code>NewsArticle</code> structured data so search engines and AI assistants can read your work without running JavaScript.",
            "<strong>An API.</strong> Publish programmatically with an API key if you already have a CMS or a pipeline — see the <a href=\"/api\">Content API docs</a>.",
            "<strong>Full control.</strong> Edit, unpublish or delete anything, whenever you want, and manage your subscriber list.",
          ],
        },
      ],
    },
    {
      h2: "What it costs",
      blocks: [
        {
          t: "p",
          text: "Nothing. Creating an account, creating channels and publishing articles are free. There is no subscription fee, no upfront cost and no cut taken from you — because NewsPlatform does not currently handle reader payments at all.",
        },
      ],
    },
    {
      h2: "What NewsPlatform does not do (yet)",
      blocks: [
        {
          t: "p",
          text: "Being straight about this matters more than a sales pitch:",
        },
        {
          t: "ul",
          items: [
            "<strong>No paid subscriptions or paywalls.</strong> There is no built-in way to charge readers for your articles, and no revenue share for writers.",
            "<strong>No email newsletter sending.</strong> Readers subscribe to your channel on the site and can use RSS; NewsPlatform does not send your posts out as email.",
            "<strong>No custom domain per channel.</strong> Your channel lives on newsplatform.org.",
          ],
        },
        {
          t: "p",
          text: 'If one of those is a hard requirement, read <a href="/alternatives">Best platforms for independent journalists</a> — it says plainly which platforms do those things better.',
        },
      ],
    },
    {
      h2: "How to start",
      blocks: [
        {
          t: "ol",
          items: [
            'Create a free account at <a href="/auth">newsplatform.org/auth</a>.',
            "Create your channel: name, description, images, category focus.",
            "Write your first article in the editor, pick a category, and publish.",
            "Share the article URL. It is indexable immediately and listed in the sitemap and RSS feed.",
          ],
        },
      ],
    },
    {
      h2: "Who this suits",
      blocks: [
        {
          t: "ul",
          items: [
            "Reporters and freelancers who want a public, citable home for their work rather than a social feed.",
            "Subject specialists who want a topic desk — AI, endurance sport, local politics — that readers can follow.",
            "Small newsrooms that want distribution and structured data without running their own CMS and hosting.",
            "Anyone who wants to be read rather than to run a paid newsletter business.",
          ],
        },
      ],
    },
  ],
};

const faq: MarketingPage = {
  path: "/faq",
  navLabel: "FAQ",
  title: "NewsPlatform FAQ — questions about reading and publishing",
  description:
    "Answers to common questions about NewsPlatform: what it is, whether it is free, how channels and subscriptions work, how to publish, the API, RSS, advertising and moderation.",
  h1: "NewsPlatform FAQ",
  kicker: "FAQ",
  lead: "Answers to the questions people ask most often about NewsPlatform, the free independent news publishing platform where writers run their own channels.",
  trail: [],
  sections: [],
  faq: [
    {
      q: "What is NewsPlatform?",
      a: "NewsPlatform is an independent news publishing platform at newsplatform.org. Writers, journalists, small newsrooms and organisations create channels and publish articles to them; readers browse a chronological front page, filter by category and subscribe to the channels they trust.",
    },
    {
      q: "Is NewsPlatform a news aggregator?",
      a: "No. An aggregator collects links to articles published elsewhere. NewsPlatform hosts the articles themselves — everything on the site was written and published to the site by the channel it appears under. NewsPlatform does not scrape or syndicate other news sites and does not rate outlets for political bias.",
    },
    {
      q: "Is NewsPlatform free?",
      a: "Yes. Reading is free and does not require an account. Creating an account, creating a channel and publishing articles are also free: there are no subscription fees and no upfront costs for writers.",
    },
    {
      q: "Do I need an account to read articles?",
      a: "No. Every published article and channel page is public. You only need a free account to subscribe to channels or to publish your own work.",
    },
    {
      q: "What is a channel?",
      a: 'A channel is a publishing space on NewsPlatform with its own name, description, images, category focus and public subscriber count. It can represent an individual writer, a small newsroom or a topic desk. Browse them all in the <a href="/channels">channel directory</a>.',
    },
    {
      q: "How do I publish an article on NewsPlatform?",
      a: 'Create a free account, create a channel, then write the article in the built-in editor and publish it. The editor supports headings, lists, links, tables, images with captions, charts and location tags. There is a step-by-step guide on the <a href="/how-it-works">How it works</a> page.',
    },
    {
      q: "How does NewsPlatform decide what appears on the homepage?",
      a: "Publication time. The feed is chronological — newest published articles first — so a channel with a handful of subscribers can lead the homepage. There is no engagement-based ranking and no preferential placement, apart from sponsored items, which are always labelled.",
    },
    {
      q: "Can I make money writing on NewsPlatform?",
      a: 'Not through the platform today. NewsPlatform has no paid reader subscriptions, no paywall and no revenue share for writers. The platform itself sells clearly labelled sponsorships, listed with prices on the <a href="/advertise">Advertise</a> page. If earning directly from readers is your priority, <a href="/compare/substack">Substack</a> or <a href="/compare/ghost">Ghost</a> are built for that and NewsPlatform is not.',
    },
    {
      q: "Does NewsPlatform send my articles out as an email newsletter?",
      a: 'No. Readers follow channels on the site, and every channel has an RSS feed at <code>/channels/&lt;id&gt;/rss.xml</code>. There is a site-wide feed at <a href="/rss.xml">/rss.xml</a>. Email sending is not part of the platform.',
    },
    {
      q: "Does NewsPlatform have an API?",
      a: 'Yes. There is a public, key-free read-only endpoint that returns recent published articles as JSON, and an authenticated write API that lets you create articles in channels you own. API keys are generated from your profile, shown once, stored as SHA-256 hashes and can be revoked at any time. See the <a href="/api">Content API documentation</a>.',
    },
    {
      q: "Can AI assistants and search engines read NewsPlatform?",
      a: 'Yes. Article pages are prerendered as plain HTML with <code>NewsArticle</code> structured data, the marketing pages are static HTML built at deploy time, every public URL is listed in <a href="/sitemap.xml">/sitemap.xml</a>, and <a href="/robots.txt">robots.txt</a> explicitly allows the major search and AI crawlers. A machine-readable summary of the site lives at <a href="/llms.txt">/llms.txt</a>.',
    },
    {
      q: "What categories does NewsPlatform cover?",
      a: "Articles are filed under " +
        CATEGORIES +
        ". The category ribbon across the top of the site filters the feed to a single section.",
    },
    {
      q: "Who moderates content, and what is not allowed?",
      a: 'Articles must be original or properly attributed and must comply with the <a href="/terms">Terms of Service</a>. Spam and malicious content is removed, and readers can report problematic content for review.',
    },
    {
      q: "Can I advertise or sponsor content on NewsPlatform?",
      a: 'Yes, and the rates are published. The <a href="/advertise">Advertise</a> page lists a sponsored homepage Featured Lead at $99 per day and channel sponsorships from $299 per month, with newsletter slots and content partnerships available on request. All sponsored content is labelled, and the platform does not run pop-ups, autoplay audio or takeover interstitials.',
    },
    {
      q: "Can I delete my articles or my channel?",
      a: "Yes. You can edit, unpublish or delete any article you have published at any time, and channel owners manage their own channel and subscriber list.",
    },
  ],
};

/* ------------------------------------------------------ comparison content */

const compareHub: MarketingPage = {
  path: "/compare",
  navLabel: "Compare",
  title: "NewsPlatform compared to other publishing platforms",
  description:
    "How NewsPlatform compares with Substack, Medium, Ghost and Ground News: what each one is built for, where each is stronger, and which to pick for your situation.",
  h1: "NewsPlatform compared to other platforms",
  kicker: "Comparisons",
  lead: "NewsPlatform is a free independent news publishing platform with channels and a shared chronological front page. This page summarises how it differs from the tools writers most often weigh it against, and links to a detailed comparison for each.",
  dated: true,
  trail: [],
  sections: [
    {
      h2: "At a glance",
      blocks: [
        {
          t: "table",
          head: ["Platform", "Built for", "Where it is stronger than NewsPlatform"],
          rows: [
            [
              "NewsPlatform",
              "Publishing news articles to a shared, chronological front page under your own channel",
              "—",
            ],
            [
              '<a href="https://substack.com" rel="nofollow noopener" target="_blank">Substack</a>',
              "Email newsletters with paid subscriptions",
              "Reader payments, email delivery, a large built-in discovery network",
            ],
            [
              '<a href="https://medium.com" rel="nofollow noopener" target="_blank">Medium</a>',
              "General-interest writing with a membership programme",
              "Audience size and breadth of topics beyond news",
            ],
            [
              '<a href="https://ghost.org" rel="nofollow noopener" target="_blank">Ghost</a>',
              "Open-source publishing software you host or have hosted for you",
              "Full ownership, custom domains and themes, memberships and email",
            ],
            [
              '<a href="https://ground.news" rel="nofollow noopener" target="_blank">Ground News</a>',
              "Comparing how outlets cover the same story",
              "Bias and coverage analysis across mainstream outlets",
            ],
          ],
        },
        {
          t: "p",
          text: "Competitor details are general, publicly documented facts taken from each company's own website as of " +
            LAST_UPDATED +
            ". Check their sites for current terms.",
        },
      ],
    },
    {
      h2: "Detailed comparisons",
      blocks: [
        {
          t: "ul",
          items: [
            '<a href="/compare/substack">NewsPlatform vs Substack</a>',
            '<a href="/compare/medium">NewsPlatform vs Medium</a>',
            '<a href="/compare/ghost">NewsPlatform vs Ghost</a>',
            '<a href="/alternatives">Best platforms for independent journalists</a>',
          ],
        },
      ],
    },
    {
      h2: "NewsPlatform and Ground News are not the same kind of thing",
      blocks: [
        {
          t: "p",
          text: 'People sometimes group these two together because both show news from several sources on one screen. They solve different problems. <a href="https://ground.news" rel="nofollow noopener" target="_blank">Ground News</a> (as of ' +
            LAST_UPDATED +
            ", per its website) is an aggregator and analysis tool: it collects coverage of a story from existing outlets and shows how left, centre and right sources framed it. It does not host original articles from individual writers.",
        },
        {
          t: "p",
          text: "NewsPlatform hosts the articles. Writers publish to it directly; there is no bias-rating layer and no outlet scoring. If you want to compare how mainstream outlets covered a story, Ground News is the better tool. If you want to publish a story, NewsPlatform is.",
        },
      ],
    },
  ],
};

const vsSubstack: MarketingPage = {
  path: "/compare/substack",
  navLabel: "vs Substack",
  title: "NewsPlatform vs Substack — which should you publish on?",
  description:
    "An honest comparison of NewsPlatform and Substack for independent writers: free open publishing with channels versus paid email newsletters, and where each one is the better choice.",
  h1: "NewsPlatform vs Substack",
  kicker: "Comparison",
  lead: "NewsPlatform and Substack are both places an independent writer can publish, but they are shaped differently: NewsPlatform is a free, open news site where you run a channel on a shared front page, and Substack is a newsletter platform built around email and paid subscriptions.",
  dated: true,
  trail: [{ name: "Compare", path: "/compare" }],
  sections: [
    {
      h2: "The short answer",
      blocks: [
        {
          t: "ul",
          items: [
            "<strong>Choose Substack</strong> if your plan is to build an email list and charge readers for it. That is what it is built for, and NewsPlatform cannot do it at all.",
            "<strong>Choose NewsPlatform</strong> if you want your articles to be read on the open web for free, to sit on a shared news front page rather than in an inbox, and to be indexed and citable.",
            "<strong>Both</strong> is a reasonable answer: publish the article on NewsPlatform and send the newsletter from Substack.",
          ],
        },
      ],
    },
    {
      h2: "Side by side",
      blocks: [
        {
          t: "table",
          head: ["", "NewsPlatform", "Substack"],
          rows: [
            [
              "Primary format",
              "Articles on a public news site, organised into channels",
              "Email newsletters, with a web archive",
            ],
            [
              "Cost to publish",
              "Free. No subscription fee, no upfront cost",
              "Free to start; Substack's published pricing takes a percentage of paid-subscription revenue",
            ],
            [
              "Charging readers",
              "Not supported — no paywalls, no paid subscriptions",
              "Core feature: paid subscriptions, free/paid tiers, payments handled for you",
            ],
            [
              "Email sending",
              "Not supported; RSS per channel and site-wide",
              "Core feature",
            ],
            [
              "Discovery",
              "Shared chronological homepage, category sections, channel directory, RSS, sitemap, public JSON API",
              "Substack's own network, recommendations between publications, and its app",
            ],
            [
              "Custom domain",
              "No — channels live on newsplatform.org",
              "Supported on Substack (per their documentation)",
            ],
            [
              "Machine readability",
              "Prerendered HTML with NewsArticle structured data, robots.txt allowing major AI crawlers, public API",
              "Standard web pages and RSS",
            ],
          ],
        },
      ],
    },
    {
      h2: "Where Substack is stronger",
      blocks: [
        {
          t: "p",
          text: 'As of ' +
            LAST_UPDATED +
            ', per <a href="https://substack.com" rel="nofollow noopener" target="_blank">substack.com</a>, Substack is a mature business platform for writers. It handles payments and subscription billing for you, sends your posts by email, supports custom domains, and has a large cross-recommendation network and a reader app that can bring you subscribers you did not go out and find. If the goal is "turn writing into income", that infrastructure is the whole point and NewsPlatform has none of it.',
        },
      ],
    },
    {
      h2: "Where NewsPlatform is stronger",
      blocks: [
        {
          t: "ul",
          items: [
            "<strong>Open by default.</strong> Every article is a free, public web page. Nothing sits behind an email signup or a paywall.",
            "<strong>A shared front page.</strong> Your article appears on the NewsPlatform homepage next to everyone else's, in publication order. On Substack, a new publication starts with an audience of zero and has to be marketed.",
            "<strong>News-shaped.</strong> Channels, categories like Politics, Tech and Science, location tags on stories, and a chronological feed — the site is organised like a news site, not like a mailing list.",
            "<strong>Free with no revenue cut,</strong> because there is no revenue to cut.",
            "<strong>Built for machine readers.</strong> Prerendered article HTML with structured data, a complete sitemap, RSS and a public read-only JSON API.",
          ],
        },
      ],
    },
    {
      h2: "Who should pick which",
      blocks: [
        {
          t: "ul",
          items: [
            "<strong>A reporter who wants their work found and cited:</strong> NewsPlatform.",
            "<strong>A writer building a paid subscriber business:</strong> Substack.",
            "<strong>A small newsroom that wants a branded channel and an API to publish into:</strong> NewsPlatform.",
            "<strong>A writer whose readers live in their inbox:</strong> Substack.",
          ],
        },
        {
          t: "p",
          text: 'See also: <a href="/compare/medium">NewsPlatform vs Medium</a>, <a href="/compare/ghost">NewsPlatform vs Ghost</a>, and <a href="/alternatives">best platforms for independent journalists</a>.',
        },
      ],
    },
  ],
};

const vsMedium: MarketingPage = {
  path: "/compare/medium",
  navLabel: "vs Medium",
  title: "NewsPlatform vs Medium — where should you publish?",
  description:
    "A fair comparison of NewsPlatform and Medium for writers: a free news publishing platform with channels and a chronological feed versus a large general-interest writing platform.",
  h1: "NewsPlatform vs Medium",
  kicker: "Comparison",
  lead: "NewsPlatform and Medium both let you publish articles on someone else's site for free, but Medium is a large general-interest writing platform with a reader membership programme, while NewsPlatform is a news site where each writer runs a channel on a shared chronological front page.",
  dated: true,
  trail: [{ name: "Compare", path: "/compare" }],
  sections: [
    {
      h2: "The short answer",
      blocks: [
        {
          t: "ul",
          items: [
            "<strong>Choose Medium</strong> for reach across general-interest topics and for its membership programme.",
            "<strong>Choose NewsPlatform</strong> if what you write is news or news-adjacent, you want a branded channel, and you want every article openly readable with no membership prompt in the way.",
          ],
        },
      ],
    },
    {
      h2: "Side by side",
      blocks: [
        {
          t: "table",
          head: ["", "NewsPlatform", "Medium"],
          rows: [
            [
              "What it is",
              "A news publishing platform: channels, categories, chronological front page",
              "A general-interest writing and reading platform with publications and topic tags",
            ],
            ["Cost to publish", "Free", "Free"],
            [
              "Reader access",
              "Every article is free and public, no account needed",
              "A paid membership exists and some stories are member-only (per Medium's website)",
            ],
            [
              "Feed ordering",
              "Chronological — newest published first",
              "Personalised and recommendation-driven (per Medium's website)",
            ],
            [
              "Your space",
              "A channel with its own name, description, images and subscriber count",
              "A profile, and optionally a publication",
            ],
            [
              "Distribution plumbing",
              "Site and per-channel RSS, XML sitemap, public read-only JSON API, authenticated write API",
              "RSS feeds and an established recommendation system",
            ],
            ["Custom domain", "No", "Not generally offered for publications today"],
          ],
        },
      ],
    },
    {
      h2: "Where Medium is stronger",
      blocks: [
        {
          t: "p",
          text: 'As of ' +
            LAST_UPDATED +
            ', per <a href="https://medium.com" rel="nofollow noopener" target="_blank">medium.com</a>, Medium is far larger and far better known than NewsPlatform, with an established readership across technology, business, culture and personal essays, a recommendation system that can surface an article long after it was published, and a membership programme through which writers can earn. Its editor and reading experience are polished and heavily used. If you want the biggest possible general audience today, Medium has it.',
        },
      ],
    },
    {
      h2: "Where NewsPlatform is stronger",
      blocks: [
        {
          t: "ul",
          items: [
            "<strong>Nothing is member-only.</strong> Every NewsPlatform article is free to read without an account.",
            "<strong>Time, not taste, orders the feed.</strong> A new article is on the front page the moment it is published, rather than waiting to be recommended.",
            "<strong>Channels are first-class.</strong> Your channel has a description, imagery, a category focus and a public subscriber count, and one account can run several.",
            "<strong>News structure.</strong> Category sections like Politics, Business, Tech, Science and Environment, plus optional location tags on stories.",
            "<strong>Machine-friendly by design.</strong> Prerendered article HTML with NewsArticle structured data, a full sitemap, RSS and a public JSON API for recent stories.",
          ],
        },
      ],
    },
    {
      h2: "Who should pick which",
      blocks: [
        {
          t: "ul",
          items: [
            "<strong>Personal essays, how-tos and general commentary:</strong> Medium.",
            "<strong>Reporting, analysis and topic desks:</strong> NewsPlatform.",
            "<strong>You want to be discovered by an existing large audience:</strong> Medium.",
            "<strong>You want an open, indexable, citable archive of your work:</strong> NewsPlatform.",
          ],
        },
        {
          t: "p",
          text: 'See also: <a href="/compare/substack">NewsPlatform vs Substack</a> and <a href="/compare/ghost">NewsPlatform vs Ghost</a>.',
        },
      ],
    },
  ],
};

const vsGhost: MarketingPage = {
  path: "/compare/ghost",
  navLabel: "vs Ghost",
  title: "NewsPlatform vs Ghost — hosted channel or your own site?",
  description:
    "Comparing NewsPlatform and Ghost for independent publishers: join a free shared news platform, or run open-source publishing software on your own domain with memberships and email.",
  h1: "NewsPlatform vs Ghost",
  kicker: "Comparison",
  lead: "NewsPlatform and Ghost answer different questions. Ghost is open-source publishing software you run on your own domain — self-hosted or on their paid managed hosting. NewsPlatform is a free, hosted news platform you join, where your channel sits on a shared front page.",
  dated: true,
  trail: [{ name: "Compare", path: "/compare" }],
  sections: [
    {
      h2: "The short answer",
      blocks: [
        {
          t: "ul",
          items: [
            "<strong>Choose Ghost</strong> if you want to own the site: your domain, your theme, your subscriber list, memberships and email, and you are willing to host it or pay for hosting.",
            "<strong>Choose NewsPlatform</strong> if you want to publish today, for free, onto a site that already has a front page, categories and readers, without running infrastructure.",
          ],
        },
      ],
    },
    {
      h2: "Side by side",
      blocks: [
        {
          t: "table",
          head: ["", "NewsPlatform", "Ghost"],
          rows: [
            [
              "Model",
              "A hosted platform you join; your channel is a page on newsplatform.org",
              "Open-source software (MIT licence) you self-host, or paid managed hosting from Ghost",
            ],
            [
              "Cost",
              "Free to publish; no hosting to pay for",
              "The software is free; self-hosting costs you a server, and Ghost's managed hosting is a paid subscription (see their pricing page)",
            ],
            [
              "Setup effort",
              "Create an account and a channel — minutes, no technical work",
              "Install, configure, theme and maintain, or pay someone to",
            ],
            [
              "Custom domain and design",
              "No — fixed site design, URLs on newsplatform.org",
              "Yes — your own domain and fully customisable themes",
            ],
            [
              "Paid memberships and email",
              "Not supported",
              "Built in: memberships, newsletters and payments",
            ],
            [
              "Built-in audience",
              "Shared chronological homepage, category sections and channel directory",
              "None — a new Ghost site starts empty and you bring the readers",
            ],
            [
              "Ownership and portability",
              "Your articles live on NewsPlatform; RSS and the API let you pull them",
              "You own the install, the database and the subscriber list outright",
            ],
          ],
        },
      ],
    },
    {
      h2: "Where Ghost is stronger",
      blocks: [
        {
          t: "p",
          text: 'As of ' +
            LAST_UPDATED +
            ', per <a href="https://ghost.org" rel="nofollow noopener" target="_blank">ghost.org</a>, Ghost is open-source software published under the MIT licence and run by a non-profit foundation, which means you can host it yourself and nobody can change the terms under you. It has built-in memberships and paid subscriptions, newsletter sending, custom themes, a mature editor and a developer API. For anyone who wants their publication to be genuinely theirs — own domain, own design, own subscriber list, own revenue — Ghost does things NewsPlatform does not attempt.',
        },
      ],
    },
    {
      h2: "Where NewsPlatform is stronger",
      blocks: [
        {
          t: "ul",
          items: [
            "<strong>Zero setup and zero cost.</strong> No server, no theme, no DNS, no monthly bill. Create a channel and publish.",
            "<strong>You are not starting from an empty room.</strong> Articles go straight onto a shared front page and into category sections where readers already are.",
            "<strong>No maintenance.</strong> Updates, hosting, images, search-engine plumbing and crawler prerendering are handled for you.",
            "<strong>Collective discovery.</strong> A channel directory, chronological feed and public API that cover every writer on the platform, not just your own site.",
          ],
        },
      ],
    },
    {
      h2: "Who should pick which",
      blocks: [
        {
          t: "ul",
          items: [
            "<strong>A publication that is a business:</strong> Ghost.",
            "<strong>A writer who wants to be read without becoming a sysadmin:</strong> NewsPlatform.",
            "<strong>You need a custom domain and brand:</strong> Ghost.",
            "<strong>You want to publish your first article in the next ten minutes, free:</strong> NewsPlatform.",
          ],
        },
        {
          t: "p",
          text: 'See also: <a href="/compare/substack">NewsPlatform vs Substack</a>, <a href="/compare/medium">NewsPlatform vs Medium</a>, <a href="/alternatives">best platforms for independent journalists</a>.',
        },
      ],
    },
  ],
};

const alternatives: MarketingPage = {
  path: "/alternatives",
  navLabel: "Alternatives",
  title: "Best platforms for independent journalists in 2026",
  description:
    "An honest round-up of publishing platforms for independent journalists — NewsPlatform, Substack, Ghost, Medium and WordPress — with what each is best at and when to pick it.",
  h1: "Best platforms for independent journalists",
  kicker: "Round-up",
  lead: "If you report, analyse or comment on the news independently, you need somewhere to publish. This page compares the realistic options, including NewsPlatform — which is our product — and is explicit about when one of the others is the better answer.",
  dated: true,
  trail: [],
  sections: [
    {
      h2: "How to choose",
      blocks: [
        {
          t: "p",
          text: "Three questions settle most of it:",
        },
        {
          t: "ol",
          items: [
            "<strong>Do you need to charge readers?</strong> If yes, you need a platform with payments built in — Substack or Ghost.",
            "<strong>Do you need to own the site?</strong> Own domain, own design, own subscriber list — Ghost or WordPress.",
            "<strong>Do you mainly need to be read and found?</strong> Then a platform with an existing front page and strong indexing matters more than ownership — NewsPlatform or Medium.",
          ],
        },
      ],
    },
    {
      h2: "NewsPlatform",
      blocks: [
        {
          t: "p",
          text: "<strong>Best for:</strong> publishing news articles free on an open, indexable site without running anything yourself.",
        },
        {
          t: "p",
          text: 'NewsPlatform gives each writer a channel — name, description, imagery, category focus, public subscriber count — and puts every published article on a shared chronological homepage, in a category section, in the site RSS feed and in the XML sitemap. Articles are prerendered as plain HTML with <code>NewsArticle</code> structured data, so search engines and AI assistants can read them without running JavaScript. There is a public read-only JSON API for recent stories and an authenticated write API for publishing programmatically. It is free, with no revenue cut.',
        },
        {
          t: "p",
          text: '<strong>Not for you if:</strong> you need paid subscriptions, a paywall, email newsletter sending, or a custom domain — NewsPlatform has none of those. Full detail on <a href="/for-writers">Publishing on NewsPlatform</a>.',
        },
      ],
    },
    {
      h2: "Substack",
      blocks: [
        {
          t: "p",
          text: "<strong>Best for:</strong> building an email list and charging for it.",
        },
        {
          t: "p",
          text: 'As of ' +
            LAST_UPDATED +
            ', per <a href="https://substack.com" rel="nofollow noopener" target="_blank">substack.com</a>, Substack is free to start, handles subscription payments for you and takes a percentage of paid-subscription revenue, supports custom domains, and has a large cross-recommendation network and reader app. If your model is paid subscribers, this is the default choice. The trade-off is that the centre of gravity is the inbox rather than an open, browsable news site. Detailed comparison: <a href="/compare/substack">NewsPlatform vs Substack</a>.',
        },
      ],
    },
    {
      h2: "Ghost",
      blocks: [
        {
          t: "p",
          text: "<strong>Best for:</strong> owning your publication outright.",
        },
        {
          t: "p",
          text: 'As of ' +
            LAST_UPDATED +
            ', per <a href="https://ghost.org" rel="nofollow noopener" target="_blank">ghost.org</a>, Ghost is open-source software under the MIT licence, run by a non-profit foundation, with built-in memberships, paid subscriptions and newsletters. You can self-host it for the cost of a server or pay for their managed hosting. It is the strongest option for a publication that is a business and wants nobody between it and its readers — at the cost of setup, maintenance and starting with no audience. Detailed comparison: <a href="/compare/ghost">NewsPlatform vs Ghost</a>.',
        },
      ],
    },
    {
      h2: "Medium",
      blocks: [
        {
          t: "p",
          text: "<strong>Best for:</strong> general-interest writing in front of a large existing readership.",
        },
        {
          t: "p",
          text: 'As of ' +
            LAST_UPDATED +
            ', per <a href="https://medium.com" rel="nofollow noopener" target="_blank">medium.com</a>, Medium is free to publish on, has a large audience across many topics, runs a paid membership programme through which writers can earn, and surfaces articles through recommendations rather than strictly by date. Some stories are member-only. It is less news-shaped than the others — no category ribbon, no location tags, no channel-level subscriber mechanics. Detailed comparison: <a href="/compare/medium">NewsPlatform vs Medium</a>.',
        },
      ],
    },
    {
      h2: "Self-hosted WordPress",
      blocks: [
        {
          t: "p",
          text: "<strong>Best for:</strong> maximum flexibility if you are comfortable maintaining a site.",
        },
        {
          t: "p",
          text: 'As of ' +
            LAST_UPDATED +
            ', per <a href="https://wordpress.org" rel="nofollow noopener" target="_blank">wordpress.org</a>, WordPress is free open-source software with an enormous plugin and theme ecosystem, so almost anything — memberships, paywalls, newsletters, multi-author newsrooms — can be bolted on. The cost is that you are responsible for hosting, updates, security and performance, and that it takes real work to get right.',
        },
      ],
    },
    {
      h2: "A note on Ground News",
      blocks: [
        {
          t: "p",
          text: 'People searching for "independent news platforms" often land on <a href="https://ground.news" rel="nofollow noopener" target="_blank">Ground News</a>. It is not a publishing platform: as of ' +
            LAST_UPDATED +
            ", per its website, it aggregates coverage from existing outlets and shows how sources across the political spectrum framed the same story. You cannot publish your own reporting to it. It is a reading and media-literacy tool, and a good one, but it does not compete with the platforms above.",
        },
      ],
    },
    {
      h2: "Summary table",
      blocks: [
        {
          t: "table",
          head: ["Platform", "Cost to publish", "Charge readers", "Own domain", "Built-in audience"],
          rows: [
            ["NewsPlatform", "Free", "No", "No", "Shared front page and channel directory"],
            ["Substack", "Free to start; cut of paid revenue", "Yes", "Yes", "Recommendation network and app"],
            ["Ghost", "Hosting or managed plan", "Yes", "Yes", "None"],
            ["Medium", "Free", "Via membership programme", "No", "Large general readership"],
            ["WordPress (self-hosted)", "Hosting", "With plugins", "Yes", "None"],
          ],
        },
        {
          t: "p",
          text: "Competitor facts above are general, publicly published details taken from each company's own site as of " +
            LAST_UPDATED +
            ". Terms change — check the links before deciding.",
        },
      ],
    },
  ],
};

export const MARKETING_PAGES: MarketingPage[] = [
  home,
  about,
  howItWorks,
  forWriters,
  faq,
  compareHub,
  vsSubstack,
  vsMedium,
  vsGhost,
  alternatives,
];

export const PAGES_BY_PATH: Record<string, MarketingPage> = Object.fromEntries(
  MARKETING_PAGES.map((p) => [p.path, p])
);

/* --------------------------------------------------------------- rendering */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Strip inline HTML tags — used for JSON-LD and the plain-text llms files. */
export const stripTags = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const PROSE_LINK =
  'class="text-[hsl(var(--edition-accent))] underline underline-offset-2 hover:no-underline"';

/** Add brand link styling to authored anchors that do not already carry a class. */
function styleLinks(html: string): string {
  return html.replace(/<a (?![^>]*\bclass=)/g, `<a ${PROSE_LINK} `);
}

function renderBlock(b: Block): string {
  switch (b.t) {
    case "p":
      return `<p class="mt-4 text-[17px] leading-relaxed text-[hsl(var(--edition-text-secondary))]">${styleLinks(
        b.text
      )}</p>`;
    case "h3":
      return `<h3 class="mt-8 font-display text-xl font-semibold">${styleLinks(b.text)}</h3>`;
    case "ul":
      return `<ul class="mt-4 list-disc space-y-2 pl-6 text-[17px] leading-relaxed text-[hsl(var(--edition-text-secondary))]">${b.items
        .map((i) => `<li>${styleLinks(i)}</li>`)
        .join("")}</ul>`;
    case "ol":
      return `<ol class="mt-4 list-decimal space-y-2 pl-6 text-[17px] leading-relaxed text-[hsl(var(--edition-text-secondary))]">${b.items
        .map((i) => `<li>${styleLinks(i)}</li>`)
        .join("")}</ol>`;
    case "table":
      return `<div class="mt-6 overflow-x-auto rounded-xl border border-[hsl(var(--edition-border))]"><table class="w-full text-left text-[15px]"><thead><tr class="bg-[hsl(var(--edition-panel))] text-xs uppercase tracking-wide text-muted-foreground">${b.head
        .map((h) => `<th scope="col" class="p-3 font-semibold">${styleLinks(h)}</th>`)
        .join("")}</tr></thead><tbody class="divide-y divide-[hsl(var(--edition-border-hair))]">${b.rows
        .map(
          (r) =>
            `<tr>${r
              .map(
                (c, i) =>
                  `<td class="p-3 align-top ${
                    i === 0 ? "font-medium" : "text-muted-foreground"
                  }">${styleLinks(c)}</td>`
              )
              .join("")}</tr>`
        )
        .join("")}</tbody></table></div>`;
  }
}

function renderFaq(items: FaqItem[]): string {
  return items
    .map(
      (f) =>
        `<div class="mt-6 border-t border-[hsl(var(--edition-border-hair))] pt-6"><h3 class="font-display text-xl font-semibold">${esc(
          f.q
        )}</h3><p class="mt-2 text-[17px] leading-relaxed text-[hsl(var(--edition-text-secondary))]">${styleLinks(
          f.a
        )}</p></div>`
    )
    .join("");
}

/**
 * Renders the article body of a marketing page: kicker, h1, lead, sections,
 * FAQ and cross-links. Shared verbatim by the React page and the prerenderer.
 */
export function renderPageHtml(
  page: MarketingPage,
  opts: { demoteH1?: boolean } = {}
): string {
  const trail =
    page.path === "/"
      ? ""
      : `<nav aria-label="Breadcrumb" class="text-xs text-muted-foreground"><a ${PROSE_LINK} href="/">Home</a>${(
          page.trail || []
        )
          .map((t) => ` <span aria-hidden="true">›</span> <a ${PROSE_LINK} href="${t.path}">${esc(t.name)}</a>`)
          .join("")} <span aria-hidden="true">›</span> <span>${esc(page.h1)}</span></nav>`;

  const kicker = page.kicker
    ? `<p class="mt-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[hsl(var(--edition-accent))]">${esc(
        page.kicker
      )}</p>`
    : "";

  const dated = page.dated
    ? `<p class="mt-3 text-sm text-muted-foreground">Last updated ${LAST_UPDATED}.</p>`
    : "";

  const sections = page.sections
    .map(
      (s) =>
        `<section class="mt-10">${
          s.h2 ? `<h2 class="font-display text-2xl font-semibold">${esc(s.h2)}</h2>` : ""
        }${s.blocks.map(renderBlock).join("")}</section>`
    )
    .join("");

  const faqBlock =
    page.faq && page.faq.length
      ? `<section class="mt-10">${
          page.path === "/faq"
            ? ""
            : '<h2 class="font-display text-2xl font-semibold">Frequently asked questions</h2>'
        }${renderFaq(page.faq)}${
          page.path === "/faq"
            ? ""
            : '<p class="mt-6 text-[17px]"><a ' +
              PROSE_LINK +
              ' href="/faq">Read the full FAQ</a></p>'
        }</section>`
      : "";

  const related =
    page.path === "/"
      ? ""
      : `<section class="mt-12 border-t border-[hsl(var(--edition-border-hair))] pt-6"><h2 class="font-display text-lg font-semibold">More about NewsPlatform</h2><ul class="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">${FOOTER_LINKS.filter(
          (l) => l.path !== page.path && l.path !== "/privacy" && l.path !== "/terms"
        )
          .map((l) => `<li><a ${PROSE_LINK} href="${l.path}">${esc(l.label)}</a></li>`)
          .join("")}</ul></section>`;

  // The live homepage already has its own <h1> ("Top stories"), so the
  // in-app copy of this block renders the brand headline as an <h2> to keep
  // exactly one <h1> per page. The prerendered static homepage keeps the <h1>.
  const headingTag = opts.demoteH1 ? "h2" : "h1";

  return `${trail}${kicker}<${headingTag} class="mt-1 font-display text-4xl font-bold leading-tight">${esc(
    page.h1
  )}</${headingTag}><p class="mt-4 text-lg leading-relaxed text-[hsl(var(--edition-text-secondary))]">${styleLinks(
    page.lead
  )}</p>${dated}${sections}${faqBlock}${related}`;
}

/* ---------------------------------------------------------------- JSON-LD */

const ORGANIZATION = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: "NewsPlatform",
  alternateName: "News Platform",
  url: `${SITE_URL}/`,
  logo: {
    "@type": "ImageObject",
    url: `${SITE_URL}/logo-newsplatform.png`,
  },
  description: ONE_LINER,
};

const WEBSITE = {
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  name: "NewsPlatform",
  alternateName: "News Platform",
  url: `${SITE_URL}/`,
  inLanguage: "en",
  description: ONE_LINER,
  publisher: { "@id": `${SITE_URL}/#organization` },
};

const WEB_APPLICATION = {
  "@type": "WebApplication",
  "@id": `${SITE_URL}/#webapp`,
  name: "NewsPlatform",
  url: `${SITE_URL}/`,
  applicationCategory: "NewsApplication",
  operatingSystem: "Any (web browser)",
  browserRequirements: "Requires JavaScript for the interactive feed; article pages render without it.",
  description: ONE_LINER,
  featureList: [
    "Publish articles to your own channel",
    "Chronological homepage feed with no algorithmic ranking",
    "Category sections and location tags",
    "Channel subscriptions",
    "Site-wide and per-channel RSS feeds",
    "Public read-only JSON API for recent articles",
  ],
  // Publishing and reading are free — stated on /for-writers and /faq.
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
  },
  publisher: { "@id": `${SITE_URL}/#organization` },
};

/** JSON-LD graph for a marketing page; mirrors the visible text. */
export function pageJsonLd(page: MarketingPage): Record<string, unknown> {
  const graph: Record<string, unknown>[] = [];

  if (page.path === "/") {
    graph.push(ORGANIZATION, WEBSITE, WEB_APPLICATION);
  } else {
    graph.push({
      "@type": "WebPage",
      "@id": `${SITE_URL}${page.path}#webpage`,
      url: `${SITE_URL}${page.path}`,
      name: page.title,
      description: page.description,
      inLanguage: "en",
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": `${SITE_URL}/#organization` },
      dateModified: LAST_UPDATED_ISO,
    });
    const items = [
      { name: "Home", item: `${SITE_URL}/` },
      ...(page.trail || []).map((t) => ({ name: t.name, item: `${SITE_URL}${t.path}` })),
      { name: page.h1, item: `${SITE_URL}${page.path}` },
    ];
    graph.push({
      "@type": "BreadcrumbList",
      "@id": `${SITE_URL}${page.path}#breadcrumb`,
      itemListElement: items.map((it, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: it.name,
        item: it.item,
      })),
    });
  }

  if (page.faq && page.faq.length) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${SITE_URL}${page.path}#faq`,
      mainEntity: page.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: stripTags(f.a) },
      })),
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}

/* ----------------------------------------------- plain text (llms*.txt) */

function blockToText(b: Block): string {
  switch (b.t) {
    case "p":
      return stripTags(b.text);
    case "h3":
      return `### ${stripTags(b.text)}`;
    case "ul":
    case "ol":
      return b.items.map((i) => `- ${stripTags(i)}`).join("\n");
    case "table":
      return [
        `| ${b.head.map(stripTags).join(" | ")} |`,
        `| ${b.head.map(() => "---").join(" | ")} |`,
        ...b.rows.map((r) => `| ${r.map(stripTags).join(" | ")} |`),
      ].join("\n");
  }
}

/** Markdown rendering of one page, used for /llms-full.txt. */
export function pageToMarkdown(page: MarketingPage): string {
  const out: string[] = [];
  out.push(`# ${page.h1}`);
  out.push(`URL: ${SITE_URL}${page.path === "/" ? "/" : page.path}`);
  if (page.dated) out.push(`Last updated: ${LAST_UPDATED}`);
  out.push("");
  out.push(stripTags(page.lead));
  for (const s of page.sections) {
    out.push("");
    if (s.h2) out.push(`## ${s.h2}`);
    for (const b of s.blocks) out.push("", blockToText(b));
  }
  if (page.faq && page.faq.length) {
    out.push("", page.path === "/faq" ? "## Questions" : "## Frequently asked questions");
    for (const f of page.faq) out.push("", `### ${f.q}`, stripTags(f.a));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}
