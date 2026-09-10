import { useEffect, useRef, useState } from 'react';
import { RESUME_MIN_FRACTION, RESUME_MAX_FRACTION } from './TrailerPlayer';

// How long the pointer has to linger before a hover preview starts —
// long enough that just sweeping across a row of posters doesn't fire a
// fetch for every card the cursor happened to cross.
const HOVER_DELAY_MS = 600;

// Touch equivalent of HOVER_DELAY_MS below (see handleTouchStart) — a
// deliberate long-press is already a much stronger, more intentional
// signal than a passing mouse hover, so it doesn't need as long a delay
// to feel deliberate rather than accidental.
const LONG_PRESS_DELAY_MS = 500;
// How far a touch can drift before it's treated as a scroll/drag instead
// of a long-press — without this, starting a swipe through a
// horizontally-scrolling row would also fire a preview load partway
// through the gesture.
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;
// A touch-triggered preview has no "mouse left the card" event to clean
// itself up with the way the desktop hover preview does (handleMouseLeave
// below) — this is the safety net so a forgotten long-press preview
// doesn't keep autoplaying muted video indefinitely after a visitor
// scrolls away.
const TOUCH_PREVIEW_AUTO_DISMISS_MS = 20000;

// Hover previews are opt-in based on real input capability: `pointer:
// fine` + `hover: hover` rules out touchscreens (where "hover" is really
// just the first half of a tap and would otherwise get stuck "on"), and
// `prefers-reduced-motion` rules out visitors who've asked their OS for
// less motion — an autoplaying clip is exactly the kind of thing that
// setting exists to suppress.
function supportsHoverPreview() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

// The touch-only counterpart to supportsHoverPreview above — gated to
// genuinely coarse-pointer devices (so a laptop's touchscreen, which
// also has a real mouse and already gets the hover preview, doesn't
// double up on both triggers) and to the same reduced-motion opt-out.
function supportsTouchPreview() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

// --- "NEW" badge ---
// A movie counts as a recent release if its release year is within this
// many years of today. This app has no real "added to catalog" date the
// way an actual streaming service does, so release year is the closest
// available proxy — deliberately generous (rather than "this year only",
// which would make the badge disappear from almost every card almost
// immediately). Exported so MovieSearch.js's "New Releases" row can
// filter by exactly the same definition of "new" that decides whether a
// card wears this badge — one shared source of truth instead of two
// definitions that could quietly drift apart.
export const NEW_RELEASE_WINDOW_YEARS = 2;

export function isRecentRelease(movie) {
  if (!movie || !movie.Year) return false;
  const match = /\d{4}/.exec(movie.Year);
  if (!match) return false;
  const year = parseInt(match[0], 10);
  const diff = new Date().getFullYear() - year;
  // Also counts a title dated next year as "new" (an upcoming/just-listed
  // release), rather than only ever looking backward.
  return diff >= -1 && diff <= NEW_RELEASE_WINDOW_YEARS;
}

/**
 * A single poster card used across the browse/search grid, the genre
 * rows, and Continue Watching. Shares one visual language (poster,
 * rating badge, bottom hover overlay with genre chips + Play) across all
 * three, and adds a Netflix-style hover preview: lingering over the card
 * swaps the poster for a muted, autoplaying trailer clip.
 *
 * On a touchscreen there's no hover to linger with, so a long-press
 * (touch and hold roughly LONG_PRESS_DELAY_MS) is the equivalent
 * trigger — see handleTouchStart/handleTouchMove/handleTouchEnd below.
 * It shares the same preview-loading logic (beginPreviewLoad) and
 * preview state as the mouse path; the two are otherwise independent so
 * neither trigger interferes with the other's own device class.
 *
 * `resolveTrailerId` is passed down from MovieSearch rather than owned
 * here so every card — in every row, plus the main grid — shares MovieSearch's
 * existing trailerCache. Hovering the same title in two different rows
 * only ever costs one YouTube API call.
 *
 * `isInList` + `onToggleList` are optional — when a caller passes
 * `onToggleList`, a small "+"/"✓" My List toggle renders next to the
 * hover Play button. Callers that don't care about My List (none today,
 * but kept optional rather than required) can simply omit both props.
 *
 * `myRating` + `onLike`/`onDislike` are optional in the same way: a pair
 * of thumbs buttons render next to the My List toggle when either
 * handler is passed. `myRating` is this profile's own opinion of the
 * title — `'like'`, `'dislike'`, or `null` — never to be confused with
 * `movie.imdbRating` (OMDb's public rating, shown separately as the gold
 * badge in the corner of the poster).
 *
 * `matchScore` is a third, independent signal — this profile's own
 * estimated percentage fit for the title (see getMatchScore in
 * MovieSearch.js), rendered as a small green "X% Match" line above the
 * title. Optional: a caller that hasn't wired up match scoring can
 * simply omit it and the line doesn't render at all.
 *
 * `progress` is this title's saved trailer-watch progress (0-1, from
 * WatchHistoryContext.getProgress/TrailerPlayer.js) — optional, and in
 * practice only ever non-zero for a Continue Watching card. When set and
 * meaningfully in progress, it draws a thin resume bar along the bottom
 * edge of the poster and swaps the hover Play button's label to
 * "Resume".
 */
export default function MovieCard({
  movie,
  variant = 'grid', // 'grid' | 'row'
  isFeatured = false,
  eagerImage = false,
  onSelect,
  onPlay,
  onRemove,
  resolveTrailerId,
  isInList = false,
  onToggleList,
  myRating = null,
  onLike,
  onDislike,
  matchScore = null,
  progress = null,
}) {
  const [previewState, setPreviewState] = useState('idle'); // idle | loading | ready | none
  const [previewId, setPreviewId] = useState(null);
  const [muted, setMuted] = useState(true);
  // Whether the CURRENT preview (if any) was triggered by a touch
  // long-press rather than a mouse hover — drives movie-card--touch-active
  // below, which is what makes the hover overlay (genre chips, Play, My
  // List, thumbs) actually visible on a device with no :hover state to
  // reveal it via CSS alone.
  const [touchActive, setTouchActive] = useState(false);
  // OMDb's Poster field frequently points at an Amazon media URL that no
  // longer resolves (removed/expired on Amazon's end, not something this
  // app controls) — that shows up as a 404 in the console and, without
  // this, a broken-image icon on the card. Once the <img> actually fails
  // to load, fall back to the same "No image" placeholder already used
  // for a missing Poster field.
  const [posterFailed, setPosterFailed] = useState(false);
  const hoverTimerRef = useRef(null);
  // Bumped every time hover starts/stops, so a resolveTrailerId() promise
  // that resolves after the pointer has already left (or re-entered a
  // different card) is recognized as stale and ignored.
  const requestTokenRef = useRef(0);
  // Where a touch gesture started (see handleTouchStart/handleTouchMove)
  // — used to tell a deliberate long-press apart from the start of a
  // scroll/drag through a horizontally-scrolling row.
  const touchStartRef = useRef(null);
  // True once the long-press timer has actually fired for the touch
  // currently in progress — read by handleTouchEnd to decide whether
  // this release is "ending a long-press" (suppress the click that would
  // otherwise follow) or just "the end of an ordinary tap" (let the
  // click through as normal).
  const longPressActiveRef = useRef(false);
  const autoDismissTimerRef = useRef(null);

  function resetPreview() {
    clearTimeout(hoverTimerRef.current);
    clearTimeout(autoDismissTimerRef.current);
    requestTokenRef.current += 1;
    setPreviewState('idle');
    setPreviewId(null);
    setMuted(true);
    setTouchActive(false);
    longPressActiveRef.current = false;
    touchStartRef.current = null;
  }

  useEffect(
    () => () => {
      clearTimeout(hoverTimerRef.current);
      clearTimeout(autoDismissTimerRef.current);
    },
    []
  );

  // Each distinct movie gets its own MovieCard instance (every caller
  // renders these with `key={movie.imdbID}`), so a prior failure never
  // needs to be reset for the same instance — but resetting on imdbID
  // change keeps this correct even if a future caller stops keying by
  // id.
  useEffect(() => {
    setPosterFailed(false);
  }, [movie.imdbID]);

  // Shared by both the mouse-hover and touch-long-press triggers below —
  // resolves this card's trailer id (via the shared cache in
  // resolveTrailerId) and swaps the poster for the preview once it's
  // ready. `token` guards against a resolution that arrives after the
  // pointer/touch has already moved on to something else.
  function beginPreviewLoad() {
    const token = ++requestTokenRef.current;
    setPreviewState('loading');
    resolveTrailerId(movie)
      .then((id) => {
        if (token !== requestTokenRef.current) return; // pointer moved on already
        if (id) {
          setPreviewId(id);
          setPreviewState('ready');
        } else {
          setPreviewState('none');
        }
      })
      .catch(() => {
        if (token !== requestTokenRef.current) return;
        setPreviewState('none');
      });
  }

  function handleMouseEnter() {
    if (!resolveTrailerId || !supportsHoverPreview()) return;
    hoverTimerRef.current = setTimeout(beginPreviewLoad, HOVER_DELAY_MS);
  }

  function handleMouseLeave() {
    resetPreview();
  }

  // --- Touch long-press (mobile equivalent of the mouse hover above) ---
  function handleTouchStart(e) {
    if (!resolveTrailerId || !supportsTouchPreview()) return;
    const touch = e.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    longPressActiveRef.current = false;
    hoverTimerRef.current = setTimeout(() => {
      longPressActiveRef.current = true;
      setTouchActive(true);
      beginPreviewLoad();
      // Safety net — see TOUCH_PREVIEW_AUTO_DISMISS_MS's comment above.
      autoDismissTimerRef.current = setTimeout(resetPreview, TOUCH_PREVIEW_AUTO_DISMISS_MS);
    }, LONG_PRESS_DELAY_MS);
  }

  function handleTouchMove(e) {
    if (!touchStartRef.current || longPressActiveRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    const dx = Math.abs(touch.clientX - touchStartRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartRef.current.y);
    if (dx > LONG_PRESS_MOVE_TOLERANCE_PX || dy > LONG_PRESS_MOVE_TOLERANCE_PX) {
      // This is a scroll/drag through the row, not a deliberate
      // long-press — cancel the pending timer before it ever fires,
      // same as a mouse leaving the card early cancels handleMouseEnter's
      // timer via handleMouseLeave.
      clearTimeout(hoverTimerRef.current);
      touchStartRef.current = null;
    }
  }

  function handleTouchEnd(e) {
    clearTimeout(hoverTimerRef.current);
    touchStartRef.current = null;
    if (longPressActiveRef.current) {
      // The long-press already opened a preview — this release is what
      // ends that gesture, not a tap that should activate the card.
      // Most touch browsers fire a synthetic click after touchend;
      // preventing it here stops that from immediately jumping past the
      // preview it just took a long-press to open. A genuine follow-up
      // tap (a fresh touchstart+touchend that never becomes a long
      // press) is unaffected and still activates normally via
      // handleActivate below.
      e.preventDefault();
    }
  }

  function handleTouchCancel() {
    clearTimeout(hoverTimerRef.current);
    touchStartRef.current = null;
  }

  function handleActivate() {
    // A tap that lands while a touch-triggered preview is showing both
    // dismisses the preview (so the muted clip doesn't keep playing in
    // the background after navigating away) and proceeds with the
    // normal activation — mirroring "tap once to preview, tap again to
    // open" without needing a separate mode.
    if (touchActive) resetPreview();
    onSelect(movie);
  }

  const hasPoster = movie.Poster && movie.Poster !== 'N/A' && !posterFailed;
  const genres = movie.Genre
    ? movie.Genre.split(',').map((g) => g.trim()).filter(Boolean).slice(0, 2)
    : [];
  const showPreview = previewState === 'ready' && previewId;
  const showNewBadge = isRecentRelease(movie);
  const showResumeBar = typeof progress === 'number' && progress > 0;
  const showResumeLabel =
    typeof progress === 'number' && progress > RESUME_MIN_FRACTION && progress < RESUME_MAX_FRACTION;

  return (
    <div
      className={`movie-card movie-card--${variant} ${isFeatured ? 'movie-card--selected' : ''} ${
        touchActive ? 'movie-card--touch-active' : ''
      }`}
      onClick={handleActivate}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleActivate();
        }
      }}
    >
      <div className="movie-card__poster">
        {hasPoster ? (
          <img
            src={movie.Poster}
            alt={movie.Title}
            loading={eagerImage ? 'eager' : 'lazy'}
            decoding="async"
            onError={() => setPosterFailed(true)}
          />
        ) : (
          <div className="movie-card__poster-placeholder">No image</div>
        )}

        {previewState === 'loading' && (
          <div className="movie-card__preview-loading" aria-hidden="true" />
        )}

        {showPreview && (
          <div className="movie-card__preview-frame">
            <iframe
              key={`${previewId}-${muted ? 'muted' : 'unmuted'}`}
              src={`https://www.youtube.com/embed/${previewId}?autoplay=1&mute=${
                muted ? 1 : 0
              }&controls=0&modestbranding=1&loop=1&playlist=${previewId}`}
              title={`${movie.Title} preview`}
              frameBorder="0"
              allow="autoplay; encrypted-media"
            />
            <button
              type="button"
              className="movie-card__mute-toggle"
              onClick={(e) => {
                e.stopPropagation();
                setMuted((m) => !m);
              }}
            >
              {muted ? 'Unmute' : 'Mute'}
            </button>
          </div>
        )}

        {movie.imdbRating != null && (
          <span className="movie-card__rating">{Number(movie.imdbRating).toFixed(1)}</span>
        )}

        {showNewBadge && (
          <span className="movie-card__new-badge" aria-hidden="true">
            NEW
          </span>
        )}

        {showResumeBar && (
          <div className="movie-card__progress-track" aria-hidden="true">
            <div
              className="movie-card__progress-fill"
              style={{ width: `${Math.round(Math.min(1, progress) * 100)}%` }}
            />
          </div>
        )}

        {onRemove && (
          <button
            type="button"
            className="movie-card__remove-badge"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(movie);
            }}
            aria-label={`Remove ${movie.Title} from Continue Watching`}
            title="Remove from Continue Watching"
          >
            ✕
          </button>
        )}

        <div className="movie-card__hover-overlay">
          {genres.length > 0 && (
            <div className="movie-card__hover-genres">
              {genres.map((g) => (
                <span key={g} className="movie-card__hover-genre-tag">
                  {g}
                </span>
              ))}
            </div>
          )}
          <div className="movie-card__hover-actions">
            <button
              type="button"
              className="movie-card__hover-play"
              onClick={(e) => {
                e.stopPropagation();
                onPlay(movie);
              }}
              onKeyDown={(e) => {
                // Stop Enter/Space from also bubbling up to the card's own
                // onKeyDown, which would fire handleActivate() a second time.
                if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
              }}
              aria-label={showResumeLabel ? `Resume ${movie.Title} trailer` : `Play ${movie.Title} trailer`}
            >
              <span aria-hidden="true">▶</span> {showResumeLabel ? 'Resume' : 'Play'}
            </button>
            {onToggleList && (
              <button
                type="button"
                className={`movie-card__list-toggle ${isInList ? 'is-active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleList(movie);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
                }}
                aria-pressed={isInList}
                aria-label={isInList ? `Remove ${movie.Title} from My List` : `Add ${movie.Title} to My List`}
                title={isInList ? 'Remove from My List' : 'Add to My List'}
              >
                <span aria-hidden="true">{isInList ? '✓' : '+'}</span>
              </button>
            )}
            {onLike && (
              <button
                type="button"
                className={`movie-card__rate-toggle movie-card__rate-toggle--like ${
                  myRating === 'like' ? 'is-active' : ''
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onLike(movie);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
                }}
                aria-pressed={myRating === 'like'}
                aria-label={myRating === 'like' ? `Remove your like from ${movie.Title}` : `Like ${movie.Title}`}
                title={myRating === 'like' ? 'Remove like' : 'Like this title'}
              >
                <span aria-hidden="true">👍</span>
              </button>
            )}
            {onDislike && (
              <button
                type="button"
                className={`movie-card__rate-toggle movie-card__rate-toggle--dislike ${
                  myRating === 'dislike' ? 'is-active' : ''
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDislike(movie);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
                }}
                aria-pressed={myRating === 'dislike'}
                aria-label={
                  myRating === 'dislike' ? `Remove your dislike from ${movie.Title}` : `Dislike ${movie.Title}`
                }
                title={myRating === 'dislike' ? 'Remove dislike' : 'Dislike this title'}
              >
                <span aria-hidden="true">👎</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="movie-card__info">
        {matchScore != null && (
          <p className="movie-card__match">{matchScore}% Match</p>
        )}
        <p className="movie-card__title">{movie.Title}</p>
        <p className="movie-card__meta">
          {movie.Year} · {movie.Type}
        </p>
      </div>
    </div>
  );
}