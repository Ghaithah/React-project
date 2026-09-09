import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProfiles } from "./ProfileContext";
import { useMyList } from "./MyListContext";
import { useRatings } from "./RatingsContext";
import MovieCard from "./MovieCard";
import {
  fetchOmdb,
  isKidSafe,
  isUpcomingRelease,
  parseReleasedDate,
  parseDetailToMovie,
  BROWSE_QUERY_TERMS,
} from "./MovieSearch";
import "./ComingSoonPage.css";

const API_KEY = process.env.REACT_APP_OMDB_API_KEY;

/**
 * A dedicated page for titles OMDb has already tagged with a future
 * release date (see isUpcomingRelease()/parseReleasedDate() in
 * MovieSearch.js). This used to be a shelf on the main browse page, but
 * that shelf only ever showed something if a future-dated title happened
 * to already be sitting in the general browse pool — and the general
 * browse loader has no reason to go looking for one (see
 * BROWSE_QUERY_YEARS in MovieSearch.js, which intentionally sticks to
 * already-released years so the everyday browsing experience isn't
 * spending its request budget on mostly-empty future-year searches).
 *
 * This page runs its own small, bounded search instead — scoped to just
 * the current and next calendar year — so visiting it reliably looks for
 * upcoming titles rather than hoping one turned up by chance elsewhere.
 */

// How many distinct not-yet-released candidates this page will spend a
// by-ID detail lookup on. OMDb's search results (`s=`) don't include
// Genre/Rated/Released — only a full by-ID lookup does — so every
// candidate worth actually showing costs one extra request on top of the
// search itself. Capped well below "every result found" so one page
// visit can't burn a large chunk of the shared 1,000/day OMDb quota
// (every request below still goes through fetchOmdb, so it's counted the
// same as every other OMDb call in the app).
const MAX_DETAIL_LOOKUPS = 24;

// How many term/year search combos to try before giving up. Since this
// only ever queries two specific years (see `years` below) instead of
// cycling through decades the way the main browse loader does, it
// doesn't need anywhere near the full BROWSE_QUERY_TERMS pool to find a
// handful of candidates.
const MAX_SEARCH_COMBOS = 10;

// Cached so revisiting this page within the window doesn't re-spend OMDb
// quota on the same search. Deliberately much shorter than
// MovieSearch.js's 7-day DETAIL_CACHE — what counts as "coming soon"
// changes as titles actually get released, so a short TTL keeps this
// from quietly showing something that came out yesterday.
const CACHE_KEY_PREFIX = "comingSoon:v1:";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function loadCache(key) {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
    return Array.isArray(parsed.movies) ? parsed.movies : null;
  } catch {
    return null;
  }
}

function saveCache(key, movies) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), movies }));
  } catch {
    // Storage full/unavailable — the fetch still works, it just won't be cached.
  }
}

// Fisher-Yates shuffle of a copy of `terms`, so repeat visits (and
// different profiles) don't all hit OMDb with the exact same term first.
function shuffledTerms(terms) {
  const copy = [...terms];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function ComingSoonPage() {
  const { activeProfile } = useProfiles();
  const kidsMode = !!(activeProfile && activeProfile.isKids);
  const { isInList, toggleInList } = useMyList();
  const { getRating, toggleLike, toggleDislike, dislikedIds } = useRatings();
  const navigate = useNavigate();

  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState("");

  // Cached separately per profile type — a Kids profile filters through
  // isKidSafe() below, an adult profile doesn't, so the two shouldn't
  // share (or overwrite) each other's cached result.
  const cacheKey = `${CACHE_KEY_PREFIX}${kidsMode ? "kids" : "all"}`;

  useEffect(() => {
    let cancelled = false;

    const cached = loadCache(cacheKey);
    if (cached) {
      setMovies(cached);
      setLoading(false);
      return undefined;
    }

    async function run() {
      setLoading(true);
      setWarning("");

      const thisYear = new Date().getFullYear();
      const years = [thisYear, thisYear + 1];
      const terms = shuffledTerms(BROWSE_QUERY_TERMS);

      const found = new Map();
      let combos = 0;
      let stop = false;

      for (const year of years) {
        if (stop) break;
        for (const term of terms) {
          if (combos >= MAX_SEARCH_COMBOS || found.size >= MAX_DETAIL_LOOKUPS) {
            stop = true;
            break;
          }
          combos += 1;

          let data = null;
          try {
            const res = await fetchOmdb(
              `https://www.omdbapi.com/?apikey=${API_KEY}&s=${encodeURIComponent(term)}&y=${year}&page=1`
            );
            data = await res.json();
          } catch {
            setWarning("Couldn't reach OMDb — try again in a moment.");
            stop = true;
            break;
          }

          if (!data || data.Response === "False") {
            if (data && (data.Error || "").toLowerCase().includes("limit")) {
              setWarning(
                "OMDb API request limit reached for today — try again once your quota resets."
              );
              stop = true;
              break;
            }
            continue; // no matches for this term/year — move on
          }

          (data.Search || []).forEach((m) => {
            if (m.Type !== "episode" && !found.has(m.imdbID)) found.set(m.imdbID, m);
          });
        }
      }

      if (cancelled) return;

      const candidates = Array.from(found.values()).slice(0, MAX_DETAIL_LOOKUPS);
      if (candidates.length === 0) {
        setMovies([]);
        setLoading(false);
        return;
      }

      const details = await Promise.all(
        candidates.map(async (m) => {
          try {
            const res = await fetchOmdb(`https://www.omdbapi.com/?apikey=${API_KEY}&i=${m.imdbID}`);
            const detail = await res.json();
            return detail && detail.Response !== "False" ? parseDetailToMovie(detail) : null;
          } catch {
            return null;
          }
        })
      );

      if (cancelled) return;

      const upcoming = details
        .filter(Boolean)
        .filter(isUpcomingRelease)
        .filter((m) => !kidsMode || isKidSafe(m))
        .sort((a, b) => parseReleasedDate(a).getTime() - parseReleasedDate(b).getTime());

      setMovies(upcoming);
      saveCache(cacheKey, upcoming);
      setLoading(false);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [cacheKey, kidsMode]);

  // Disliked titles are filtered live off `dislikedIds` rather than baked
  // into the cached list — disliking something on this page (or anywhere
  // else) should hide it immediately, without waiting for the 12-hour
  // cache to expire and re-fetch.
  const visible = useMemo(
    () => movies.filter((m) => !dislikedIds.has(m.imdbID)),
    [movies, dislikedIds]
  );

  function openMovie(movie) {
    navigate(`/movies?movie=${movie.imdbID}`);
  }

  return (
    <div className="coming-soon-page">
      <h1 className="coming-soon-page__title">Coming Soon</h1>
      <p className="coming-soon-page__subtitle">
        Announced titles OMDb already has a future release date for.
      </p>

      {warning && <p className="coming-soon-page__warning">{warning}</p>}

      {loading ? (
        <div className="coming-soon-page__state" role="status">
          <p className="coming-soon-page__state-text">Looking for what's on the way…</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="coming-soon-page__state">
          <p className="coming-soon-page__state-text">
            Nothing upcoming found right now. OMDb's catalog is mostly already-released titles,
            so this list depends on what's been announced with a future date so far.
          </p>
          <p className="coming-soon-page__state-subtext">
            New titles turn up as they're announced — check back another time.
          </p>
        </div>
      ) : (
        <div className="coming-soon-page__grid">
          {visible.map((movie) => (
            <MovieCard
              key={movie.imdbID}
              movie={movie}
              variant="grid"
              onSelect={openMovie}
              onPlay={openMovie}
              isInList={isInList(movie.imdbID)}
              onToggleList={toggleInList}
              myRating={getRating(movie.imdbID)}
              onLike={toggleLike}
              onDislike={toggleDislike}
            />
          ))}
        </div>
      )}
    </div>
  );
}