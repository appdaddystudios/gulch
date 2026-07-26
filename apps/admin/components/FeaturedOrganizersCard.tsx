"use client";

import { useActionState, useState } from "react";

import {
  addFeaturedOrganizer,
  moveFeaturedOrganizerDown,
  moveFeaturedOrganizerUp,
  removeFeaturedOrganizer,
  type ActionResult
} from "@/app/actions";
import type { OrganizerRow } from "@/lib/featured";

import { ActionStatus, cardClass, inputClass, smallButtonClass } from "./forms";

const INITIAL: ActionResult = { ok: true, error: null, saved: false };

type FeaturedOrganizersCardProps = {
  readonly organizers: readonly OrganizerRow[];
  readonly featuredIds: readonly string[];
};

export function FeaturedOrganizersCard({ organizers, featuredIds }: FeaturedOrganizersCardProps) {
  const [search, setSearch] = useState("");
  const [addState, addAction, addPending] = useActionState(addFeaturedOrganizer, INITIAL);
  const [removeState, removeAction, removePending] = useActionState(removeFeaturedOrganizer, INITIAL);
  const [upState, upAction, upPending] = useActionState(moveFeaturedOrganizerUp, INITIAL);
  const [downState, downAction, downPending] = useActionState(moveFeaturedOrganizerDown, INITIAL);

  const pending = addPending || removePending || upPending || downPending;
  const states = [addState, removeState, upState, downState];
  const error = states.find((state) => state.error)?.error ?? null;
  const combined: ActionResult = {
    ok: !error,
    error,
    saved: !error && states.some((state) => state.saved)
  };

  const names = new Map(organizers.map((organizer) => [organizer.id, organizer.name]));
  const featured = featuredIds.map((id) => ({ id, name: names.get(id) ?? id }));
  const query = search.trim().toLowerCase();
  const available = organizers.filter(
    (organizer) =>
      !featuredIds.includes(organizer.id) &&
      (query === "" || organizer.name.toLowerCase().includes(query))
  );

  return (
    <section className={cardClass}>
      <h2 className="text-xl font-bold text-white">Featured organizations</h2>
      <p className="mt-1 text-sm text-khakis">Curated order shown on Home, top to bottom.</p>

      <ul className="mt-4 flex flex-col gap-2">
        {featured.map((organizer, index) => (
          <li
            key={organizer.id}
            className="flex items-center gap-2 rounded-pill border-2 border-oreo bg-brown-300 px-4 py-2"
          >
            <span className="w-5 text-xs font-medium text-khakis">{index + 1}</span>
            <span className="flex-1 truncate text-sm font-medium text-white">{organizer.name}</span>
            <form action={upAction}>
              <input name="organizerId" type="hidden" value={organizer.id} />
              <button
                aria-label={`Move ${organizer.name} up`}
                className={smallButtonClass}
                disabled={pending || index === 0}
                type="submit"
              >
                ↑
              </button>
            </form>
            <form action={downAction}>
              <input name="organizerId" type="hidden" value={organizer.id} />
              <button
                aria-label={`Move ${organizer.name} down`}
                className={smallButtonClass}
                disabled={pending || index === featured.length - 1}
                type="submit"
              >
                ↓
              </button>
            </form>
            <form action={removeAction}>
              <input name="organizerId" type="hidden" value={organizer.id} />
              <button
                aria-label={`Remove ${organizer.name}`}
                className={smallButtonClass}
                disabled={pending}
                type="submit"
              >
                ✕
              </button>
            </form>
          </li>
        ))}
        {featured.length === 0 ? (
          <li className="text-sm text-khakis">No featured organizations yet.</li>
        ) : null}
      </ul>

      <div className="mt-6 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-khakis">
          Add an organization
          <input
            className={inputClass}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search organizers"
            type="search"
            value={search}
          />
        </label>
        <ul className="flex max-h-60 flex-col gap-2 overflow-y-auto pr-1">
          {available.map((organizer) => (
            <li key={organizer.id} className="flex items-center gap-2">
              <span className="flex-1 truncate text-sm text-white">{organizer.name}</span>
              <form action={addAction}>
                <input name="organizerId" type="hidden" value={organizer.id} />
                <button
                  aria-label={`Feature ${organizer.name}`}
                  className={smallButtonClass}
                  disabled={pending}
                  type="submit"
                >
                  + Add
                </button>
              </form>
            </li>
          ))}
          {available.length === 0 ? <li className="text-sm text-khakis">No organizers match.</li> : null}
        </ul>
      </div>

      <div className="mt-3">
        <ActionStatus pending={pending} state={combined} />
      </div>
    </section>
  );
}
