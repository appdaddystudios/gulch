import { useCallback, useState } from "react";

import { useSavedEvents } from "./useSavedEvents";

// Wraps useSavedEvents so every save surface outside Event Details (Calendar,
// Favorites, Map) confirms an add with the same "Added to your favorites"
// toast. Only the transition to saved fires it — unsaves stay silent.
export function useSaveToast() {
  const { savedIds, isSaved, toggle } = useSavedEvents();
  // The nonce keys the rendered Toast so back-to-back saves remount it —
  // re-setting visible=true alone would neither restart the 2s timer nor
  // re-announce to screen readers.
  const [toast, setToast] = useState({ visible: false, nonce: 0 });

  const toggleWithToast = useCallback(
    (id: string) => {
      if (!isSaved(id)) {
        setToast((prev) => ({ visible: true, nonce: prev.nonce + 1 }));
      }
      toggle(id);
    },
    [isSaved, toggle],
  );

  const dismissToast = useCallback(
    () => setToast((prev) => ({ ...prev, visible: false })),
    [],
  );

  return {
    savedIds,
    isSaved,
    toggle: toggleWithToast,
    toastVisible: toast.visible,
    toastNonce: toast.nonce,
    dismissToast,
  };
}
