/**
 * Custom TipTap nodes for NewsPlatform's rich article format.
 *
 * CRITICAL CONTRACT: these nodes parse and serialize the SAME HTML that the
 * markdown pipeline (server/markdown-to-html.ts + api/index.ts copy) produces
 * and that the reader (rich-article-content.tsx + .article-body CSS) renders:
 *   - <figure class="article-figure"><img><figcaption>   (captioned image)
 *   - <div class="article-gallery" data-gallery>          (image gallery)
 *   - <div class="video-embed"><iframe>                   (YouTube/Vimeo)
 *   - <div class="article-chart" data-chart="{json}">     (chart block)
 *   - <aside class="callout callout-X" data-callout>      (callout box)
 *   - <figure class="pull-quote"><blockquote><figcaption> (pull quote)
 *   - <aside class="callout callout-stat">                 (big stat)
 * Editing an API-authored article round-trips losslessly.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { ArticleChart, type ChartSpec } from "@/components/article-chart";

/* ---------------------------------- Figure --------------------------------- */

export interface FigureAttrs {
  src: string;
  alt?: string;
  caption?: string;
}

export const ArticleFigure = Node.create({
  name: "articleFigure",
  group: "block",
  atom: false,
  draggable: true,
  content: "inline*", // the caption text is the editable content

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure.article-figure",
        contentElement: "figcaption",
        getAttrs: (el) => {
          const img = (el as HTMLElement).querySelector("img");
          return img ? { src: img.getAttribute("src"), alt: img.getAttribute("alt") || "" } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { src, alt } = HTMLAttributes;
    return [
      "figure",
      { class: "article-figure" },
      ["img", { src, alt: alt || "", loading: "lazy" }],
      ["figcaption", {}, 0],
    ];
  },
});

/* --------------------------------- Gallery --------------------------------- */

export const ArticleGallery = Node.create({
  name: "articleGallery",
  group: "block",
  content: "articleFigure{2,}",
  draggable: true,

  parseHTML() {
    return [{ tag: "div.article-gallery" }];
  },

  renderHTML() {
    return ["div", { class: "article-gallery", "data-gallery": "" }, 0];
  },
});

/* -------------------------------- Video embed ------------------------------ */

export function videoEmbedSrc(url: string): string | null {
  const yt = url.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/
  );
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  if (/youtube-nocookie\.com\/embed\//.test(url) || /player\.vimeo\.com\/video\//.test(url)) {
    return url;
  }
  return null;
}

export const VideoEmbed = Node.create({
  name: "videoEmbed",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return { src: { default: null } };
  },

  parseHTML() {
    return [
      {
        tag: "div.video-embed",
        getAttrs: (el) => {
          const iframe = (el as HTMLElement).querySelector("iframe");
          return iframe ? { src: iframe.getAttribute("src") } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      { class: "video-embed" },
      [
        "iframe",
        {
          src: HTMLAttributes.src,
          title: "Embedded video",
          loading: "lazy",
          allow:
            "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
          allowfullscreen: "true",
        },
      ],
    ];
  },
});

/* ---------------------------------- Chart ---------------------------------- */

function ChartNodeView({ node }: { node: { attrs: { spec: string } } }) {
  let spec: ChartSpec | null = null;
  try {
    spec = JSON.parse(node.attrs.spec);
  } catch {
    /* invalid spec */
  }
  return (
    <NodeViewWrapper className="article-chart" data-drag-handle>
      {spec ? (
        <ArticleChart spec={spec} />
      ) : (
        <div className="p-4 text-sm text-muted-foreground">Invalid chart data</div>
      )}
    </NodeViewWrapper>
  );
}

export const ArticleChartNode = Node.create({
  name: "articleChart",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return { spec: { default: "{}" } };
  },

  parseHTML() {
    return [
      {
        tag: "div.article-chart",
        getAttrs: (el) => ({
          spec: (el as HTMLElement).getAttribute("data-chart") || "{}",
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      { class: "article-chart", "data-chart": HTMLAttributes.spec },
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChartNodeView as any);
  },
});

/* --------------------------------- Callout --------------------------------- */

export const CALLOUT_TYPES = [
  { value: "summary", label: "Summary (In brief)" },
  { value: "key", label: "Key points" },
  { value: "context", label: "Context" },
  { value: "tip", label: "Worth knowing" },
  { value: "warning", label: "Caution" },
] as const;

const CALLOUT_DEFAULT_TITLES: Record<string, string> = {
  summary: "In brief",
  key: "Key points",
  context: "Context",
  tip: "Worth knowing",
  note: "Note",
  important: "Important",
  warning: "Caution",
};

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      calloutType: { default: "key" },
      title: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "aside.callout[data-callout]",
        contentElement: ".callout-body",
        getAttrs: (el) => {
          const type = (el as HTMLElement).getAttribute("data-callout") || "key";
          if (type === "stat") return false; // handled by StatCallout
          const title =
            (el as HTMLElement).querySelector(".callout-title")?.textContent ||
            null;
          return { calloutType: type, title };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const type = node.attrs.calloutType || "key";
    const title =
      node.attrs.title || CALLOUT_DEFAULT_TITLES[type] || "Note";
    return [
      "aside",
      { class: `callout callout-${type}`, "data-callout": type },
      ["div", { class: "callout-title" }, title],
      ["div", { class: "callout-body" }, 0],
    ];
  },
});

/* -------------------------------- Pull quote -------------------------------- */

export const PullQuote = Node.create({
  name: "pullQuote",
  group: "block",
  content: "inline*", // the quote text
  defining: true,

  addAttributes() {
    return { attribution: { default: "" } };
  },

  parseHTML() {
    return [
      {
        tag: "figure.pull-quote",
        contentElement: "blockquote",
        getAttrs: (el) => ({
          attribution:
            (el as HTMLElement).querySelector("figcaption")?.textContent || "",
        }),
      },
    ];
  },

  renderHTML({ node }) {
    const attribution = node.attrs.attribution;
    const children: any[] = [
      "figure",
      { class: "pull-quote" },
      ["blockquote", {}, 0],
    ];
    if (attribution) {
      children.push(["figcaption", {}, attribution]);
    }
    return children as any;
  },
});

/* -------------------------------- Stat callout ------------------------------ */

function StatNodeView({ node }: { node: { attrs: { figure: string; caption: string } } }) {
  return (
    <NodeViewWrapper
      className="callout callout-stat"
      data-callout="stat"
      data-drag-handle
    >
      <div className="stat-figure">{node.attrs.figure}</div>
      {node.attrs.caption && (
        <div className="stat-caption">{node.attrs.caption}</div>
      )}
    </NodeViewWrapper>
  );
}

export const StatCallout = Node.create({
  name: "statCallout",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      figure: { default: "" },
      caption: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "aside.callout-stat",
        getAttrs: (el) => ({
          figure:
            (el as HTMLElement).querySelector(".stat-figure")?.textContent || "",
          caption:
            (el as HTMLElement).querySelector(".stat-caption")?.textContent ||
            "",
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const out: any[] = [
      "aside",
      { class: "callout callout-stat" },
      ["div", { class: "stat-figure" }, HTMLAttributes.figure || ""],
    ];
    if (HTMLAttributes.caption) {
      out.push(["div", { class: "stat-caption" }, HTMLAttributes.caption]);
    }
    return out as any;
  },

  addNodeView() {
    return ReactNodeViewRenderer(StatNodeView as any);
  },
});
