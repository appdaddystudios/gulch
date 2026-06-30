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
    const counts = await getCounts(client);
    return { connected: true, counts };
  } catch (error) {
    captureException(error);
    return {
      connected: false,
      reason: error instanceof Error ? error.message : "Supabase count query failed."
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
    <main className="min-h-screen px-6 py-8 sm:px-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="border border-amber-300 bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-950">
          TEMPORARY — pending Figma design
        </div>

        <section className="border border-neutral-300 bg-white p-6">
          <div className="flex flex-col gap-2 border-b border-neutral-200 pb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Gulch Admin</p>
            <h1 className="text-3xl font-semibold text-neutral-950">Live Supabase Connectivity</h1>
            <p className="max-w-2xl text-sm leading-6 text-neutral-600">
              This shell only verifies request-time environment wiring and read access to the live public data.
            </p>
          </div>

          {state.connected ? (
            <div className="grid gap-4 pt-6 sm:grid-cols-3">
              {countCards.map((card) => (
                <div key={card.key} className="border border-neutral-200 p-4">
                  <p className="text-sm font-medium text-neutral-500">{card.label}</p>
                  <p className="mt-3 text-4xl font-semibold tabular-nums text-neutral-950">
                    {state.counts[card.key].toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-6 border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-sm font-semibold text-neutral-900">Not connected</p>
              <p className="mt-2 text-sm leading-6 text-neutral-600">{state.reason}</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
