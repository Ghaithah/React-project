import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useProfiles } from './ProfileContext';
import { useToast } from './ToastContext';

const RatingsContext = createContext(null);

// Thumbs up/down are scoped per PROFILE, exactly like My List
// (MyListContext.js) and Continue Watching (WatchHistoryContext.js) — a
// Kids profile and an adult profile sharing one login keep entirely
// separate opinions about the same title.
//
// Exported (not just used internally) so MovieSearch.js's "Popular With
// Your Household" row can read every OTHER profile's own liked-titles
// set directly out of localStorage, using this exact same key shape,
// without needing a second copy of it to drift out of sync with this
// one. See that row's own comment in MovieSearch.js for why that's safe
// to do without a backend: every profile on an account shares the same
// browser's localStorage.
export const RATINGS_KEY_PREFIX = 'movieapp_ratings_';

// Same reasoning as MyListContext's MAX_ENTRIES: a generous ceiling, not
// a realistic one, just so an enthusiastic visitor can't grow
// localStorage without bound.
const MAX_ENTRIES = 500;

function ratingsKey(user, profileId) {
  if (!user || !profileId) return null;
  return `${RATINGS_KEY_PREFIX}${user.toLowerCase()}_${profileId}`;
}

// A plain { imdbID: 'like' | 'dislike' } map — a title can only ever be
// in one state at a time, so this can't drift out of sync the way two
// separate liked/disliked Sets could if a toggle only ever updated one
// of them.
function loadRatings(key) {
  if (!key) return {};
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
}

// Trims the oldest-inserted entries once MAX_ENTRIES is exceeded — plain
// string-keyed object property order reflects insertion order in JS, so
// the first keys really are the oldest ratings recorded. Mutates `map`
// in place (callers always hand it a fresh copy) and returns it, purely
// so call sites can do `persist(trim(next))` in one line.
function trimToLimit(map) {
  const keys = Object.keys(map);
  if (keys.length > MAX_ENTRIES) {
    keys.slice(0, keys.length - MAX_ENTRIES).forEach((k) => delete map[k]);
  }
  return map;
}

function persistRatings(key, map) {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // Storage full/unavailable — ratings still work for the rest of this
    // session, they just won't survive a reload. Not fetch-critical.
  }
}

export function RatingsProvider({ children }) {
  const { user } = useAuth();
  const { activeProfileId } = useProfiles();
  const { showToast } = useToast();
  const key = ratingsKey(user, activeProfileId);

  const [ratings, setRatings] = useState(() => loadRatings(key));

  // Re-sync whenever the logged-in user or the active profile changes —
  // switching from an adult profile to Kids (or logging into a different
  // account) should swap in THAT profile's own ratings, not keep
  // showing whatever happened to already be in state. Mirrors the same
  // effect in MyListContext/WatchHistoryContext.
  useEffect(() => {
    setRatings(loadRatings(key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Sets kept alongside the map, same pattern MyListContext uses for its
  // own O(1) isInList() lookups — these get checked on every card render
  // across every row, so a Set beats re-scanning the map each time.
  // Declared up here, ahead of toggleLike/toggleDislike below, so those
  // callbacks can read "was this already liked/disliked?" BEFORE calling
  // setRatings — see the comment on toggleLike for why that ordering
  // matters. Also exposed so MovieSearch can use them to keep disliked
  // titles out of recommendation rows and give liked titles a small
  // ranking boost.
  const likedIds = useMemo(
    () => new Set(Object.keys(ratings).filter((id) => ratings[id] === 'like')),
    [ratings]
  );
  const dislikedIds = useMemo(
    () => new Set(Object.keys(ratings).filter((id) => ratings[id] === 'dislike')),
    [ratings]
  );

  // Sets a title's rating outright — 'like', 'dislike', or a falsy value
  // to clear it. The two toggle helpers below are what the thumbs
  // buttons actually call; this is the shared primitive both build on.
  const rateMovie = useCallback(
    (movie, rating) => {
      if (!key || !movie || !movie.imdbID) return;
      setRatings((prev) => {
        const next = { ...prev };
        if (!rating) delete next[movie.imdbID];
        else next[movie.imdbID] = rating;
        trimToLimit(next);
        persistRatings(key, next);
        return next;
      });
    },
    [key]
  );

  // What the thumbs-up button actually calls: likes the title if it
  // isn't already liked, clears the rating entirely if it is (clicking
  // an active thumb turns it off, rather than requiring a separate
  // "clear" control). Clicking Like while a title is disliked switches
  // it straight to liked. Single entry point so MovieCard/HeroBanner/
  // MovieInfoModal don't each need to inspect the current rating before
  // deciding what to do — same shape as MyListContext's toggleInList.
  //
  // `wasLiked` is read from the already-memoized `likedIds` BEFORE
  // setRatings runs, for the same Strict-Mode-safety reason
  // MyListContext.toggleInList computes `wasInList` up front: a
  // showToast() call made from inside the setRatings functional updater
  // would be double-invoked by React 18 Strict Mode in development.
  const toggleLike = useCallback(
    (movie) => {
      if (!key || !movie || !movie.imdbID) return;
      const wasLiked = likedIds.has(movie.imdbID);
      setRatings((prev) => {
        const isAlreadyLiked = prev[movie.imdbID] === 'like';
        const next = { ...prev };
        if (isAlreadyLiked) delete next[movie.imdbID];
        else next[movie.imdbID] = 'like';
        trimToLimit(next);
        persistRatings(key, next);
        return next;
      });
      showToast(wasLiked ? 'Removed like' : 'Liked', wasLiked ? 'info' : 'like');
    },
    [key, likedIds, showToast]
  );

  const toggleDislike = useCallback(
    (movie) => {
      if (!key || !movie || !movie.imdbID) return;
      const wasDisliked = dislikedIds.has(movie.imdbID);
      setRatings((prev) => {
        const isAlreadyDisliked = prev[movie.imdbID] === 'dislike';
        const next = { ...prev };
        if (isAlreadyDisliked) delete next[movie.imdbID];
        else next[movie.imdbID] = 'dislike';
        trimToLimit(next);
        persistRatings(key, next);
        return next;
      });
      showToast(wasDisliked ? 'Removed dislike' : 'Disliked', wasDisliked ? 'info' : 'dislike');
    },
    [key, dislikedIds, showToast]
  );

  const clearRating = useCallback(
    (imdbID) => {
      setRatings((prev) => {
        if (!(imdbID in prev)) return prev;
        const next = { ...prev };
        delete next[imdbID];
        persistRatings(key, next);
        return next;
      });
    },
    [key]
  );

  const clearAllRatings = useCallback(() => {
    persistRatings(key, {});
    setRatings({});
  }, [key]);

  const getRating = useCallback((imdbID) => ratings[imdbID] || null, [ratings]);

  return (
    <RatingsContext.Provider
      value={{
        ratings,
        getRating,
        rateMovie,
        toggleLike,
        toggleDislike,
        clearRating,
        clearAllRatings,
        likedIds,
        dislikedIds,
      }}
    >
      {children}
    </RatingsContext.Provider>
  );
}

export function useRatings() {
  const ctx = useContext(RatingsContext);
  if (!ctx) throw new Error('useRatings must be used within a RatingsProvider');
  return ctx;
}