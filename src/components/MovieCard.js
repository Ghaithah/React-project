import { useEffect, useRef, useState } from 'react';

// How long the pointer has to linger before a hover preview starts —
// long enough that just sweeping across a row of posters doesn't fire a
// fetch for every card the cursor happened to cross.
const HOVER_DELAY_MS = 600;

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

/**
 * A single poster card used across the browse/search grid, the genre
 * rows, and Continue Watching. Shares one visual language (poster,
 * rating badge, bottom hover overlay with genre chips + Play) across all
 * three, and adds a Netflix-style hover preview: lingering over the card
 * swaps the poster for a muted, autoplaying trailer clip.
 *
 * `resolveTrailerId` is passed down from MovieSearch rather than owned
 * here so every card — in every row, plus the main grid — shares MovieSearch's
 * existing trailerCache. Hovering the same title in two different rows
 * only ever costs one YouTube API call.
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
}) {
  const [previewState, setPreviewState] = useState('idle'); // idle | loading | ready | none
  const [previewId, setPreviewId] = useState(null);
  const [muted, setMuted] = useState(true);
  const hoverTimerRef = useRef(null);
  // Bumped every time hover starts/stops, so a resolveTrailerId() promise
  // that resolves after the pointer has already left (or re-entered a
  // different card) is recognized as stale and ignored.
  const requestTokenRef = useRef(0);

  function resetPreview() {
    clearTimeout(hoverTimerRef.current);
    requestTokenRef.current += 1;
    setPreviewState('idle');
    setPreviewId(null);
    setMuted(true);
  }

  useEffect(() => () => clearTimeout(hoverTimerRef.current), []);

  function handleMouseEnter() {
    if (!resolveTrailerId || !supportsHoverPreview()) return;
    hoverTimerRef.current = setTimeout(() => {
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
    }, HOVER_DELAY_MS);
  }

  function handleMouseLeave() {
    resetPreview();
  }

  function handleActivate() {
    onSelect(movie);
  }

  const hasPoster = movie.Poster && movie.Poster !== 'N/A';
  const genres = movie.Genre
    ? movie.Genre.split(',').map((g) => g.trim()).filter(Boolean).slice(0, 2)
    : [];
  const showPreview = previewState === 'ready' && previewId;

  return (
    <div
      className={`movie-card movie-card--${variant} ${isFeatured ? 'movie-card--selected' : ''}`}
      onClick={handleActivate}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
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
            aria-label={`Play ${movie.Title} trailer`}
          >
            <span aria-hidden="true">▶</span> Play
          </button>
        </div>
      </div>

      <div className="movie-card__info">
        <p className="movie-card__title">{movie.Title}</p>
        <p className="movie-card__meta">
          {movie.Year} · {movie.Type}
        </p>
      </div>
    </div>
  );
}