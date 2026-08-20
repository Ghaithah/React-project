import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import "./MovieSearch.css";


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


const BROWSE_IDS = [
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
  "tt0120689", // The Green Mile
  "tt0241527", // Harry Potter and the Sorcerer's Stone
  "tt0167260", // The Lord of the Rings: The Return of the King
  "tt0167261", // The Lord of the Rings: The Two Towers
  "tt0118715", // The Big Lebowski
  "tt0482571", // The Prestige
  "tt1345836", // The Dark Knight Rises
  "tt0372784", // Batman Begins
  "tt0086250", // Scarface
  "tt0047478", // Seven Samurai
  "tt0050083", // 12 Angry Men
  "tt0060196", // The Good, the Bad and the Ugly
  "tt0034583", // Casablanca
  "tt0050212", // The Bridge on the River Kwai
  "tt0053125", // North by Northwest
  "tt0057012", // Dr. Strangelove
  "tt0208092", // Snatch
  "tt0266697", // Kill Bill: Vol. 1
  "tt0126029", // Shrek
  "tt0910970", // WALL·E
  "tt0198781", // Monsters, Inc.
  "tt0317705", // The Incredibles
  "tt2278388", // The Grand Budapest Hotel
  "tt0088247", // The Terminator
  "tt0103064", // Terminator 2: Judgment Day
  "tt0499549", // Avatar
  "tt0796366", // Star Trek
  "tt0369610", // Jurassic World
  "tt0848228", // The Avengers
  "tt4633694", // Spider-Man: Into the Spider-Verse
  "tt0105236", // Reservoir Dogs
  "tt0071853", // Monty Python and the Holy Grail
  "tt0129167", // The Iron Giant
  "tt7131622", // Once Upon a Time in Hollywood
  "tt5027774", // Three Billboards Outside Ebbing, Missouri
  "tt3315342", // Logan
  "tt0169547", // American Beauty
];


const BROWSE_PAGE_SIZE = 12;


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
    
    Actors: detail.Actors || "",
    imdbRating:
      detail.imdbRating && detail.imdbRating !== "N/A"
        ? parseFloat(detail.imdbRating)
        : null,
  };
}


function renderPosterCard(movie, onSelect) {
  return (
    <div
      key={movie.imdbID}
      className="movie-search__similar-card"
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="movie-search__similar-poster">
        {movie.Poster !== "N/A" ? (
          <img src={movie.Poster} alt={movie.Title} loading="lazy" decoding="async" />
        ) : (
          <div className="movie-search__similar-poster-placeholder">No image</div>
        )}
      </div>
      <p className="movie-search__similar-card-title">{movie.Title}</p>
      <p className="movie-search__similar-card-meta">{movie.Year}</p>
    </div>
  );
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

  
  const [browseMovies, setBrowseMovies] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [browseLoadingMore, setBrowseLoadingMore] = useState(false);
  const [browsePage, setBrowsePage] = useState(0);


  const [similarPool, setSimilarPool] = useState([]);

  const [showFilters, setShowFilters] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  const [yearMin, setYearMin] = useState("");
  const [yearMax, setYearMax] = useState("");
  const [sortBy, setSortBy] = useState("relevance");

 
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("movie");
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [trailerId, setTrailerId] = useState(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const [trailerError, setTrailerError] = useState("");


  const [movieDetail, setMovieDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

 
  const [selectedPerson, setSelectedPerson] = useState(null);

 
  const [personInfo, setPersonInfo] = useState(null);
  const [personInfoLoading, setPersonInfoLoading] = useState(false);

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
  const personInfoRequestId = useRef(0);
  const personInfoCache = useRef({}); // person name -> info object | null
  const trailerSectionRef = useRef(null); // scroll target: the trailer panel at the top of the page
  const pendingMovieRef = useRef(null); // movie object from the click that's about to become selectedId
  const loadMoreSentinelRef = useRef(null); // bottom-of-grid marker watched for infinite scroll


  useEffect(() => {
    const idsForPage = BROWSE_IDS.slice(
      browsePage * BROWSE_PAGE_SIZE,
      (browsePage + 1) * BROWSE_PAGE_SIZE
    );
    if (idsForPage.length === 0) return; // ran out of curated titles

    let cancelled = false;
    if (browsePage === 0) setBrowseLoading(true);
    else setBrowseLoadingMore(true);

    Promise.all(
      idsForPage.map((id) =>
        fetch(`https://www.omdbapi.com/?apikey=${API_KEY}&i=${id}`)
          .then((res) => res.json())
          .catch(() => null)
      )
    ).then((results) => {
      if (cancelled) return;
      const parsed = results
        .filter((d) => d && d.Response !== "False")
        .map(parseDetailToMovie);
      setBrowseMovies((prev) => (browsePage === 0 ? parsed : [...prev, ...parsed]));
      if (browsePage === 0) setBrowseLoading(false);
      else setBrowseLoadingMore(false);
    });

    return () => {
      cancelled = true;
    };
  }, [browsePage]);


  function loadMoreBrowse() {
    if (browseLoadingMore) return;
    setBrowsePage((p) => p + 1);
  }

  
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
            Actors: detail.Actors || "",
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

 
  const activeMovies = searched ? movies : browseMovies;
  const activeLoading = searched ? loading : browseLoading;


  const searchHasMore = searched && !loading && movies.length > 0 && movies.length < totalResults;
  const browseHasMore =
    !searched && !browseLoading && (browsePage + 1) * BROWSE_PAGE_SIZE < BROWSE_IDS.length;
  const hasMore = searchHasMore || browseHasMore;
  const loadingMoreAny = loadingMore || browseLoadingMore;

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
        // Leave the list as-is — the sentinel/button just stays visible so
        // the visitor (or the observer, on next scroll) can try again.
      })
      .finally(() => {
        setLoadingMore(false);
      });
  }

  
  function loadMore() {
    if (searched) loadMoreResults();
    else loadMoreBrowse();
  }

  useEffect(() => {
    if (!hasMore) return;
    if (typeof IntersectionObserver === "undefined") return; // fall back to the manual button
    const node = loadMoreSentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "400px" } // start fetching a bit before the sentinel is actually visible
    );
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, movies.length, browseMovies.length]);


  useEffect(() => {
    if (!selectedMovie) return;
    if (trailerSectionRef.current) {
      trailerSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [selectedMovie]);



  function openMovie(movie) {
    pendingMovieRef.current = movie;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("movie", movie.imdbID);
      return next;
    });
  }


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
      setSelectedPerson(null);
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
    setSelectedPerson(null); // don't carry a cast/crew filter over to the new title

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
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("movie");
        return next;
      },
      { replace: true }
    );
  }


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

 
  const personTitles = useMemo(() => {
    if (!selectedPerson) return [];
    const target = selectedPerson.trim().toLowerCase();
    if (!target) return [];

    const candidates = new Map();
    [...browseMovies, ...similarPool, ...movies].forEach((m) => {
      if (m.imdbID && !candidates.has(m.imdbID)) candidates.set(m.imdbID, m);
    });
    if (movieDetail) candidates.delete(movieDetail.imdbID);

    const matches = [];
    candidates.forEach((m) => {
      const actors = m.Actors ? m.Actors.split(",").map((n) => n.trim().toLowerCase()) : [];
      const directors = m.Director
        ? m.Director.split(",").map((n) => n.trim().toLowerCase())
        : [];
      if (actors.includes(target) || directors.includes(target)) matches.push(m);
    });

    matches.sort((a, b) => (b.imdbRating ?? -1) - (a.imdbRating ?? -1));
    return matches;
  }, [selectedPerson, browseMovies, similarPool, movies, movieDetail]);


  useEffect(() => {
    if (!selectedPerson) {
      personInfoRequestId.current++;
      setPersonInfo(null);
      setPersonInfoLoading(false);
      return;
    }

    const cached = personInfoCache.current[selectedPerson];
    if (cached !== undefined) {
      personInfoRequestId.current++;
      setPersonInfo(cached);
      setPersonInfoLoading(false);
      return;
    }

    const requestId = ++personInfoRequestId.current;
    setPersonInfo(null);
    setPersonInfoLoading(true);

    fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(selectedPerson)}`
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (requestId !== personInfoRequestId.current) return;
        if (!data || data.type === "disambiguation") {
          personInfoCache.current[selectedPerson] = null;
          setPersonInfo(null);
          return;
        }
        const info = {
          extract: data.extract || "",
          description: data.description || "",
          thumbnail: data.thumbnail ? data.thumbnail.source : null,
          pageUrl:
            data.content_urls && data.content_urls.desktop
              ? data.content_urls.desktop.page
              : null,
        };
        personInfoCache.current[selectedPerson] = info;
        setPersonInfo(info);
      })
      .catch(() => {
        if (requestId !== personInfoRequestId.current) return;
        personInfoCache.current[selectedPerson] = null;
        setPersonInfo(null);
      })
      .finally(() => {
        if (requestId === personInfoRequestId.current) setPersonInfoLoading(false);
      });
  }, [selectedPerson]);

 
  function renderPeopleList(namesStr) {
    const names = namesStr
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);

    return names.map((name, i) => (
      <span key={name}>
        <button
          type="button"
          className={`movie-search__person-link ${
            selectedPerson && selectedPerson.toLowerCase() === name.toLowerCase()
              ? "is-active"
              : ""
          }`}
          onClick={() =>
            setSelectedPerson((p) =>
              p && p.toLowerCase() === name.toLowerCase() ? null : name
            )
          }
        >
          {name}
        </button>
        {i < names.length - 1 ? ", " : ""}
      </span>
    ));
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
              <div
                className="movie-search__trailer-frame--skeleton"
                role="status"
                aria-label="Loading trailer"
              />
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
              <div
                className="movie-search__detail-skeleton"
                role="status"
                aria-label="Loading details"
              >
                <div className="movie-search__detail-skeleton-main">
                  <div className="movie-search__detail-skeleton-pills">
                    <span className="skeleton-pill" />
                    <span className="skeleton-pill" />
                    <span className="skeleton-pill" />
                  </div>
                  <div className="skeleton-line skeleton-line--plot" />
                  <div className="skeleton-line skeleton-line--plot" />
                  <div className="skeleton-line skeleton-line--plot-short" />
                </div>
                <div className="movie-search__detail-skeleton-facts">
                  <div className="skeleton-line skeleton-line--fact" />
                  <div className="skeleton-line skeleton-line--fact" />
                  <div className="skeleton-line skeleton-line--fact" />
                </div>
              </div>
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
                        {renderPeopleList(movieDetail.Actors)}
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
                        {renderPeopleList(movieDetail.Director)}
                      </p>
                    )}
                  </div>
                </div>

                {selectedPerson && (
                  <div className="movie-search__person">
                    <div className="movie-search__person-header">
                      <h3 className="movie-search__person-title">
                        More with {selectedPerson}
                      </h3>
                      <button
                        type="button"
                        className="movie-search__person-close"
                        onClick={() => setSelectedPerson(null)}
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
                            decoding="async"
                          />
                        )}
                        <div className="movie-search__person-bio-text">
                          {personInfo.description && (
                            <p className="movie-search__person-bio-desc">
                              {personInfo.description}
                            </p>
                          )}
                          {personInfo.extract && (
                            <p className="movie-search__person-bio-extract">
                              {personInfo.extract}
                            </p>
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
                      <p className="movie-search__detail-status">
                        No info found for {selectedPerson}.
                      </p>
                    )}

                    {personTitles.length > 0 && (
                      <div className="movie-search__similar-row">
                        {personTitles.map((m) =>
                          renderPosterCard(m, () => {
                            setSelectedPerson(null);
                            openMovie(m);
                          })
                        )}
                      </div>
                    )}
                  </div>
                )}

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
                      {similarTitles.map((m) => renderPosterCard(m, () => openMovie(m)))}
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
          {Array.from({ length: searched ? 8 : BROWSE_PAGE_SIZE }).map((_, i) => (
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
        <div className="movie-search__load-more" ref={loadMoreSentinelRef}>
          {loadingMoreAny && (
            <span className="movie-search__load-more-status" role="status">
              Loading more…
            </span>
          )}
          {!loadingMoreAny && typeof IntersectionObserver === "undefined" && (
            <button type="button" className="movie-search__load-more-btn" onClick={loadMore}>
              {searched ? `Load more (${movies.length} of ${totalResults})` : "Load more"}
            </button>
          )}
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