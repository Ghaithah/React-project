import { useNavigate } from 'react-router-dom';
import { useMyList } from './MyListContext';
import { useRatings } from './RatingsContext';
import MovieCard from './MovieCard';
import './MyListPage.css';

/**
 * The one persistent, always-findable place to see everything saved with
 * the "+" / My List toggle on a MovieCard, HeroBanner, or MovieInfoModal
 * (see MyListContext.js). Before this page existed, the only way to see
 * My List was a horizontal shelf on the plain browse view — easy to miss
 * if you'd scrolled past it, and invisible entirely while searching or
 * filtering. This page is reachable from the header nav (see Header.js)
 * regardless of what the browse page is currently showing.
 *
 * Doesn't fetch anything itself: every title here is already the
 * lightweight entry MyListContext stored when it was added (imdbID,
 * Title, Poster, Year, Type, Genre, imdbRating — see toEntry() in
 * MyListContext.js), which is exactly what MovieCard needs to render a
 * grid tile. Clicking a card (or its Play button) hands off to the main
 * browse page's own trailer view via the same `?movie=<imdbID>` URL
 * param MovieSearch already reads on mount — MovieSearch resolves an
 * unrecognized id with its own OMDb by-ID lookup, so this doesn't need
 * to duplicate that fetch just to open a trailer from here.
 */
export default function MyListPage() {
  const { myList, isInList, toggleInList, removeFromList } = useMyList();
  const { getRating, toggleLike, toggleDislike } = useRatings();
  const navigate = useNavigate();

  function openMovie(movie) {
    navigate(`/movies?movie=${movie.imdbID}`);
  }

  return (
    <div className="my-list-page">
      <h1 className="my-list-page__title">My List</h1>

      {myList.length === 0 ? (
        <p className="my-list-page__empty">
          Nothing saved yet — tap the <strong>+</strong> on any title's poster (or on its Play
          panel) to add it here.
        </p>
      ) : (
        <div className="my-list-page__grid">
          {myList.map((movie) => (
            <MovieCard
              key={movie.imdbID}
              movie={movie}
              variant="grid"
              onSelect={openMovie}
              onPlay={openMovie}
              onRemove={() => removeFromList(movie.imdbID)}
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