import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useProfiles } from './ProfileContext';

const WatchHistoryContext = createContext(null);

// Continue Watching is scoped per PROFILE, not just per account — so the
// Kids profile and an adult profile sharing the same login never see each
// other's recently-opened titles. Mirrors the per-user namespacing pattern
// ProfileContext already uses for the profiles list itself.
const HISTORY_KEY_PREFIX = 'movieapp_continue_watching_';

// How many recently-opened titles to remember before the oldest fall off
// the end. Netflix's own Continue Watching row is similarly bounded.
const MAX_ENTRIES = 20;

function historyKey(user, profileId) {
  if (!user || !profileId) return null;
  return `${HISTORY_KEY_PREFIX}${user.toLowerCase()}_${profileId}`;
}

function loadHistory(key) {
  if (!key) return [];
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

export function WatchHistoryProvider({ children }) {
  const { user } = useAuth();
  const { activeProfileId } = useProfiles();
  const key = historyKey(user, activeProfileId);

  const [history, setHistory] = useState(() => loadHistory(key));

  // Re-sync whenever the logged-in user or the active profile changes —
  // switching from an adult profile to Kids (or logging into a different
  // account) should swap in THAT profile's own list, not keep showing
  // whatever happened to already be in state.
  useEffect(() => {
    setHistory(loadHistory(key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Records (or refreshes) a title in Continue Watching. If it's already
  // there it moves to the front instead of duplicating, and the list is
  // capped at MAX_ENTRIES so it can't grow forever. Only the fields the
  // Continue Watching row actually needs are kept — no point storing the
  // full OMDb payload (Plot, Actors, etc.) just to remember "recently
  // opened this".
  //
  // `progress` (how far into the trailer this profile got — see
  // updateProgress below) is deliberately carried over from any existing
  // entry rather than reset to 0 here: this runs every time a trailer is
  // opened, including re-opening a title already in Continue Watching to
  // pick up where you left off, and resetting progress on every open
  // would make "resume" impossible.
  const recordWatch = useCallback(
    (movie) => {
      if (!key || !movie || !movie.imdbID) return;
      setHistory((prev) => {
        const existing = prev.find((m) => m.imdbID === movie.imdbID);
        const withoutExisting = prev.filter((m) => m.imdbID !== movie.imdbID);
        const entry = {
          imdbID: movie.imdbID,
          Title: movie.Title,
          Poster: movie.Poster,
          Year: movie.Year,
          Type: movie.Type,
          Genre: movie.Genre || '',
          imdbRating: movie.imdbRating ?? null,
          progress: existing && typeof existing.progress === 'number' ? existing.progress : 0,
        };
        const updated = [entry, ...withoutExisting].slice(0, MAX_ENTRIES);
        localStorage.setItem(key, JSON.stringify(updated));
        return updated;
      });
    },
    [key]
  );

  // Updates just the progress fraction (0-1, how far into its trailer
  // this title has been watched) for a title already in Continue
  // Watching — called periodically while a trailer is playing, and once
  // more on pause/end/close (see TrailerPlayer.js). A no-op if the title
  // isn't in history at all (shouldn't normally happen, since
  // recordWatch always runs first when a trailer opens, but this stays
  // safe rather than silently re-adding a title from a stray progress
  // update).
  const updateProgress = useCallback(
    (imdbID, progress) => {
      if (!key || !imdbID || typeof progress !== 'number' || Number.isNaN(progress)) return;
      const clamped = Math.max(0, Math.min(1, progress));
      setHistory((prev) => {
        if (!prev.some((m) => m.imdbID === imdbID)) return prev;
        const updated = prev.map((m) => (m.imdbID === imdbID ? { ...m, progress: clamped } : m));
        localStorage.setItem(key, JSON.stringify(updated));
        return updated;
      });
    },
    [key]
  );

  // Reads back a title's saved progress (0-1), defaulting to 0 for a
  // title that's either not in history yet or was saved before this
  // field existed.
  const getProgress = useCallback(
    (imdbID) => {
      const entry = history.find((m) => m.imdbID === imdbID);
      return entry && typeof entry.progress === 'number' ? entry.progress : 0;
    },
    [history]
  );

  const removeFromHistory = useCallback(
    (imdbID) => {
      setHistory((prev) => {
        const updated = prev.filter((m) => m.imdbID !== imdbID);
        if (key) localStorage.setItem(key, JSON.stringify(updated));
        return updated;
      });
    },
    [key]
  );

  const clearHistory = useCallback(() => {
    if (key) localStorage.setItem(key, JSON.stringify([]));
    setHistory([]);
  }, [key]);

  return (
    <WatchHistoryContext.Provider
      value={{
        continueWatching: history,
        recordWatch,
        removeFromHistory,
        clearHistory,
        updateProgress,
        getProgress,
      }}
    >
      {children}
    </WatchHistoryContext.Provider>
  );
}

export function useWatchHistory() {
  const ctx = useContext(WatchHistoryContext);
  if (!ctx) throw new Error('useWatchHistory must be used within a WatchHistoryProvider');
  return ctx;
}