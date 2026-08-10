import { useState, useEffect, useMemo, useRef } from "react";
import "./MovieSearch.css";

const API_KEY = "7894ef1b"; // get one free at https://www.omdbapi.com/apikey.aspx
const DEBOUNCE_MS = 400;

// OMDb's search endpoint (s=) only returns Title, Year, imdbID, Type, Poster.
// Genre and imdbRating require a separate detail lookup (i=imdbID) per title,
// which is why they're fetched lazily below rather than up front.

// Curated picks shown as soon as the visitor lands on the page (before they've
// typed anything), so the screen isn't empty — similar to a Netflix homepage.
// OMDb has no "trending"/"popular" endpoint, so this is a hand-picked list of
// well-known titles across genres/types, fetched via the detail endpoint
// (which already includes Genre + imdbRating, unlike the search endpoint).
const FEATURED_IDS = [
  "tt1375666", // Inception
  "tt0468569", // The Dark Knight
  "tt0816692", // Interstellar
  "tt6751668", // Parasite
  "tt4154796", // Avengers: Endgame
  "tt0111161", // The Shawshank Redemption
  "tt0110912", // Pulp Fiction
  "tt0137523", // Fight Club
  "tt0944947", // Game of Thrones
  "tt4574334", // Stranger Things
  "tt7366338", // Chernobyl
  "tt0903747", // Breaking Bad
];

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

function parseDetailToMovie(detail) {
  return {
    Title: detail.Title,
    Year: detail.Year,
    imdbID: detail.imdbID,
    Type: detail.Type,
    Poster: detail.Poster,
    Genre: detail.Genre || "",
    imdbRating:
      detail.imdbRating && detail.imdbRating !== "N/A"
        ? parseFloat(detail.imdbRating)
        : null,
  };
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
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, DEBOUNCE_MS);

  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  // Browse mode: what's shown before the visitor searches for anything.
  const [browseMovies, setBrowseMovies] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(true);

  const [showFilters, setShowFilters] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  const [yearMin, setYearMin] = useState("");
  const [yearMax, setYearMax] = useState("");
  const [sortBy, setSortBy] = useState("relevance");

  const searchRequestId = useRef(0);

  // --- Load the curated "browse" picks once, on mount ---
  useEffect(() => {
    let cancelled = false;

    Promise.all(
      FEATURED_IDS.map((id) =>
        fetch(`https://www.omdbapi.com/?apikey=${API_KEY}&i=${id}`)
          .then((res) => res.json())
          .catch(() => null)
      )
    ).then((results) => {
      if (cancelled) return;
      const parsed = results
        .filter((d) => d && d.Response !== "False")
        .map(parseDetailToMovie);
      setBrowseMovies(parsed);
      setBrowseLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // --- Search (debounced, fires as the user types) ---
  useEffect(() => {
    const q = debouncedQuery.trim();
    if (!q) {
      setMovies([]);
      setSearched(false);
      setError("");
      return;
    }

    const requestId = ++searchRequestId.current;
    setLoading(true);
    setSearched(true);
    setError("");

    fetch(`https://www.omdbapi.com/?apikey=${API_KEY}&s=${encodeURIComponent(q)}`)
      .then((res) => res.json())
      .then((data) => {
        if (requestId !== searchRequestId.current) return; // stale response, ignore

        if (data.Response === "False") {
          setMovies([]);
          setError(data.Error || "No results found.");
        } else {
          setMovies(data.Search.map((m) => ({ ...m, Genre: null, imdbRating: null })));
        }
      })
      .catch(() => {
        if (requestId !== searchRequestId.current) return;
        setError("Something went wrong fetching movies.");
        setMovies([]);
      })
      .finally(() => {
        if (requestId === searchRequestId.current) setLoading(false);
      });
  }, [debouncedQuery]);

  // --- Background enrichment: fetch Genre + imdbRating per search result ---
  // Runs after search results land, so genre filtering and rating sort
  // become available a beat after the grid first appears. Browse picks
  // already carry this data from the detail lookup above, so they're
  // untouched by this effect.
  useEffect(() => {
    const needsDetail = movies.filter((m) => m.Genre === null);
    if (needsDetail.length === 0) return;

    let cancelled = false;
    setEnriching(true);

    Promise.all(
      needsDetail.map((m) =>
        fetch(`https://www.omdbapi.com/?apikey=${API_KEY}&i=${m.imdbID}`)
          .then((res) => res.json())
          .catch(() => null)
      )
    ).then((details) => {
      if (cancelled) return;
      setMovies((prev) =>
        prev.map((movie) => {
          const detail = details.find((d) => d && d.imdbID === movie.imdbID);
          if (!detail) return { ...movie, Genre: "" }; // mark as attempted, avoid retry loop
          return {
            ...movie,
            Genre: detail.Genre || "",
            imdbRating: detail.imdbRating && detail.imdbRating !== "N/A" ? parseFloat(detail.imdbRating) : null,
          };
        })
      );
      setEnriching(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movies.length, debouncedQuery]);

  // The list actually on screen: search results once the visitor has typed
  // something, otherwise the curated browse picks.
  const activeMovies = searched ? movies : browseMovies;
  const activeLoading = searched ? loading : browseLoading;

  // --- Derived: genre options available so far ---
  const genreOptions = useMemo(() => {
    const set = new Set();
    activeMovies.forEach((m) => {
      if (m.Genre) m.Genre.split(",").map((g) => g.trim()).forEach((g) => set.add(g));
    });
    return ["", ...Array.from(set).sort()];
  }, [activeMovies]);

  // --- Filtering + sorting ---
  const filteredMovies = useMemo(() => {
    let list = [...activeMovies];

    if (typeFilter) list = list.filter((m) => m.Type === typeFilter);
    if (genreFilter) {
      list = list.filter((m) => m.Genre && m.Genre.includes(genreFilter));
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
  }, [activeMovies, typeFilter, genreFilter, yearMin, yearMax, sortBy]);

  const activeFilterCount =
    (typeFilter ? 1 : 0) + (genreFilter ? 1 : 0) + (yearMin ? 1 : 0) + (yearMax ? 1 : 0);

  function clearFilters() {
    setTypeFilter("");
    setGenreFilter("");
    setYearMin("");
    setYearMax("");
  }

  return (
    <div className="movie-search">
      <h1 className="movie-search__title">Movie Search</h1>

      <div className="movie-search__controls">
        <div className="movie-search__search-row">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a movie, e.g. Inception"
            className="movie-search__input"
          />
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

      {!searched && !activeLoading && (
        <h2 className="movie-search__section-title">Popular Right Now</h2>
      )}

      {activeLoading && (
        <div className="movie-search__grid">
          {Array.from({ length: searched ? 8 : FEATURED_IDS.length }).map((_, i) => (
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

      {!activeLoading && !error && filteredMovies.length === 0 && activeMovies.length > 0 && (
        <p className="movie-search__status">
          No results match your filters. Try widening the year range or clearing a filter.
        </p>
      )}

      {!activeLoading && !error && filteredMovies.length > 0 && (
        <div className="movie-search__grid">
          {filteredMovies.map((movie) => (
            <div key={movie.imdbID} className="movie-card">
              <div className="movie-card__poster">
                {movie.Poster !== "N/A" ? (
                  <img src={movie.Poster} alt={movie.Title} />
                ) : (
                  <div className="movie-card__poster-placeholder">No image</div>
                )}
                {movie.imdbRating != null && (
                  <span className="movie-card__rating">{movie.imdbRating.toFixed(1)}</span>
                )}
              </div>
              <div className="movie-card__info">
                <p className="movie-card__title">{movie.Title}</p>
                <p className="movie-card__meta">
                  {movie.Year} · {movie.Type}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {!activeLoading && !searched && !error && activeMovies.length === 0 && (
        <p className="movie-search__status">
          Search for a movie title to get started.
        </p>
      )}
    </div>
  );
}