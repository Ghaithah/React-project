import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import { useProfiles } from "./ProfileContext";
import { useWatchHistory } from "./WatchHistoryContext";
import { useMyList } from "./MyListContext";
import { useRatings } from "./RatingsContext";
import { useMovieCatalog } from "./MovieCatalogContext";
import HeroBanner from "./HeroBanner";
import MovieCard from "./MovieCard";
import MovieInfoModal from "./MovieInfoModal";
import "./MovieSearch.css";


const API_KEY = process.env.REACT_APP_OMDB_API_KEY;
const DEBOUNCE_MS = 400;

const YOUTUBE_API_KEY = process.env.REACT_APP_YOUTUBE_API_KEY;

if (process.env.NODE_ENV !== "production" && (!API_KEY || !YOUTUBE_API_KEY)) {
  // eslint-disable-next-line no-console
  console.warn(
    "Missing REACT_APP_OMDB_API_KEY and/or REACT_APP_YOUTUBE_API_KEY. " +
      "Copy .env.example to .env, fill in real keys, and restart the dev server."
  );
}


// --- "Infinite" browse: real, live OMDb search results ---
// OMDb has no "list every movie" endpoint — its `s=` parameter only does
// a title-contains search, and any single query tops out around 1,000
// matches (100 pages of 10). There's genuinely no way to enumerate
// "every movie that exists." Instead, the browse grid is powered by
// cycling through a large pool of broad, common search terms below (each
// one paginated through OMDb's own `s=...&page=...` results via
// fetchNextBrowseBatch, further down), and once every term has been
// paginated through once, cycling through the same terms again paired
// with a rotating `y=` year filter (a real filter, not a text match) to
// pull a different slice of results for the same term. The combined
// term x year space is large enough — and dedupe by imdbID keeps repeats
// out — that in any realistic scrolling session "Load more" never runs
// dry. It's bounded by OMDb's actual catalog and your API quota (free
// tier: 1,000 requests/day), not by a hardcoded list size.
const BROWSE_QUERY_TERMS = [
  "the", "man", "love", "life", "day", "night", "story", "world", "girl",
  "boy", "king", "war", "house", "time", "dark", "star", "black", "white",
  "blue", "red", "last", "new", "one", "two", "three", "good", "bad",
  "great", "little", "big", "old", "young", "american", "queen", "dead",
  "fire", "ice", "water", "gold", "silver", "city", "town", "home",
  "family", "friend", "wedding", "christmas", "summer", "winter",
  "spring", "school", "hotel", "prison", "island", "mountain", "river",
  "sea", "ocean", "forest", "desert", "space", "moon", "sun", "sky",
  "heart", "soul", "mind", "dream", "shadow", "light", "dance", "song",
  "music", "art", "game", "play", "run", "road", "journey", "adventure",
  "mystery", "secret", "truth", "law", "justice", "crime", "murder",
  "kill", "death", "born", "child", "mother", "father", "brother",
  "sister", "wife", "husband", "bride", "prince", "princess", "knight",
  "warrior", "hero", "monster", "ghost", "witch", "wizard", "magic",
  "power", "force", "battle", "fight", "win", "escape", "return", "rise",
  "fall", "end", "beginning", "first", "final", "next", "north", "south",
  "east", "west", "diamond", "silence", "sound", "voice", "letter",
  "book", "movie", "show", "party", "birthday", "vacation", "dog", "cat",
  "money", "business", "office", "doctor", "lawyer", "cop", "agent",
  "spy", "soldier", "captain", "pilot", "driver", "rider", "runner",
];

// A separate, family-skewed term pool for the Kids profile — every
// result these terms turn up still has to clear isKidSafe() (genre +
// Rated allowlist, defined below) before it actually renders in the Kids
// grid, same as before; this just biases which raw candidates get
// fetched in the first place so more of them pass that filter.
const BROWSE_QUERY_TERMS_KIDS = [
  "toy", "princess", "dragon", "dog", "cat", "robot", "superhero",
  "magic", "school", "adventure", "animal", "forest", "ocean", "space",
  "dinosaur", "pirate", "circus", "holiday", "birthday", "friend",
  "family", "puppy", "kitten", "bear", "lion", "fairy", "castle",
  "treasure", "journey", "hero", "team", "game", "sport", "race",
  "champion", "music", "dance", "song", "movie", "farm", "zoo", "garden",
  "snow", "rainbow", "star", "moon", "balloon", "candy", "chocolate",
  "house", "home", "baby", "kid", "little", "big", "bunny", "duck",
  "penguin", "monkey", "elephant", "unicorn", "mermaid",
];

// Cycled through after the term pool above wraps around once, paired
// with `s=` to pull a genuinely different set of results for the same
// term (OMDb's `y=` filters by release year server-side — it isn't a
// text match, so the same word plus a different year returns different
// titles). `null` means "no year filter" and is always tried first.
const BROWSE_QUERY_YEARS = [
  null, 2025, 2022, 2019, 2016, 2013, 2010, 2007, 2004, 2001, 1998, 1995,
  1992, 1989, 1986, 1983, 1980, 1975, 1970, 1965, 1960, 1955, 1950,
];

// Safety cap on how many term/year combos a single "Load more" click will
// burn through if it keeps landing on combos with nothing new left (a
// term already fully paginated, or a term+year pair with zero matches).
// Without this, one click could in theory fire a long, silent chain of
// requests; with it, a click that can't find anything new just comes up
// a little short rather than hammering OMDb indefinitely.
const MAX_COMBO_ADVANCE_PER_LOAD = 8;

// Purely cosmetic: how many skeleton cards to show while the very first
// browse batch is loading.
const BROWSE_SKELETON_COUNT = 10;

// --- Shuffle helper ---
// Plain Fisher-Yates, used in two places: (1) randomizing the order
// BROWSE_QUERY_TERMS[_KIDS] gets walked each session (see
// shuffledTermsRef below), so the browse pool isn't always seeded by the
// same "the" -> "man" -> "love" -> ... sequence every time — "man" in
// particular is a title-text match for Iron Man/Spider-Man/Ant-Man/Ant-Man
// and the Wasp/Spider-Man: No Way Home all at once, and being 2nd in the
// list meant those few franchises dominated the very first batch of
// browseMovies almost every session; and (2) the order each genre shelf's
// movies render in (see genreRows below), since without it a genre row
// always shows the same handful of titles up front — whichever ones
// happened to load first — every time you reload the page. Never mutates
// its input.
function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}


const SIMILAR_POOL_IDS = [
  "tt0109830", // Forrest Gump
  "tt0068646", // The Godfather
  "tt0071562", // The Godfather Part II
  "tt0133093", // The Matrix
  "tt0099685", // Goodfellas
  "tt0114369", // Se7en
  "tt0102926", // The Silence of the Lambs
  "tt0120737", // The Fellowship of the Ring
  "tt0245429", // Spirited Away
  "tt0110357", // The Lion King
  "tt2582802", // Whiplash
  "tt0361748", // Inglourious Basterds
  "tt0993846", // The Wolf of Wall Street
  "tt0119217", // Good Will Hunting
  "tt0407887", // The Departed
  "tt0338013", // Eternal Sunshine of the Spotless Mind
  "tt0088763", // Back to the Future
  "tt0209144", // Memento
  "tt0172495", // Gladiator
  "tt0081505", // The Shining
  "tt0078748", // Alien
  "tt0107048", // Groundhog Day
  "tt0120815", // Saving Private Ryan
  "tt0475784", // Westworld
  "tt0076759", // Star Wars: A New Hope
  "tt0080684", // The Empire Strikes Back
  "tt0086190", // Return of the Jedi
  "tt0107290", // Jurassic Park
  "tt0114814", // The Usual Suspects
  "tt0180093", // Requiem for a Dream
  "tt0264464", // Catch Me If You Can
  "tt2015381", // Guardians of the Galaxy
  "tt0117951", // Trainspotting
  "tt7286456", // Joker
  "tt1130884", // Shutter Island
  "tt2380307", // Coco
  "tt0435761", // Toy Story 3
  "tt1049413", // Up
];

// --- Curated trailer IDs (no live YouTube search needed) ---
// A hand-verified imdbID -> YouTube video ID mapping covering exactly
// the SIMILAR_POOL_IDS set above — the same ~38 well-known titles that
// get fetched on every single session (as the general "You Might Also
// Like"/similar-titles pool) no matter what a visitor actually searches
// for. Since that set never changes, there's no reason to keep spending
// part of the very limited YouTube search.list daily quota (100
// requests/day on this project — see the throttle/budget section
// further down) re-discovering the same 38 trailers over and over.
// Each entry here was looked up once and verified two ways before being
// hardcoded: the title text returned by YouTube's public oembed
// endpoint (oembed calls don't count against the Data API quota) was
// checked against the actual movie, and the same call confirms the
// video is embeddable at all — a handful of otherwise-correct-looking
// candidates during that process turned out to have embedding disabled
// (oembed 403) or, in a couple of cases, to be reuploads from an
// unrelated channel despite an official-sounding title, and were
// swapped out for a verified alternative instead of used as-is.
// resolveTrailerId below checks this map before ever touching the
// persistent cache or the network, so these 38 titles cost zero quota,
// forever, however often they're hovered or opened. If OMDb's catalog
// ever points a different imdbID at one of these titles, this map
// simply won't have an entry for it and resolution falls through to the
// normal cache/search path unaffected.
const CURATED_TRAILER_IDS = {
  tt0109830: "bLvqoHBptjg", // Forrest Gump
  tt0068646: "UaVTIH8mujA", // The Godfather
  tt0071562: "tF_v4ZZkQWE", // The Godfather Part II
  tt0133093: "nUEQNVV3Gfs", // The Matrix
  tt0099685: "y73Fa_bC6yo", // Goodfellas
  tt0114369: "KPOuJGkpblk", // Se7en
  tt0102926: "6iB21hsprAQ", // The Silence of the Lambs
  tt0120737: "_nZdmwHrcnw", // The Fellowship of the Ring
  tt0245429: "rwY4XwAyrM4", // Spirited Away
  tt0110357: "eHcZlPpNt0Q", // The Lion King (1994)
  tt2582802: "WfBmoQaHzfQ", // Whiplash
  tt0361748: "wDI2kqJxasU", // Inglourious Basterds
  tt0993846: "iszwuX1AK6A", // The Wolf of Wall Street
  tt0119217: "ReIJ1lbL-Q8", // Good Will Hunting
  tt0407887: "r-MiSNsCdQ4", // The Departed
  tt0338013: "07-QBnEkgXU", // Eternal Sunshine of the Spotless Mind
  tt0088763: "WRrCVyT09ow", // Back to the Future
  tt0209144: "4CV41hoyS8A", // Memento
  tt0172495: "uvbavW31adA", // Gladiator
  tt0081505: "FZQvIJxG9Xs", // The Shining
  tt0078748: "OjfRhwn-4fw", // Alien
  tt0107048: "TYscEUt17oE", // Groundhog Day
  tt0120815: "9CiW_DgxCnQ", // Saving Private Ryan
  tt0475784: "JctIuZfSsa4", // Westworld — this imdbID is HBO's 2016 TV series, not the 1973 film
  tt0076759: "L-_xHEv0l-w", // Star Wars: A New Hope
  tt0080684: "5TJuVT-q6yk", // The Empire Strikes Back
  tt0086190: "q118J_LLEx0", // Return of the Jedi
  tt0107290: "_jKEqDKpJLw", // Jurassic Park
  tt0114814: "Ij4Fdq190qo", // The Usual Suspects
  tt0180093: "s0_w_KB0U80", // Requiem for a Dream
  tt0264464: "SosRcIMCr5g", // Catch Me If You Can
  tt2015381: "2XltzyLcu0g", // Guardians of the Galaxy
  tt0117951: "8LuxOYIpu-I", // Trainspotting
  tt7286456: "SaVxhiWI0Rc", // Joker
  tt1130884: "gN02XJ9pDAU", // Shutter Island
  tt2380307: "xlnPHQ3TLX8", // Coco
  tt0435761: "2BlMNH1QTeE", // Toy Story 3
  tt1049413: "ORFWdXl_zJ4", // Up
};

// Caps how many OMDb requests fire at once. Fetching a whole ID batch with
// a bare Promise.all() (as this used to) throws every request at OMDb
// simultaneously — up to 49 at once between the browse grid and the
// similar-titles pool on a single page load. OMDb's free tier doesn't
// handle that gracefully: a chunk of the burst comes back with
// Response:"False" (rate-limited / request-limit-reached), and since
// those were silently filtered out of the results, titles would just
// vanish from the grid with zero indication anything went wrong. Routing
// every OMDb fetch through this small worker pool keeps at most
// FETCH_CONCURRENCY requests in flight at a time.
const FETCH_CONCURRENCY = 5;

async function fetchJsonPool(urls, limit = FETCH_CONCURRENCY) {
  const results = new Array(urls.length);
  let next = 0;

  async function worker() {
    while (next < urls.length) {
      const i = next++;
      try {
        // Every URL passed through this pool in this file is an OMDb
        // request — count it against the daily quota budget (see
        // trackOmdbRequest below) right alongside the other single-fetch
        // call sites, so the counter reflects every request regardless
        // of which code path made it.
        trackOmdbRequest();
        const res = await fetch(urls[i]);
        results[i] = await res.json();
      } catch {
        results[i] = null;
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, urls.length) }, worker);
  await Promise.all(workers);
  return results;
}

// --- Daily OMDb request counter ---
// OMDb's free tier caps out at 1,000 requests/day and its responses
// don't say how many are left, so the only way to know how close a
// session is to the cap is to count client-side. Resets itself the
// moment the stored date no longer matches today (UTC) — an
// approximation of OMDb's actual reset time, but close enough to be
// useful as an early-warning signal rather than an exact readout.
const REQUEST_COUNT_KEY = "movieSearch:omdbRequestCount:v1";
const REQUEST_COUNT_DAILY_LIMIT = 1000;
const REQUEST_COUNT_WARN_AT = [800, 950]; // dev-console heads-up thresholds

function omdbDateStamp() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, UTC
}

function trackOmdbRequest() {
  try {
    const today = omdbDateStamp();
    const raw = window.localStorage.getItem(REQUEST_COUNT_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const count = parsed && parsed.date === today ? parsed.count + 1 : 1;
    window.localStorage.setItem(REQUEST_COUNT_KEY, JSON.stringify({ date: today, count }));
    if (process.env.NODE_ENV !== "production" && REQUEST_COUNT_WARN_AT.includes(count)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[MovieSearch] OMDb requests today: ${count}/${REQUEST_COUNT_DAILY_LIMIT} — ` +
          "getting close to the free-tier daily cap."
      );
    }
    return count;
  } catch {
    // localStorage unavailable — the counter is a nice-to-have, not
    // fetch-critical, so just skip tracking rather than breaking a fetch.
    return null;
  }
}

// Single-request counterpart to fetchJsonPool above: every plain
// `fetch(...)` call to omdbapi.com elsewhere in this file goes through
// this instead, so trackOmdbRequest() sees every OMDb request the
// component makes, not just the ones batched through the pool.
function fetchOmdb(url) {
  trackOmdbRequest();
  return fetch(url);
}

// --- Local caching for the curated browse / similar-titles pools ---
// The browse grid and similar-titles pool are responsible for the
// biggest bursts of OMDb requests (see fetchJsonPool above) — up to 49
// requests on a single page load, all for a small, mostly-static set of
// curated IMDb IDs that rarely change. Caching successful results in
// localStorage means a page refresh (extremely common during dev) reuses
// what was already fetched instead of re-spending quota on the same
// titles every time. Only a "clean" result set (zero failed lookups) is
// ever cached, so a batch that partially failed from a rate limit /
// exhausted daily quota isn't remembered as if it were correct — the
// next load just retries it from the network instead.
const CACHE_VERSION = "v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // ~1 day, roughly matching OMDb's daily quota reset

function readCache(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    // localStorage unavailable (private browsing, disabled, full, etc.) —
    // treat it as a cache miss rather than letting this break the page.
    return null;
  }
}

function writeCache(key, data) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // Storage full/unavailable — caching is a nice-to-have, not fetch-critical.
  }
}

// --- Persistent per-title detail cache ---
// The single biggest avoidable source of OMDb requests: the "by ID"
// detail lookup (Genre/Director/Actors/Plot/Runtime/Rated/imdbRating)
// that enriches every search result and browse-grid card, and that
// fetchDetail() below uses for the trailer/"More Info" panels, was only
// ever cached in a component-scoped ref (detailCache) — so it reset on
// every page reload, and reloads are constant during development. Movie
// metadata essentially never changes, so caching it in localStorage with
// a long TTL is safe and cuts out a large share of repeat requests.
// Keyed by imdbID inside one JSON blob (rather than one localStorage key
// per title) to keep reads/writes cheap and predictable.
const DETAIL_CACHE_KEY = "movieSearch:detailCache:v1";
const DETAIL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DETAIL_CACHE_MAX_ENTRIES = 800; // soft cap so the blob doesn't grow unbounded

let detailCacheStore = null; // lazily loaded once per page load, then kept in memory

function loadDetailCacheStore() {
  if (detailCacheStore) return detailCacheStore;
  try {
    const raw = window.localStorage.getItem(DETAIL_CACHE_KEY);
    detailCacheStore = raw ? JSON.parse(raw) : {};
    if (!detailCacheStore || typeof detailCacheStore !== "object") detailCacheStore = {};
  } catch {
    detailCacheStore = {};
  }
  return detailCacheStore;
}

function persistDetailCacheStore() {
  try {
    window.localStorage.setItem(DETAIL_CACHE_KEY, JSON.stringify(detailCacheStore));
  } catch {
    // Storage full/unavailable — persistent caching is a nice-to-have.
  }
}

function getCachedDetail(imdbID) {
  const store = loadDetailCacheStore();
  const entry = store[imdbID];
  if (!entry || typeof entry.savedAt !== "number") return null;
  if (Date.now() - entry.savedAt > DETAIL_CACHE_TTL_MS) return null;
  return entry.data;
}

function setCachedDetail(imdbID, data) {
  const store = loadDetailCacheStore();
  store[imdbID] = { savedAt: Date.now(), data };

  const keys = Object.keys(store);
  if (keys.length > DETAIL_CACHE_MAX_ENTRIES) {
    // Trim the oldest entries first rather than letting the cache (and
    // the cost of writing it to localStorage) grow forever.
    keys
      .sort((a, b) => store[a].savedAt - store[b].savedAt)
      .slice(0, keys.length - DETAIL_CACHE_MAX_ENTRIES)
      .forEach((k) => delete store[k]);
  }

  persistDetailCacheStore();
}

// --- Persistent trailer-id cache (localStorage) ---
// YouTube's search.list endpoint is the most expensive call this app
// makes — 100 quota units per request against a free key's 10,000/day
// budget — and MovieCard's hover preview (see MovieCard.js) calls
// resolveTrailerId for essentially every poster a visitor's pointer
// lingers over across every row and grid. Before this, resolved video
// ids only lived in the component-scoped `trailerCache` ref below, so
// they reset on every page reload — meaning a page refresh during
// ordinary browsing re-spent quota re-searching the same handful of
// popular titles. Persisting to localStorage (same pattern as
// DETAIL_CACHE_KEY above) makes repeat lookups — across reloads, and
// across every row a title happens to appear in — free. Trailers
// essentially never change once found, so the TTL here is long. A
// cached `null` (searched, nothing found) is stored too, so a title with
// no trailer isn't re-searched every time it's hovered.
const TRAILER_CACHE_KEY = "movieSearch:trailerCache:v1";
const TRAILER_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const TRAILER_CACHE_MAX_ENTRIES = 500;

let trailerCacheStore = null;

function loadTrailerCacheStore() {
  if (trailerCacheStore) return trailerCacheStore;
  try {
    const raw = window.localStorage.getItem(TRAILER_CACHE_KEY);
    trailerCacheStore = raw ? JSON.parse(raw) : {};
    if (!trailerCacheStore || typeof trailerCacheStore !== "object") trailerCacheStore = {};
  } catch {
    trailerCacheStore = {};
  }
  return trailerCacheStore;
}

function persistTrailerCacheStore() {
  try {
    window.localStorage.setItem(TRAILER_CACHE_KEY, JSON.stringify(trailerCacheStore));
  } catch {
    // Storage full/unavailable — persistent caching is a nice-to-have.
  }
}

// Returns `undefined` when nothing usable is cached (never looked up, or
// the entry expired) so callers can tell that apart from a cached
// lookup that resolved to `null` (searched, no trailer found).
function getCachedTrailerId(imdbID) {
  const store = loadTrailerCacheStore();
  const entry = store[imdbID];
  if (!entry || typeof entry.savedAt !== "number") return undefined;
  if (Date.now() - entry.savedAt > TRAILER_CACHE_TTL_MS) return undefined;
  return entry.videoId;
}

function setCachedTrailerId(imdbID, videoId) {
  const store = loadTrailerCacheStore();
  store[imdbID] = { savedAt: Date.now(), videoId };

  const keys = Object.keys(store);
  if (keys.length > TRAILER_CACHE_MAX_ENTRIES) {
    keys
      .sort((a, b) => store[a].savedAt - store[b].savedAt)
      .slice(0, keys.length - TRAILER_CACHE_MAX_ENTRIES)
      .forEach((k) => delete store[k]);
  }

  persistTrailerCacheStore();
}

// --- YouTube search request budget + throttle ---
// search.list is YouTube's most expensive endpoint (100 quota units per
// call) and Google enforces two separate limits on top of each other: a
// short burst-rate window (what actually surfaces as an HTTP 429 in the
// console) and a hard total daily quota per key. The previous version of
// this only reacted to a 429 after the fact (a short cooldown once one
// came back) — that stops the immediate hammering but does nothing to
// stop the *next* burst from tripping the limiter again a minute later.
// This version instead keeps requests under both ceilings proactively,
// so a 429 shouldn't happen at all under normal browsing:
//
//   1. A conservative daily request budget (YOUTUBE_DAILY_REQUEST_LIMIT)
//      is tracked in localStorage — same date-keyed pattern as
//      trackOmdbRequest above — and checked BEFORE a request is ever
//      sent. Once today's budget is spent, resolveTrailerId resolves
//      locally to "no trailer" with zero network calls, rather than
//      firing a request that would likely just fail anyway.
//   2. Requests that are still within budget are serialized through a
//      queue with a wide minimum spacing (well under one request per
//      second), keeping the sustained rate safely inside Google's
//      short-window limiter regardless of how many distinct titles get
//      hovered in a session.
//
// If a 429 slips through anyway — the key's real quota turns out lower
// than assumed, or something else shares the same key — that single
// response immediately zeroes out the rest of today's budget too, so
// this goes quiet on trailer lookups for the remainder of the day
// instead of retrying into more errors. Budget-skipped lookups are
// deliberately NOT written to the persistent trailer cache (see
// resolveTrailerId below) — "we didn't check" must stay distinct from
// "we checked and found nothing," or a title would be permanently
// mislabeled as trailer-less just because it was hovered on a
// budget-exhausted day.
const YOUTUBE_MIN_REQUEST_SPACING_MS = 1500; // ~40 req/min sustained — well under Google's short-window limit
const YOUTUBE_RATE_LIMIT_COOLDOWN_MS = 5 * 60 * 1000; // fallback in-memory cooldown, belt-and-suspenders with the budget below

const YOUTUBE_REQUEST_COUNT_KEY = "movieSearch:youtubeRequestCount:v1";
// Deliberately conservative: a fresh/free YouTube Data API key's default
// quota (10,000 units/day ÷ 100 units per search.list call) works out to
// ~100 searches/day. Capping ourselves at 90 leaves headroom for
// whatever the real number actually is instead of aiming right at the
// edge of it.
const YOUTUBE_DAILY_REQUEST_LIMIT = 90;
const YOUTUBE_BUDGET_WARN_AT = 80; // dev-console heads-up threshold

function youtubeDateStamp() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, UTC
}

function readYoutubeRequestCount() {
  try {
    const raw = window.localStorage.getItem(YOUTUBE_REQUEST_COUNT_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || parsed.date !== youtubeDateStamp()) return 0;
    return parsed.count || 0;
  } catch {
    return 0;
  }
}

let youtubeBudgetWarned = false;

function bumpYoutubeRequestCount() {
  try {
    const today = youtubeDateStamp();
    const count = readYoutubeRequestCount() + 1;
    window.localStorage.setItem(YOUTUBE_REQUEST_COUNT_KEY, JSON.stringify({ date: today, count }));
    if (process.env.NODE_ENV !== "production" && !youtubeBudgetWarned && count >= YOUTUBE_BUDGET_WARN_AT) {
      youtubeBudgetWarned = true;
      // eslint-disable-next-line no-console
      console.warn(
        `[MovieSearch] YouTube trailer lookups today: ${count}/${YOUTUBE_DAILY_REQUEST_LIMIT} — ` +
          "approaching today's self-imposed budget; trailer previews will start " +
          "resolving to \"not found\" locally (no request sent) once it's reached."
      );
    }
    return count;
  } catch {
    return null;
  }
}

// Forces the rest of today's budget to read as spent. Used the moment a
// real 429 comes back, so — even though the count above is meant to stay
// well clear of the actual quota — an actual quota lower than assumed
// still results in "quiet for the rest of the day" rather than repeat
// errors.
function exhaustYoutubeBudgetForToday() {
  try {
    window.localStorage.setItem(
      YOUTUBE_REQUEST_COUNT_KEY,
      JSON.stringify({ date: youtubeDateStamp(), count: YOUTUBE_DAILY_REQUEST_LIMIT })
    );
  } catch {
    // Nothing to persist — the in-memory cooldown below still covers the
    // rest of this page load.
  }
}

let youtubeQueueTail = Promise.resolve();
let youtubeCooldownUntil = 0;

function queueYoutubeRequest(fn) {
  const runAfterSpacing = () =>
    new Promise((resolve, reject) => {
      setTimeout(() => {
        if (Date.now() < youtubeCooldownUntil) {
          reject(new Error("youtube-rate-limited"));
          return;
        }
        fn().then(resolve, reject);
      }, YOUTUBE_MIN_REQUEST_SPACING_MS);
    });

  const scheduled = youtubeQueueTail.then(runAfterSpacing, runAfterSpacing);
  // Keep the chain alive regardless of this call's outcome — one failed
  // or rate-limited lookup must not stall every request queued behind it.
  youtubeQueueTail = scheduled.catch(() => {});
  return scheduled;
}

// A sentinel (rather than throwing, or resolving with fabricated "no
// results" data) so resolveTrailerId below can tell "skipped, don't
// cache this" apart from a genuine empty search response.
const YOUTUBE_BUDGET_SKIPPED = { budgetSkipped: true };

// Single-request counterpart to fetchOmdb above: every YouTube
// search.list call in this file goes through this, so the daily budget,
// throttled spacing, persistent caching, and 429 backoff all apply
// uniformly regardless of whether the call came from opening a trailer
// or a hover preview.
function fetchYoutubeSearch(url) {
  if (readYoutubeRequestCount() >= YOUTUBE_DAILY_REQUEST_LIMIT) {
    return Promise.resolve(YOUTUBE_BUDGET_SKIPPED);
  }

  return queueYoutubeRequest(() => {
    // Re-check right before actually sending: several lookups can be
    // queued back-to-back before the count below updates, so this catches
    // the request that would otherwise push slightly past the budget.
    if (readYoutubeRequestCount() >= YOUTUBE_DAILY_REQUEST_LIMIT) {
      return Promise.resolve(YOUTUBE_BUDGET_SKIPPED);
    }
    bumpYoutubeRequestCount();
    return fetch(url).then((res) => {
      if (res.status === 429) {
        youtubeCooldownUntil = Date.now() + YOUTUBE_RATE_LIMIT_COOLDOWN_MS;
        exhaustYoutubeBudgetForToday();
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.warn(
            "[MovieSearch] YouTube search rate-limited (429) — treating today's " +
              "trailer-lookup budget as spent; will resume automatically tomorrow."
          );
        }
        throw new Error("youtube-rate-limited");
      }
      return res.json();
    });
  });
}

// --- Recent searches (search suggestions dropdown) ---
// A small, per-browser list of the most recent committed search terms —
// "committed" meaning the visitor pressed Enter or picked a suggestion,
// not every debounced keystroke. Shown in the suggestions dropdown when
// the search box is focused and empty, the same way Netflix/most search
// boxes offer a quick way back to something you searched a minute ago.
const RECENT_SEARCHES_KEY = "movieSearch:recentSearches:v1";
const MAX_RECENT_SEARCHES = 6;
// How many live suggestions (with poster thumbnails) to show while typing.
const MAX_SUGGESTIONS = 6;

function readRecentSearches() {
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === "string" && t) : [];
  } catch {
    return [];
  }
}

function writeRecentSearches(list) {
  try {
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
  } catch {
    // Storage full/unavailable — recent searches are a nice-to-have.
  }
}

function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function parseStartYear(yearField) {
  // Handles both "2013" and series ranges like "2017–2020" / "2017–"
  const match = /\d{4}/.exec(yearField || "");
  return match ? parseInt(match[0], 10) : null;
}


const PLOT_MAX_LENGTH = 320;
const PLOT_MAX_SENTENCES = 3;


const ABBREVIATIONS = /\b(?:[A-Z]\.){2,}|\b(?:Mr|Mrs|Ms|Dr|Jr|Sr|St|vs|etc)\./g;
// A token that will never occur naturally in plot text and contains no
// control characters, so it survives string storage/transport untouched.
const PERIOD_PLACEHOLDER = "@@PERIOD@@";

export function truncatePlot(text) {
  if (!text) return text;
  const trimmed = text.trim();

  const protectedText = trimmed.replace(ABBREVIATIONS, (m) =>
    m.split(".").join(PERIOD_PLACEHOLDER)
  );
  const sentences = protectedText.match(/[^.!?]+[.!?]+(\s+|$)/g);
  if (!sentences) return trimmed; // no sentence punctuation to split on — leave as-is

  let result = "";
  for (let i = 0; i < sentences.length && i < PLOT_MAX_SENTENCES; i++) {
    const next = result + sentences[i];
    // Always keep at least the first sentence, even if it alone exceeds the
    // length cap — better a long single sentence than a mid-sentence cut.
    if (result && next.trim().length > PLOT_MAX_LENGTH) break;
    result = next;
  }

  result = result.trim().split(PERIOD_PLACEHOLDER).join(".");
  return result.length < trimmed.length ? result : trimmed;
}

function parseDetailToMovie(detail) {
  return {
    Title: detail.Title,
    Year: detail.Year,
    imdbID: detail.imdbID,
    Type: detail.Type,
    Poster: detail.Poster,
    Genre: detail.Genre || "",
    Director: detail.Director || "",

    Actors: detail.Actors || "",
    // Plot/Runtime/Rated aren't used by the grid cards, but the browse
    // fetch already hits OMDb's by-ID endpoint (which returns them for
    // free), and HeroBanner needs them — so capture them here instead of
    // firing a second request just for the featured title.
    Plot: detail.Plot || "",
    Runtime: detail.Runtime || "",
    Rated: detail.Rated || "",
    // Same reasoning: OMDb's by-ID lookup already returns Language for
    // free, so it's captured here rather than firing a second request —
    // it's what powers the "Browse by Languages" filter (see
    // languageFilter below).
    Language: detail.Language || "",
    imdbRating:
      detail.imdbRating && detail.imdbRating !== "N/A"
        ? parseFloat(detail.imdbRating)
        : null,
  };
}

// Applies a raw OMDb "by ID" detail response onto a lightweight
// search/browse-result movie object. Shared by the movies and
// browseMovies enrichment effects below so the field mapping only lives
// in one place. A missing/failed detail still returns an updated object
// (Genre: "") so the caller can tell "attempted, nothing came back" apart
// from "not yet enriched" (Genre: null) and doesn't retry it forever.
function mergeDetailIntoMovie(movie, detail) {
  if (!detail) return { ...movie, Genre: "" };
  return {
    ...movie,
    Genre: detail.Genre || "",
    Director: detail.Director || "",
    Actors: detail.Actors || "",
    Plot: detail.Plot || "",
    Runtime: detail.Runtime || "",
    Rated: detail.Rated || "",
    Language: detail.Language || "",
    imdbRating: detail.imdbRating && detail.imdbRating !== "N/A" ? parseFloat(detail.imdbRating) : null,
  };
}


// --- Kids-profile content filtering ---
// OMDb doesn't expose a simple "kid safe" flag, so this leans on two
// signals as a practical proxy: genre, and the official content rating
// (Rated). Genre alone isn't enough — plenty of clearly adult titles
// carry a genre tag like "Adventure" or "Comedy" alongside their harder
// genres (Gladiator is Action/Adventure/Drama, for instance, and is
// R-rated), so relying only on genre lets titles like that leak into the
// Kids rows anywhere the general (non-kids-curated) pools — like
// similarPool below, which is shared across both profile types — get
// merged in and genre-filtered. The Rated allowlist below is the
// stricter signal: only titles OMDb marks with a clearly kid/family
// rating are considered safe, everything else (PG-13, R, NC-17,
// Unrated, TV-14, TV-MA, missing/"N/A" rating, etc.) is excluded
// regardless of genre.
//
// Titles whose genre or rating hasn't loaded yet (before enrichment
// finishes) are treated as not-yet-safe rather than shown optimistically,
// so nothing inappropriate flashes on screen while it loads.
const KID_SAFE_GENRES = [
  "Animation",
  "Family",
  "Adventure",
  "Comedy",
  "Fantasy",
  "Musical",
  "Sport",
];
const KID_UNSAFE_GENRES = [
  "Horror",
  "Crime",
  "War",
  "Thriller",
  "Film-Noir",
  "Mystery",
];
// Deliberately an allowlist, not a denylist: OMDb's Rated field is messy
// enough (many different TV rating systems, "Not Rated", "Approved",
// "N/A", etc.) that guessing which values are *unsafe* is easy to get
// wrong. Only these clearly-kid/family ratings pass; everything else —
// including PG-13, which the genre check alone was letting through —
// does not.
const KID_SAFE_RATINGS = ["G", "PG", "TV-Y", "TV-Y7", "TV-Y7-FV", "TV-G", "TV-PG"];

function isKidSafe(movie) {
  if (!movie || !movie.Genre) return false;
  const genres = movie.Genre.split(",").map((g) => g.trim()).filter(Boolean);
  if (genres.length === 0) return false;
  if (genres.some((g) => KID_UNSAFE_GENRES.includes(g))) return false;
  if (!genres.some((g) => KID_SAFE_GENRES.includes(g))) return false;

  const rated = movie.Rated ? movie.Rated.trim() : "";
  if (!KID_SAFE_RATINGS.includes(rated)) return false;

  return true;
}


// --- Genre-based browse rows ---
// Netflix's signature browse layout isn't one big grid, it's a stack of
// horizontally-scrolling shelves grouped by genre. This list just decides
// which genres get first billing (and in what order) when more than one
// qualifies; anything present in the data but not named here still gets
// its own row, alphabetized, after these.
const GENRE_ROW_ORDER = [
  "Action",
  "Comedy",
  "Drama",
  "Sci-Fi",
  "Animation",
  "Horror",
  "Thriller",
  "Adventure",
  "Crime",
  "Romance",
  "Fantasy",
  "Documentary",
  "Mystery",
  "Family",
  "War",
  "Biography",
];
// Every genre needs at least this many loaded, matching titles before it
// gets its own shelf. A genre with only one or two posters reads as
// broken, not curated — this used to be set to 1 so that literally every
// genre present in the pool got a row (see the comment that used to be
// here), but that's exactly what made the browse page feel like a long
// tail of half-empty shelves (Documentary, War, Biography, Mystery, ...)
// rather than a small set of categories that actually feel full. Raising
// the bar means a shelf only appears once there's enough of that genre
// loaded to fill a meaningful chunk of ROW_ITEM_CAP.
const MIN_ROW_SIZE = 10;
const MIN_ROW_SIZE_KIDS = 6; // the Kids term pool is smaller, so this stays a lower bar
const ROW_ITEM_CAP = 15;
// On top of the size bar above, cap how many shelves show at once even
// if more genres qualify — otherwise a well-loaded pool (lots of browse
// pages fetched) would just turn the size filter into "every genre
// eventually gets a row anyway," recreating the same long-tail problem
// one scroll further down. GENRE_ROW_ORDER's priority order (below)
// decides which qualifying genres win the available slots.
const MAX_GENRE_ROWS = 8;

// --- "Because You Watched" personalized rows ---
// How many of the most-recently-opened Continue Watching titles get their
// own recommendation shelf. Netflix shows a handful of these on the
// homepage, not one per watched title — capping it keeps the page from
// turning into an endless stack of thin, low-confidence rows.
const BECAUSE_YOU_WATCHED_SEED_COUNT = 3;
const BECAUSE_YOU_WATCHED_ROW_SIZE = 12;
// Same reasoning as MIN_ROW_SIZE above: a "Because you watched X" row
// with only two or three posters reads as broken, not personalized —
// better to just skip that seed title and try the next one.
const MIN_BECAUSE_YOU_WATCHED_ROW_SIZE = 5;

// How much a liked title's genre-overlap score gets bumped in the
// personalized rows below ("Because You Watched" and "You Might Also
// Like"/"More Like This") — enough to reliably outrank an
// equally-genre-matched title that hasn't been rated, without letting a
// single like completely override a much stronger genre/director match.
const LIKE_SCORE_BONUS = 1;

// --- Auto-load cap (genre-filtered browsing AND text search) ---
// Applies the same ceiling everywhere scrolling can trigger more OMDb
// requests on its own: a genre-filtered browse view (any genre — OMDb's
// search endpoint has no genre parameter, so genre only comes back from
// the per-title detail lookup after a title's already been found via a
// broad title-text search, meaning most requests spent growing a genre
// view don't even end up matching it) and a plain text search (which,
// for a broad query, can have thousands of OMDb matches). Letting either
// keep auto-loading unbounded — until the term/year combo space runs
// dry, or OMDb's own ~1,000-result search ceiling — could burn a large
// share of the 1,000/day OMDb cap in a single scrolling session, so both
// stop auto-loading once they've gathered this many titles. Clearing the
// filter/search (or narrowing the query further) re-enables loading
// more, same as before.
const AUTO_LOAD_TARGET_COUNT = 100;

function renderPosterCard(movie, onSelect) {
  return (
    <div
      key={movie.imdbID}
      className="movie-search__similar-card"
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="movie-search__similar-poster">
        {movie.Poster !== "N/A" ? (
          <img src={movie.Poster} alt={movie.Title} loading="lazy" decoding="async" />
        ) : (
          <div className="movie-search__similar-poster-placeholder">No image</div>
        )}
      </div>
      <p className="movie-search__similar-card-title">{movie.Title}</p>
      <p className="movie-search__similar-card-meta">{movie.Year}</p>
    </div>
  );
}

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "movie", label: "Movies" },
  { value: "series", label: "Series" },
];

const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "year_desc", label: "Newest first" },
  { value: "year_asc", label: "Oldest first" },
  { value: "title_asc", label: "Title A–Z" },
  { value: "rating_desc", label: "Rating (high to low)" },
];

export default function MovieSearch() {
  const { activeProfile } = useProfiles();
  const { continueWatching, recordWatch, removeFromHistory } = useWatchHistory();
  const { myList, isInList, toggleInList } = useMyList();
  const { getRating, toggleLike, toggleDislike, likedIds, dislikedIds } = useRatings();
  const { setCatalog } = useMovieCatalog();
  const kidsMode = !!(activeProfile && activeProfile.isKids);

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, DEBOUNCE_MS);

  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  // Set once a search's pagination can't advance any further — either
  // OMDb has genuinely run out of pages for this query, or the query hit
  // OMDb's hard cap on how far a single `s=` search can page through (its
  // own search endpoint stops serving pages once you're roughly 1,000
  // results in, well before `totalResults` for a broad query like "the"
  // ever reaches zero remaining). Without this,
  // `searched && movies.length < totalResults` stays true forever for
  // any broad query, so "Load more"/infinite-scroll keeps trying (and
  // silently failing) indefinitely once that ceiling is hit.
  const [searchExhausted, setSearchExhausted] = useState(false);


  const [browseMovies, setBrowseMovies] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [browseLoadingMore, setBrowseLoadingMore] = useState(false);
  const [browseExhausted, setBrowseExhausted] = useState(false);
  // Where the "infinite" browse loader currently is in the term x year
  // combo space (see BROWSE_QUERY_TERMS[_KIDS]/BROWSE_QUERY_YEARS above)
  // and which OMDb results page it's on within that combo. Refs rather
  // than state because fetchNextBrowseBatch below advances them
  // step-by-step inside a single async call (possibly several times per
  // click, per MAX_COMBO_ADVANCE_PER_LOAD) — turning every step into a
  // state update would both be unnecessary re-renders and racy across
  // steps.
  const browseComboIndexRef = useRef(0);
  const browseComboPageRef = useRef(1);
  // A freshly-shuffled copy of BROWSE_QUERY_TERMS[_KIDS], re-rolled on
  // mount and whenever kidsMode flips (see the reset effect right below)
  // — see shuffleArray's comment above for why this exists. combo %
  // terms.length in fetchNextBrowseBatch indexes into THIS array, not the
  // static term list, so which term a given combo number maps to varies
  // session to session while combo math itself is untouched.
  const shuffledTermsRef = useRef([]);
  // Every imdbID the browse loader has already surfaced, across every
  // term/year combo queried so far this session — search terms overlap
  // a lot ("war" and "the" both turn up plenty of the same titles), so
  // this is what keeps "Load more" from ever showing the same movie
  // twice.
  const browseSeenIdsRef = useRef(new Set());
  // Non-blocking notice shown only when fetchNextBrowseBatch hits a real
  // OMDb quota/rate-limit error, or a network-level failure (not for an
  // individual search term simply having no matches, which is expected
  // and just advances to the next combo silently).
  const [browseWarning, setBrowseWarning] = useState("");


  const [similarPool, setSimilarPool] = useState([]);

  const [showFilters, setShowFilters] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  // Filters the active list down to titles whose OMDb "Language" field
  // includes the chosen language — the same shape of filter as
  // genreFilter above, just against a different field. Driven either by
  // the Filters panel's own dropdown, or by picking a tile on the
  // dedicated Browse by Languages page (see the ?language= URL handoff
  // effect below, which mirrors the existing ?genre= one).
  const [languageFilter, setLanguageFilter] = useState("");
  const [yearMin, setYearMin] = useState("");
  const [yearMax, setYearMax] = useState("");
  const [sortBy, setSortBy] = useState("relevance");

  // --- Search suggestions dropdown (typeahead + recent searches) ---
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState(() => readRecentSearches());
  const searchWrapRef = useRef(null);
  const searchInputRef = useRef(null);


  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("movie");
  const [selectedMovie, setSelectedMovie] = useState(null);
  // The movie currently previewed in the hero banner. Set whenever a movie
  // card is clicked anywhere (browse grid, search grid, "You Might Also
  // Like", cast/crew rows) — clicking a card no longer jumps straight into
  // the trailer, it just previews that title up top. Play / More Info on
  // the hero banner is what actually opens the trailer via openMovie().
  const [heroMovie, setHeroMovie] = useState(null);
  // Movie currently shown in the "More Info" modal — pure metadata (full
  // plot, cast, director, episodes for series, similar titles), no
  // trailer. Independent of heroMovie/selectedMovie: opening it reuses
  // fetchDetail() below (the same OMDb by-ID lookup + cache the trailer
  // panel already relies on) but never mounts a video.
  const [infoMovie, setInfoMovie] = useState(null);
  const [trailerId, setTrailerId] = useState(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const [trailerError, setTrailerError] = useState("");


  const [movieDetail, setMovieDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");


  const [selectedPerson, setSelectedPerson] = useState(null);


  const [personInfo, setPersonInfo] = useState(null);
  const [personInfoLoading, setPersonInfoLoading] = useState(false);

  const [selectedSeason, setSelectedSeason] = useState(1);
  const [episodes, setEpisodes] = useState([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);

  const searchRequestId = useRef(0);
  const trailerRequestId = useRef(0);
  const trailerCache = useRef({}); // imdbID -> videoId | null
  const detailRequestId = useRef(0);
  const detailCache = useRef({}); // imdbID -> detail object | null
  const episodesRequestId = useRef(0);
  const episodesCache = useRef({}); // "imdbID:season" -> episodes array
  const personInfoRequestId = useRef(0);
  const personInfoCache = useRef({}); // person name -> info object | null
  const trailerSectionRef = useRef(null); // scroll target: the trailer panel at the top of the page
  const pendingMovieRef = useRef(null); // movie object from the click that's about to become selectedId
  const loadMoreSentinelRef = useRef(null); // bottom-of-grid marker watched for infinite scroll
  // Guards the one-time "?genre="/"?language="/"/shows" URL-and-route
  // handoff (see the effect right below) so it only ever applies once
  // per page load — after that, the Filters panel's own dropdowns are
  // what drive genreFilter/typeFilter/languageFilter, and this effect
  // must not fight them on re-renders.
  const appliedGenreParamRef = useRef(false);


  // Switching profiles mid-session (Kids <-> regular) should reset the
  // browse grid back to the start of whichever term pool now applies,
  // and clear any in-flight search so nothing from the other profile
  // lingers on screen while the new pool loads.
  useEffect(() => {
    setBrowseMovies([]);
    setBrowseLoading(true);
    setBrowseWarning("");
    setBrowseExhausted(false);
    shuffledTermsRef.current = shuffleArray(
      kidsMode ? BROWSE_QUERY_TERMS_KIDS : BROWSE_QUERY_TERMS
    );
    browseComboIndexRef.current = 0;
    browseComboPageRef.current = 1;
    browseSeenIdsRef.current = new Set();
    setQuery("");
    setMovies([]);
    setSearched(false);
    setError("");
    setSearchExhausted(false);
    setHeroMovie(null);
    setInfoMovie(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kidsMode]);


  // One-time handoff into the Filters panel from a URL param, so picking
  // something from a tile grid (rather than only the Filters panel's own
  // dropdowns, which you'd otherwise have to already be on this page and
  // open Filters to find) lands here with the right filter pre-applied
  // and the Filters panel already open:
  //   - `/movies?genre=<name>` (a tile on the Genres page) pre-applies
  //     that genre.
  //   - `/movies?language=<name>` (a tile on the Browse by Languages
  //     page) pre-applies that language.
  // Runs once on mount only — afterwards the Filters panel's dropdowns
  // own genreFilter/languageFilter, same as if the visitor had picked
  // them there themselves. (typeFilter/Home-Shows-Movies is handled by
  // the route-driven effect right below instead, since it has to keep
  // reacting every time the visitor switches tabs, not just once.)
  useEffect(() => {
    if (appliedGenreParamRef.current) return;
    appliedGenreParamRef.current = true;

    let opened = false;

    const g = searchParams.get("genre");
    if (g) {
      setGenreFilter(g);
      opened = true;
    }

    const lang = searchParams.get("language");
    if (lang) {
      setLanguageFilter(lang);
      opened = true;
    }

    if (opened) setShowFilters(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keeps typeFilter in sync with the Header's Home / Shows / Movies tabs
  // on EVERY navigation, not just the first time this component mounts.
  // React Router doesn't remount MovieSearch when navigating between
  // "/", "/shows" and "/movies" — they all render the exact same element
  // tree, so from React's perspective it's the same component instance
  // staying mounted across the URL change. A mount-only effect (like the
  // one above) would therefore only ever apply once per page load; this
  // effect instead re-derives typeFilter from the current route every
  // time location.pathname (or the "/movies?type=" query) changes, which
  // is what makes clicking Shows after Movies (or back again) actually
  // take effect each time:
  //   - `/shows` -> only Series
  //   - `/movies?type=movie` (the Header's "Movies" tab) -> only Movies
  //   - `/movies` with no `type` param (e.g. a Genres tile's
  //     `/movies?genre=<name>` link) -> both, same as before these tabs
  //     existed, so genre browsing isn't silently narrowed to one type
  //   - `/` (Home) -> both
  // Anywhere else, typeFilter is left alone so the Filters panel's own
  // Type dropdown still works normally.
  useEffect(() => {
    if (location.pathname === "/shows") {
      setTypeFilter("series");
    } else if (location.pathname === "/movies") {
      setTypeFilter(searchParams.get("type") === "movie" ? "movie" : "");
    } else if (location.pathname === "/") {
      setTypeFilter("");
    }
  }, [location.pathname, searchParams]);


  // Walks forward through the term/year combo space (see
  // BROWSE_QUERY_TERMS[_KIDS]/BROWSE_QUERY_YEARS above), fetching OMDb
  // search pages one at a time, until it's gathered a decent-sized fresh
  // batch (or hit MAX_COMBO_ADVANCE_PER_LOAD, or run out of combos
  // entirely). A combo is "used up" once its page comes back with fewer
  // than 10 results (OMDb's per-page cap) — at that point this moves on
  // to the next combo rather than requesting an empty page 2. Results
  // already seen (browseSeenIdsRef) are filtered out so the same title
  // never shows up twice across two overlapping search terms.
  async function fetchNextBrowseBatch() {
    // Falls back to the unshuffled list only in the (normally impossible)
    // case this runs before the reset effect above has had a chance to
    // populate shuffledTermsRef — keeps this function safe to call early
    // rather than throwing on an empty array.
    const fallbackTerms = kidsMode ? BROWSE_QUERY_TERMS_KIDS : BROWSE_QUERY_TERMS;
    const terms = shuffledTermsRef.current.length > 0 ? shuffledTermsRef.current : fallbackTerms;
    const totalCombos = terms.length * BROWSE_QUERY_YEARS.length;
    let collected = [];

    for (let attempts = 0; attempts < MAX_COMBO_ADVANCE_PER_LOAD; attempts++) {
      const combo = browseComboIndexRef.current;
      if (combo >= totalCombos) {
        setBrowseExhausted(true);
        break;
      }

      const term = terms[combo % terms.length];
      const year = BROWSE_QUERY_YEARS[Math.floor(combo / terms.length) % BROWSE_QUERY_YEARS.length];
      const page = browseComboPageRef.current;
      const url =
        `https://www.omdbapi.com/?apikey=${API_KEY}&s=${encodeURIComponent(term)}&page=${page}` +
        (year ? `&y=${year}` : "");

      // Fetch and JSON-parse are tracked separately from "OMDb responded
      // but found nothing" — a thrown fetch (offline, DNS hiccup, CORS,
      // etc.) means this combo was never actually queried, so it must
      // NOT be treated the same as "no matches for this term/page" below
      // (which advances past the combo forever). A network failure stops
      // the batch and leaves the combo position untouched so the next
      // "Load more"/retry picks up exactly where it left off.
      let data = null;
      let networkError = false;
      try {
        const res = await fetchOmdb(url);
        data = await res.json();
      } catch {
        networkError = true;
      }

      if (networkError) {
        setBrowseWarning(
          "Couldn't reach OMDb — check your connection and try \"Load more\" again."
        );
        break;
      }

      if (!data || data.Response === "False") {
        const errMsg = (data && data.Error) || "";
        if (errMsg.toLowerCase().includes("limit")) {
          // A genuine quota/rate-limit error, not just "this combo has
          // no matches" — surface it and stop for now rather than
          // burning through the rest of the attempt budget on requests
          // that'll fail the same way. Combo position is left untouched
          // so the next click retries this exact query once the limit
          // resets.
          setBrowseWarning(
            "OMDb API request limit reached for today — new titles will resume loading once your quota resets. Check your usage at omdbapi.com."
          );
          break;
        }
        // A real (non-network) OMDb response saying this term/page has
        // no matches — move on to the next combo.
        browseComboIndexRef.current += 1;
        browseComboPageRef.current = 1;
        continue;
      }

      const results = data.Search || [];
      const fresh = results
        .filter((m) => m.Type !== "episode" && !browseSeenIdsRef.current.has(m.imdbID))
        .map((m) => {
          browseSeenIdsRef.current.add(m.imdbID);
          return { ...m, Genre: null, imdbRating: null };
        });

      if (results.length >= 10) {
        browseComboPageRef.current += 1; // more pages likely left in this combo
      } else {
        browseComboIndexRef.current += 1; // this combo is exhausted
        browseComboPageRef.current = 1;
      }

      if (fresh.length > 0) {
        collected = collected.concat(fresh);
        setBrowseWarning("");
      }

      if (collected.length >= 8) break; // enough for one "page" of Load More
    }

    return collected;
  }


  // Initial browse load: fires on mount and whenever kidsMode flips (the
  // reset effect above clears state first — effects run in declaration
  // order on the same commit, so this always sees the freshly-reset
  // combo position).
  useEffect(() => {
    let cancelled = false;
    fetchNextBrowseBatch().then((fresh) => {
      if (cancelled) return;
      setBrowseMovies(fresh);
      setBrowseLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kidsMode]);


  function loadMoreBrowse() {
    if (browseLoadingMore || browseExhausted) return;
    setBrowseLoadingMore(true);
    fetchNextBrowseBatch().then((fresh) => {
      if (fresh.length > 0) setBrowseMovies((prev) => [...prev, ...fresh]);
      setBrowseLoadingMore(false);
    });
  }


  useEffect(() => {
    let cancelled = false;
    const cacheKey = `movieSearch:similarPool:${CACHE_VERSION}`;

    const cached = readCache(cacheKey);
    if (cached) {
      setSimilarPool(cached);
      return;
    }

    fetchJsonPool(
      SIMILAR_POOL_IDS.map((id) => `https://www.omdbapi.com/?apikey=${API_KEY}&i=${id}`)
    ).then((results) => {
      if (cancelled) return;
      const parsed = results
        .filter((d) => d && d.Response !== "False")
        .map(parseDetailToMovie);
      const failedCount = results.length - parsed.length;
      if (failedCount > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `[MovieSearch] ${failedCount}/${results.length} similar-pool title(s) failed to load from OMDb.`
        );
        // Not cached — see the browse-pool effect above for why a
        // partially-failed batch isn't remembered.
      } else {
        writeCache(cacheKey, parsed);
      }
      setSimilarPool(parsed);
    });

    return () => {
      cancelled = true;
    };
  }, []);


  useEffect(() => {
    const q = debouncedQuery.trim();
    // A fresh query (or clearing back to browse) invalidates whatever was
    // previously previewed in the hero banner — leaving it in place would
    // either pin an old browse title above new search results, or show a
    // stale search result after the visitor cleared the search box.
    setHeroMovie(null);
    setInfoMovie(null);
    if (!q) {
      setMovies([]);
      setSearched(false);
      setError("");
      setPage(1);
      setTotalResults(0);
      setSearchExhausted(false);
      return;
    }

    const requestId = ++searchRequestId.current;
    setLoading(true);
    setSearched(true);
    setError("");
    setPage(1);
    setSearchExhausted(false);

    fetchOmdb(`https://www.omdbapi.com/?apikey=${API_KEY}&s=${encodeURIComponent(q)}&page=1`)
      .then((res) => res.json())
      .then((data) => {
        if (requestId !== searchRequestId.current) return; // stale response, ignore

        if (data.Response === "False") {
          setMovies([]);
          setTotalResults(0);
          setError(data.Error || "No results found.");
        } else {
          setMovies(data.Search.map((m) => ({ ...m, Genre: null, imdbRating: null })));
          setTotalResults(parseInt(data.totalResults, 10) || 0);
        }
      })
      .catch(() => {
        if (requestId !== searchRequestId.current) return;
        setError("Something went wrong fetching movies.");
        setMovies([]);
        setTotalResults(0);
      })
      .finally(() => {
        if (requestId === searchRequestId.current) setLoading(false);
      });
  }, [debouncedQuery]);


  useEffect(() => {
    const needsDetail = movies.filter((m) => m.Genre === null);
    if (needsDetail.length === 0) return;

    let cancelled = false;
    setEnriching(true);

    // Split off anything already sitting in the persistent detail cache
    // (see getCachedDetail above) — those get applied immediately with
    // zero network requests, and only the genuinely-unseen titles go out
    // to OMDb.
    const toFetch = [];
    const cachedById = new Map();
    needsDetail.forEach((m) => {
      const cached = getCachedDetail(m.imdbID);
      if (cached) cachedById.set(m.imdbID, cached);
      else toFetch.push(m);
    });

    if (cachedById.size > 0) {
      setMovies((prev) =>
        prev.map((movie) =>
          cachedById.has(movie.imdbID)
            ? mergeDetailIntoMovie(movie, cachedById.get(movie.imdbID))
            : movie
        )
      );
    }

    if (toFetch.length === 0) {
      setEnriching(false);
      return;
    }

    // plot=full: search results start out with no Plot field at all.
    // Without fetching it here, previewing a search result in the hero
    // banner (see previewMovie/heroMovie below) would show a banner
    // with no synopsis until Play was clicked.
    fetchJsonPool(
      toFetch.map((m) => `https://www.omdbapi.com/?apikey=${API_KEY}&i=${m.imdbID}&plot=full`)
    ).then((details) => {
      if (cancelled) return;
      setMovies((prev) =>
        prev.map((movie) => {
          if (movie.Genre !== null) return movie; // already resolved above (cache hit)
          const detail = details.find((d) => d && d.imdbID === movie.imdbID);
          if (detail) setCachedDetail(movie.imdbID, detail);
          return mergeDetailIntoMovie(movie, detail);
        })
      );
      setEnriching(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movies.length, debouncedQuery]);


  useEffect(() => {
    const needsDetail = browseMovies.filter((m) => m.Genre === null);
    if (needsDetail.length === 0) return;

    let cancelled = false;

    // Same cache-first split as the search-results effect above: anything
    // already in the persistent detail cache is applied without a
    // network request, and only genuinely-unseen titles go out to OMDb.
    const toFetch = [];
    const cachedById = new Map();
    needsDetail.forEach((m) => {
      const cached = getCachedDetail(m.imdbID);
      if (cached) cachedById.set(m.imdbID, cached);
      else toFetch.push(m);
    });

    if (cachedById.size > 0) {
      setBrowseMovies((prev) =>
        prev.map((movie) =>
          cachedById.has(movie.imdbID)
            ? mergeDetailIntoMovie(movie, cachedById.get(movie.imdbID))
            : movie
        )
      );
    }

    if (toFetch.length === 0) return;

    // Same enrichment as the search-results effect above, applied to the
    // browse grid: fetchNextBrowseBatch (further up) only has OMDb's
    // lightweight search-result shape (Title/Year/imdbID/Type/Poster) to
    // work with, so genre, cast, rating, and a full plot all get filled
    // in here via a follow-up by-ID lookup per title.
    fetchJsonPool(
      toFetch.map((m) => `https://www.omdbapi.com/?apikey=${API_KEY}&i=${m.imdbID}&plot=full`)
    ).then((details) => {
      if (cancelled) return;
      setBrowseMovies((prev) =>
        prev.map((movie) => {
          if (movie.Genre !== null) return movie; // already resolved above (cache hit)
          const detail = details.find((d) => d && d.imdbID === movie.imdbID);
          if (detail) setCachedDetail(movie.imdbID, detail);
          return mergeDetailIntoMovie(movie, detail);
        })
      );
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browseMovies.length, kidsMode]);


  const activeMovies = searched ? movies : browseMovies;
  const activeLoading = searched ? loading : browseLoading;

  // --- Derived: page-wide type filtering (Home / Shows / Movies tabs) ---
  // typeFilter (kept in sync with the route by the effect above) has to
  // apply everywhere on the page, not just the main grid — Continue
  // Watching, My List, Top 10 Today, Because You Watched, and the hero
  // banner's default pick all pull from their own unfiltered lists
  // (continueWatching/myList/browseMovies/similarPool), so each of those
  // needs its own type-filtered view rather than relying on
  // filteredMovies below (which only covers the main grid).
  const visibleContinueWatching = useMemo(
    () => (typeFilter ? continueWatching.filter((m) => m.Type === typeFilter) : continueWatching),
    [continueWatching, typeFilter]
  );
  const visibleMyList = useMemo(
    () => (typeFilter ? myList.filter((m) => m.Type === typeFilter) : myList),
    [myList, typeFilter]
  );
  const typeFilteredBrowseMovies = useMemo(
    () => (typeFilter ? browseMovies.filter((m) => m.Type === typeFilter) : browseMovies),
    [browseMovies, typeFilter]
  );

  // --- Derived: search suggestions dropdown ---
  // Reuses the flat `movies` list the debounced search effect above
  // already fetches (raw OMDb search-result shape: Title/Year/imdbID/
  // Type/Poster — enough for a poster thumbnail + title/year, no extra
  // API calls needed) rather than firing a second, separate lookup just
  // for the dropdown.
  const suggestions = useMemo(
    () => (query.trim() ? movies.slice(0, MAX_SUGGESTIONS) : []),
    [query, movies]
  );

  // Hero banner title: whichever movie the visitor last clicked to preview
  // (heroMovie), falling back to the first title the browse loader has
  // pulled in so the banner has something to show before any click
  // happens. The fallback only applies on the browse view — search
  // results don't get an unrelated hero banner pinned above them unless
  // the visitor has actually clicked one of them to preview it. Uses the
  // type-filtered pool so, e.g., the Shows tab never opens on a movie's
  // hero banner.
  const defaultFeaturedMovie =
    !searched && typeFilteredBrowseMovies.length > 0 ? typeFilteredBrowseMovies[0] : null;
  const featuredMovie = heroMovie || defaultFeaturedMovie;

  const searchCapped = movies.length >= AUTO_LOAD_TARGET_COUNT;
  const searchHasMore =
    searched &&
    !loading &&
    !searchExhausted &&
    movies.length > 0 &&
    movies.length < totalResults &&
    !searchCapped;

  // How many of the currently-loaded browse titles match the active
  // genre filter (and kids-safety, mirroring the same slice of
  // filteredMovies' logic below — type/year/sort aren't relevant here,
  // only genre matters for the auto-load cap). Kept as its own small
  // memo rather than reusing filteredMovies directly since that memo is
  // defined further down and this needs to exist before hasMore.
  const genreFilterMatchCount = useMemo(() => {
    if (!genreFilter) return 0;
    const pool = kidsMode ? browseMovies.filter(isKidSafe) : browseMovies;
    return pool.filter((m) => m.Genre && m.Genre.includes(genreFilter)).length;
  }, [browseMovies, kidsMode, genreFilter]);
  const genreFilterCapped = !!genreFilter && genreFilterMatchCount >= AUTO_LOAD_TARGET_COUNT;

  const browseHasMore = !searched && !browseLoading && !browseExhausted && !genreFilterCapped;
  const hasMore = searchHasMore || browseHasMore;
  const loadingMoreAny = loadingMore || browseLoadingMore;

  // --- Derived: Top 10 Today ---
  // A lightweight "trending" row that needs no extra API calls: it's just
  // the titles already loaded for the browse grid and the similar-titles
  // pool, deduped and ranked by IMDb rating. It's not real trending data
  // (this app has no view-count analytics to rank by), but it gives the
  // browse page a Netflix-style ranked row using data that's already on
  // hand. Recomputes automatically as more of the browse pool streams in.
  //
  // Disliked titles are excluded outright (thumbs-down is a stronger,
  // explicit signal than "just don't happen to match your history" — no
  // point surfacing something you already said you don't want) —
  // dislikedIds comes from RatingsContext, the same per-profile localStorage
  // rating record backing the thumbs buttons on every card.
  //
  // similarPool is a single list fetched once for the whole app (see the
  // effect above), built from general-audience titles (Star Wars, The
  // Matrix, Gladiator, ...) — it was never curated with a Kids profile in
  // mind, and genre/rating heuristics alone aren't a reliable enough gate
  // for it: Star Wars is rated PG and carries "Adventure"/"Fantasy" genre
  // tags, so it clears isKidSafe() even though it isn't what anyone means
  // by a "kids pick". In Kids mode this row is built ONLY from browseMovies
  // (which itself is sourced from the Kids-specific BROWSE_QUERY_TERMS_KIDS
  // term pool — see fetchNextBrowseBatch further up), never from
  // similarPool. Every genuinely kid-appropriate title in similarPool
  // (Lion King, Coco, Toy Story 3, Up, Spirited Away) is common enough
  // that the Kids term pool turns it up too, so this loses nothing real
  // for the Kids row while closing the leak.
  const topTrending = useMemo(() => {
    const pool = kidsMode ? browseMovies : [...browseMovies, ...similarPool];
    const candidates = new Map();
    pool.forEach((m) => {
      if (!m || !m.imdbID || candidates.has(m.imdbID)) return;
      if (kidsMode && !isKidSafe(m)) return;
      // Respects the Home/Shows/Movies tab (or a manual Type pick in the
      // Filters panel) the same way the main grid does — otherwise this
      // row would keep mixing in the other type even while the rest of
      // the page is filtered down to just one.
      if (typeFilter && m.Type !== typeFilter) return;
      if (dislikedIds.has(m.imdbID)) return;
      candidates.set(m.imdbID, m);
    });
    return Array.from(candidates.values())
      .sort((a, b) => (b.imdbRating ?? -1) - (a.imdbRating ?? -1))
      .slice(0, 10);
  }, [browseMovies, similarPool, kidsMode, dislikedIds, typeFilter]);

  // --- Derived: "Because You Watched" personalized rows ---
  // Builds one recommendation shelf per recently-opened Continue Watching
  // title (most recent first), the same way Netflix's homepage does.
  // Scoring reuses the exact approach the "More Like This"/"You Might
  // Also Like" panel already uses for a single title (shared-genre count,
  // highest IMDb rating as the tiebreaker, now also a small LIKE_SCORE_BONUS
  // for a title this profile has already given a thumbs-up — see the
  // comment on LIKE_SCORE_BONUS above) — just run once per seed instead
  // of once for whatever's open in the trailer/info panel. Disliked
  // titles never enter the candidate pool at all, same as topTrending
  // above.
  //
  // Titles already in Continue Watching are excluded from every row (no
  // point recommending something the visitor already opened), and a
  // title picked for one row is removed from the candidate pool for the
  // rows after it, so the same recommendation doesn't show up twice
  // across two different "Because you watched" shelves.
  const becauseYouWatchedRows = useMemo(() => {
    if (continueWatching.length === 0) return [];

    // Same reasoning as topTrending above: similarPool is a general-audience
    // pool that was never curated for the Kids profile, so it's excluded
    // entirely in Kids mode rather than relied on to "genre-filter down"
    // safely.
    const source = kidsMode ? [...browseMovies, ...movies] : [...browseMovies, ...similarPool, ...movies];
    const pool = new Map();
    source.forEach((m) => {
      if (!m || !m.imdbID || !m.Genre || pool.has(m.imdbID)) return;
      if (kidsMode && !isKidSafe(m)) return;
      // Same Home/Shows/Movies (or manual Type) filter as topTrending
      // above — recommendations stay the same type as everything else
      // on the page instead of quietly mixing the other type back in.
      if (typeFilter && m.Type !== typeFilter) return;
      if (dislikedIds.has(m.imdbID)) return;
      pool.set(m.imdbID, m);
    });

    const watchedIds = new Set(continueWatching.map((m) => m.imdbID));
    const usedIds = new Set();
    const minRowSize = kidsMode ? Math.min(MIN_BECAUSE_YOU_WATCHED_ROW_SIZE, MIN_ROW_SIZE_KIDS) : MIN_BECAUSE_YOU_WATCHED_ROW_SIZE;

    // Seeds (the "Because you watched X" titles themselves) are also
    // limited to the active type filter — a movie you watched shouldn't
    // headline a shelf while the Shows tab is filtering everything else
    // on the page down to series only.
    const seeds = continueWatching
      .filter((m) => m.Genre && (!typeFilter || m.Type === typeFilter))
      .slice(0, BECAUSE_YOU_WATCHED_SEED_COUNT);

    const rows = [];
    seeds.forEach((seed) => {
      const targetGenres = new Set(
        seed.Genre.split(",").map((g) => g.trim()).filter(Boolean)
      );
      if (targetGenres.size === 0) return;

      const scored = [];
      pool.forEach((m) => {
        if (watchedIds.has(m.imdbID) || usedIds.has(m.imdbID)) return;
        const genres = m.Genre.split(",").map((g) => g.trim()).filter(Boolean);
        const shared = genres.filter((g) => targetGenres.has(g)).length;
        if (shared === 0) return;
        const likeBonus = likedIds.has(m.imdbID) ? LIKE_SCORE_BONUS : 0;
        scored.push({ movie: m, score: shared + likeBonus });
      });
      scored.sort(
        (a, b) => b.score - a.score || (b.movie.imdbRating ?? -1) - (a.movie.imdbRating ?? -1)
      );

      const picks = scored.slice(0, BECAUSE_YOU_WATCHED_ROW_SIZE).map((s) => s.movie);
      if (picks.length < minRowSize) return; // too thin to read as a real recommendation shelf

      picks.forEach((m) => usedIds.add(m.imdbID));
      rows.push({ seedId: seed.imdbID, seedTitle: seed.Title, movies: picks });
    });

    return rows;
  }, [continueWatching, browseMovies, similarPool, movies, kidsMode, dislikedIds, likedIds, typeFilter]);

  // --- Derived: genre-based browse rows ---
  // Groups the curated browse pool by genre into Netflix-style shelves.
  // Only ever built from browseMovies (never search results — a search
  // is a single flat list of matches, rows would just be noise there).
  // Two gates keep this to a small set of categories that are actually
  // full of movies rather than a long tail of thin ones: a genre needs
  // at least MIN_ROW_SIZE[_KIDS] matching titles to earn a shelf at all,
  // and even after that filter, only the top MAX_GENRE_ROWS survive —
  // GENRE_ROW_ORDER's priority list decides which qualifying genres get
  // the available slots, with anything else alphabetized after.
  //
  // A movie almost always carries more than one genre tag, so without
  // deduping here the same title would headline its Action shelf AND its
  // Comedy shelf AND so on — more posters/DOM nodes to paint for every
  // scroll past the rows, with zero new content to show for it. Each
  // title is now claimed by at most one shelf: genres are walked in
  // priority order and a title already used by an earlier (higher
  // priority) shelf is skipped when filling a later one. `usedIds` is
  // returned alongside the rows so the "everything else" section below
  // (leftoverMovies) knows exactly which titles already appeared in a
  // shelf and can list every remaining title exactly once instead of
  // dropping it silently.
  const genreRowsData = useMemo(() => {
    const pool = kidsMode ? browseMovies.filter(isKidSafe) : browseMovies;
    const minSize = kidsMode ? MIN_ROW_SIZE_KIDS : MIN_ROW_SIZE;

    const byGenre = new Map();
    pool.forEach((m) => {
      if (!m.Genre) return;
      m.Genre.split(",")
        .map((g) => g.trim())
        .filter(Boolean)
        .forEach((g) => {
          if (!byGenre.has(g)) byGenre.set(g, []);
          byGenre.get(g).push(m);
        });
    });

    const orderedGenres = [
      ...GENRE_ROW_ORDER.filter((g) => byGenre.has(g)),
      ...Array.from(byGenre.keys())
        .filter((g) => !GENRE_ROW_ORDER.includes(g))
        .sort(),
    ];

    const usedIds = new Set();
    const rows = [];
    for (const genre of orderedGenres) {
      if (rows.length >= MAX_GENRE_ROWS) break;

      // Shuffled rather than left in fetch order — otherwise a row
      // always shows the exact same leading titles every time the page
      // loads (whichever browse-pool entries happened to be found
      // first) — then filtered down to titles no earlier shelf has
      // already claimed.
      const available = shuffleArray(byGenre.get(genre)).filter(
        (m) => !usedIds.has(m.imdbID)
      );
      if (available.length < minSize) continue; // too thin once already-shown titles are excluded

      const picked = available.slice(0, ROW_ITEM_CAP);
      picked.forEach((m) => usedIds.add(m.imdbID));
      rows.push({ genre, movies: picked });
    }

    return { rows, usedIds };
  }, [browseMovies, kidsMode]);
  const genreRows = genreRowsData.rows;

  // --- Derived: everything not already shown in a genre shelf above ---
  // The trailing catch-all grid: every browse-pool title that didn't end
  // up in one of genreRows' shelves, either because it has no genre tag
  // at all, its genres didn't make the cut, or every shelf it could have
  // gone in was already full/claimed by another title. Keeps the promise
  // that nothing loaded ever quietly disappears once genre rows are
  // showing — it just surfaces lower on the page instead of up top.
  // Recomputes automatically as more of the browse pool streams in via
  // "Load more"/infinite scroll, same as genreRowsData above.
  const leftoverMovies = useMemo(() => {
    const pool = kidsMode ? browseMovies.filter(isKidSafe) : browseMovies;
    return pool.filter((m) => !genreRowsData.usedIds.has(m.imdbID));
  }, [browseMovies, kidsMode, genreRowsData]);

  // Rows only replace the flat grid on the plain browse view — once a
  // visitor has picked a type/genre/language/year filter or an explicit
  // sort order, each shelf being independently curated (rather than
  // obeying that choice) would just be confusing, so it falls back to
  // the same filtered flat grid search results already use.
  const filtersActive =
    !!typeFilter || !!genreFilter || !!languageFilter || !!yearMin || !!yearMax || sortBy !== "relevance";
  const showRows = !searched && !filtersActive && genreRows.length > 0;

  // --- Derived: genre/language options available so far ---
  const genreOptions = useMemo(() => {
    const set = new Set();
    activeMovies.forEach((m) => {
      if (m.Genre) m.Genre.split(",").map((g) => g.trim()).forEach((g) => set.add(g));
    });
    return ["", ...Array.from(set).sort()];
  }, [activeMovies]);

  // Same idea as genreOptions above, built from whatever "Language"
  // values have actually loaded so far (OMDb returns this as a
  // comma-separated string, e.g. "English, Spanish") — so the dropdown
  // never offers a language with zero matches in what's currently
  // fetched.
  const languageOptions = useMemo(() => {
    const set = new Set();
    activeMovies.forEach((m) => {
      if (m.Language) m.Language.split(",").map((l) => l.trim()).filter(Boolean).forEach((l) => set.add(l));
    });
    return ["", ...Array.from(set).sort()];
  }, [activeMovies]);

  // --- Filtering + sorting ---
  const filteredMovies = useMemo(() => {
    let list = [...activeMovies];

    if (kidsMode) list = list.filter(isKidSafe);

    if (typeFilter) list = list.filter((m) => m.Type === typeFilter);
    if (genreFilter) {
      list = list.filter((m) => m.Genre && m.Genre.includes(genreFilter));
    }
    if (languageFilter) {
      list = list.filter((m) => m.Language && m.Language.includes(languageFilter));
    }
    if (yearMin) {
      list = list.filter((m) => {
        const y = parseStartYear(m.Year);
        return y !== null && y >= Number(yearMin);
      });
    }
    if (yearMax) {
      list = list.filter((m) => {
        const y = parseStartYear(m.Year);
        return y !== null && y <= Number(yearMax);
      });
    }

    switch (sortBy) {
      case "year_desc":
        list.sort((a, b) => (parseStartYear(b.Year) || 0) - (parseStartYear(a.Year) || 0));
        break;
      case "year_asc":
        list.sort((a, b) => (parseStartYear(a.Year) || 0) - (parseStartYear(b.Year) || 0));
        break;
      case "title_asc":
        list.sort((a, b) => a.Title.localeCompare(b.Title));
        break;
      case "rating_desc":
        list.sort((a, b) => (b.imdbRating ?? -1) - (a.imdbRating ?? -1));
        break;
      default:
        break;
    }

    return list;
  }, [activeMovies, kidsMode, typeFilter, genreFilter, languageFilter, yearMin, yearMax, sortBy]);

  // --- Publish the currently loaded/visible movies for the chatbot ---
  // MovieChatbot is mounted once at the App level (outside this
  // component's tree) so it has no direct access to any of the state
  // above — this is the bridge: any time the underlying pools or the
  // active filters/search change, a small, deduped summary gets pushed
  // into MovieCatalogContext for the chatbot's guardrail + reply logic
  // (see MovieChatbot.js) to read. `allLoaded` is the broad pool
  // (everything fetched so far, across browse/search/similar-titles) the
  // bot draws on for "best of <year>"/genre/title questions; `visible`
  // is the narrower, currently-on-screen set (after filters/search) used
  // for "recommend something" so the answer matches what's actually in
  // front of the visitor. Capped well below what's actually loaded —
  // this is just grounding context for pattern-matching, not a place
  // that needs the full pool.
  const CATALOG_POOL_CAP = 150;
  useEffect(() => {
    const pool = new Map();
    [...browseMovies, ...similarPool, ...movies].forEach((m) => {
      if (m && m.imdbID && m.Genre && !pool.has(m.imdbID)) {
        pool.set(m.imdbID, {
          imdbID: m.imdbID,
          Title: m.Title,
          Year: m.Year,
          Type: m.Type,
          Genre: m.Genre,
          imdbRating: m.imdbRating ?? null,
          Plot: m.Plot || "",
        });
      }
    });

    setCatalog({
      allLoaded: Array.from(pool.values()).slice(0, CATALOG_POOL_CAP),
      visible: filteredMovies.slice(0, CATALOG_POOL_CAP).map((m) => ({
        imdbID: m.imdbID,
        Title: m.Title,
        Year: m.Year,
        Type: m.Type,
        Genre: m.Genre || "",
        imdbRating: m.imdbRating ?? null,
      })),
      isSearching: searched,
      searchQuery: debouncedQuery,
      kidsMode,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browseMovies, similarPool, movies, filteredMovies, searched, debouncedQuery, kidsMode]);

  const activeFilterCount =
    (typeFilter ? 1 : 0) + (genreFilter ? 1 : 0) + (languageFilter ? 1 : 0) + (yearMin ? 1 : 0) + (yearMax ? 1 : 0);

  function clearFilters() {
    setTypeFilter("");
    setGenreFilter("");
    setLanguageFilter("");
    setYearMin("");
    setYearMax("");
  }

  // Jumps straight to a flat, genre-filtered grid — used both by the
  // "See All" link on each genre shelf below and (via the one-time
  // ?genre= handoff effect above) by the dedicated Genres browse page.
  // Scrolls back to the top so the now-open Filters panel is actually in
  // view instead of leaving the visitor stranded mid-row.
  function browseGenre(genre) {
    setGenreFilter(genre);
    setShowFilters(true);
    setShowSuggestions(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }


  function loadMoreResults() {
    const q = debouncedQuery.trim();
    if (!q || loadingMore || searchExhausted) return;

    const nextPage = page + 1;
    const requestId = ++searchRequestId.current;
    setLoadingMore(true);

    fetchOmdb(`https://www.omdbapi.com/?apikey=${API_KEY}&s=${encodeURIComponent(q)}&page=${nextPage}`)
      .then((res) => res.json())
      .then((data) => {
        if (requestId !== searchRequestId.current) return; // a newer search superseded this one
        if (data.Response === "False" || !data.Search) {
          // OMDb has nothing left to give us for this query — either the
          // pages have genuinely run out, or we've hit OMDb's own cap on
          // how far a single search can paginate (it stops serving pages
          // well before `totalResults` reaches zero remaining for broad
          // queries). Either way, further clicks/scroll-triggers on this
          // same query would just repeat the same failing request
          // forever, so mark it exhausted and drop "Load more" instead.
          setSearchExhausted(true);
          return;
        }

        setMovies((prev) => {
          const seen = new Set(prev.map((m) => m.imdbID));
          const additions = data.Search.filter((m) => !seen.has(m.imdbID)).map((m) => ({
            ...m,
            Genre: null,
            imdbRating: null,
          }));
          return [...prev, ...additions];
        });
        setPage(nextPage);
        setTotalResults(parseInt(data.totalResults, 10) || totalResults);
      })
      .catch(() => {
        // A transient network failure, not OMDb saying "no more pages" —
        // leave searchExhausted alone so the sentinel/button stays
        // visible and the visitor (or the observer, on next scroll) can
        // simply try again.
      })
      .finally(() => {
        setLoadingMore(false);
      });
  }


  function loadMore() {
    if (searched) loadMoreResults();
    else loadMoreBrowse();
  }

  // Keeps a ref pointed at the latest `loadMore` closure (fresh
  // `searched`, `loadingMore`, `searchExhausted`, `page`, etc. every
  // render) so the observer effect below can call an always-current
  // version without needing to recreate the observer itself.
  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  });

  // Sets up ONE IntersectionObserver for as long as `hasMore` stays true,
  // instead of tearing it down and recreating it on every
  // movies.length/browseMovies.length change (which is what this used to
  // depend on). That distinction is the actual fix for "Loading more…"
  // seeming to run forever on a broad search: observing a *brand-new*
  // IntersectionObserver instance always fires an immediate callback
  // reporting the sentinel's current intersection state — so recreating
  // the observer after every successful batch meant any batch that
  // didn't push the sentinel past the 400px lookahead zone immediately
  // triggered another automatic load, chaining into dozens of
  // back-to-back fetches with no actual scrolling (and, for a query with
  // hundreds of matches, burning through a lot of OMDb quota in the
  // process). A single persistent observer instead relies on
  // IntersectionObserver's own continuous tracking: it only calls back
  // when the sentinel genuinely crosses in or out of the lookahead zone,
  // whether that's from real scrolling or from the page's layout
  // shifting — so a batch that doesn't move the sentinel out of range
  // doesn't trigger a further fetch until the visitor actually scrolls.
  useEffect(() => {
    if (!hasMore) return;
    if (typeof IntersectionObserver === "undefined") return; // very old browsers just stop at the first batch
    const node = loadMoreSentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreRef.current();
        }
      },
      { rootMargin: "400px" } // start fetching a bit before the sentinel is actually visible
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore]);


  // Clicking a movie card previews it in the hero banner up top, so scroll
  // the page back to the top to bring that banner into view. Skipped when
  // the click is actually opening the trailer (selectedMovie already set
  // by the time this runs, since openResolvedMovie sets both selectedMovie
  // and heroMovie together) — that flow has its own scroll-to-trailer
  // effect right below, which should win instead.
  useEffect(() => {
    if (!heroMovie || selectedMovie) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroMovie]);

  useEffect(() => {
    if (!selectedMovie) return;
    if (trailerSectionRef.current) {
      trailerSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [selectedMovie]);


  // Previews a movie in the hero banner rather than opening its trailer —
  // this is what movie cards call now (browse grid, search grid, "You
  // Might Also Like", cast/crew rows). If a trailer/detail section is
  // already open, close it first so the hero banner is free to show.
  // Play / More Info on the hero banner is what calls openMovie() to
  // actually open the trailer.
  function previewMovie(movie) {
    setHeroMovie(movie);
    setInfoMovie(null);
    if (selectedId) closeTrailer();
  }


  function openMovie(movie) {
    // Opening the trailer supersedes whatever the "More Info" modal was
    // showing — closing it here means Play (including the modal's own
    // "Play Trailer" button) never leaves it lingering behind the panel
    // that's about to open.
    setInfoMovie(null);
    pendingMovieRef.current = movie;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("movie", movie.imdbID);
      return next;
    });
  }

  // Opens the "More Info" modal for a title — a Netflix-style overlay with
  // full plot, cast, director, episodes (for series), and similar titles,
  // and no trailer. Reuses fetchDetail() (defined below) rather than
  // duplicating the OMDb detail fetch: it's the same by-ID lookup + cache
  // the trailer panel already relies on, just displayed without ever
  // mounting a video.
  function openInfo(movie) {
    setInfoMovie(movie);
    setSelectedPerson(null); // don't carry a cast/crew filter over from a previous title
    fetchDetail(movie);
  }

  function closeInfo() {
    setInfoMovie(null);
  }

  // --- Search suggestions dropdown: selection + recent-search helpers ---

  function addRecentSearch(term) {
    const clean = term.trim();
    if (!clean) return;
    setRecentSearches((prev) => {
      const next = [clean, ...prev.filter((t) => t.toLowerCase() !== clean.toLowerCase())].slice(
        0,
        MAX_RECENT_SEARCHES
      );
      writeRecentSearches(next);
      return next;
    });
  }

  function clearRecentSearches(e) {
    e.stopPropagation();
    setRecentSearches([]);
    writeRecentSearches([]);
  }

  // Picking a live suggestion (poster + title) jumps straight to that
  // title's "More Info" modal — the same destination the row/grid cards'
  // own More Info affordance opens — rather than just filling the search
  // box in, since the whole point of a suggestion is "this is the one I
  // meant."
  function handleSelectSuggestion(movie) {
    if (!movie) return;
    addRecentSearch(query.trim() || movie.Title);
    setShowSuggestions(false);
    setHighlightedIndex(-1);
    openInfo(movie);
  }

  // Picking a recent search re-runs it (rather than opening a title
  // directly, since a bare search term doesn't resolve to one movie) —
  // dropping the query back in lets the existing debounced search effect
  // take over and the dropdown itself flips over to live suggestions as
  // soon as results come back.
  function handleSelectRecent(term) {
    setQuery(term);
    setHighlightedIndex(-1);
  }

  function handleQueryChange(e) {
    setQuery(e.target.value);
    setShowSuggestions(true);
    setHighlightedIndex(-1);
  }

  function handleSearchKeyDown(e) {
    const list = query.trim() ? suggestions : recentSearches;

    if (e.key === "Escape") {
      setShowSuggestions(false);
      setHighlightedIndex(-1);
      return;
    }

    if (!showSuggestions || list.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, list.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      if (highlightedIndex >= 0 && highlightedIndex < list.length) {
        e.preventDefault();
        if (query.trim()) handleSelectSuggestion(suggestions[highlightedIndex]);
        else handleSelectRecent(recentSearches[highlightedIndex]);
      } else if (query.trim()) {
        addRecentSearch(query.trim());
        setShowSuggestions(false);
        if (searchInputRef.current) searchInputRef.current.blur();
      }
    }
  }

  // Closes the dropdown once focus leaves the whole search field wrapper
  // (input + dropdown) — checking relatedTarget (rather than just always
  // closing on blur) means clicking a suggestion itself doesn't close the
  // dropdown out from under the click before onClick fires.
  function handleSearchWrapBlur(e) {
    if (searchWrapRef.current && searchWrapRef.current.contains(e.relatedTarget)) return;
    setShowSuggestions(false);
    setHighlightedIndex(-1);
  }


  useEffect(() => {
    if (!selectedId) {
      // Closed (X button, or navigated back past the selection).
      trailerRequestId.current++; // invalidate any in-flight fetches
      detailRequestId.current++;
      episodesRequestId.current++;
      setSelectedMovie(null);
      setTrailerId(null);
      setTrailerError("");
      setTrailerLoading(false);
      setMovieDetail(null);
      setDetailError("");
      setDetailLoading(false);
      setEpisodes([]);
      setSelectedSeason(1);
      setEpisodesLoading(false);
      setSelectedPerson(null);
      pendingMovieRef.current = null;
      return;
    }

    const fromClick =
      pendingMovieRef.current?.imdbID === selectedId ? pendingMovieRef.current : null;
    pendingMovieRef.current = null;

    const known = fromClick || activeMovies.find((m) => m.imdbID === selectedId);
    if (known) {
      openResolvedMovie(known);
      return;
    }


    let cancelled = false;
    fetchOmdb(`https://www.omdbapi.com/?apikey=${API_KEY}&i=${selectedId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.Response === "False") {
          setTrailerError(data.Error || "Couldn't find that title.");
          return;
        }
        openResolvedMovie(parseDetailToMovie(data));
      })
      .catch(() => {
        if (!cancelled) setTrailerError("Couldn't load that title.");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Resolves a movie's trailer video id, sharing one cache (trailerCache)
  // across every caller: the main trailer panel below AND every
  // MovieCard's hover preview. Resolution now goes through three tiers
  // before ever touching the network: the component-scoped trailerCache
  // ref (free, but reset on reload), then the persistent localStorage
  // cache (getCachedTrailerId — free, survives reloads, shared by every
  // title this browser has ever resolved), and only then an actual
  // search.list call — routed through fetchYoutubeSearch/
  // queueYoutubeRequest so it's spaced out and backs off automatically
  // if YouTube starts returning 429s. Resolves to `null` (not a
  // rejection) when the search genuinely turns up nothing; a rejected
  // promise means the request itself failed (network error, or the
  // rate-limit cooldown is active), which callers can tell apart to show
  // a more specific error if they want to (the main trailer panel does;
  // hover previews just treat it the same as "nothing found").
  const resolveTrailerId = useCallback((movie) => {
    // Curated titles (see CURATED_TRAILER_IDS above) resolve for free,
    // every time, with zero cache lookups and zero network — checked
    // first since it's the cheapest possible path and never goes stale.
    const curated = CURATED_TRAILER_IDS[movie.imdbID];
    if (curated !== undefined) {
      trailerCache.current[movie.imdbID] = curated;
      return Promise.resolve(curated);
    }

    const cached = trailerCache.current[movie.imdbID];
    if (cached !== undefined) return Promise.resolve(cached);

    const persisted = getCachedTrailerId(movie.imdbID);
    if (persisted !== undefined) {
      trailerCache.current[movie.imdbID] = persisted;
      return Promise.resolve(persisted);
    }

    const q = encodeURIComponent(`${movie.Title} ${movie.Year} official trailer`);
    return fetchYoutubeSearch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=${q}&key=${YOUTUBE_API_KEY}`
    ).then((data) => {
      if (data && data.budgetSkipped) {
        // Today's self-imposed request budget is spent — resolve as "no
        // trailer, for now" WITHOUT writing to either cache, so this
        // title gets a real lookup (not a permanently-stuck negative)
        // the next time it's hovered/opened once the budget resets.
        return null;
      }
      const videoId =
        data.items && data.items[0] && data.items[0].id ? data.items[0].id.videoId : null;
      trailerCache.current[movie.imdbID] = videoId || null;
      setCachedTrailerId(movie.imdbID, videoId || null);
      return videoId || null;
    });
  }, []);

  // Does the actual trailer + detail fetching for a resolved movie object.
  function openResolvedMovie(movie) {
    setSelectedMovie(movie);
    // Keep the hero banner in sync with whatever title is now open, so
    // closing the trailer (X button) lands back on this title's preview
    // instead of falling back to the default browse title — this matters
    // for deep links (?movie=...) that never went through previewMovie.
    setHeroMovie(movie);
    setTrailerId(null);
    setTrailerError("");
    setSelectedPerson(null); // don't carry a cast/crew filter over to the new title

    // Logs this as "watched" the moment its trailer is opened — the
    // closest proxy this app has to real playback progress, since what's
    // actually being opened is a trailer, not the title itself.
    recordWatch(movie);

    const requestId = ++trailerRequestId.current;
    const cached = trailerCache.current[movie.imdbID];

    if (cached !== undefined) {
      setTrailerId(cached);
      setTrailerLoading(false);
      if (cached === null) setTrailerError("No trailer found for this title.");
    } else {
      setTrailerLoading(true);
      resolveTrailerId(movie)
        .then((videoId) => {
          if (requestId !== trailerRequestId.current) return; // a newer click superseded this one
          setTrailerId(videoId);
          if (!videoId) setTrailerError("No trailer found for this title.");
        })
        .catch(() => {
          if (requestId !== trailerRequestId.current) return;
          setTrailerError("Couldn't load the trailer. Try again.");
        })
        .finally(() => {
          if (requestId === trailerRequestId.current) setTrailerLoading(false);
        });
    }

    fetchDetail(movie);
  }

  // --- Title details (rating, runtime, cast, plot, genres, episodes) ---
  function fetchDetail(movie) {
    setMovieDetail(null);
    setDetailError("");
    setEpisodes([]);
    setSelectedSeason(1);

    const cached = detailCache.current[movie.imdbID];
    if (cached !== undefined) {
      detailRequestId.current++; // invalidate any in-flight fetch from a previous click
      setDetailLoading(false);
      if (cached === null) {
        setDetailError("Couldn't load details for this title.");
      } else {
        setMovieDetail(cached);
        if (cached.Type === "series" && cached.totalSeasons && cached.totalSeasons !== "N/A") {
          fetchEpisodes(movie.imdbID, 1);
        }
      }
      return;
    }

    // Fall back to the persistent (localStorage) detail cache before
    // hitting the network — this is what makes reopening a title's
    // trailer/"More Info" panel free after a page reload instead of
    // spending another request on a title already looked up recently.
    const persisted = getCachedDetail(movie.imdbID);
    if (persisted) {
      detailCache.current[movie.imdbID] = persisted;
      detailRequestId.current++; // invalidate any in-flight fetch from a previous click
      setDetailLoading(false);
      setMovieDetail(persisted);
      if (persisted.Type === "series" && persisted.totalSeasons && persisted.totalSeasons !== "N/A") {
        fetchEpisodes(movie.imdbID, 1);
      }
      return;
    }

    const requestId = ++detailRequestId.current;
    setDetailLoading(true);

    fetchOmdb(`https://www.omdbapi.com/?apikey=${API_KEY}&i=${movie.imdbID}&plot=full`)
      .then((res) => res.json())
      .then((data) => {
        if (requestId !== detailRequestId.current) return; // a newer click superseded this one
        if (data.Response === "False") {
          detailCache.current[movie.imdbID] = null;
          setDetailError(data.Error || "Couldn't load details for this title.");
          return;
        }
        detailCache.current[movie.imdbID] = data;
        setCachedDetail(movie.imdbID, data);
        setMovieDetail(data);
        if (data.Type === "series" && data.totalSeasons && data.totalSeasons !== "N/A") {
          fetchEpisodes(movie.imdbID, 1);
        }
      })
      .catch(() => {
        if (requestId !== detailRequestId.current) return;
        setDetailError("Couldn't load details for this title.");
      })
      .finally(() => {
        if (requestId === detailRequestId.current) setDetailLoading(false);
      });
  }

  function fetchEpisodes(imdbID, season) {
    const cacheKey = `${imdbID}:${season}`;
    const cached = episodesCache.current[cacheKey];
    if (cached !== undefined) {
      episodesRequestId.current++; // invalidate any in-flight fetch for a different season
      setEpisodes(cached);
      setEpisodesLoading(false);
      return;
    }

    const requestId = ++episodesRequestId.current;
    setEpisodesLoading(true);

    fetchOmdb(`https://www.omdbapi.com/?apikey=${API_KEY}&i=${imdbID}&Season=${season}`)
      .then((res) => res.json())
      .then((data) => {
        if (requestId !== episodesRequestId.current) return;
        const list = data.Response !== "False" && data.Episodes ? data.Episodes : [];
        episodesCache.current[cacheKey] = list;
        setEpisodes(list);
      })
      .catch(() => {
        if (requestId !== episodesRequestId.current) return;
        episodesCache.current[cacheKey] = [];
        setEpisodes([]);
      })
      .finally(() => {
        if (requestId === episodesRequestId.current) setEpisodesLoading(false);
      });
  }

  function handleSeasonChange(season) {
    const s = Number(season);
    setSelectedSeason(s);
    if (selectedMovie) fetchEpisodes(selectedMovie.imdbID, s);
  }


  function closeTrailer() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("movie");
        return next;
      },
      { replace: true }
    );
  }


  const similarTitles = useMemo(() => {
    if (!movieDetail || !movieDetail.Genre || movieDetail.Genre === "N/A") return [];

    const targetGenres = new Set(
      movieDetail.Genre.split(",").map((g) => g.trim()).filter(Boolean)
    );
    if (targetGenres.size === 0) return [];

    const targetDirector =
      movieDetail.Director && movieDetail.Director !== "N/A"
        ? movieDetail.Director.trim()
        : null;

    // Same reasoning as topTrending above: similarPool is excluded entirely
    // in Kids mode rather than relied on to "genre-filter down" safely.
    const similarSource = kidsMode
      ? [...browseMovies, ...movies]
      : [...browseMovies, ...similarPool, ...movies];
    const candidates = new Map();
    similarSource.forEach((m) => {
      if (m.imdbID && m.Genre && !candidates.has(m.imdbID)) {
        if (kidsMode && !isKidSafe(m)) return;
        if (dislikedIds.has(m.imdbID)) return;
        candidates.set(m.imdbID, m);
      }
    });
    candidates.delete(movieDetail.imdbID);

    const scored = [];
    candidates.forEach((m) => {
      const genres = m.Genre.split(",").map((g) => g.trim()).filter(Boolean);
      const shared = genres.filter((g) => targetGenres.has(g)).length;
      if (shared === 0) return;
      const directorBonus = targetDirector && m.Director === targetDirector ? 1 : 0;
      const likeBonus = likedIds.has(m.imdbID) ? LIKE_SCORE_BONUS : 0;
      scored.push({ movie: m, score: shared + directorBonus + likeBonus });
    });

    scored.sort(
      (a, b) => b.score - a.score || (b.movie.imdbRating ?? -1) - (a.movie.imdbRating ?? -1)
    );

    return scored.slice(0, 10).map((s) => s.movie);
  }, [movieDetail, browseMovies, similarPool, movies, kidsMode, dislikedIds, likedIds]);


  const personTitles = useMemo(() => {
    if (!selectedPerson) return [];
    const target = selectedPerson.trim().toLowerCase();
    if (!target) return [];

    // Same reasoning as topTrending above: similarPool is excluded entirely
    // in Kids mode rather than relied on to "genre-filter down" safely.
    const personSource = kidsMode
      ? [...browseMovies, ...movies]
      : [...browseMovies, ...similarPool, ...movies];
    const candidates = new Map();
    personSource.forEach((m) => {
      if (m.imdbID && !candidates.has(m.imdbID)) {
        if (kidsMode && !isKidSafe(m)) return;
        candidates.set(m.imdbID, m);
      }
    });
    if (movieDetail) candidates.delete(movieDetail.imdbID);

    const matches = [];
    candidates.forEach((m) => {
      const actors = m.Actors ? m.Actors.split(",").map((n) => n.trim().toLowerCase()) : [];
      const directors = m.Director
        ? m.Director.split(",").map((n) => n.trim().toLowerCase())
        : [];
      if (actors.includes(target) || directors.includes(target)) matches.push(m);
    });

    matches.sort((a, b) => (b.imdbRating ?? -1) - (a.imdbRating ?? -1));
    return matches;
  }, [selectedPerson, browseMovies, similarPool, movies, movieDetail, kidsMode]);


  useEffect(() => {
    if (!selectedPerson) {
      personInfoRequestId.current++;
      setPersonInfo(null);
      setPersonInfoLoading(false);
      return;
    }

    const cached = personInfoCache.current[selectedPerson];
    if (cached !== undefined) {
      personInfoRequestId.current++;
      setPersonInfo(cached);
      setPersonInfoLoading(false);
      return;
    }

    const requestId = ++personInfoRequestId.current;
    setPersonInfo(null);
    setPersonInfoLoading(true);

    fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(selectedPerson)}`
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (requestId !== personInfoRequestId.current) return;
        if (!data || data.type === "disambiguation") {
          personInfoCache.current[selectedPerson] = null;
          setPersonInfo(null);
          return;
        }
        const info = {
          extract: data.extract || "",
          description: data.description || "",
          thumbnail: data.thumbnail ? data.thumbnail.source : null,
          pageUrl:
            data.content_urls && data.content_urls.desktop
              ? data.content_urls.desktop.page
              : null,
        };
        personInfoCache.current[selectedPerson] = info;
        setPersonInfo(info);
      })
      .catch(() => {
        if (requestId !== personInfoRequestId.current) return;
        personInfoCache.current[selectedPerson] = null;
        setPersonInfo(null);
      })
      .finally(() => {
        if (requestId === personInfoRequestId.current) setPersonInfoLoading(false);
      });
  }, [selectedPerson]);


  function renderPeopleList(namesStr) {
    const names = namesStr
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);

    return names.map((name, i) => (
      <span key={name}>
        <button
          type="button"
          className={`movie-search__person-link ${
            selectedPerson && selectedPerson.toLowerCase() === name.toLowerCase()
              ? "is-active"
              : ""
          }`}
          onClick={() =>
            setSelectedPerson((p) =>
              p && p.toLowerCase() === name.toLowerCase() ? null : name
            )
          }
        >
          {name}
        </button>
        {i < names.length - 1 ? ", " : ""}
      </span>
    ));
  }

  return (
    <div className={`movie-search ${kidsMode ? "movie-search--kids" : ""}`}>
      <h1 className="movie-search__title">
        <span className="movie-search__title-text">
          {kidsMode ? "Kids Movie Search" : "Movie Search"}
          {kidsMode && <span className="movie-search__kids-badge">KIDS</span>}
        </span>
      </h1>

      <div className="movie-search__controls">
        <div className="movie-search__search-row">
          <div
            className="movie-search__search-field"
            ref={searchWrapRef}
            onBlur={handleSearchWrapBlur}
          >
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={handleQueryChange}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={handleSearchKeyDown}
              placeholder={
                kidsMode ? "Search for a kid-friendly movie, e.g. Shrek" : "Search for a movie, e.g. Inception"
              }
              className="movie-search__input"
              role="combobox"
              aria-expanded={showSuggestions}
              aria-haspopup="listbox"
              aria-controls="movie-search-suggestions"
              aria-autocomplete="list"
              aria-activedescendant={
                highlightedIndex >= 0 ? `movie-search-suggestion-${highlightedIndex}` : undefined
              }
              autoComplete="off"
            />

            {showSuggestions &&
              (query.trim()
                ? loading || suggestions.length > 0
                : recentSearches.length > 0) && (
                <div
                  id="movie-search-suggestions"
                  className="movie-search__suggestions"
                  role="listbox"
                >
                  {query.trim() ? (
                    suggestions.length === 0 ? (
                      <div className="movie-search__suggestions-status">Searching…</div>
                    ) : (
                      suggestions.map((m, i) => (
                        <div
                          key={m.imdbID}
                          id={`movie-search-suggestion-${i}`}
                          role="option"
                          aria-selected={highlightedIndex === i}
                          className={`movie-search__suggestion ${
                            highlightedIndex === i ? "is-highlighted" : ""
                          }`}
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => setHighlightedIndex(i)}
                          onClick={() => handleSelectSuggestion(m)}
                        >
                          <div className="movie-search__suggestion-poster">
                            {m.Poster && m.Poster !== "N/A" ? (
                              <img src={m.Poster} alt="" loading="lazy" decoding="async" />
                            ) : (
                              <div
                                className="movie-search__suggestion-poster-placeholder"
                                aria-hidden="true"
                              />
                            )}
                          </div>
                          <div className="movie-search__suggestion-info">
                            <p className="movie-search__suggestion-title">{m.Title}</p>
                            <p className="movie-search__suggestion-meta">
                              {m.Year} · {m.Type}
                            </p>
                          </div>
                        </div>
                      ))
                    )
                  ) : (
                    <>
                      <div className="movie-search__suggestions-header">
                        <span>Recent searches</span>
                        <button
                          type="button"
                          className="movie-search__suggestions-clear"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={clearRecentSearches}
                        >
                          Clear
                        </button>
                      </div>
                      {recentSearches.map((term, i) => (
                        <div
                          key={term}
                          id={`movie-search-suggestion-${i}`}
                          role="option"
                          aria-selected={highlightedIndex === i}
                          className={`movie-search__suggestion movie-search__suggestion--recent ${
                            highlightedIndex === i ? "is-highlighted" : ""
                          }`}
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => setHighlightedIndex(i)}
                          onClick={() => handleSelectRecent(term)}
                        >
                          <span className="movie-search__suggestion-recent-icon" aria-hidden="true">
                            ⏱
                          </span>
                          <span className="movie-search__suggestion-title">{term}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
          </div>

          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            className={`movie-search__filter-toggle ${activeFilterCount ? "is-active" : ""}`}
          >
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
        </div>

        {showFilters && (
          <div className="movie-search__filters">
            <label className="movie-search__filter-field">
              <span>Type</span>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>

            <label className="movie-search__filter-field">
              <span>Genre {enriching && <em className="movie-search__hint">(loading…)</em>}</span>
              <select value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)}>
                {genreOptions.map((g) => (
                  <option key={g || "all"} value={g}>{g || "All genres"}</option>
                ))}
              </select>
            </label>

            <label className="movie-search__filter-field">
              <span>Language {enriching && <em className="movie-search__hint">(loading…)</em>}</span>
              <select value={languageFilter} onChange={(e) => setLanguageFilter(e.target.value)}>
                {languageOptions.map((l) => (
                  <option key={l || "all"} value={l}>{l || "All languages"}</option>
                ))}
              </select>
            </label>

            <label className="movie-search__filter-field">
              <span>Year from</span>
              <input
                type="number"
                value={yearMin}
                onChange={(e) => setYearMin(e.target.value)}
                placeholder="e.g. 1990"
              />
            </label>

            <label className="movie-search__filter-field">
              <span>Year to</span>
              <input
                type="number"
                value={yearMax}
                onChange={(e) => setYearMax(e.target.value)}
                placeholder="e.g. 2026"
              />
            </label>

            <label className="movie-search__filter-field">
              <span>Sort by</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>

            {activeFilterCount > 0 && (
              <button type="button" className="movie-search__clear" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {featuredMovie && !selectedMovie && (
        <HeroBanner
          movie={featuredMovie}
          truncatePlot={truncatePlot}
          // "Featured Today" only describes the curated default pick —
          // once a movie has been clicked to preview, the banner is
          // showing that title, not today's pick, so the eyebrow drops.
          isDefaultFeatured={!heroMovie}
          onPlay={() => openMovie(featuredMovie)}
          onMoreInfo={() => openInfo(featuredMovie)}
          isInList={isInList(featuredMovie.imdbID)}
          onToggleList={() => toggleInList(featuredMovie)}
          myRating={getRating(featuredMovie.imdbID)}
          onLike={() => toggleLike(featuredMovie)}
          onDislike={() => toggleDislike(featuredMovie)}
        />
      )}

      {infoMovie && (
        <MovieInfoModal
          movie={infoMovie}
          detail={movieDetail}
          loading={detailLoading}
          error={detailError}
          onClose={closeInfo}
          onPlayTrailer={() => openMovie(infoMovie)}
          selectedPerson={selectedPerson}
          onSelectPerson={(name) =>
            setSelectedPerson((p) =>
              p && p.toLowerCase() === name.toLowerCase() ? null : name
            )
          }
          personInfo={personInfo}
          personInfoLoading={personInfoLoading}
          personTitles={personTitles}
          similarTitles={similarTitles}
          onSelectSimilar={previewMovie}
          episodes={episodes}
          selectedSeason={selectedSeason}
          episodesLoading={episodesLoading}
          onSeasonChange={handleSeasonChange}
          isInList={isInList(infoMovie.imdbID)}
          onToggleList={() => toggleInList(infoMovie)}
          myRating={getRating(infoMovie.imdbID)}
          onLike={() => toggleLike(infoMovie)}
          onDislike={() => toggleDislike(infoMovie)}
        />
      )}

      {selectedMovie && (
        <div className="movie-search__trailer" ref={trailerSectionRef}>
          <div className="movie-search__trailer-header">
            <h2>
              {selectedMovie.Title}{" "}
              <span className="movie-search__trailer-year">({selectedMovie.Year})</span>
            </h2>
            <button
              type="button"
              className="movie-search__trailer-close"
              onClick={closeTrailer}
              aria-label="Close trailer"
            >
              ✕
            </button>
          </div>
          <div className="movie-search__trailer-frame">
            {trailerLoading && (
              <div
                className="movie-search__trailer-frame--skeleton"
                role="status"
                aria-label="Loading trailer"
              />
            )}
            {!trailerLoading && trailerError && (
              <div className="movie-search__trailer-status">{trailerError}</div>
            )}
            {!trailerLoading && !trailerError && trailerId && (
              <iframe
                key={trailerId}
                src={`https://www.youtube.com/embed/${trailerId}?autoplay=1`}
                title={`${selectedMovie.Title} trailer`}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            )}
          </div>

          <div className="movie-search__detail">
            {detailLoading && (
              <div
                className="movie-search__detail-skeleton"
                role="status"
                aria-label="Loading details"
              >
                <div className="movie-search__detail-skeleton-main">
                  <div className="movie-search__detail-skeleton-pills">
                    <span className="skeleton-pill" />
                    <span className="skeleton-pill" />
                    <span className="skeleton-pill" />
                  </div>
                  <div className="skeleton-line skeleton-line--plot" />
                  <div className="skeleton-line skeleton-line--plot" />
                  <div className="skeleton-line skeleton-line--plot-short" />
                </div>
                <div className="movie-search__detail-skeleton-facts">
                  <div className="skeleton-line skeleton-line--fact" />
                  <div className="skeleton-line skeleton-line--fact" />
                  <div className="skeleton-line skeleton-line--fact" />
                </div>
              </div>
            )}
            {!detailLoading && detailError && (
              <p className="movie-search__detail-status">{detailError}</p>
            )}
            {!detailLoading && !detailError && movieDetail && (
              <>
                <div className="movie-search__detail-body">
                  <div className="movie-search__detail-main">
                    <div className="movie-search__detail-meta">
                      {movieDetail.Year && movieDetail.Year !== "N/A" && (
                        <span>{movieDetail.Year}</span>
                      )}
                      {movieDetail.Type === "series" &&
                        movieDetail.totalSeasons &&
                        movieDetail.totalSeasons !== "N/A" && (
                          <span>
                            {movieDetail.totalSeasons} Season
                            {movieDetail.totalSeasons === "1" ? "" : "s"}
                          </span>
                        )}
                      {movieDetail.Runtime && movieDetail.Runtime !== "N/A" && (
                        <span>{movieDetail.Runtime}</span>
                      )}
                      {movieDetail.Rated && movieDetail.Rated !== "N/A" && (
                        <span className="movie-search__badge">{movieDetail.Rated}</span>
                      )}
                      {movieDetail.imdbRating && movieDetail.imdbRating !== "N/A" && (
                        <span className="movie-search__badge movie-search__badge--gold">
                          ★ {movieDetail.imdbRating}
                        </span>
                      )}
                    </div>

                    {movieDetail.Plot && movieDetail.Plot !== "N/A" && (
                      <p className="movie-search__detail-plot">
                        {truncatePlot(movieDetail.Plot)}
                      </p>
                    )}
                  </div>

                  <div className="movie-search__detail-facts">
                    {movieDetail.Actors && movieDetail.Actors !== "N/A" && (
                      <p>
                        <span className="movie-search__detail-label">Cast:</span>{" "}
                        {renderPeopleList(movieDetail.Actors)}
                      </p>
                    )}
                    {movieDetail.Genre && movieDetail.Genre !== "N/A" && (
                      <p>
                        <span className="movie-search__detail-label">Genres:</span>{" "}
                        {movieDetail.Genre}
                      </p>
                    )}
                    {movieDetail.Director && movieDetail.Director !== "N/A" && (
                      <p>
                        <span className="movie-search__detail-label">Director:</span>{" "}
                        {renderPeopleList(movieDetail.Director)}
                      </p>
                    )}
                  </div>
                </div>

                {selectedPerson && (
                  <div className="movie-search__person">
                    <div className="movie-search__person-header">
                      <h3 className="movie-search__person-title">
                        More with {selectedPerson}
                      </h3>
                      <button
                        type="button"
                        className="movie-search__person-close"
                        onClick={() => setSelectedPerson(null)}
                        aria-label={`Clear ${selectedPerson} filter`}
                      >
                        ✕
                      </button>
                    </div>

                    {personInfoLoading && (
                      <div
                        className="movie-search__person-bio"
                        role="status"
                        aria-label={`Loading info about ${selectedPerson}`}
                      >
                        <div className="movie-search__person-bio-photo movie-search__person-bio-photo--skeleton" />
                        <div className="movie-search__person-bio-text">
                          <div className="skeleton-line skeleton-line--plot" />
                          <div className="skeleton-line skeleton-line--plot" />
                          <div className="skeleton-line skeleton-line--plot-short" />
                        </div>
                      </div>
                    )}

                    {!personInfoLoading && personInfo && (
                      <div className="movie-search__person-bio">
                        {personInfo.thumbnail && (
                          <img
                            className="movie-search__person-bio-photo"
                            src={personInfo.thumbnail}
                            alt={selectedPerson}
                            loading="lazy"
                            decoding="async"
                          />
                        )}
                        <div className="movie-search__person-bio-text">
                          {personInfo.description && (
                            <p className="movie-search__person-bio-desc">
                              {personInfo.description}
                            </p>
                          )}
                          {personInfo.extract && (
                            <p className="movie-search__person-bio-extract">
                              {personInfo.extract}
                            </p>
                          )}
                          {personInfo.pageUrl && (
                            <a
                              className="movie-search__person-bio-link"
                              href={personInfo.pageUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              More on Wikipedia ↗
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    {!personInfoLoading && !personInfo && (
                      <p className="movie-search__detail-status">
                        No info found for {selectedPerson}.
                      </p>
                    )}

                    {personTitles.length > 0 && (
                      <div className="movie-search__similar-row">
                        {personTitles.map((m) =>
                          renderPosterCard(m, () => {
                            setSelectedPerson(null);
                            previewMovie(m);
                          })
                        )}
                      </div>
                    )}
                  </div>
                )}

                {movieDetail.Type === "series" &&
                  movieDetail.totalSeasons &&
                  movieDetail.totalSeasons !== "N/A" && (
                    <div className="movie-search__episodes">
                      <div className="movie-search__episodes-header">
                        <h3>Episodes</h3>
                        <select
                          value={selectedSeason}
                          onChange={(e) => handleSeasonChange(e.target.value)}
                        >
                          {Array.from(
                            { length: parseInt(movieDetail.totalSeasons, 10) },
                            (_, i) => i + 1
                          ).map((s) => (
                            <option key={s} value={s}>
                              Season {s}
                            </option>
                          ))}
                        </select>
                      </div>

                      {episodesLoading && (
                        <p className="movie-search__detail-status">Loading episodes…</p>
                      )}

                      {!episodesLoading && episodes.length > 0 && (
                        <ul className="movie-search__episode-list">
                          {episodes.map((ep) => (
                            <li key={ep.imdbID || ep.Episode} className="movie-search__episode">
                              <span className="movie-search__episode-number">
                                {ep.Episode}
                              </span>
                              <div className="movie-search__episode-info">
                                <p className="movie-search__episode-title">{ep.Title}</p>
                                <p className="movie-search__episode-meta">
                                  {ep.Released && ep.Released !== "N/A" ? ep.Released : ""}
                                  {ep.imdbRating && ep.imdbRating !== "N/A"
                                    ? ` · ★ ${ep.imdbRating}`
                                    : ""}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}

                      {!episodesLoading && episodes.length === 0 && (
                        <p className="movie-search__detail-status">
                          No episode data for this season.
                        </p>
                      )}
                    </div>
                  )}

                {similarTitles.length > 0 && (
                  <div className="movie-search__similar">
                    <h3 className="movie-search__similar-title">You Might Also Like</h3>
                    <div className="movie-search__similar-row">
                      {similarTitles.map((m) => renderPosterCard(m, () => previewMovie(m)))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {!searched && !activeLoading && visibleContinueWatching.length > 0 && (
        <div className="movie-search__row-section">
          <h2 className="movie-search__section-title">
            Continue Watching{activeProfile ? ` for ${activeProfile.name}` : ""}
          </h2>
          <div className="movie-search__row-track">
            {visibleContinueWatching.map((movie) => (
              <MovieCard
                key={movie.imdbID}
                movie={movie}
                variant="row"
                onSelect={() => openMovie(movie)}
                onPlay={() => openMovie(movie)}
                onRemove={() => removeFromHistory(movie.imdbID)}
                resolveTrailerId={resolveTrailerId}
                isInList={isInList(movie.imdbID)}
                onToggleList={toggleInList}
                myRating={getRating(movie.imdbID)}
                onLike={toggleLike}
                onDislike={toggleDislike}
              />
            ))}
          </div>
        </div>
      )}

      {!searched && !activeLoading && visibleMyList.length > 0 && (
        <div className="movie-search__row-section">
          <h2 className="movie-search__section-title">My List</h2>
          <div className="movie-search__row-track">
            {visibleMyList.map((movie) => (
              <MovieCard
                key={movie.imdbID}
                movie={movie}
                variant="row"
                onSelect={() => previewMovie(movie)}
                onPlay={() => openMovie(movie)}
                resolveTrailerId={resolveTrailerId}
                isInList={isInList(movie.imdbID)}
                onToggleList={toggleInList}
                myRating={getRating(movie.imdbID)}
                onLike={toggleLike}
                onDislike={toggleDislike}
              />
            ))}
          </div>
        </div>
      )}

      {!searched && !activeLoading &&
        becauseYouWatchedRows.map((row) => (
          <div className="movie-search__row-section" key={row.seedId}>
            <h2 className="movie-search__section-title">Because You Watched {row.seedTitle}</h2>
            <div className="movie-search__row-track">
              {row.movies.map((movie) => (
                <MovieCard
                  key={movie.imdbID}
                  movie={movie}
                  variant="row"
                  onSelect={previewMovie}
                  onPlay={openMovie}
                  resolveTrailerId={resolveTrailerId}
                  isInList={isInList(movie.imdbID)}
                  onToggleList={toggleInList}
                  myRating={getRating(movie.imdbID)}
                  onLike={toggleLike}
                  onDislike={toggleDislike}
                />
              ))}
            </div>
          </div>
        ))}

      {!searched && !activeLoading && topTrending.length > 0 && (
        <div className="movie-search__trending">
          <h2 className="movie-search__section-title">
            {kidsMode ? "Top 10 Kids' Picks Today" : "Top 10 Today"}
          </h2>
          <div className="movie-search__trending-row">
            {topTrending.map((movie, i) => (
              <div
                key={movie.imdbID}
                className="movie-search__trending-item"
                onClick={() => previewMovie(movie)}
                role="button"
                tabIndex={0}
                aria-label={`Preview ${movie.Title}, ranked number ${i + 1}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    previewMovie(movie);
                  }
                }}
              >
                <span className="movie-search__trending-rank" aria-hidden="true">
                  {i + 1}
                </span>
                <div className="movie-search__trending-poster-col">
                  <div className="movie-search__trending-poster-wrap">
                    <div className="movie-search__trending-poster">
                      {movie.Poster !== "N/A" ? (
                        <img
                          src={movie.Poster}
                          alt={movie.Title}
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="movie-search__similar-poster-placeholder">No image</div>
                      )}
                    </div>
                  </div>
                  <p className="movie-search__trending-title">{movie.Title}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!searched && !activeLoading && showRows &&
        genreRows.map((row) => (
          <div className="movie-search__row-section" key={row.genre}>
            <div className="movie-search__row-header">
              <h2 className="movie-search__section-title">{row.genre}</h2>
              <button
                type="button"
                className="movie-search__row-seeall"
                onClick={() => browseGenre(row.genre)}
              >
                See All ›
              </button>
            </div>
            <div className="movie-search__row-track">
              {row.movies.map((movie) => (
                <MovieCard
                  key={movie.imdbID}
                  movie={movie}
                  variant="row"
                  isFeatured={!selectedMovie && featuredMovie?.imdbID === movie.imdbID}
                  onSelect={previewMovie}
                  onPlay={openMovie}
                  resolveTrailerId={resolveTrailerId}
                  isInList={isInList(movie.imdbID)}
                  onToggleList={toggleInList}
                  myRating={getRating(movie.imdbID)}
                  onLike={toggleLike}
                  onDislike={toggleDislike}
                />
              ))}
            </div>
          </div>
        ))}

      {/* Everything that didn't make it into a genre shelf above (see
          leftoverMovies) — every browse title still shows up somewhere on
          the page exactly once, it just lands here, below the last
          category, instead of being dropped or duplicated across rows. */}
      {!searched && !activeLoading && showRows && leftoverMovies.length > 0 && (
        <div className="movie-search__row-section">
          <h2 className="movie-search__section-title">
            {kidsMode ? "More Kids' Picks" : "More Movies"}
          </h2>
          <div className="movie-search__grid">
            {leftoverMovies.map((movie) => (
              <MovieCard
                key={movie.imdbID}
                movie={movie}
                variant="grid"
                isFeatured={!selectedMovie && featuredMovie?.imdbID === movie.imdbID}
                onSelect={previewMovie}
                onPlay={openMovie}
                resolveTrailerId={resolveTrailerId}
                isInList={isInList(movie.imdbID)}
                onToggleList={toggleInList}
                myRating={getRating(movie.imdbID)}
                onLike={toggleLike}
                onDislike={toggleDislike}
              />
            ))}
          </div>
        </div>
      )}

      {!searched && !activeLoading && !showRows && (
        <h2 className="movie-search__section-title">
          {kidsMode ? "Kids' Picks" : "Popular Right Now"}
        </h2>
      )}

      {!searched && !activeLoading && browseWarning && (
        <p className="movie-search__status" role="status">
          {browseWarning}
        </p>
      )}

      {activeLoading && (
        <div className="movie-search__grid">
          {Array.from({ length: searched ? 8 : BROWSE_SKELETON_COUNT }).map((_, i) => (
            <div key={i} className="movie-card movie-card--skeleton">
              <div className="movie-card__poster movie-card__poster--skeleton" />
              <div className="movie-card__info">
                <div className="skeleton-line skeleton-line--title" />
                <div className="skeleton-line skeleton-line--meta" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!activeLoading && searched && error && <p className="movie-search__status">{error}</p>}

      {!activeLoading && !error && !showRows && filteredMovies.length === 0 && activeMovies.length > 0 && (
        <p className="movie-search__status">
          {kidsMode
            ? "No kid-friendly matches found. Try a different search."
            : "No results match your filters. Try widening the year range or clearing a filter."}
        </p>
      )}

      {!activeLoading && !error && !showRows && filteredMovies.length > 0 && (
        <div className="movie-search__grid">
          {filteredMovies.map((movie, index) => (
            <MovieCard
              key={movie.imdbID}
              movie={movie}
              variant="grid"
              eagerImage={index < 4}
              isFeatured={!selectedMovie && featuredMovie?.imdbID === movie.imdbID}
              onSelect={previewMovie}
              onPlay={openMovie}
              resolveTrailerId={resolveTrailerId}
              isInList={isInList(movie.imdbID)}
              onToggleList={toggleInList}
              myRating={getRating(movie.imdbID)}
              onLike={toggleLike}
              onDislike={toggleDislike}
            />
          ))}
        </div>
      )}

      {!activeLoading && !searched && !showRows && genreFilterCapped && (
        <p className="movie-search__status" role="status">
          Showing the first {AUTO_LOAD_TARGET_COUNT} {genreFilter} titles found. Clear the
          filter to keep browsing everything else.
        </p>
      )}

      {hasMore && (
        // No visible button anymore — this div stays only as the
        // IntersectionObserver's scroll target (see the effect above),
        // so scrolling near the bottom still auto-loads the next batch.
        // The status text is the only thing rendered, and only while a
        // batch is actually in flight.
        <div className="movie-search__load-more" ref={loadMoreSentinelRef}>
          {loadingMoreAny && (
            <span className="movie-search__load-more-status" role="status">
              Loading more…
            </span>
          )}
        </div>
      )}

      {!activeLoading && searched && searchExhausted && movies.length > 0 && movies.length < totalResults && (
        <p className="movie-search__status" role="status">
          That's as far as OMDb's search results go for this query — try narrowing your search
          to find more specific titles.
        </p>
      )}

      {!activeLoading && searched && !searchExhausted && searchCapped && movies.length < totalResults && (
        <p className="movie-search__status" role="status">
          Showing the first {AUTO_LOAD_TARGET_COUNT} of {totalResults} results — narrow your
          search to find more specific titles.
        </p>
      )}

      {!activeLoading && !searched && !error && activeMovies.length === 0 && (
        <p className="movie-search__status">
          Search for a movie title to get started.
        </p>
      )}
    </div>
  );
}