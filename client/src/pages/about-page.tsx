import { Helmet } from "react-helmet-async";

export default function AboutPage() {
  return (
    <>
      <Helmet>
        <title>About NewsPlatform — Independent News Aggregator</title>
        <meta
          name="description"
          content="NewsPlatform is an independent news aggregator that curates today's top stories from diverse, independent channels. Learn about our mission and platform."
        />
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <article className="prose prose-lg dark:prose-invert max-w-none">
          <h1>About NewsPlatform</h1>

          <p className="lead text-xl text-muted-foreground">
            NewsPlatform is an independent news aggregator that curates and
            displays today's top stories from diverse, independent channels.
          </p>

          <h2>What is NewsPlatform?</h2>
          <p>
            NewsPlatform is a news discovery platform that focuses on surfacing
            quality journalism from independent voices and smaller outlets
            alongside established sources. The platform allows creators to
            publish content through personalized channels, giving readers access
            to a broader perspective on current events than traditional news
            aggregators.
          </p>

          <h2>Our Mission</h2>
          <p>
            We believe in the power of independent journalism and diverse
            perspectives. NewsPlatform was built to:
          </p>
          <ul>
            <li>
              Empower independent journalists and content creators to reach
              wider audiences
            </li>
            <li>
              Give readers access to news from voices outside the mainstream
              media ecosystem
            </li>
            <li>
              Foster a more diverse and representative news landscape
            </li>
            <li>
              Make quality journalism discoverable regardless of publisher size
            </li>
          </ul>

          <h2>Key Features</h2>

          <h3>For Readers</h3>
          <ul>
            <li>
              <strong>Independent Channels:</strong> Discover content from
              independent journalists, small newsrooms, and niche publications
            </li>
            <li>
              <strong>Diverse Perspectives:</strong> Access articles representing
              different viewpoints and coverage angles
            </li>
            <li>
              <strong>Channel Subscriptions:</strong> Follow channels that match
              your interests for a personalized news feed
            </li>
            <li>
              <strong>Category Organization:</strong> Browse news by topic —
              politics, technology, culture, and more
            </li>
            <li>
              <strong>Clean Reading Experience:</strong> Distraction-free article
              presentation focused on content
            </li>
          </ul>

          <h3>For Content Creators</h3>
          <ul>
            <li>
              <strong>Create Channels:</strong> Establish your own branded space
              to publish articles
            </li>
            <li>
              <strong>Build an Audience:</strong> Grow your subscriber base and
              reach engaged readers
            </li>
            <li>
              <strong>Rich Content Publishing:</strong> Publish articles with
              images, formatting, and multimedia
            </li>
            <li>
              <strong>Analytics:</strong> Track your reach and subscriber growth
            </li>
          </ul>

          <h2>How It Works</h2>
          <ol>
            <li>Content creators register and create channels</li>
            <li>Creators publish articles to their channels</li>
            <li>
              Articles appear in the main feed and in category-specific views
            </li>
            <li>Readers can browse, subscribe to channels, and follow topics</li>
            <li>
              The platform surfaces quality content from all channels, not just
              the largest ones
            </li>
          </ol>

          <h2>Platform Values</h2>
          <ul>
            <li>
              <strong>Independence:</strong> We don't favor large publishers over
              small ones
            </li>
            <li>
              <strong>Diversity:</strong> We actively promote voices from
              different backgrounds and perspectives
            </li>
            <li>
              <strong>Quality:</strong> We encourage well-researched, thoughtful
              journalism
            </li>
            <li>
              <strong>Transparency:</strong> Readers always know who published an
              article and when
            </li>
            <li>
              <strong>Accessibility:</strong> Our platform is free to use for
              both readers and creators
            </li>
          </ul>

          <h2>Get Started</h2>
          <p>
            Ready to explore independent news? <a href="/">Browse the latest
            stories</a> on our homepage, or <a href="/channels">discover
            channels</a> that match your interests.
          </p>
          <p>
            Want to publish your own content? <a href="/auth">Create an
            account</a> and start your channel today.
          </p>

          <h2>API Access</h2>
          <p>
            Developers can access our public API to integrate NewsPlatform
            content into their applications. Visit our{" "}
            <a href="/api">API documentation</a> to learn more.
          </p>
        </article>
      </div>
    </>
  );
}
