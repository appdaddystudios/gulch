"use client";

import { useActionState } from "react";

import { saveResearch, type ActionResult } from "@/app/actions";

import { ActionStatus, cardClass, inputClass, labelClass, primaryButtonClass } from "./forms";

const INITIAL: ActionResult = { ok: true, error: null, saved: false };

type ResearchCardProps = {
  readonly label: string;
  readonly url: string;
};

export function ResearchCard({ label, url }: ResearchCardProps) {
  const [state, formAction, pending] = useActionState(saveResearch, INITIAL);

  return (
    <section className={cardClass}>
      <h2 className="text-xl font-bold text-white">Research button</h2>
      <p className="mt-1 text-sm text-khakis">
        Label and link for the research banner button on Home.
      </p>
      <form action={formAction} className="mt-4 flex flex-col gap-4">
        <label className={labelClass}>
          Button label
          <input className={inputClass} defaultValue={label} maxLength={80} name="label" required />
        </label>
        <label className={labelClass}>
          Link URL
          <input className={inputClass} defaultValue={url} name="url" required type="url" />
        </label>
        <div className="flex items-center gap-3">
          <button className={primaryButtonClass} disabled={pending} type="submit">
            Save
          </button>
          <ActionStatus pending={pending} state={state} />
        </div>
      </form>
    </section>
  );
}
