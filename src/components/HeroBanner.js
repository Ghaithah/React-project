import { useEffect, useMemo, useState } from 'react';
import './HeroBanner.css';

const PLOT_PREVIEW_LENGTH = 200;
// "Read More" must always reveal MORE text than the collapsed preview —
// never less — and more than a single sentence. These bound the summary
// on both sides: long enough to always exceed the preview, short enough
// to still read as a summary rather than the entire raw paragraph.
const SUMMARY_MIN_LENGTH = PLOT_PREVIEW_LENGTH + 50;
const SUMMARY_MIN_SENTENCES = 2;
const SUMMARY_MAX_LENGTH = 480;

// Cuts at the nearest word boundary at or before `length` rather than
// mid-word, unless the text has no space early enough to cut at (then it
// just hard-cuts at `length` rather than showing almost nothing).
function truncateToLength(text, length) {
  if (!text || text.length <= length) return text;
  const slice = text.slice(0, length);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > length * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trim()}…`;
}

// "Read More" doesn't reveal the full raw OMDb paragraph — it swaps in a
// condensed summary instead, built by keeping whole sentences (never
// cutting one mid-way) until we've passed BOTH SUMMARY_MIN_LENGTH and
// SUMMARY_MIN_SENTENCES (checking length alone isn't enough: a single
// dense plot sentence can easily clear 250 characters on its own, which
// would stop the loop before a second sentence ever gets a chance), and
// never starting a sentence that would push past SUMMARY_MAX_LENGTH.
// Abbreviations like "Mr." or "Jr." are protected first so they don't get
// mistaken for sentence endings.
const ABBREVIATIONS = /\b(?:[A-Z]\.){2,}|\b(?:Mr|Mrs|Ms|Dr|Jr|Sr|St|vs|etc)\./g;
const PERIOD_PLACEHOLDER = '@@PERIOD@@';

function summarizeMinimal(text) {
  if (!text) return text;
  const trimmed = text.trim();
  const protectedText = trimmed.replace(ABBREVIATIONS, (m) =>
    m.split('.').join(PERIOD_PLACEHOLDER)
  );
  const sentences = protectedText.match(/[^.!?]+[.!?]+(\s+|$)/g);

  let summary = '';
  let sentenceCount = 0;
  if (sentences) {
    for (const sentence of sentences) {
      const next = summary + sentence;
      // Always keep at least one full sentence, even if it alone runs
      // past the cap — a longer-than-ideal summary beats an empty one.
      if (summary && next.trim().length > SUMMARY_MAX_LENGTH) break;
      summary = next;
      sentenceCount += 1;
      if (sentenceCount >= SUMMARY_MIN_SENTENCES && summary.trim().length >= SUMMARY_MIN_LENGTH) {
        break;
      }
    }
  }
  if (!summary) summary = protectedText;

  summary = summary.split(PERIOD_PLACEHOLDER).join('.').trim();
  return summary.length > SUMMARY_MAX_LENGTH
    ? truncateToLength(summary, SUMMARY_MAX_LENGTH)
    : summary;
}

/**
 * Netflix-style hero banner for the top of the browse page: a single
 * featured title with a backdrop, a short synopsis, and Play / More Info
 * actions.
 *
 * OMDb only gives us portrait poster art (no widescreen backdrop), so the
 * same poster image is reused two ways: scaled up and heavily blurred to
 * fill the whole banner as ambient color, and shown sharp as a small
 * floating poster on top for legibility. If a title has no poster at all,
 * the backdrop is skipped and the banner just falls back to a plain
 * gradient.
 *
 * The synopsis defaults to a PLOT_PREVIEW_LENGTH-character preview; the
 * "Read More" toggle swaps in a minimal one-sentence summary rather than
 * the full raw plot — MovieSearch fetches this movie's Plot with OMDb's
 * `&plot=full` param so there's real, complete text to summarize from,
 * not OMDb's own pre-shortened (and often already-truncated) summary.
 *
 * `isDefaultFeatured` controls the "Featured Today" eyebrow above the
 * title: it's only true for the curated default pick shown before any
 * movie has been clicked. Once the banner is previewing a movie the
 * visitor clicked on (browse grid, search results, "You Might Also
 * Like"), the eyebrow is dropped — "Featured Today" would misdescribe a
 * title the visitor picked themselves.
 *
 * `isInList` + `onToggleList` back a third "My List" action alongside
 * Play / More Info — optional, same as MovieCard's list toggle, so a
 * caller that hasn't wired up My List can simply omit them.
 *
 * `myRating` + `onLike`/`onDislike` are optional in the same way: a
 * compact pair of thumbs icons render alongside the action buttons when
 * either handler is passed. `myRating` is this profile's own opinion —
 * `'like'`, `'dislike'`, or `null` — distinct from `movie.imdbRating`
 * (OMDb's public score, shown in the meta row above).
 *
 * `matchScore` is the same per-profile "X% Match" personalization signal
 * MovieCard shows — optional, same pattern: omit it and the pill simply
 * doesn't render.
 */
function HeroBanner({
  movie,
  onPlay,
  onMoreInfo,
  isDefaultFeatured = false,
  isInList = false,
  onToggleList,
  myRating = null,
  onLike,
  onDislike,
  matchScore = null,
}) {
  // OMDb's Poster field sometimes points at an Amazon media URL that no
  // longer resolves — that surfaces as a console 404 and, without this,
  // a broken-image icon over the backdrop. Once the poster <img> actually
  // fails to load, treat the title as posterless and fall back to the
  // plain gradient, same as when OMDb has no Poster at all.
  const [posterFailed, setPosterFailed] = useState(false);
  const hasPoster = !!movie.Poster && movie.Poster !== 'N/A' && !posterFailed;

  const genres = useMemo(
    () =>
      movie.Genre
        ? movie.Genre.split(',').map((g) => g.trim()).filter(Boolean).slice(0, 3)
        : [],
    [movie.Genre]
  );

  const plot = movie.Plot && movie.Plot !== 'N/A' ? movie.Plot : '';
  const isLong = plot.length > PLOT_PREVIEW_LENGTH;
  const previewPlot = useMemo(() => truncateToLength(plot, PLOT_PREVIEW_LENGTH), [plot]);
  const minimalSummary = useMemo(() => summarizeMinimal(plot), [plot]);

  const [expanded, setExpanded] = useState(false);
  // Collapse back to the preview whenever the featured title itself
  // changes, so an expanded synopsis from a previous movie doesn't carry
  // over and render as if it were the new title's full plot. Also clears
  // any earlier poster-load failure, since a fresh title deserves its own
  // fresh attempt at loading its own poster.
  useEffect(() => {
    setExpanded(false);
    setPosterFailed(false);
  }, [movie.imdbID]);

  return (
    <div className="hero-banner">
      {hasPoster && (
        <div
          className="hero-banner__backdrop"
          style={{ backgroundImage: `url(${movie.Poster})` }}
          aria-hidden="true"
        />
      )}
      <div className="hero-banner__scrim hero-banner__scrim--left" aria-hidden="true" />
      <div className="hero-banner__scrim hero-banner__scrim--bottom" aria-hidden="true" />

      {/*
        content + poster are laid out as real flex siblings (not two
        independently-positioned boxes) so the poster's width always
        actually subtracts from the space the text is allowed to use —
        they can't drift into each other at any viewport width.
      */}
      <div className="hero-banner__row">
      <div className="hero-banner__content">
        {isDefaultFeatured && <p className="hero-banner__eyebrow">Featured Today</p>}
        <h1 className="hero-banner__title">{movie.Title}</h1>

        <div className="hero-banner__meta">
          {matchScore != null && (
            <span className="hero-banner__match">{matchScore}% Match</span>
          )}
          {movie.imdbRating != null && (
            <span className="hero-banner__rating">★ {movie.imdbRating.toFixed(1)}</span>
          )}
          {movie.Year && <span>{movie.Year}</span>}
          {genres.length > 0 && <span className="hero-banner__dot">•</span>}
          {genres.map((g) => (
            <span key={g} className="hero-banner__tag">
              {g}
            </span>
          ))}
          {movie.Runtime && movie.Runtime !== 'N/A' && (
            <>
              <span className="hero-banner__dot">•</span>
              <span>{movie.Runtime}</span>
            </>
          )}
          {movie.Rated && movie.Rated !== 'N/A' && (
            <span className="hero-banner__badge">{movie.Rated}</span>
          )}
        </div>

        {plot && (
          <p className="hero-banner__synopsis">
            {!isLong ? plot : expanded ? minimalSummary : previewPlot}
            {isLong && (
              <button
                type="button"
                className="hero-banner__read-more"
                onClick={() => setExpanded((e) => !e)}
                aria-expanded={expanded}
              >
                {expanded ? 'Read Less' : 'Read More'}
              </button>
            )}
          </p>
        )}

        <div className="hero-banner__actions">
          <button
            type="button"
            className="hero-banner__btn hero-banner__btn--play"
            onClick={onPlay}
          >
            <span className="hero-banner__play-icon" aria-hidden="true">
              ▶
            </span>{' '}
            Play
          </button>
          <button
            type="button"
            className="hero-banner__btn hero-banner__btn--info"
            onClick={onMoreInfo}
          >
            <span aria-hidden="true">ⓘ</span> More Info
          </button>
          {onToggleList && (
            <button
              type="button"
              className={`hero-banner__btn hero-banner__btn--list ${isInList ? 'is-active' : ''}`}
              onClick={onToggleList}
              aria-pressed={isInList}
            >
              <span aria-hidden="true">{isInList ? '✓' : '+'}</span>{' '}
              {isInList ? 'In My List' : 'My List'}
            </button>
          )}
          {(onLike || onDislike) && (
            <div className="hero-banner__rate-group" role="group" aria-label="Rate this title">
              {onLike && (
                <button
                  type="button"
                  className={`hero-banner__rate-btn hero-banner__rate-btn--like ${
                    myRating === 'like' ? 'is-active' : ''
                  }`}
                  onClick={onLike}
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
                  className={`hero-banner__rate-btn hero-banner__rate-btn--dislike ${
                    myRating === 'dislike' ? 'is-active' : ''
                  }`}
                  onClick={onDislike}
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
          )}
        </div>
      </div>

      {hasPoster && (
        <img
          className="hero-banner__poster"
          src={movie.Poster}
          alt={`${movie.Title} poster`}
          loading="eager"
          onError={() => setPosterFailed(true)}
        />
      )}
      </div>
    </div>
  );
}

export default HeroBanner;