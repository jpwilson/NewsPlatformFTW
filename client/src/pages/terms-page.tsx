import { NavigationBar } from "@/components/navigation-bar";
import { Link } from "wouter";

// Generic terms of service for NewsPlatform. Not legal advice — review before
// relying on it for specific regulatory obligations.
export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <NavigationBar />

      <div className="container mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-display text-4xl font-bold">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Effective date: 7 July 2026
        </p>

        <div className="mt-8 space-y-8 text-[15px] leading-relaxed text-foreground/90">
          <section>
            <h2 className="font-display text-2xl font-semibold mb-2">
              1. Agreement
            </h2>
            <p>
              These terms govern your use of NewsPlatform at{" "}
              <a
                href="https://newsplatform.org"
                className="text-primary hover:underline"
              >
                newsplatform.org
              </a>{" "}
              ("the platform", "we", "us"). By using the platform you agree to
              these terms and to our{" "}
              <Link href="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>
              . If you do not agree, please do not use the platform.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold mb-2">
              2. Accounts
            </h2>
            <p>
              You must be at least 13 years old to use NewsPlatform. You are
              responsible for your account and for keeping your credentials
              secure. You may sign in with an email address and password or
              through Google.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold mb-2">
              3. Your content
            </h2>
            <p>
              Writers and channel owners retain ownership of the articles,
              images, and other content they publish. By publishing on
              NewsPlatform you grant us a worldwide, non-exclusive,
              royalty-free licence to host, store, display, and distribute
              that content on and through the platform (including previews and
              social-sharing cards). You are responsible for the content you
              publish and must have the rights to everything you upload.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold mb-2">
              4. Acceptable use
            </h2>
            <p>You agree not to:</p>
            <ul className="mt-2 list-disc space-y-2 pl-6">
              <li>break the law or infringe others' rights, including copyright;</li>
              <li>
                publish content that is defamatory, harassing, hateful, or
                incites violence;
              </li>
              <li>
                impersonate others or knowingly publish fabricated material
                presented as fact;
              </li>
              <li>spam, scrape at abusive volumes, or attempt to disrupt or
                gain unauthorised access to the platform;</li>
              <li>
                use the platform's APIs except as permitted by their
                documentation and your API credentials.
              </li>
            </ul>
            <p className="mt-3">
              We may remove content or suspend accounts that violate these
              terms.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold mb-2">
              5. Third-party and publisher content
            </h2>
            <p>
              Articles on NewsPlatform are published by independent channels
              and reflect their authors' views, not ours. Market data shown in
              the ticker is provided by third parties, may be delayed or
              inaccurate, and is for general information only — it is{" "}
              <strong>not</strong> financial advice. Nothing on the platform
              constitutes professional advice of any kind.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold mb-2">
              6. Copyright complaints
            </h2>
            <p>
              If you believe content on the platform infringes your copyright,
              email us at the address below with the content's URL and details
              of your claim, and we will review and, where appropriate, remove
              it.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold mb-2">
              7. Our platform
            </h2>
            <p>
              The NewsPlatform name, logo, design, and software are ours or
              our licensors' and are protected by intellectual-property laws.
              We may change, suspend, or discontinue features at any time, and
              may update these terms — material changes will be reflected by
              updating the effective date above. Continued use after changes
              means you accept the updated terms.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold mb-2">
              8. Disclaimers and liability
            </h2>
            <p>
              The platform is provided "as is" and "as available", without
              warranties of any kind, express or implied. To the fullest
              extent permitted by law, we are not liable for indirect,
              incidental, special, or consequential damages, or for loss of
              data, profits, or goodwill, arising from your use of the
              platform. Nothing in these terms excludes liability that cannot
              be excluded by law.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold mb-2">
              9. Termination
            </h2>
            <p>
              You may stop using the platform or request account deletion at
              any time. We may suspend or terminate accounts that violate
              these terms or pose risk to the platform or its users.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold mb-2">
              10. Contact
            </h2>
            <p>
              Questions about these terms? Email{" "}
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
