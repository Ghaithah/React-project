import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useProfiles } from './ProfileContext';
import { useToast } from './ToastContext';

const MyListContext = createContext(null);

// My List is scoped per PROFILE, exactly like Continue Watching in
// WatchHistoryContext.js — a Kids profile and an adult profile sharing
// one login keep entirely separate saved lists.
const LIST_KEY_PREFIX = 'movieapp_my_list_';

// Generous cap so an enthusiastic visitor can't grow localStorage without
// bound. Netflix's own My List has no hard limit, but this is a
// browser-storage-backed list, not a real database, so it gets a ceiling
// well past anything a real visitor would hit.
const MAX_ENTRIES = 300;

function listKey(user, profileId) {
  if (!user || !profileId) return null;
  return `${LIST_KEY_PREFIX}${user.toLowerCase()}_${profileId}`;
}

function loadList(key) {
  if (!key) return [];
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

// Only the fields the My List row / cards actually need are kept — same
// trimming WatchHistoryContext does — so this doesn't end up storing the
// full OMDb payload (Plot, Actors, etc.) just to remember "saved this".
function toEntry(movie) {
  return {
    imdbID: movie.imdbID,
    Title: movie.Title,
    Poster: movie.Poster,
    Year: movie.Year,
    Type: movie.Type,
    Genre: movie.Genre || '',
    imdbRating: movie.imdbRating ?? null,
  };
}

export function MyListProvider({ children }) {
  const { user } = useAuth();
  const { activeProfileId } = useProfiles();
  const { showToast } = useToast();
  const key = listKey(user, activeProfileId);

  const [list, setList] = useState(() => loadList(key));

  // Re-sync whenever the logged-in user or the active profile changes —
  // switching from an adult profile to Kids (or logging into a different
  // account) should swap in THAT profile's own list, not keep showing
  // whatever happened to already be in state.
  useEffect(() => {
    setList(loadList(key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // A Set of saved ids kept alongside the array so isInList() lookups —
  // called on every card render, for every card, on every row — are O(1)
  // instead of re-scanning the whole list each time. Declared up here,
  // ahead of toggleInList/removeFromList below, so those callbacks can
  // read "was this already saved?" BEFORE calling setList — see the
  // comment on toggleInList for why that ordering matters.
  const listIds = useMemo(() => new Set(list.map((m) => m.imdbID)), [list]);
  const isInList = useCallback((imdbID) => listIds.has(imdbID), [listIds]);

  const addToList = useCallback(
    (movie) => {
      if (!key || !movie || !movie.imdbID) return;
      setList((prev) => {
        if (prev.some((m) => m.imdbID === movie.imdbID)) return prev; // already saved
        const updated = [toEntry(movie), ...prev].slice(0, MAX_ENTRIES);
        localStorage.setItem(key, JSON.stringify(updated));
        return updated;
      });
    },
    [key]
  );

  const removeFromList = useCallback(
    (imdbID) => {
      setList((prev) => {
        const updated = prev.filter((m) => m.imdbID !== imdbID);
        if (key) localStorage.setItem(key, JSON.stringify(updated));
        return updated;
      });
      showToast('Removed from My List', 'success');
    },
    [key, showToast]
  );

  // What every "+ My List" button actually calls: adds the title if it's
  // not saved yet, removes it if it already is. Single entry point so
  // callers (MovieCard, HeroBanner, MovieInfoModal) don't each need to
  // track membership themselves before deciding which function to call.
  //
  // `wasInList` is read from the already-memoized `listIds` BEFORE
  // setList runs, rather than showToast() being called from inside the
  // setList functional updater below. React 18 Strict Mode
  // double-invokes updater functions in development to help surface
  // impure ones — a showToast() call living inside that updater would
  // fire twice per click and show a duplicate toast. Computing the
  // before-state first and calling showToast() once, outside the
  // updater, sidesteps that entirely.
  const toggleInList = useCallback(
    (movie) => {
      if (!key || !movie || !movie.imdbID) return;
      const wasInList = listIds.has(movie.imdbID);
      setList((prev) => {
        const exists = prev.some((m) => m.imdbID === movie.imdbID);
        const updated = exists
          ? prev.filter((m) => m.imdbID !== movie.imdbID)
          : [toEntry(movie), ...prev].slice(0, MAX_ENTRIES);
        localStorage.setItem(key, JSON.stringify(updated));
        return updated;
      });
      showToast(wasInList ? 'Removed from My List' : 'Added to My List', 'success');
    },
    [key, listIds, showToast]
  );

  const clearList = useCallback(() => {
    if (key) localStorage.setItem(key, JSON.stringify([]));
    setList([]);
  }, [key]);

  return (
    <MyListContext.Provider
      value={{ myList: list, addToList, removeFromList, toggleInList, isInList, clearList }}
    >
      {children}
    </MyListContext.Provider>
  );
}

export function useMyList() {
  const ctx = useContext(MyListContext);
  if (!ctx) throw new Error('useMyList must be used within a MyListProvider');
  return ctx;
}