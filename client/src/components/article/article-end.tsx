import { CommentSection } from "@/components/comment-section";

/** End of the article: end mark and comments (step B3; the recirculation blocks follow in B4). */
export function ArticleEnd({
  articleId,
  isDraft,
  onCommentsLoaded,
}: {
  articleId: number;
  isDraft: boolean;
  onCommentsLoaded: (count: number) => void;
}) {
  return (
    <div className="mx-auto max-w-[720px] px-4">
      <div aria-hidden className="mt-10 h-[3px] w-12 rounded-full bg-[hsl(var(--edition-accent))]" />
      {!isDraft && (
        <section id="comments" className="mt-10 scroll-mt-24">
          <CommentSection articleId={articleId} onCommentsLoaded={onCommentsLoaded} />
        </section>
      )}
    </div>
  );
}
