import { useState, useEffect, useMemo, useRef } from "react";
import "./MovieSearch.css";

const API_KEY = "7894ef1b"; // get one free at https://www.omdbapi.com/apikey.aspx
const DEBOUNCE_MS = 400;


const YOUTUBE_API_KEY = "AIzaSyA-rxBgD7E1QSbKsw-GrBwccVcJRyNsZIA";




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


const PLOT_MAX_LENGTH = 320;
const PLOT_MAX_SENTENCES = 3;


const ABBREVIATIONS = /\b(?:[A-Z]\.){2,}|\b(?:Mr|Mrs|Ms|Dr|Jr|Sr|St|vs|etc)\./g;
const PERIOD_PLACEHOLDER = "";

function truncatePlot(text) {
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

  // Trailer player: which movie is selected, and the YouTube video id for it.
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [trailerId, setTrailerId] = useState(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const [trailerError, setTrailerError] = useState("");


  const [movieDetail, setMovieDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

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
  const trailerSectionRef = useRef(null); // scroll target: the trailer panel at the top of the page

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

  // Scrolls the trailer panel into view. Runs whenever a movie is selected,
  // so it also re-centers if the visitor had scrolled further down the grid
  // before clicking a different title.
  useEffect(() => {
    if (!selectedMovie) return;
    if (trailerSectionRef.current) {
      trailerSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [selectedMovie]);


  function selectMovie(movie) {
    setSelectedMovie(movie);
    setTrailerId(null);
    setTrailerError("");

    const cached = trailerCache.current[movie.imdbID];
    if (cached !== undefined) {
      trailerRequestId.current++; // invalidate any in-flight fetch from a previous click
      setTrailerId(cached);
      setTrailerLoading(false);
      if (cached === null) setTrailerError("No trailer found for this title.");
    } else {
      const requestId = ++trailerRequestId.current;
      setTrailerLoading(true);

      const q = encodeURIComponent(`${movie.Title} ${movie.Year} official trailer`);
      fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=${q}&key=${YOUTUBE_API_KEY}`
      )
        .then((res) => res.json())
        .then((data) => {
          if (requestId !== trailerRequestId.current) return; // a newer click superseded this one
          const videoId =
            data.items && data.items[0] && data.items[0].id
              ? data.items[0].id.videoId
              : null;
          trailerCache.current[movie.imdbID] = videoId || null;
          setTrailerId(videoId || null);
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

    const requestId = ++detailRequestId.current;
    setDetailLoading(true);

    fetch(`https://www.omdbapi.com/?apikey=${API_KEY}&i=${movie.imdbID}&plot=full`)
      .then((res) => res.json())
      .then((data) => {
        if (requestId !== detailRequestId.current) return; // a newer click superseded this one
        if (data.Response === "False") {
          detailCache.current[movie.imdbID] = null;
          setDetailError(data.Error || "Couldn't load details for this title.");
          return;
        }
        detailCache.current[movie.imdbID] = data;
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

    fetch(`https://www.omdbapi.com/?apikey=${API_KEY}&i=${imdbID}&Season=${season}`)
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
              <div className="movie-search__trailer-status">Loading trailer…</div>
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
              <p className="movie-search__detail-status">Loading details…</p>
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
                        {movieDetail.Actors}
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
                        {movieDetail.Director}
                      </p>
                    )}
                  </div>
                </div>

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
              </>
            )}
          </div>
        </div>
      )}

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
            <div
              key={movie.imdbID}
              className={`movie-card ${
                selectedMovie?.imdbID === movie.imdbID ? "movie-card--selected" : ""
              }`}
              onClick={() => selectMovie(movie)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  selectMovie(movie);
                }
              }}
            >
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