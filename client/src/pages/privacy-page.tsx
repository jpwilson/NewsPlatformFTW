import { NavigationBar } from "@/components/navigation-bar";

// Generic privacy policy for NewsPlatform. Not legal advice — review before
// relying on it for specific regulatory obligations.
export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <NavigationBar />

      <div className="container mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-display text-4xl font-bold">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Effective date: 7 July 2026
        </p>

        <div className="mt-8 space-y-8 text-[15px] leading-relaxed text-foreground/90">
          <section>
            <h2 className="font-display text-2xl font-semibold mb-2">
              Who we are
            </h2>
            <p>
              NewsPlatform ("we", "us") operates the news publishing platform
              at{" "}
              <a href="https://newsplatform.org" className="text-primary hover:underline">
                newsplatform.org
              </a>
              . This policy explains what information we collect, how we use
              it, and the choices you have.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold mb-2">
              Information we collect
            </h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>Account information.</strong> When you create an
                account — with an email address and password, or by signing in
                with Google — we receive basic profile details such as your
                email address, display name, and profile picture.
              </li>
              <li>
                <strong>Content you create.</strong> Articles, channels,
                comments, subscriptions, and reactions you publish on the
                platform.
              </li>
              <li>
                <strong>Usage information.</strong> Article view counts and
                basic technical data (such as browser type and approximate
                region derived from your IP address) used to operate and
                improve the service — for example, to rank "Most read"
                stories.
              </li>
              <li>
                <strong>Cookies and local storage.</strong> We use them to keep
                you signed in and to remember preferences such as your theme
                and layout choices. We do not use third-party advertising
                cookies.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold mb-2">
              How we use information
            </h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>To provide, maintain, and improve the platform.</li>
              <li>
                To personalise your experience, such as showing stories from
                channels you follow and surfacing popular articles.
              </li>
              <li>To keep the platform safe and prevent abuse.</li>
              <li>
                To communicate with you about your account when necessary.
              </li>
            </ul>
            <p className="mt-3">
              We do <strong>not</strong> sell your personal information.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold mb-2">
              Services we rely on
            </h2>
            <p>
              We use a small number of service providers to run NewsPlatform:
            </p>
            <ul className="mt-2 list-disc space-y-2 pl-6">
              <li>
                <strong>Supabase</strong> — authentication, database, and file
                storage.
              </li>
              <li>
                <strong>Vercel</strong> — website hosting and anonymous
                performance analytics.
              </li>
              <li>
                <strong>Google</strong> — optional "Sign in with Google"
                authentication.
              </li>
              <li>
                <strong>Market data providers</strong> — the market ticker
                fetches public price data (e.g. from CoinGecko and
                exchangerate-api) directly from your browser, so those
                services may see your IP address. You can hide the ticker at
                any time.
              </li>
            </ul>
            <p className="mt-3">
              These providers process data on our behalf under their own
              security and privacy commitments. We may also disclose
              information if required by law.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold mb-2">
              Data retention and deletion
            </h2>
            <p>
              We keep your account information and content for as long as your
              account exists. You can request deletion of your account and
              associated personal data by contacting us at the address below;
              we will action requests within a reasonable period. Published
              articles may be removed or anonymised on request.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold mb-2">
              Your rights
            </h2>
            <p>
              Depending on where you live, you may have rights to access,
              correct, export, or delete your personal information, and to
              object to or restrict certain processing. To exercise any of
              these rights, contact us using the details below.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold mb-2">
              Children
            </h2>
            <p>
              NewsPlatform is not directed at children under 13, and we do not
              knowingly collect personal information from them.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold mb-2">
              Changes to this policy
            </h2>
            <p>
              We may update this policy from time to time. Material changes
              will be reflected by updating the effective date at the top of
              this page.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold mb-2">
              Contact
            </h2>
            <p>
              Questions or requests? Email{" "}
              <a
                href="mailto:jeanpaulwilson@gmail.com"
                className="text-primary hover:underline"
              >
                jeanpaulwilson@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
