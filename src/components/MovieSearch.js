import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import "./MovieSearch.css";

// Both keys are read from environment variables so real credentials never
// live in source control. Create a `.env` file in the project root
// (already gitignored by Create React App's default .gitignore) with:
//   REACT_APP_OMDB_API_KEY=your_omdb_key
//   REACT_APP_YOUTUBE_API_KEY=your_youtube_key
// Get a free OMDb key at https://www.omdbapi.com/apikey.aspx and a YouTube
// Data API v3 key at https://console.cloud.google.com/apis/credentials.
// See .env.example for the full template. Restart `npm start` after
// creating/editing .env — CRA only reads it at server startup.
const API_KEY = process.env.REACT_APP_OMDB_API_KEY;
const DEBOUNCE_MS = 400;

const YOUTUBE_API_KEY = process.env.REACT_APP_YOUTUBE_API_KEY;

if (process.env.NODE_ENV !== "production" && (!API_KEY || !YOUTUBE_API_KEY)) {
  // eslint-disable-next-line no-console
  console.warn(
    "Missing REACT_APP_OMDB_API_KEY and/or REACT_APP_YOUTUBE_API_KEY. " +
      "Copy .env.example to .env, fill in real keys, and restart the dev server."
  );
}

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

// A secondary catalog used only to power the "You Might Also Like" panel.
// OMDb's search endpoint only matches on title text — there is no
// genre/actor/director discovery endpoint on the free API — so "similar"
// titles are computed client-side by genre/director overlap against a
// curated pool of well-known titles spanning many genres, rather than a
// live query. It's fetched once in the background, separately from the
// featured browse picks above. Kept fairly wide (~38 titles) so the row
// still surfaces good multi-genre matches even after raising the display
// cap below — a bigger candidate pool matters more than the cap itself.
const SIMILAR_POOL_IDS = [
  "tt0109830", // Forrest Gump
  "tt0068646", // The Godfather
  "tt0071562", // The Godfather Part II
  "tt0133093", // The Matrix
  "tt0099685", // Goodfellas
  "tt0114369", // Se7en
  "tt0102926", // The Silence of the Lambs
  "tt0120737", // The Fellowship of the Ring
  "tt0245429", // Spirited Away
  "tt0110357", // The Lion King
  "tt2582802", // Whiplash
  "tt0361748", // Inglourious Basterds
  "tt0993846", // The Wolf of Wall Street
  "tt0119217", // Good Will Hunting
  "tt0407887", // The Departed
  "tt0338013", // Eternal Sunshine of the Spotless Mind
  "tt0088763", // Back to the Future
  "tt0209144", // Memento
  "tt0172495", // Gladiator
  "tt0081505", // The Shining
  "tt0078748", // Alien
  "tt0107048", // Groundhog Day
  "tt0120815", // Saving Private Ryan
  "tt0475784", // Westworld
  "tt0076759", // Star Wars: A New Hope
  "tt0080684", // The Empire Strikes Back
  "tt0086190", // Return of the Jedi
  "tt0107290", // Jurassic Park
  "tt0114814", // The Usual Suspects
  "tt0180093", // Requiem for a Dream
  "tt0264464", // Catch Me If You Can
  "tt2015381", // Guardians of the Galaxy
  "tt0117951", // Trainspotting
  "tt7286456", // Joker
  "tt1130884", // Shutter Island
  "tt2380307", // Coco
  "tt0435761", // Toy Story 3
  "tt1049413", // Up
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
// A token that will never occur naturally in plot text and contains no
// control characters, so it survives string storage/transport untouched.
const PERIOD_PLACEHOLDER = "@@PERIOD@@";

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
    Director: detail.Director || "",
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
  const [page, setPage] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  // Browse mode: what's shown before the visitor searches for anything.
  const [browseMovies, setBrowseMovies] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(true);

  // Background pool used only for "You Might Also Like" matching (see
  // SIMILAR_POOL_IDS above). Never rendered directly, so it has no loading
  // state of its own — the similar-titles section just stays empty until it
  // (and/or browseMovies) resolve.
  const [similarPool, setSimilarPool] = useState([]);

  const [showFilters, setShowFilters] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  const [yearMin, setYearMin] = useState("");
  const [yearMax, setYearMax] = useState("");
  const [sortBy, setSortBy] = useState("relevance");

  // Trailer player: which movie is selected, and the YouTube video id for it.
  // Selection lives in the URL (a `?movie=<imdbID>` query param) rather than
  // plain component state, so a selected trailer is shareable/bookmarkable
  // and the browser back button closes it instead of leaving the page.
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("movie");
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
  const pendingMovieRef = useRef(null); // movie object from the click that's about to become selectedId

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

  // --- Load the "similar titles" matching pool once, on mount ---
  // Independent from the browse-picks fetch above so a slow/failed request
  // here never blocks the main browse grid from showing.
  useEffect(() => {
    let cancelled = false;

    Promise.all(
      SIMILAR_POOL_IDS.map((id) =>
        fetch(`https://www.omdbapi.com/?apikey=${API_KEY}&i=${id}`)
          .then((res) => res.json())
          .catch(() => null)
      )
    ).then((results) => {
      if (cancelled) return;
      const parsed = results
        .filter((d) => d && d.Response !== "False")
        .map(parseDetailToMovie);
      setSimilarPool(parsed);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // --- Search (debounced, fires as the user types) --- fetches page 1 only;
  // loadMoreResults() below fetches subsequent pages on demand. OMDb's
  // search endpoint always paginates in blocks of 10 regardless of how many
  // titles actually match, so without pagination a broad query like
  // "Batman" silently hides everything past the first 10 results.
  useEffect(() => {
    const q = debouncedQuery.trim();
    if (!q) {
      setMovies([]);
      setSearched(false);
      setError("");
      setPage(1);
      setTotalResults(0);
      return;
    }

    const requestId = ++searchRequestId.current;
    setLoading(true);
    setSearched(true);
    setError("");
    setPage(1);

    fetch(`https://www.omdbapi.com/?apikey=${API_KEY}&s=${encodeURIComponent(q)}&page=1`)
      .then((res) => res.json())
      .then((data) => {
        if (requestId !== searchRequestId.current) return; // stale response, ignore

        if (data.Response === "False") {
          setMovies([]);
          setTotalResults(0);
          setError(data.Error || "No results found.");
        } else {
          setMovies(data.Search.map((m) => ({ ...m, Genre: null, imdbRating: null })));
          setTotalResults(parseInt(data.totalResults, 10) || 0);
        }
      })
      .catch(() => {
        if (requestId !== searchRequestId.current) return;
        setError("Something went wrong fetching movies.");
        setMovies([]);
        setTotalResults(0);
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
            Director: detail.Director || "",
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

  // Only search mode paginates — the curated browse grid is a fixed list.
  // Filters apply client-side to whatever pages have been fetched so far,
  // so "more to load" is judged against the raw (unfiltered) result count.
  const hasMore = searched && !loading && movies.length > 0 && movies.length < totalResults;

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

  // Fetches the next page (10 more) of the current search and appends them.
  // Shares searchRequestId with the main search effect so that typing a new
  // query while a "load more" fetch is in flight invalidates the stale one.
  function loadMoreResults() {
    const q = debouncedQuery.trim();
    if (!q || loadingMore) return;

    const nextPage = page + 1;
    const requestId = ++searchRequestId.current;
    setLoadingMore(true);

    fetch(`https://www.omdbapi.com/?apikey=${API_KEY}&s=${encodeURIComponent(q)}&page=${nextPage}`)
      .then((res) => res.json())
      .then((data) => {
        if (requestId !== searchRequestId.current) return; // a newer search superseded this one
        if (data.Response === "False" || !data.Search) return;

        setMovies((prev) => {
          const seen = new Set(prev.map((m) => m.imdbID));
          const additions = data.Search.filter((m) => !seen.has(m.imdbID)).map((m) => ({
            ...m,
            Genre: null,
            imdbRating: null,
          }));
          return [...prev, ...additions];
        });
        setPage(nextPage);
        setTotalResults(parseInt(data.totalResults, 10) || totalResults);
      })
      .catch(() => {
        // Leave the list as-is — the button just stays visible so the
        // visitor can try again.
      })
      .finally(() => {
        setLoadingMore(false);
      });
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


  // Called from a movie card click/Enter — just updates the URL. Stashing
  // the clicked movie object in a ref lets the resolution effect below use
  // it immediately instead of re-fetching data we already have in hand.
  function openMovie(movie) {
    pendingMovieRef.current = movie;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("movie", movie.imdbID);
      return next;
    });
  }

  // Reacts to the `movie` URL param, whichever way it changed: a card
  // click (openMovie, above), the browser back/forward buttons, or landing
  // directly on a `?movie=<imdbID>` link. Resolves the imdbID into a movie
  // object — preferring data already on hand — then hands off to
  // openResolvedMovie to actually fetch the trailer/detail.
  useEffect(() => {
    if (!selectedId) {
      // Closed (X button, or navigated back past the selection).
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
      pendingMovieRef.current = null;
      return;
    }

    const fromClick =
      pendingMovieRef.current?.imdbID === selectedId ? pendingMovieRef.current : null;
    pendingMovieRef.current = null;

    const known = fromClick || activeMovies.find((m) => m.imdbID === selectedId);
    if (known) {
      openResolvedMovie(known);
      return;
    }

    // Not in the currently loaded browse/search list — this is a deep link
    // or a page refresh with the param already in the URL. Fetch a minimal
    // record directly by imdbID so the trailer panel still has a
    // title/year/poster to show.
    let cancelled = false;
    fetch(`https://www.omdbapi.com/?apikey=${API_KEY}&i=${selectedId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.Response === "False") {
          setTrailerError(data.Error || "Couldn't find that title.");
          return;
        }
        openResolvedMovie(parseDetailToMovie(data));
      })
      .catch(() => {
        if (!cancelled) setTrailerError("Couldn't load that title.");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Does the actual trailer + detail fetching for a resolved movie object.
  function openResolvedMovie(movie) {
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

  // Just clears the URL param — the resolution effect above handles
  // resetting all the trailer/detail state once selectedId goes null.
  // `replace: true` so closing via the X button doesn't leave a "no movie"
  // entry in history (that would make the back button appear to do
  // nothing on the first press).
  function closeTrailer() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("movie");
        return next;
      },
      { replace: true }
    );
  }

  // --- "You Might Also Like" ---
  // Scored by genre overlap (plus a small bonus for a shared director)
  // against every title the app currently knows the genre for: the curated
  // browse picks, the dedicated similar-titles pool, and any already-
  // enriched search results from this session. See SIMILAR_POOL_IDS for why
  // this isn't a live discovery query.
  const similarTitles = useMemo(() => {
    if (!movieDetail || !movieDetail.Genre || movieDetail.Genre === "N/A") return [];

    const targetGenres = new Set(
      movieDetail.Genre.split(",").map((g) => g.trim()).filter(Boolean)
    );
    if (targetGenres.size === 0) return [];

    const targetDirector =
      movieDetail.Director && movieDetail.Director !== "N/A"
        ? movieDetail.Director.trim()
        : null;

    const candidates = new Map();
    [...browseMovies, ...similarPool, ...movies].forEach((m) => {
      if (m.imdbID && m.Genre && !candidates.has(m.imdbID)) {
        candidates.set(m.imdbID, m);
      }
    });
    candidates.delete(movieDetail.imdbID);

    const scored = [];
    candidates.forEach((m) => {
      const genres = m.Genre.split(",").map((g) => g.trim()).filter(Boolean);
      const shared = genres.filter((g) => targetGenres.has(g)).length;
      if (shared === 0) return;
      const directorBonus = targetDirector && m.Director === targetDirector ? 1 : 0;
      scored.push({ movie: m, score: shared + directorBonus });
    });

    scored.sort(
      (a, b) => b.score - a.score || (b.movie.imdbRating ?? -1) - (a.movie.imdbRating ?? -1)
    );

    return scored.slice(0, 10).map((s) => s.movie);
  }, [movieDetail, browseMovies, similarPool, movies]);

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

                {similarTitles.length > 0 && (
                  <div className="movie-search__similar">
                    <h3 className="movie-search__similar-title">You Might Also Like</h3>
                    <div className="movie-search__similar-row">
                      {similarTitles.map((m) => (
                        <div
                          key={m.imdbID}
                          className="movie-search__similar-card"
                          onClick={() => openMovie(m)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openMovie(m);
                            }
                          }}
                        >
                          <div className="movie-search__similar-poster">
                            {m.Poster !== "N/A" ? (
                              <img
                                src={m.Poster}
                                alt={m.Title}
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                              <div className="movie-search__similar-poster-placeholder">
                                No image
                              </div>
                            )}
                          </div>
                          <p className="movie-search__similar-card-title">{m.Title}</p>
                          <p className="movie-search__similar-card-meta">{m.Year}</p>
                        </div>
                      ))}
                    </div>
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
          {filteredMovies.map((movie, index) => (
            <div
              key={movie.imdbID}
              className={`movie-card ${
                selectedMovie?.imdbID === movie.imdbID ? "movie-card--selected" : ""
              }`}
              onClick={() => openMovie(movie)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openMovie(movie);
                }
              }}
            >
              <div className="movie-card__poster">
                {movie.Poster !== "N/A" ? (
                  <img
                    src={movie.Poster}
                    alt={movie.Title}
                    // The first couple of rows are visible immediately on
                    // load, so they fetch eagerly (avoids a pop-in flash
                    // above the fold); everything below lazy-loads only as
                    // the visitor scrolls near it, which keeps the initial
                    // page weight down on grids of dozens of posters.
                    loading={index < 4 ? "eager" : "lazy"}
                    decoding="async"
                  />
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

      {hasMore && (
        <div className="movie-search__load-more">
          <button
            type="button"
            className="movie-search__load-more-btn"
            onClick={loadMoreResults}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading…" : `Load more (${movies.length} of ${totalResults})`}
          </button>
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