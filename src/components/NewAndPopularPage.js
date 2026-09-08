import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMovieCatalog } from './MovieCatalogContext';
import { useMyList } from './MyListContext';
import { useRatings } from './RatingsContext';
import { isKidSafe } from './MovieSearch';
import MovieCard, { isRecentRelease } from './MovieCard';
import './NewAndPopularPage.css';

// How many cards each shelf shows at most. Netflix's own New & Popular
// page is a curated handful of rows, not an exhaustive list — capping
// here keeps both grids to "a screen or two of scrolling" rather than
// dumping the entire loaded catalog onto the page.
const SECTION_CAP = 30;

/**
 * A dedicated home for "what's new" and "what's trending" — the same two
 * questions the Home page already answers with its New Releases row and
 * Top 10 shelf, but easy to scroll past there since they're just two
 * rows among many. This page exists so both questions have one
 * permanent, findable answer instead of requiring a scroll down the
 * browse page first.
 *
 * Deliberately does NOT run its own OMDb/YouTube fetch. MovieSearch
 * already builds a deduped pool of everything it's loaded (browse rows,
 * search results, similar-titles pools) and publishes it to
 * MovieCatalogContext for the floating chatbot to read — see
 * MovieCatalogContext.js. This page reads that exact same pool. That
 * means this page's grids are only ever as full as whatever MovieSearch
 * has already fetched this session (see the empty state below for what
 * happens before that's happened at all), but it also means opening
 * this page costs zero extra API calls against OMDb's rate-limited free
 * tier — a real constraint elsewhere in this app (see the daily-quota
 * counters in MovieSearch.js).
 */
export default function NewAndPopularPage() {
  const { catalog } = useMovieCatalog();
  const { isInList, toggleInList } = useMyList();
  const { getRating, toggleLike, toggleDislike, dislikedIds } = useRatings();
  const navigate = useNavigate();

  function openMovie(movie) {
    navigate(`/movies?movie=${movie.imdbID}`);
  }

  // Same two gates MovieSearch itself applies before anything reaches a
  // Kids profile: a disliked title never reappears in a recommendation-
  // style row, and (only in Kids mode) isKidSafe's genre+Rated allowlist
  // keeps anything not clearly kid/family content out entirely — this
  // page borrows MovieSearch's own isKidSafe rather than redefining a
  // second copy of the same rules that could quietly drift out of sync.
  const eligible = useMemo(() => {
    return catalog.allLoaded.filter((m) => {
      if (dislikedIds.has(m.imdbID)) return false;
      if (catalog.kidsMode && !isKidSafe(m)) return false;
      return true;
    });
  }, [catalog.allLoaded, catalog.kidsMode, dislikedIds]);

  // Newest first, ties broken by rating — matches the "New Releases"
  // row's own ordering on the Home page so this shelf reads as the same
  // feature, just given more room.
  const newReleases = useMemo(() => {
    return eligible
      .filter(isRecentRelease)
      .slice()
      .sort((a, b) => {
        const yearA = parseInt((a.Year || '').match(/\d{4}/)?.[0] || '0', 10);
        const yearB = parseInt((b.Year || '').match(/\d{4}/)?.[0] || '0', 10);
        if (yearB !== yearA) return yearB - yearA;
        return (b.imdbRating ?? 0) - (a.imdbRating ?? 0);
      })
      .slice(0, SECTION_CAP);
  }, [eligible]);

  // Highest-rated first. Deliberately allowed to overlap with New
  // Releases above (a title can easily be both new AND well-reviewed) —
  // Netflix's own New & Popular page does the same rather than
  // artificially excluding a title from one shelf because it's already
  // on the other.
  const popular = useMemo(() => {
    return eligible
      .filter((m) => m.imdbRating != null)
      .slice()
      .sort((a, b) => (b.imdbRating ?? 0) - (a.imdbRating ?? 0))
      .slice(0, SECTION_CAP);
  }, [eligible]);

  const isEmpty = catalog.allLoaded.length === 0;

  return (
    <div className="new-and-popular-page">
      <h1 className="new-and-popular-page__title">New & Popular</h1>

      {isEmpty ? (
        <p className="new-and-popular-page__empty">
          Nothing loaded yet — <Link to="/">head to Home</Link> to browse for a bit, then come
          back and this page will fill in with what's new and what's trending.
        </p>
      ) : (
        <>
          <section className="new-and-popular-page__section">
            <h2 className="new-and-popular-page__section-title">New Releases</h2>
            {newReleases.length === 0 ? (
              <p className="new-and-popular-page__section-empty">
                Nothing recent loaded yet — keep browsing and this shelf will fill in.
              </p>
            ) : (
              <div className="new-and-popular-page__grid">
                {newReleases.map((movie) => (
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
          </section>

          <section className="new-and-popular-page__section">
            <h2 className="new-and-popular-page__section-title">Popular</h2>
            {popular.length === 0 ? (
              <p className="new-and-popular-page__section-empty">
                Nothing rated loaded yet — keep browsing and this shelf will fill in.
              </p>
            ) : (
              <div className="new-and-popular-page__grid">
                {popular.map((movie) => (
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
          </section>
        </>
      )}
    </div>
  );
}