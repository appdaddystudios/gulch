import { BannerAdCard } from "@/components/BannerAdCard";
import { FeaturedOrganizersCard } from "@/components/FeaturedOrganizersCard";
import { ResearchCard } from "@/components/ResearchCard";
import { SponsoredEventsCard } from "@/components/SponsoredEventsCard";
import { getFeaturedState, type FeaturedState } from "@/lib/featured";
import { getHomepageConfig, type HomepageConfig } from "@/lib/homeContent";
import { getSponsorableEvents, type SponsorableEvent } from "@/lib/sponsoredEvents";
import { getCounts } from "@/lib/stats";
import { createServerSupabase } from "@/lib/supabase";
import { initializeTelemetry, captureException } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

type DashboardState =
  | {
      readonly connected: true;
      readonly counts: {
        readonly locations: number;
        readonly events: number;
        readonly shows: number;
      };
      readonly config: HomepageConfig;
      readonly featured: FeaturedState;
      readonly sponsorable: readonly SponsorableEvent[];
    }
  | {
      readonly connected: false;
      readonly reason: string;
    };

const loadDashboardState = async (): Promise<DashboardState> => {
  initializeTelemetry();

  const client = createServerSupabase();

  if (!client) {
    return {
      connected: false,
      reason: "Supabase environment variables are not available for this request."
    };
  }

  try {
    const [counts, config, featured, sponsorable] = await Promise.all([
      getCounts(client),
      getHomepageConfig(client),
      getFeaturedState(client),
      getSponsorableEvents(client)
    ]);
    return { connected: true, counts, config, featured, sponsorable };
  } catch (error) {
    captureException(error);
    return {
      connected: false,
      reason: error instanceof Error ? error.message : "Supabase query failed."
    };
  }
};

const countCards = [
  { key: "locations", label: "Locations" },
  { key: "events", label: "Events" },
  { key: "shows", label: "Shows" }
] as const;

export default async function AdminPage() {
  const state = await loadDashboardState();

  return (
    <main className="min-h-screen px-6 py-10 sm:px-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header className="flex flex-col items-start gap-3">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-khakis">
            Gulch Admin
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-3xl font-bold text-white">Dashboard</h1>
            <span
              className={`rounded-pill border-2 border-oreo px-3 py-1 text-xs font-medium text-oreo shadow-hard ${
                state.connected ? "bg-gulch-green" : "bg-beige"
              }`}
            >
              {state.connected ? "Connected" : "Not connected"}
            </span>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-khakis">
            Edit the app homepage content — changes go live the next time the app loads.
          </p>
        </header>

        {state.connected ? (
          <>
            <div className="grid gap-5 sm:grid-cols-3">
              {countCards.map((card) => (
                <div
                  key={card.key}
                  className="rounded-card border-2 border-oreo bg-brown-300 p-5 shadow-hard-lg"
                >
                  <p className="text-sm font-medium text-white">{card.label}</p>
                  <p className="mt-3 text-4xl font-bold tabular-nums text-white">
                    {state.counts[card.key].toLocaleString()}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid items-start gap-6 lg:grid-cols-2">
              <ResearchCard label={state.config.researchLabel} url={state.config.researchUrl} />
              <BannerAdCard config={state.config} />
            </div>

            <FeaturedOrganizersCard
              featuredIds={state.featured.featuredIds}
              organizers={state.featured.organizers}
            />

            <SponsoredEventsCard events={state.sponsorable} />
          </>
        ) : (
          <div className="rounded-card border-2 border-oreo bg-brown-400 p-5 shadow-hard-lg">
            <p className="text-sm font-bold text-white">Supabase is unreachable</p>
            <p className="mt-2 text-sm leading-6 text-khakis">{state.reason}</p>
          </div>
        )}
      </div>
    </main>
  );
}
