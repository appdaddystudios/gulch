import { useCallback, useState } from "react";

import { useSavedEvents } from "./useSavedEvents";

// Wraps useSavedEvents so every save surface outside Event Details (Calendar,
// Favorites, Map) confirms an add with the same "Added to your favorites"
// toast. Only the transition to saved fires it — unsaves stay silent.
export function useSaveToast() {
  const { savedIds, isSaved, toggle } = useSavedEvents();
  const [toastVisible, setToastVisible] = useState(false);

  const toggleWithToast = useCallback(
    (id: string) => {
      if (!isSaved(id)) {
        setToastVisible(true);
      }
      toggle(id);
    },
    [isSaved, toggle],
  );

  const dismissToast = useCallback(() => setToastVisible(false), []);

  return {
    savedIds,
    isSaved,
    toggle: toggleWithToast,
    toastVisible,
    dismissToast,
  };
}
