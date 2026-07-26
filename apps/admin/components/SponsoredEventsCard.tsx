"use client";

import { useActionState, useState } from "react";

import { toggleEventSponsored, type ActionResult } from "@/app/actions";
import type { SponsorableEvent } from "@/lib/sponsoredEvents";

import { ActionStatus, cardClass, inputClass, smallButtonClass } from "./forms";

const INITIAL: ActionResult = { ok: true, error: null, saved: false };

const dateLabel = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/New_York"
  });

type SponsoredEventsCardProps = {
  readonly events: readonly SponsorableEvent[];
};

export function SponsoredEventsCard({ events }: SponsoredEventsCardProps) {
  const [search, setSearch] = useState("");
  const [state, action, pending] = useActionState(toggleEventSponsored, INITIAL);

  const query = search.trim().toLowerCase();
  const sponsored = events.filter((event) => event.sponsored);
  const available = events.filter(
    (event) =>
      !event.sponsored && (query === "" || event.name.toLowerCase().includes(query))
  );

  return (
    <section className={cardClass}>
      <h2 className="text-xl font-bold text-white">Sponsored events</h2>
      <p className="mt-1 text-sm text-khakis">
        Sponsored events show a &ldquo;Sponsored&rdquo; badge on their cards in the app.
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {sponsored.map((event) => (
          <li
            key={event.id}
            className="flex items-center gap-2 rounded-pill border-2 border-oreo bg-brown-300 px-4 py-2"
          >
            <span className="w-14 text-xs font-medium text-khakis">
              {dateLabel(event.startAt)}
            </span>
            <span className="flex-1 truncate text-sm font-medium text-white">{event.name}</span>
            <form action={action}>
              <input name="eventId" type="hidden" value={event.id} />
              <input name="sponsored" type="hidden" value="false" />
              <button
                aria-label={`Remove sponsorship from ${event.name}`}
                className={smallButtonClass}
                disabled={pending}
                type="submit"
              >
                ✕
              </button>
            </form>
          </li>
        ))}
        {sponsored.length === 0 ? (
          <li className="text-sm text-khakis">No sponsored events yet.</li>
        ) : null}
      </ul>

      <div className="mt-6 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-khakis">
          Mark an upcoming event as sponsored
          <input
            className={inputClass}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search upcoming events"
            type="search"
            value={search}
          />
        </label>
        <ul className="flex max-h-60 flex-col gap-2 overflow-y-auto pr-1">
          {available.map((event) => (
            <li key={event.id} className="flex items-center gap-2">
              <span className="w-14 text-xs text-khakis">{dateLabel(event.startAt)}</span>
              <span className="flex-1 truncate text-sm text-white">{event.name}</span>
              <form action={action}>
                <input name="eventId" type="hidden" value={event.id} />
                <input name="sponsored" type="hidden" value="true" />
                <button
                  aria-label={`Mark ${event.name} as sponsored`}
                  className={smallButtonClass}
                  disabled={pending}
                  type="submit"
                >
                  + Sponsor
                </button>
              </form>
            </li>
          ))}
          {available.length === 0 ? (
            <li className="text-sm text-khakis">No upcoming events match.</li>
          ) : null}
        </ul>
      </div>

      <div className="mt-3">
        <ActionStatus pending={pending} state={state} />
      </div>
    </section>
  );
}
