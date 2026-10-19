import { Helmet } from "react-helmet-async";

export default function ComparePage() {
  return (
    <>
      <Helmet>
        <title>NewsPlatform vs Ground News — Platform Comparison</title>
        <meta
          name="description"
          content="Compare NewsPlatform and Ground News: understand the differences between an independent publishing platform and a news bias analysis tool."
        />
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <article className="prose prose-lg dark:prose-invert max-w-none">
          <h1>NewsPlatform vs Ground News</h1>

          <p className="lead text-xl text-muted-foreground">
            NewsPlatform and Ground News both work with news content, but serve
            fundamentally different purposes. Here's how they compare.
          </p>

          <h2>The Key Difference</h2>

          <div className="grid md:grid-cols-2 gap-6 not-prose my-8">
            <div className="border rounded-lg p-6 bg-card">
              <h3 className="text-lg font-semibold mb-3">NewsPlatform</h3>
              <p className="text-sm text-muted-foreground">
                <strong>Publishing platform</strong> for independent content
                creators
              </p>
              <ul className="text-sm mt-4 space-y-2">
                <li>✓ Creators publish original articles</li>
                <li>✓ Content lives on NewsPlatform</li>
                <li>✓ Focuses on independent voices</li>
                <li>✓ Readers discover new creators</li>
              </ul>
            </div>

            <div className="border rounded-lg p-6 bg-card">
              <h3 className="text-lg font-semibold mb-3">Ground News</h3>
              <p className="text-sm text-muted-foreground">
                <strong>Analytical tool</strong> for understanding news bias
              </p>
              <ul className="text-sm mt-4 space-y-2">
                <li>✓ Aggregates existing articles</li>
                <li>✓ Links to original sources</li>
                <li>✓ Analyzes bias patterns</li>
                <li>✓ Compares coverage across outlets</li>
              </ul>
            </div>
          </div>

          <h2>Detailed Comparison</h2>

          <h3>Content Source</h3>
          <p>
            <strong>NewsPlatform:</strong> Content creators publish articles
            directly to the platform. Articles are original to NewsPlatform or
            republished by their authors. Think of it like Medium or Substack
            for news.
          </p>
          <p>
            <strong>Ground News:</strong> Aggregates and links to articles
            already published by major news outlets. Ground News doesn't host
            the content — it indexes and analyzes it.
          </p>

          <h3>Primary Purpose</h3>
          <p>
            <strong>NewsPlatform:</strong> Provides a publishing platform for
            independent journalists and small outlets to reach readers. The goal
            is content creation and discovery.
          </p>
          <p>
            <strong>Ground News:</strong> Helps readers understand how different
            outlets cover the same story and identify bias patterns. The goal is
            media literacy and bias awareness.
          </p>

          <h3>Target Users</h3>
          <p>
            <strong>NewsPlatform:</strong>
          </p>
          <ul>
            <li>
              <em>Creators:</em> Independent journalists, small newsrooms,
              niche publishers
            </li>
            <li>
              <em>Readers:</em> People seeking independent perspectives and
              discovering new voices
            </li>
          </ul>
          <p>
            <strong>Ground News:</strong>
          </p>
          <ul>
            <li>
              <em>Readers:</em> People who want to understand bias in media
              coverage
            </li>
            <li>
              <em>Educators:</em> Teaching media literacy
            </li>
          </ul>

          <h3>Key Features</h3>
          <p>
            <strong>NewsPlatform:</strong>
          </p>
          <ul>
            <li>Channel creation and management</li>
            <li>Article editor and publishing tools</li>
            <li>Subscriber system</li>
            <li>Chronological content feed</li>
            <li>Category-based browsing</li>
            <li>API for developers</li>
          </ul>
          <p>
            <strong>Ground News:</strong>
          </p>
          <ul>
            <li>Bias ratings for news sources</li>
            <li>Side-by-side story comparisons</li>
            <li>Coverage pattern analysis</li>
            <li>Blindspot detection (stories covered by only one side)</li>
            <li>Source ownership transparency</li>
          </ul>

          <h3>Business Model</h3>
          <p>
            <strong>NewsPlatform:</strong> Free for both creators and readers.
            Platform is funded independently.
          </p>
          <p>
            <strong>Ground News:</strong> Freemium model with basic features
            free and premium subscription for advanced analysis.
          </p>

          <h2>Which Should You Use?</h2>

          <h3>Use NewsPlatform if you want to:</h3>
          <ul>
            <li>Publish your own journalism or commentary</li>
            <li>Discover independent content creators</li>
            <li>Follow specific journalists or small outlets</li>
            <li>Access content from voices outside mainstream media</li>
            <li>Support independent journalism</li>
          </ul>

          <h3>Use Ground News if you want to:</h3>
          <ul>
            <li>Understand how different outlets cover the same story</li>
            <li>Identify bias in news coverage</li>
            <li>Compare left, center, and right perspectives</li>
            <li>Discover stories your usual sources aren't covering</li>
            <li>Learn about media literacy</li>
          </ul>

          <h2>Can You Use Both?</h2>
          <p>
            Absolutely! NewsPlatform and Ground News serve complementary
            purposes:
          </p>
          <ul>
            <li>
              Use <strong>Ground News</strong> to analyze coverage of major
              stories across established outlets
            </li>
            <li>
              Use <strong>NewsPlatform</strong> to discover independent voices
              and perspectives you won't find in mainstream coverage
            </li>
          </ul>

          <h2>Getting Started</h2>
          <p>
            Ready to explore independent news? Visit the{" "}
            <a href="/">NewsPlatform homepage</a> to browse latest stories, or{" "}
            <a href="/channels">discover channels</a> to follow.
          </p>
          <p>
            If you're a content creator, <a href="/auth">create an account</a>{" "}
            and start your channel.
          </p>
        </article>
      </div>
    </>
  );
}
