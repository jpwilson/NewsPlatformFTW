import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { ArrowRight } from "lucide-react";
import { categoryColor } from "@/lib/category-colors";
import { createSlugUrl } from "@/lib/slug-utils";
import { cn } from "@/lib/utils";
import { toMediaUrl } from "@shared/article-media";
import type { RelatedCard } from "./related-types";

export function cardUrl(card: RelatedCard) {
  return createSlugUrl("/articles/", card.slug || "", String(card.id));
}

function ago(date: string | null) {
  if (!date) return "";
  const d = new Date(date);
  return isNaN(d.getTime()) ? "" : formatDistanceToNow(d, { addSuffix: true });
}

function Meta({ card, className }: { card: RelatedCard; className?: string }) {
  const when = ago(card.createdAt);
  return (
    <p className={cn("text-[12.5px] text-[hsl(var(--edition-text-muted))]", className)}>
      {card.channel?.name}
      {card.channel?.name && when && <span aria-hidden> · </span>}
      {when}
    </p>
  );
}

function Thumb({
  card,
  className,
  showImages,
}: {
  card: RelatedCard;
  className?: string;
  showImages: boolean;
}) {
  if (!showImages) return null;
  return (
    <div className={cn("relative overflow-hidden bg-[hsl(var(--edition-panel))]", className)}>
      {card.image?.url ? (
        <img
          src={toMediaUrl(card.image.url)}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-[50%_25%] transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.04]"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center font-display text-3xl font-black text-[hsl(var(--edition-border-strong))]">
          N
        </div>
      )}
    </div>
  );
}

/** One large "Read next" card: image left on desktop, on top on phones. */
export function ReadNextCard({ card, showImages }: { card: RelatedCard; showImages: boolean }) {
  return (
    <Link
      href={cardUrl(card)}
      className={cn(
        "group grid overflow-hidden rounded-2xl border border-[hsl(var(--edition-border))] bg-card transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--edition-accent))]",
        showImages && "sm:grid-cols-[45%_1fr]"
      )}
    >
      <Thumb card={card} showImages={showImages} className="aspect-[16/9] sm:aspect-auto sm:min-h-[260px]" />
      <div className="flex flex-col justify-center p-5 sm:p-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--edition-accent))]">
          Read next
        </p>
        <h3 className="mt-2 text-balance font-display text-[22px] font-extrabold leading-[1.15] tracking-[-0.01em] text-[hsl(var(--edition-text))] sm:text-[28px]">
          {card.title}
        </h3>
        <Meta card={card} className="mt-3" />
        <span className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-semibold text-[hsl(var(--edition-text))]">
          Continue reading
          <ArrowRight className="h-4 w-4 transition-transform motion-safe:group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
}

/** Image-top card on desktop, compact row on phones. */
export function StoryCard({ card, showImages }: { card: RelatedCard; showImages: boolean }) {
  return (
    <Link
      href={cardUrl(card)}
      className="group flex gap-4 border-b border-[hsl(var(--edition-border-hair))] py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--edition-accent))] sm:block sm:border-0 sm:py-0"
    >
      <Thumb
        card={card}
        showImages={showImages}
        className="h-[74px] w-[112px] shrink-0 rounded-md sm:aspect-[3/2] sm:h-auto sm:w-full sm:rounded-xl"
      />
      <div className="min-w-0 flex-1 sm:mt-3">
        {card.category && (
          <p
            className="text-[10.5px] font-bold uppercase tracking-[0.1em] sm:text-[11px]"
            style={{ color: categoryColor(card.category) }}
          >
            {card.category}
          </p>
        )}
        <h3 className="line-clamp-3 font-display text-[17px] font-bold leading-[1.2] text-[hsl(var(--edition-text))] transition-colors group-hover:text-[hsl(var(--edition-accent))] sm:mt-1 sm:text-[19px]">
          {card.title}
        </h3>
        <Meta card={card} className="mt-1.5" />
      </div>
    </Link>
  );
}

export function StoryGrid({
  title,
  cards,
  showImages,
}: {
  title: string;
  cards: RelatedCard[];
  showImages: boolean;
}) {
  if (!cards.length) return null;
  return (
    <section className="mt-12" aria-label={title}>
      <h2 className="border-b border-[hsl(var(--edition-border))] pb-3 font-display text-[22px] font-bold text-[hsl(var(--edition-text))] sm:text-[24px]">
        {title}
      </h2>
      <div className="sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:gap-y-8 lg:grid-cols-3">
        {cards.map((c) => (
          <StoryCard key={c.id} card={c} showImages={showImages} />
        ))}
      </div>
    </section>
  );
}
