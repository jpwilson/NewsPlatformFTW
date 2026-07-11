import { NavigationBar } from "@/components/navigation-bar";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Megaphone, Newspaper, Mail, LineChart } from "lucide-react";

// Advertising / sponsorship storefront. Bookings are manual (email) for now —
// the Featured Lead placement is delivered via Admin → Homepage → manual
// sponsored pick.
export default function AdvertisePage() {
  const mailto =
    "mailto:jeanpaulwilson@gmail.com?subject=NewsPlatform%20sponsorship%20enquiry";

  return (
    <div className="min-h-screen bg-background">
      <NavigationBar />

      <div className="container mx-auto max-w-3xl px-4 py-10">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[hsl(var(--edition-accent))]">
          Advertise on NewsPlatform
        </p>
        <h1 className="mt-1 font-display text-4xl font-bold">
          Put your story in front of engaged readers
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          NewsPlatform publishes rich, data-driven journalism across politics,
          business, tech, science, sport and more — dozens of new stories every
          day from independent channels. Sponsorships are clearly labelled and
          designed to feel native, never disruptive.
        </p>

        <div className="mt-10 space-y-6">
          <h2 className="font-display text-2xl font-semibold">Placements</h2>

          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-[15px]">
              <thead>
                <tr className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="p-4 font-semibold">Placement</th>
                  <th className="p-4 font-semibold">What you get</th>
                  <th className="p-4 font-semibold text-right">
                    Launch pricing
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="p-4 align-top font-medium">
                    <div className="flex items-center gap-2">
                      <Newspaper className="h-4 w-4 text-[hsl(var(--edition-accent))]" />
                      Featured Lead
                    </div>
                  </td>
                  <td className="p-4 align-top text-muted-foreground">
                    Your sponsored article as the homepage lead story — the
                    largest placement on the site, with a clear
                    “Sponsored” label. Full rich-article format (galleries,
                    charts, video).
                  </td>
                  <td className="p-4 align-top text-right font-semibold">
                    $99 / day
                  </td>
                </tr>
                <tr>
                  <td className="p-4 align-top font-medium">
                    <div className="flex items-center gap-2">
                      <Megaphone className="h-4 w-4 text-[hsl(var(--edition-accent))]" />
                      Channel sponsorship
                    </div>
                  </td>
                  <td className="p-4 align-top text-muted-foreground">
                    Presenting sponsor of a topic channel (e.g. AI, Endurance
                    Sport): logo + credit on the channel page and its stories.
                  </td>
                  <td className="p-4 align-top text-right font-semibold">
                    from $299 / month
                  </td>
                </tr>
                <tr>
                  <td className="p-4 align-top font-medium">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-[hsl(var(--edition-accent))]" />
                      Newsletter slot
                    </div>
                  </td>
                  <td className="p-4 align-top text-muted-foreground">
                    A featured slot in the NewsPlatform digest email.
                  </td>
                  <td className="p-4 align-top text-right font-semibold">
                    Coming soon
                  </td>
                </tr>
                <tr>
                  <td className="p-4 align-top font-medium">
                    <div className="flex items-center gap-2">
                      <LineChart className="h-4 w-4 text-[hsl(var(--edition-accent))]" />
                      Content partnership
                    </div>
                  </td>
                  <td className="p-4 align-top text-muted-foreground">
                    Publish at scale through the NewsPlatform Content API —
                    your newsroom, our audience and tooling.
                  </td>
                  <td className="p-4 align-top text-right font-semibold">
                    Let’s talk
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border bg-[hsl(var(--edition-panel))] p-6">
            <h3 className="font-display text-xl font-semibold">
              Book a placement
            </h3>
            <p className="mt-2 text-muted-foreground">
              Tell us what you're promoting and the dates you want. We reply
              within one business day with availability and a preview of your
              placement.
            </p>
            <a href={mailto}>
              <Button className="mt-4 bg-[hsl(var(--edition-accent))] text-white hover:bg-[hsl(var(--edition-accent))]/90">
                <Mail className="mr-2 h-4 w-4" />
                Contact us
              </Button>
            </a>
          </div>

          <p className="text-sm text-muted-foreground">
            All sponsored content is clearly labelled. We don't run intrusive
            formats — no pop-ups, no autoplay audio, no takeover interstitials.
            See our{" "}
            <Link href="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link href="/terms" className="text-primary hover:underline">
              Terms
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
