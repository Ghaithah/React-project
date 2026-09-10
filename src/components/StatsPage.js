import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWatchHistory } from './WatchHistoryContext';
import { useMyList } from './MyListContext';
import { useRatings } from './RatingsContext';
import { useAuth } from './AuthContext';
import { useProfiles } from './ProfileContext';
import MovieCard from './MovieCard';
import './StatsPage.css';

// How many genre bars to show. Netflix's own "Year in Review"-style
// recaps favor a short, skimmable list over an exhaustive breakdown —
// five is enough to say something about taste without turning into a
// wall of thin bars for genres with a single title in them.
const TOP_GENRE_COUNT = 5;

function decadeLabel(year) {
  const decade = Math.floor(year / 10) * 10;
  return `${decade}s`;
}

// =============================================================================
// "Your Taste, In One Line" — a single Gemini-generated one-liner that
// lightly roasts this profile's own genre/decade/like-ratio breakdown
// below. Same client-side Gemini pattern MovieChatBot.js already uses
// (see that file's own top-of-file comment for the tradeoffs of a
// browser-side key), but deliberately a SEPARATE, much simpler call
// here rather than reusing or extracting that file's retry/model-
// cascade machinery: the roast is a low-stakes, decorative "nice to
// have," not core chat functionality, so it's not worth the risk of
// destabilizing that more carefully-tuned logic just to share a few
// lines of fetch boilerplate. One fallback model and no backoff retries
// is enough — if both attempts fail, templatedRoast() below covers it
// exactly the way offlineReply() covers MovieChatBot's own Gemini
// outages, just with a much smaller joke book.
// =============================================================================

const GEMINI_API_KEY = process.env.REACT_APP_GEMINI_API_KEY;
const GEMINI_MODEL = process.env.REACT_APP_GEMINI_MODEL || 'gemini-3.5-flash';
const GEMINI_MODEL_FALLBACK = 'gemini-flash-latest';

function geminiEndpointFor(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

async function callGeminiOnce(model, prompt) {
  const res = await fetch(`${geminiEndpointFor(model)}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        // Higher temperature than MovieChatBot's own calls — this is a
        // one-off playful line, not a factual answer, so more variety
        // between refreshes ("🔄 New take") is a feature, not a risk.
        temperature: 0.9,
        maxOutputTokens: 200,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (!res.ok) {
    const err = new Error(`gemini-http-${res.status}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('gemini-empty-response');
  // Gemini sometimes wraps a short line in quotes even when told not
  // to — stripped here rather than fought harder for in the prompt.
  return text.trim().replace(/^["'“]+|["'”]+$/g, '');
}

async function callGeminiTasteRoast(prompt) {
  if (!GEMINI_API_KEY) throw new Error('missing-api-key');
  try {
    return await callGeminiOnce(GEMINI_MODEL, prompt);
  } catch {
    // Exactly one fallback attempt, on a different model — see this
    // section's top comment for why this doesn't reuse MovieChatBot's
    // fuller RETRY_CONFIG/model-cascade approach.
    return await callGeminiOnce(GEMINI_MODEL_FALLBACK, prompt);
  }
}

function buildRoastPrompt({ topGenres, favoriteDecade, likeRatio, likedCount, lovedTitleNames }) {
  const bits = [
    `Top genres, most-watched first: ${topGenres.map(([g]) => g).join(', ') || 'no clear pattern yet'}`,
    favoriteDecade ? `Favorite decade: ${favoriteDecade}` : null,
    likeRatio != null ? `Like ratio: ${likeRatio}% (liked ${likedCount} titles rated so far)` : null,
    lovedTitleNames.length > 0 ? `A few titles they loved: ${lovedTitleNames.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    "You are a witty, warm friend lightly roasting someone's movie/TV taste based on the stats " +
    'below. Reply with exactly ONE short sentence (under 25 words) — playful and affectionate, ' +
    'never mean-spirited, and specific to what these numbers actually say, not a generic joke ' +
    'that could apply to anyone. Reply with ONLY the one-liner itself: plain text, no quotation ' +
    'marks, no markdown, no preamble.\n\n' +
    bits
  );
}

// Used when there's no API key configured, or every Gemini attempt above
// fails — a small, deterministic joke book keyed off the same stats the
// prompt above would have used, so the section never just goes blank.
function templatedRoast({ topGenres, favoriteDecade, likeRatio }) {
  const genre = topGenres.length > 0 ? topGenres[0][0] : null;
  if (!genre) return "Your taste is still a mystery — even to us.";

  const decadeBit = favoriteDecade ? `, with a soft spot for the ${favoriteDecade}` : '';
  const ratioBit =
    likeRatio != null && likeRatio >= 80
      ? ' You basically like everything — very generous of you.'
      : likeRatio != null && likeRatio <= 40
      ? " You're a tough critic and honestly, we respect it."
      : '';

  return `Mostly ${genre}${decadeBit} — we see you.${ratioBit}`;
}

// --- Roast caching: per-user, per-profile (same localStorage namespacing
// pattern as RatingsContext/MyListContext/WatchHistoryContext), so a
// generated line survives a page refresh instead of re-rolling (and
// re-spending API quota) every single visit. Keyed on a signature of the
// stats it was generated from, not just the profile, so a roast doesn't
// go stale the moment the underlying numbers actually change. ---
const ROAST_CACHE_KEY_PREFIX = 'movieapp_tasteRoast_';
// Backstop expiry on top of the signature check above, purely so a
// profile whose stats happen to stay perfectly static doesn't see the
// exact same line forever — a week feels about right for something this
// decorative.
const ROAST_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function roastCacheKey(user, profileId) {
  if (!user || !profileId) return null;
  return `${ROAST_CACHE_KEY_PREFIX}${user.toLowerCase()}_${profileId}`;
}

function buildInputSignature({ topGenres, favoriteDecade, likeRatio, likedCount }) {
  return JSON.stringify([topGenres.map(([g, c]) => `${g}:${c}`), favoriteDecade, likeRatio, likedCount]);
}

function loadCachedRoast(key, signature) {
  if (!key) return null;
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    if (!stored || stored.signature !== signature) return null;
    if (Date.now() - (stored.savedAt || 0) > ROAST_CACHE_TTL_MS) return null;
    return stored.text || null;
  } catch {
    return null;
  }
}

function persistRoast(key, signature, text) {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify({ signature, text, savedAt: Date.now() }));
  } catch {
    // Storage full/unavailable — the roast just regenerates next visit
    // instead of persisting; not worth surfacing an error over a
    // decorative one-liner.
  }
}

/**
 * A lightweight, always-available recap of this PROFILE's own activity —
 * not a real "year" (this app has no watch-date history, only a running
 * Continue Watching / My List / ratings state), but the same spirit:
 * a few numbers and a taste breakdown that make the app feel like it's
 * paying attention, built entirely from data this app already tracks
 * per-profile (see WatchHistoryContext.js, MyListContext.js,
 * RatingsContext.js) rather than anything new to fetch or store.
 *
 * The genre/decade breakdown and "Titles You Loved" grid can only draw
 * on titles this app actually has full details for — Continue Watching
 * and My List entries, which both store Genre/Year alongside the id
 * (see toEntry() in MyListContext.js and recordWatch() in
 * WatchHistoryContext.js). RatingsContext deliberately stores only a
 * bare `{ imdbID: 'like' | 'dislike' }` map with no title details at
 * all, so a title liked from, say, a search result that was never
 * opened or saved won't have a poster/genre to show here — the Titles
 * Liked *count* tile still reflects it, just not the grid below.
 */
export default function StatsPage() {
  const { continueWatching } = useWatchHistory();
  const { myList, isInList, toggleInList } = useMyList();
  const { getRating, toggleLike, toggleDislike, likedIds, dislikedIds } = useRatings();
  const { user } = useAuth();
  const { activeProfileId } = useProfiles();
  const navigate = useNavigate();

  function openMovie(movie) {
    navigate(`/movies?movie=${movie.imdbID}`);
  }

  // Every title this profile has full details for, deduped by imdbID —
  // the pool the genre chart, decade, and "Titles You Loved" grid all
  // draw from. A title in both Continue Watching and My List only
  // counts once; Continue Watching wins the merge since its entry is
  // usually the more recently touched of the two.
  const knownTitles = useMemo(() => {
    const pool = new Map();
    [...continueWatching, ...myList].forEach((m) => {
      if (m && m.imdbID && !pool.has(m.imdbID)) pool.set(m.imdbID, m);
    });
    return Array.from(pool.values());
  }, [continueWatching, myList]);

  const likedCount = likedIds.size;
  const dislikedCount = dislikedIds.size;
  const likeRatio =
    likedCount + dislikedCount === 0 ? null : Math.round((likedCount / (likedCount + dislikedCount)) * 100);

  const topGenres = useMemo(() => {
    const counts = new Map();
    knownTitles.forEach((m) => {
      if (!m.Genre) return;
      m.Genre.split(',')
        .map((g) => g.trim())
        .filter(Boolean)
        .forEach((g) => counts.set(g, (counts.get(g) || 0) + 1));
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_GENRE_COUNT);
  }, [knownTitles]);

  const maxGenreCount = topGenres.length > 0 ? topGenres[0][1] : 0;

  const favoriteDecade = useMemo(() => {
    const counts = new Map();
    knownTitles.forEach((m) => {
      const match = /\d{4}/.exec(m.Year || '');
      if (!match) return;
      const decade = decadeLabel(parseInt(match[0], 10));
      counts.set(decade, (counts.get(decade) || 0) + 1);
    });
    let best = null;
    counts.forEach((count, decade) => {
      if (!best || count > best.count) best = { decade, count };
    });
    return best ? best.decade : null;
  }, [knownTitles]);

  const lovedTitles = useMemo(
    () => knownTitles.filter((m) => likedIds.has(m.imdbID)),
    [knownTitles, likedIds]
  );

  const isEmpty = knownTitles.length === 0 && likedCount === 0 && dislikedCount === 0;

  // --- Taste Roast ---
  const lovedTitleNames = useMemo(
    () => lovedTitles.slice(0, 5).map((m) => m.Title).filter(Boolean),
    [lovedTitles]
  );
  const inputSignature = useMemo(
    () => buildInputSignature({ topGenres, favoriteDecade, likeRatio, likedCount }),
    [topGenres, favoriteDecade, likeRatio, likedCount]
  );
  const cacheKey = useMemo(() => roastCacheKey(user, activeProfileId), [user, activeProfileId]);

  const [roastText, setRoastText] = useState('');
  const [roastLoading, setRoastLoading] = useState(false);
  // Guards against an in-flight request from a PREVIOUS signature (e.g.
  // switching profiles, or a rating changing mid-request) resolving late
  // and overwriting a newer roast that already replaced it.
  const roastRequestIdRef = useRef(0);

  const generateRoast = useCallback(
    (force) => {
      if (topGenres.length === 0) return;
      if (!force) {
        const cached = loadCachedRoast(cacheKey, inputSignature);
        if (cached) {
          setRoastText(cached);
          return;
        }
      }

      const requestId = roastRequestIdRef.current + 1;
      roastRequestIdRef.current = requestId;
      setRoastLoading(true);

      const prompt = buildRoastPrompt({ topGenres, favoriteDecade, likeRatio, likedCount, lovedTitleNames });
      callGeminiTasteRoast(prompt)
        .then((text) => {
          if (roastRequestIdRef.current !== requestId) return; // superseded
          setRoastText(text);
          persistRoast(cacheKey, inputSignature, text);
        })
        .catch((err) => {
          if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.warn('[StatsPage] Taste roast Gemini call failed, using offline fallback:', err);
          }
          if (roastRequestIdRef.current !== requestId) return; // superseded
          const text = templatedRoast({ topGenres, favoriteDecade, likeRatio });
          setRoastText(text);
          persistRoast(cacheKey, inputSignature, text);
        })
        .finally(() => {
          if (roastRequestIdRef.current === requestId) setRoastLoading(false);
        });
    },
    [topGenres, favoriteDecade, likeRatio, likedCount, lovedTitleNames, cacheKey, inputSignature]
  );

  // Regenerates (or loads the cached line for) whenever the profile or
  // its underlying stats actually change — NOT on every render, and NOT
  // in a way a stale in-flight request from before the change can still
  // clobber (see the requestId guard above).
  useEffect(() => {
    if (topGenres.length === 0) {
      setRoastText('');
      return;
    }
    generateRoast(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, inputSignature]);

  return (
    <div className="stats-page">
      <h1 className="stats-page__title">Your Year in Review</h1>

      {isEmpty ? (
        <p className="stats-page__empty">
          Nothing to recap yet — watch a few trailers, save a title or two, and rate what you
          liked, then come back here to see it add up. <Link to="/">Start browsing</Link>
        </p>
      ) : (
        <>
          <div className="stats-page__tiles">
            <div className="stats-page__tile">
              <p className="stats-page__tile-value">{continueWatching.length}</p>
              <p className="stats-page__tile-label">Trailers Watched</p>
            </div>
            <div className="stats-page__tile">
              <p className="stats-page__tile-value">{myList.length}</p>
              <p className="stats-page__tile-label">Saved to My List</p>
            </div>
            <div className="stats-page__tile">
              <p className="stats-page__tile-value">{likedCount}</p>
              <p className="stats-page__tile-label">Titles Liked</p>
            </div>
            <div className="stats-page__tile">
              <p className="stats-page__tile-value">{likeRatio == null ? '—' : `${likeRatio}%`}</p>
              <p className="stats-page__tile-label">Like Ratio</p>
            </div>
          </div>

          {topGenres.length > 0 && (
            <section className="stats-page__section stats-page__roast">
              <div className="stats-page__roast-card">
                <p className="stats-page__roast-label">Your Taste, In One Line</p>
                {roastLoading && !roastText ? (
                  <p className="stats-page__roast-text stats-page__roast-text--loading">Thinking…</p>
                ) : (
                  <p className="stats-page__roast-text">{roastText || '—'}</p>
                )}
                <button
                  type="button"
                  className="stats-page__roast-refresh"
                  onClick={() => generateRoast(true)}
                  disabled={roastLoading}
                >
                  🔄 New take
                </button>
              </div>
            </section>
          )}

          {topGenres.length > 0 && (
            <section className="stats-page__section">
              <h2 className="stats-page__section-title">Your Top Genres</h2>
              <div className="stats-page__genre-bars">
                {topGenres.map(([genre, count]) => (
                  <div key={genre} className="stats-page__genre-row">
                    <span className="stats-page__genre-name">{genre}</span>
                    <div className="stats-page__genre-track">
                      <div
                        className="stats-page__genre-fill"
                        style={{ width: `${maxGenreCount ? (count / maxGenreCount) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="stats-page__genre-count">{count}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {favoriteDecade && (
            <section className="stats-page__section">
              <h2 className="stats-page__section-title">Favorite Decade</h2>
              <p className="stats-page__decade-value">{favoriteDecade}</p>
            </section>
          )}

          {lovedTitles.length > 0 && (
            <section className="stats-page__section">
              <h2 className="stats-page__section-title">Titles You Loved</h2>
              <div className="stats-page__grid">
                {lovedTitles.map((movie) => (
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
            </section>
          )}
        </>
      )}
    </div>
  );
}