import { RichArticleContent } from "@/components/rich-article-content";
import { useLightbox } from "@/components/lightbox/lightbox-context";

/**
 * The article text in a 720px reading column. Body images open the page's photo viewer:
 * the n-th image in the body is the n-th "body" slide (composeArticleMedia keeps both in
 * document order), with a lookup by src as a safety net.
 */
export function ArticleBody({ html }: { html: string }) {
  const { open, slides } = useLightbox();
  const firstBody = slides.findIndex((s) => s.origin === "body");

  return (
    <div className="mx-auto mt-8 max-w-[720px] px-4 lg:mt-10">
      <RichArticleContent
        className="article-body prose dark:prose-invert max-w-none"
        html={html}
        onImageActivate={(img, i) => {
          const src = img.getAttribute("src");
          const at = firstBody >= 0 ? firstBody + i : -1;
          const index =
            at >= 0 && slides[at]?.src === src
              ? at
              : slides.findIndex((s) => s.origin === "body" && s.src === src);
          if (index >= 0) open(index, img);
        }}
      />
    </div>
  );
}
