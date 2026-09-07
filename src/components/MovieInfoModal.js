import { useEffect, useState } from 'react';
import './MovieInfoModal.css';

/**
 * "More Info" for the currently featured title — a Netflix-style modal
 * that surfaces everything OMDb/Wikipedia have on a title (full plot,
 * cast, director, writer, awards, episodes for series, similar titles)
 * without ever touching the trailer. This is what the hero banner's
 * "More Info" button opens now; "Play" still goes straight to the
 * trailer panel (see MovieSearch.js's openMovie/openInfo).
 *
 * Deliberately doesn't fetch anything itself: MovieSearch already owns
 * all of this data for the trailer panel (movieDetail, cast/crew lookups,
 * episodes), so this modal is just pointed at whichever movie is
 * currently open and reuses that same state + the same OMDb/Wikipedia
 * caches, rather than duplicating any network calls.
 *
 * `isInList` + `onToggleList` are optional, same contract as MovieCard
 * and HeroBanner's own My List props — when passed, a second action
 * button renders next to Play Trailer.
 */
export default function MovieInfoModal({
  movie,
  detail,
  loading,
  error,
  onClose,
  onPlayTrailer,
  selectedPerson,
  onSelectPerson,
  personInfo,
  personInfoLoading,
  personTitles,
  similarTitles,
  onSelectSimilar,
  episodes,
  selectedSeason,
  episodesLoading,
  onSeasonChange,
  isInList = false,
  onToggleList,
}) {
  // Standard modal hygiene: Esc closes it, and the page behind it stops
  // scrolling while it's open so a long info panel doesn't fight the
  // browse grid underneath for scroll position.
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  // OMDb's Poster field sometimes points at an Amazon media URL that no
  // longer resolves — that surfaces as a console 404 and, without this,
  // a broken-image icon over the hero backdrop. Once the poster <img>
  // actually fails to load, fall back to the plain hero background, same
  // as when OMDb has no Poster at all. Reset whenever a different title
  // is opened so a previous failure doesn't stick around.
  const [posterFailed, setPosterFailed] = useState(false);
  useEffect(() => {
    setPosterFailed(false);
  }, [movie.imdbID]);

  const hasPoster = !!movie.Poster && movie.Poster !== 'N/A' && !posterFailed;
  const genres = movie.Genre
    ? movie.Genre.split(',').map((g) => g.trim()).filter(Boolean)
    : [];

  // Same cast/director rendering the trailer panel uses (clickable names
  // that filter into "More with <person>" below), reimplemented locally
  // so this component doesn't depend on a closure from MovieSearch —
  // just the plain callback + current selection it's handed as props.
  function renderPeopleList(namesStr) {
    const names = namesStr.split(',').map((n) => n.trim()).filter(Boolean);
    return names.map((name, i) => (
      <span key={name}>
        <button
          type="button"
          className={`movie-search__person-link ${
            selectedPerson && selectedPerson.toLowerCase() === name.toLowerCase()
              ? 'is-active'
              : ''
          }`}
          onClick={() => onSelectPerson(name)}
        >
          {name}
        </button>
        {i < names.length - 1 ? ', ' : ''}
      </span>
    ));
  }

  function renderPosterCard(m) {
    return (
      <div
        key={m.imdbID}
        className="movie-search__similar-card"
        onClick={() => onSelectSimilar(m)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectSimilar(m);
          }
        }}
      >
        <div className="movie-search__similar-poster">
          {m.Poster !== 'N/A' ? (
            <img
              src={m.Poster}
              alt={m.Title}
              loading="lazy"
              decoding="async"
              // Same OMDb-poster-404 issue as the main hero poster above,
              // just without per-card state: hiding the broken <img> on
              // error reveals this poster box's own neutral background
              // instead of a broken-image icon.
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div className="movie-search__similar-poster-placeholder">No image</div>
          )}
        </div>
        <p className="movie-search__similar-card-title">{m.Title}</p>
        <p className="movie-search__similar-card-meta">{m.Year}</p>
      </div>
    );
  }

  return (
    <div className="movie-info-modal__overlay" onClick={onClose} role="presentation">
      <div
        className="movie-info-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="movie-info-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="movie-info-modal__close"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>

        <div className="movie-info-modal__hero">
          {hasPoster && (
            <div
              className="movie-info-modal__hero-backdrop"
              style={{ backgroundImage: `url(${movie.Poster})` }}
              aria-hidden="true"
            />
          )}
          <div className="movie-info-modal__hero-scrim" aria-hidden="true" />
          <div className="movie-info-modal__hero-content">
            {hasPoster && (
              <img
                className="movie-info-modal__poster"
                src={movie.Poster}
                alt={`${movie.Title} poster`}
                onError={() => setPosterFailed(true)}
              />
            )}
            <div className="movie-info-modal__hero-text">
              <h2 id="movie-info-modal-title" className="movie-info-modal__title">
                {movie.Title}
              </h2>
              <div className="movie-info-modal__meta">
                {movie.imdbRating != null && (
                  <span className="movie-search__badge movie-search__badge--gold">
                    ★ {Number(movie.imdbRating).toFixed(1)}
                  </span>
                )}
                {movie.Year && <span>{movie.Year}</span>}
                {movie.Runtime && movie.Runtime !== 'N/A' && <span>{movie.Runtime}</span>}
                {movie.Rated && movie.Rated !== 'N/A' && (
                  <span className="movie-search__badge">{movie.Rated}</span>
                )}
              </div>
              {genres.length > 0 && (
                <div className="movie-info-modal__genres">
                  {genres.map((g) => (
                    <span key={g} className="movie-search__badge">
                      {g}
                    </span>
                  ))}
                </div>
              )}
              <div className="movie-info-modal__actions">
                <button type="button" className="movie-info-modal__play-btn" onClick={onPlayTrailer}>
                  <span aria-hidden="true">▶</span> Play Trailer
                </button>
                {onToggleList && (
                  <button
                    type="button"
                    className={`movie-info-modal__list-btn ${isInList ? 'is-active' : ''}`}
                    onClick={onToggleList}
                    aria-pressed={isInList}
                  >
                    <span aria-hidden="true">{isInList ? '✓' : '+'}</span>{' '}
                    {isInList ? 'In My List' : 'My List'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="movie-info-modal__body">
          {loading && (
            <div className="movie-info-modal__skeleton" role="status" aria-label="Loading details">
              <div className="skeleton-line skeleton-line--plot" />
              <div className="skeleton-line skeleton-line--plot" />
              <div className="skeleton-line skeleton-line--plot-short" />
            </div>
          )}

          {!loading && error && <p className="movie-search__detail-status">{error}</p>}

          {!loading && !error && detail && (
            <>
              {detail.Plot && detail.Plot !== 'N/A' && (
                <p className="movie-info-modal__plot">{detail.Plot}</p>
              )}

              <div className="movie-info-modal__facts">
                {detail.Actors && detail.Actors !== 'N/A' && (
                  <p>
                    <span className="movie-search__detail-label">Cast:</span>{' '}
                    {renderPeopleList(detail.Actors)}
                  </p>
                )}
                {detail.Genre && detail.Genre !== 'N/A' && (
                  <p>
                    <span className="movie-search__detail-label">Genres:</span> {detail.Genre}
                  </p>
                )}
                {detail.Director && detail.Director !== 'N/A' && (
                  <p>
                    <span className="movie-search__detail-label">Director:</span>{' '}
                    {renderPeopleList(detail.Director)}
                  </p>
                )}
                {detail.Writer && detail.Writer !== 'N/A' && (
                  <p>
                    <span className="movie-search__detail-label">Writer:</span> {detail.Writer}
                  </p>
                )}
                {detail.Awards && detail.Awards !== 'N/A' && (
                  <p>
                    <span className="movie-search__detail-label">Awards:</span> {detail.Awards}
                  </p>
                )}
              </div>

              {selectedPerson && (
                <div className="movie-search__person">
                  <div className="movie-search__person-header">
                    <h3 className="movie-search__person-title">More with {selectedPerson}</h3>
                    <button
                      type="button"
                      className="movie-search__person-close"
                      onClick={() => onSelectPerson(selectedPerson)}
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
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                      <div className="movie-search__person-bio-text">
                        {personInfo.description && (
                          <p className="movie-search__person-bio-desc">{personInfo.description}</p>
                        )}
                        {personInfo.extract && (
                          <p className="movie-search__person-bio-extract">{personInfo.extract}</p>
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
                    <p className="movie-search__detail-status">No info found for {selectedPerson}.</p>
                  )}

                  {personTitles.length > 0 && (
                    <div className="movie-search__similar-row">
                      {personTitles.map((m) => renderPosterCard(m))}
                    </div>
                  )}
                </div>
              )}

              {detail.Type === 'series' && detail.totalSeasons && detail.totalSeasons !== 'N/A' && (
                <div className="movie-search__episodes">
                  <div className="movie-search__episodes-header">
                    <h3>Episodes</h3>
                    <select value={selectedSeason} onChange={(e) => onSeasonChange(e.target.value)}>
                      {Array.from(
                        { length: parseInt(detail.totalSeasons, 10) },
                        (_, i) => i + 1
                      ).map((s) => (
                        <option key={s} value={s}>
                          Season {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  {episodesLoading && <p className="movie-search__detail-status">Loading episodes…</p>}

                  {!episodesLoading && episodes.length > 0 && (
                    <ul className="movie-search__episode-list">
                      {episodes.map((ep) => (
                        <li key={ep.imdbID || ep.Episode} className="movie-search__episode">
                          <span className="movie-search__episode-number">{ep.Episode}</span>
                          <div className="movie-search__episode-info">
                            <p className="movie-search__episode-title">{ep.Title}</p>
                            <p className="movie-search__episode-meta">
                              {ep.Released && ep.Released !== 'N/A' ? ep.Released : ''}
                              {ep.imdbRating && ep.imdbRating !== 'N/A' ? ` · ★ ${ep.imdbRating}` : ''}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {!episodesLoading && episodes.length === 0 && (
                    <p className="movie-search__detail-status">No episode data for this season.</p>
                  )}
                </div>
              )}

              {similarTitles.length > 0 && (
                <div className="movie-search__similar">
                  <h3 className="movie-search__similar-title">More Like This</h3>
                  <div className="movie-search__similar-row">
                    {similarTitles.map((m) => renderPosterCard(m))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}