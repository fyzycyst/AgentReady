import type { Metadata } from "next";
import Link from "next/link";
import { DemoAuditPanel } from "@/components/demo/demo-audit-panel";
import { WebMcpScripts } from "@/components/demo/webmcp-scripts";
import type { WebMcpControlProps, WebMcpFormProps } from "@/types/webmcp";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const canonical = `${siteUrl.replace(/\/$/, "")}/demo`;

export const metadata: Metadata = {
  title: "Le Petit Bistro — Table reservations in Lyon",
  description:
    "Reserve a table at Le Petit Bistro. Same-day availability, seasonal menu, and agent-ready WebMCP tools for booking.",
  alternates: { canonical },
  openGraph: {
    title: "Le Petit Bistro — Reservations",
    description: "Book a table online. Declarative and imperative WebMCP tools demonstrate agent-ready hospitality.",
    type: "website",
    url: canonical,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Restaurant",
  name: "Le Petit Bistro",
  url: canonical,
  description: "Seasonal French bistro in Lyon with online table reservations.",
  servesCuisine: "French",
  address: {
    "@type": "PostalAddress",
    streetAddress: "14 Rue de la République",
    addressLocality: "Lyon",
    postalCode: "69002",
    addressCountry: "FR",
  },
  telephone: "+33-4-78-00-00-00",
  potentialAction: {
    "@type": "ReserveAction",
    target: `${siteUrl.replace(/\/$/, "")}/api/demo/reserve`,
  },
};

export default function DemoPage() {
  return (
    <>
      <WebMcpScripts />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="flex-1 flex flex-col min-h-full">
        <header className="border-b border-line bg-surface/80">
          <div className="mx-auto max-w-3xl px-6 py-5 flex items-center justify-between">
            <Link href="/" className="font-mono text-sm tracking-wide text-text">
              Le Petit <span className="text-signal">Bistro</span>
            </Link>
            <nav aria-label="Primary" className="flex gap-5 text-sm text-muted">
              <a href="#menu" className="hover:text-text">
                Menu
              </a>
              <a href="#reserve" className="hover:text-text">
                Reserve
              </a>
              <Link href="/" className="hover:text-text">
                AgentReady
              </Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl px-6 py-12 flex-1">
          <p className="eyebrow">Lyon · Seasonal French</p>
          <h1 className="display mt-4 text-4xl md:text-5xl font-semibold">Reserve your table</h1>
          <p className="mt-4 max-w-xl text-muted">
            A demonstration restaurant page built for AgentReady — fully semantic HTML, structured data, and two WebMCP
            tools agents can discover and invoke.
          </p>

          <section id="menu" className="mt-10">
            <h2 className="text-xl font-medium">Tonight&apos;s menu</h2>
            <p className="mt-2 text-sm text-muted">
              Soupe à l&apos;oignon gratinée, duck confit with pommes sarladaises, tarte Tatin.
            </p>
          </section>

          <section id="reserve" className="mt-10">
            <h2 className="text-xl font-medium">Book online</h2>
            <form
              action="/api/demo/reserve"
              method="post"
              className="card mt-4 p-6 grid gap-4 sm:grid-cols-2"
              {...({
                toolname: "reserve_table",
                tooldescription: "Reserve a table at Le Petit Bistro for a given date, time, and party size.",
              } satisfies WebMcpFormProps)}
            >
              <div className="sm:col-span-2">
                <label htmlFor="guest-name" className="block text-sm text-muted mb-1">
                  Full name
                </label>
                <input
                  id="guest-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  {...({ toolparamdescription: "Guest full name for the reservation" } satisfies WebMcpControlProps)}
                  className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="guest-email" className="block text-sm text-muted mb-1">
                  Email
                </label>
                <input
                  id="guest-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  {...({ toolparamdescription: "Contact email for confirmation" } satisfies WebMcpControlProps)}
                  className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="guest-phone" className="block text-sm text-muted mb-1">
                  Phone
                </label>
                <input
                  id="guest-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  required
                  {...({ toolparamdescription: "Phone number for day-of changes" } satisfies WebMcpControlProps)}
                  className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="res-date" className="block text-sm text-muted mb-1">
                  Date
                </label>
                <input
                  id="res-date"
                  name="date"
                  type="date"
                  required
                  {...({ toolparamdescription: "Reservation date (YYYY-MM-DD)" } satisfies WebMcpControlProps)}
                  className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="res-time" className="block text-sm text-muted mb-1">
                  Time
                </label>
                <input
                  id="res-time"
                  name="time"
                  type="time"
                  required
                  {...({ toolparamdescription: "Preferred seating time (24-hour)" } satisfies WebMcpControlProps)}
                  className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="party-size" className="block text-sm text-muted mb-1">
                  Party size
                </label>
                <input
                  id="party-size"
                  name="party_size"
                  type="number"
                  min={1}
                  max={12}
                  defaultValue={2}
                  required
                  {...({ toolparamdescription: "Number of guests (1–12)" } satisfies WebMcpControlProps)}
                  className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="notes" className="block text-sm text-muted mb-1">
                  Special requests
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  {...({ toolparamdescription: "Optional dietary notes or occasion" } satisfies WebMcpControlProps)}
                  className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="rounded-md bg-signal px-5 py-2.5 text-sm font-medium text-bg hover:bg-signal-dim transition-colors"
                >
                  Confirm reservation
                </button>
              </div>
            </form>
          </section>

          <DemoAuditPanel />
        </main>

        <footer className="border-t border-line mt-12">
          <div className="mx-auto max-w-3xl px-6 py-6 text-xs text-faint flex flex-wrap gap-x-4 gap-y-1">
            <span>© Le Petit Bistro · AgentReady demo</span>
            <span>WebMCP origin trial Chrome 149–156; flag #enable-webmcp-testing; not on by default in Stable 152/153.</span>
          </div>
        </footer>
      </div>
    </>
  );
}
