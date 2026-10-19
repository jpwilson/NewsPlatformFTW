import { Helmet } from "react-helmet-async";

export default function HowItWorksPage() {
  return (
    <>
      <Helmet>
        <title>How NewsPlatform Works — Independent News Publishing</title>
        <meta
          name="description"
          content="Learn how NewsPlatform connects independent content creators with readers. Understand our publishing platform, channel system, and content discovery."
        />
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <article className="prose prose-lg dark:prose-invert max-w-none">
          <h1>How NewsPlatform Works</h1>

          <p className="lead text-xl text-muted-foreground">
            NewsPlatform is a two-sided platform connecting independent content
            creators with readers seeking diverse news perspectives.
          </p>

          <h2>For Readers</h2>

          <h3>1. Browse Stories</h3>
          <p>
            The <a href="/">homepage</a> displays the latest published articles
            from all channels. Stories are organized chronologically, with the
            newest content appearing first. Each article card shows:
          </p>
          <ul>
            <li>Article headline and excerpt</li>
            <li>Publishing channel name</li>
            <li>Publication date</li>
            <li>Category tags</li>
          </ul>

          <h3>2. Discover Channels</h3>
          <p>
            Browse the <a href="/channels">Channels directory</a> to discover
            content creators. Each channel represents an independent voice —
            whether that's an individual journalist, a small newsroom, or a niche
            publication. Channels can focus on specific topics, regions, or
            perspectives.
          </p>

          <h3>3. Subscribe to Channels</h3>
          <p>
            When you find channels you like, subscribe to follow their content.
            Subscriptions help you:
          </p>
          <ul>
            <li>Keep track of your favorite creators</li>
            <li>Support independent voices by growing their subscriber base</li>
            <li>Build a personalized reading list</li>
          </ul>

          <h3>4. Explore by Category</h3>
          <p>
            Articles are tagged with categories like Politics, Technology,
            Culture, Environment, and more. Use category filters to find content
            on specific topics.
          </p>

          <h2>For Content Creators</h2>

          <h3>1. Create an Account</h3>
          <p>
            Sign up for a free account at <a href="/auth">newsplatform.org/auth</a>.
            No subscription fees or upfront costs — NewsPlatform is free for
            creators.
          </p>

          <h3>2. Create Your Channel</h3>
          <p>
            Once registered, create a channel for your content. Your channel is
            your branded publishing space on NewsPlatform. Set up:
          </p>
          <ul>
            <li>Channel name and description</li>
            <li>Profile and banner images</li>
            <li>Category focus</li>
            <li>Location (if relevant)</li>
          </ul>

          <h3>3. Publish Articles</h3>
          <p>
            Write and publish articles to your channel using our editor. Articles
            can include:
          </p>
          <ul>
            <li>Rich text formatting</li>
            <li>Images and captions</li>
            <li>Links and embedded content</li>
            <li>Category tags</li>
            <li>Location tags</li>
          </ul>

          <h3>4. Build Your Audience</h3>
          <p>
            As you publish quality content, readers will discover your channel
            and subscribe. Your subscriber count is visible on your channel page.
          </p>

          <h3>5. Manage Your Content</h3>
          <p>You can edit, unpublish, or delete your articles at any time.</p>

          <h2>Content Discovery</h2>
          <p>
            NewsPlatform uses a chronological feed model, meaning newer content
            appears first. This approach ensures:
          </p>
          <ul>
            <li>Small channels have the same visibility as large ones</li>
            <li>Breaking news surfaces quickly</li>
            <li>No algorithmic filtering or preferential placement</li>
            <li>All published content is discoverable</li>
          </ul>

          <h2>Quality and Moderation</h2>
          <p>
            While NewsPlatform is open to diverse perspectives, we maintain
            standards for content quality:
          </p>
          <ul>
            <li>Articles must be original or properly attributed</li>
            <li>Content must comply with our terms of service</li>
            <li>Spam and malicious content is removed</li>
            <li>
              Readers can report problematic content for review
            </li>
          </ul>

          <h2>API Integration</h2>
          <p>
            Developers and organizations can integrate NewsPlatform content via
            our public API:
          </p>
          <ul>
            <li>Fetch latest articles programmatically</li>
            <li>Access article metadata and content</li>
            <li>Filter by channel, category, or date</li>
            <li>Build custom news applications</li>
          </ul>
          <p>
            Learn more in our <a href="/api">API documentation</a>.
          </p>

          <h2>Getting Help</h2>
          <p>
            Questions about how NewsPlatform works? Check our{" "}
            <a href="/about">About page</a> for more information, or explore the
            platform yourself at <a href="/">newsplatform.org</a>.
          </p>
        </article>
      </div>
    </>
  );
}
