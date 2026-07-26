import type { ActionResult } from "@/app/actions";

// Shared styling + status line for the admin editor cards (brand tokens from
// globals.css: oreo borders, pill inputs, hard shadows).

export const cardClass = "rounded-card border-2 border-oreo bg-brown-400 p-6 shadow-hard-lg";

export const labelClass = "flex flex-col gap-1 text-sm font-medium text-khakis";

export const inputClass =
  "rounded-pill border-2 border-oreo bg-brown-100 px-4 py-2 text-sm text-oreo outline-none focus:bg-white";

export const textareaClass =
  "rounded-xl border-2 border-oreo bg-brown-100 px-4 py-2 text-sm text-oreo outline-none focus:bg-white";

export const primaryButtonClass =
  "self-start rounded-pill border-2 border-oreo bg-gulch-green px-5 py-2 text-xs font-medium text-oreo shadow-hard disabled:opacity-60";

export const smallButtonClass =
  "rounded-pill border-2 border-oreo bg-beige px-3 py-1 text-xs font-medium text-oreo shadow-hard disabled:opacity-40";

type ActionStatusProps = {
  readonly state: ActionResult;
  readonly pending: boolean;
};

export function ActionStatus({ state, pending }: ActionStatusProps) {
  if (pending) {
    return <p className="text-xs text-khakis">Saving…</p>;
  }
  if (state.error) {
    return <p className="text-xs font-bold text-brown-100">⚠ {state.error}</p>;
  }
  if (state.saved) {
    return <p className="text-xs font-medium text-gulch-green">Saved</p>;
  }
  return null;
}
