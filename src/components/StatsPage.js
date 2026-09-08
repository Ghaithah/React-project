import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWatchHistory } from './WatchHistoryContext';
import { useMyList } from './MyListContext';
import { useRatings } from './RatingsContext';
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