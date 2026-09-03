import { createContext, useContext, useState, useCallback, useMemo } from "react";

// --- Bridge between MovieSearch and the floating MovieChatbot ---
// MovieChatbot is mounted once at the App level (see App.js) so it stays
// on screen across every route, but that also means it has zero direct
// access to whatever MovieSearch (or, in future, any other page) is
// currently showing. This context is that bridge: the page in front of
// the visitor calls setCatalog() with a lightweight summary of what's
// loaded/visible, and MovieChatbot reads it back out via
// useMovieCatalog() to ground its guardrails and answers in the real
// on-screen catalog instead of answering blind or making things up.
//
// Kept intentionally tiny (see the shape below) — this is grounding
// context for pattern-matching, not a general-purpose data store.
const MovieCatalogContext = createContext(null);

const EMPTY_CATALOG = {
  // Every distinct title loaded so far on the current page (browse grid,
  // search results, similar-titles pool, ...), deduped by imdbID. This
  // is the broad pool the chatbot draws "best of <year>"/genre/title
  // answers from.
  allLoaded: [],
  // The narrower set actually rendered right now, after whatever
  // filters/search are active — used for "recommend something" so the
  // answer matches what's in front of the visitor rather than the full
  // loaded pool.
  visible: [],
  isSearching: false,
  searchQuery: "",
  kidsMode: false,
};

export function MovieCatalogProvider({ children }) {
  const [catalog, setCatalogState] = useState(EMPTY_CATALOG);

  // Merges rather than replaces, so a caller can update just the fields
  // it owns without needing to know about the rest of the shape.
  const setCatalog = useCallback((next) => {
    setCatalogState((prev) => ({ ...prev, ...next }));
  }, []);

  const value = useMemo(() => ({ catalog, setCatalog }), [catalog, setCatalog]);

  return (
    <MovieCatalogContext.Provider value={value}>{children}</MovieCatalogContext.Provider>
  );
}

export function useMovieCatalog() {
  const ctx = useContext(MovieCatalogContext);
  if (!ctx) throw new Error("useMovieCatalog must be used within a MovieCatalogProvider");
  return ctx;
}