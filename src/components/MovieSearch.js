import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useProfiles } from "./ProfileContext";
import HeroBanner from "./HeroBanner";
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

  // --- Expansion batch: pulled in from SIMILAR_POOL_IDS below (already
  // fetched/validated for the "You Might Also Like" feature elsewhere in
  // this file, so reusing them here for the main browse grid costs
  // nothing new in confidence) plus a second hand-picked batch covering
  // more classics, blockbusters, and a few well-known series. This is
  // what actually pushes "Load more" past the old ~49-title ceiling —
  // see the browseWarning UI below for what happens on the rare id that
  // turns out to be wrong (OMDb quietly drops it, nothing breaks).
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

  "tt0108052", // Schindler's List
  "tt0073486", // One Flew Over the Cuckoo's Nest
  "tt0038650", // It's a Wonderful Life
  "tt0118799", // Life Is Beautiful
  "tt0110413", // Léon: The Professional
  "tt0317248", // City of God
  "tt0093058", // Full Metal Jacket
  "tt0119488", // L.A. Confidential
  "tt0116282", // Fargo
  "tt0332280", // The Notebook
  "tt0246578", // Donnie Darko
  "tt0268978", // A Beautiful Mind
  "tt0093779", // The Princess Bride
  "tt0071315", // Chinatown
  "tt0032138", // The Wizard of Oz
  "tt0043014", // Sunset Boulevard
  "tt0095016", // Die Hard
  "tt0082971", // Raiders of the Lost Ark
  "tt0033467", // Citizen Kane
  "tt0056172", // Lawrence of Arabia
  "tt0086879", // Amadeus
  "tt6966692", // Green Book
  "tt5013056", // Dunkirk
  "tt1825683", // Black Panther
  "tt4154756", // Avengers: Infinity War
  "tt1160419", // Dune
  "tt1877830", // The Batman
  "tt10872600", // Spider-Man: No Way Home
  "tt15398776", // Oppenheimer
  "tt1517268", // Barbie
  "tt0892769", // How to Train Your Dragon
  "tt2948356", // Zootopia
  "tt3521164", // Moana
  "tt2294629", // Frozen
  "tt2096673", // Inside Out
  "tt1490017", // The Lego Movie
  "tt1772341", // Wreck-It Ralph
  "tt0096283", // My Neighbor Totoro
  "tt0347149", // Howl's Moving Castle
  "tt0141842", // The Sopranos
  "tt0386676", // The Office (U.S.)
  "tt0108778", // Friends
  "tt0306414", // The Wire
  "tt1475582", // Sherlock
];


// A separate, hand-picked pool of family movies for the Kids profile's
// "Popular Right Now" grid. Kept distinct from BROWSE_IDS rather than just
// filtering it, because most of the general browse list (crime dramas, war
// films, horror, etc.) has nothing kid-appropriate to filter down to.
const KIDS_BROWSE_IDS = [
  "tt0114709", // Toy Story
  "tt0120363", // Toy Story 2
  "tt0435761", // Toy Story 3
  "tt1979376", // Toy Story 4
  "tt0266543", // Finding Nemo
  "tt0110357", // The Lion King
  "tt0126029", // Shrek
  "tt0910970", // WALL·E
  "tt0198781", // Monsters, Inc.
  "tt0317705", // The Incredibles
  "tt1049413", // Up
  "tt0382932", // Ratatouille
  "tt2096673", // Inside Out
  "tt2245084", // Big Hero 6
  "tt1323594", // Despicable Me
  "tt0892769", // How to Train Your Dragon
  "tt0441773", // Kung Fu Panda
  "tt2294629", // Frozen
  "tt3521164", // Moana
  "tt2948356", // Zootopia
  "tt1109624", // Paddington
  "tt2380307", // Coco
  "tt0129167", // The Iron Giant
  "tt0245429", // Spirited Away

  // --- Expansion batch: more hand-picked family/animated titles, same
  // ~49-title-ceiling fix as BROWSE_IDS above. Every one of these still
  // has to clear isKidSafe() (genre-based) before it actually shows in
  // the Kids grid — see the filteredMovies logic further down — so a
  // title landing here isn't a bypass of that check, just more raw
  // material for it to filter.
  "tt1490017", // The Lego Movie
  "tt1772341", // Wreck-It Ralph
  "tt5848272", // Ralph Breaks the Internet
  "tt0096283", // My Neighbor Totoro
  "tt0347149", // Howl's Moving Castle
  "tt0876563", // Ponyo
  "tt2379713", // Kubo and the Two Strings
  "tt1219827", // The Croods
  "tt4520988", // Frozen II
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

// Caps how many OMDb requests fire at once. Fetching a whole ID batch with
// a bare Promise.all() (as this used to) throws every request at OMDb
// simultaneously — up to 49 at once between the browse grid and the
// similar-titles pool on a single page load. OMDb's free tier doesn't
// handle that gracefully: a chunk of the burst comes back with
// Response:"False" (rate-limited / request-limit-reached), and since
// those were silently filtered out of the results, titles would just
// vanish from the grid with zero indication anything went wrong. Routing
// every OMDb fetch through this small worker pool keeps at most
// FETCH_CONCURRENCY requests in flight at a time.
const FETCH_CONCURRENCY = 5;

async function fetchJsonPool(urls, limit = FETCH_CONCURRENCY) {
  const results = new Array(urls.length);
  let next = 0;

  async function worker() {
    while (next < urls.length) {
      const i = next++;
      try {
        const res = await fetch(urls[i]);
        results[i] = await res.json();
      } catch {
        results[i] = null;
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, urls.length) }, worker);
  await Promise.all(workers);
  return results;
}

// --- Local caching for the curated browse / similar-titles pools ---
// The browse grid and similar-titles pool are responsible for the
// biggest bursts of OMDb requests (see fetchJsonPool above) — up to 49
// requests on a single page load, all for a small, mostly-static set of
// curated IMDb IDs that rarely change. Caching successful results in
// localStorage means a page refresh (extremely common during dev) reuses
// what was already fetched instead of re-spending quota on the same
// titles every time. Only a "clean" result set (zero failed lookups) is
// ever cached, so a batch that partially failed from a rate limit /
// exhausted daily quota isn't remembered as if it were correct — the
// next load just retries it from the network instead.
const CACHE_VERSION = "v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // ~1 day, roughly matching OMDb's daily quota reset

function readCache(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    // localStorage unavailable (private browsing, disabled, full, etc.) —
    // treat it as a cache miss rather than letting this break the page.
    return null;
  }
}

function writeCache(key, data) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // Storage full/unavailable — caching is a nice-to-have, not fetch-critical.
  }
}

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

export function truncatePlot(text) {
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
    // Plot/Runtime/Rated aren't used by the grid cards, but the browse
    // fetch already hits OMDb's by-ID endpoint (which returns them for
    // free), and HeroBanner needs them — so capture them here instead of
    // firing a second request just for the featured title.
    Plot: detail.Plot || "",
    Runtime: detail.Runtime || "",
    Rated: detail.Rated || "",
    imdbRating:
      detail.imdbRating && detail.imdbRating !== "N/A"
        ? parseFloat(detail.imdbRating)
        : null,
  };
}


// --- Kids-profile content filtering ---
// OMDb doesn't expose a simple "kid safe" flag, so this leans on genre as a
// practical proxy: a title has to carry at least one clearly kid-friendly
// genre, and none of the genres that are a near-certain sign it isn't meant
// for children. Titles whose genre hasn't loaded yet (Genre === null, before
// enrichment finishes) are treated as not-yet-safe rather than shown
// optimistically, so nothing inappropriate flashes on screen while it loads.
const KID_SAFE_GENRES = [
  "Animation",
  "Family",
  "Adventure",
  "Comedy",
  "Fantasy",
  "Musical",
  "Sport",
];
const KID_UNSAFE_GENRES = [
  "Horror",
  "Crime",
  "War",
  "Thriller",
  "Film-Noir",
  "Mystery",
];

function isKidSafe(movie) {
  if (!movie || !movie.Genre) return false;
  const genres = movie.Genre.split(",").map((g) => g.trim()).filter(Boolean);
  if (genres.length === 0) return false;
  if (genres.some((g) => KID_UNSAFE_GENRES.includes(g))) return false;
  return genres.some((g) => KID_SAFE_GENRES.includes(g));
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

// Netflix-style hover card: a gradient scrim that rises over the poster on
// mouse hover (or keyboard focus, via :focus-within in the CSS) showing a
// couple of genre chips plus a quick "Play" button that jumps straight to
// the trailer — skipping the usual click-to-preview-in-hero-banner step.
// Pure CSS drives the reveal (see .movie-card__hover-overlay), so this is
// only ever visible to visitors whose input actually supports hover
// (pointer: fine) or who've focused the card via keyboard; touch visitors
// keep the existing tap-to-preview flow untouched.
function renderCardHoverOverlay(movie, onPlay) {
  const genres = movie.Genre
    ? movie.Genre.split(",").map((g) => g.trim()).filter(Boolean).slice(0, 2)
    : [];

  return (
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
          onPlay();
        }}
        onKeyDown={(e) => {
          // Stop Enter/Space from also bubbling up to the card's own
          // onKeyDown, which would fire previewMovie() a second time.
          if (e.key === "Enter" || e.key === " ") e.stopPropagation();
        }}
        aria-label={`Play ${movie.Title} trailer`}
      >
        <span aria-hidden="true">▶</span> Play
      </button>
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
  const { activeProfile } = useProfiles();
  const kidsMode = !!(activeProfile && activeProfile.isKids);
  const browseIdsSource = kidsMode ? KIDS_BROWSE_IDS : BROWSE_IDS;

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
  // Non-blocking notice shown when some of the curated browse titles
  // failed to load from OMDb (rate limit, exhausted daily quota, network
  // blip, etc.) — see fetchJsonPool above for why this can happen even
  // though the app itself has no bug in *which* titles it's asking for.
  const [browseWarning, setBrowseWarning] = useState("");


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
  // The movie currently previewed in the hero banner. Set whenever a movie
  // card is clicked anywhere (browse grid, search grid, "You Might Also
  // Like", cast/crew rows) — clicking a card no longer jumps straight into
  // the trailer, it just previews that title up top. Play / More Info on
  // the hero banner is what actually opens the trailer via openMovie().
  const [heroMovie, setHeroMovie] = useState(null);
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


  // Switching profiles mid-session (Kids <-> regular) should reset the
  // browse grid back to page one of whichever pool now applies, and clear
  // any in-flight search so nothing from the other profile lingers on
  // screen while the new pool loads.
  useEffect(() => {
    setBrowseMovies([]);
    setBrowsePage(0);
    setBrowseLoading(true);
    setBrowseWarning("");
    setQuery("");
    setMovies([]);
    setSearched(false);
    setError("");
    setHeroMovie(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kidsMode]);


  useEffect(() => {
    const idsForPage = browseIdsSource.slice(
      browsePage * BROWSE_PAGE_SIZE,
      (browsePage + 1) * BROWSE_PAGE_SIZE
    );
    if (idsForPage.length === 0) return; // ran out of curated titles

    let cancelled = false;
    const cacheKey = `movieSearch:browse:${CACHE_VERSION}:${kidsMode ? "kids" : "regular"}:${browsePage}`;

    const cached = readCache(cacheKey);
    if (cached) {
      setBrowseMovies((prev) => (browsePage === 0 ? cached : [...prev, ...cached]));
      if (browsePage === 0) {
        setBrowseLoading(false);
        setBrowseWarning("");
      } else {
        setBrowseLoadingMore(false);
      }
      return;
    }

    if (browsePage === 0) setBrowseLoading(true);
    else setBrowseLoadingMore(true);

    // plot=full: OMDb's default plot is a short, often mid-sentence
    // clipped summary. The hero banner shows this Plot field in full
    // now (no more line-clamp truncation on top), so it needs the
    // real, complete synopsis rather than the pre-shortened one.
    //
    // Routed through fetchJsonPool (rather than a bare Promise.all) so
    // this batch of up to BROWSE_PAGE_SIZE requests doesn't all hit OMDb
    // in the same instant — see fetchJsonPool's comment for why that
    // matters.
    fetchJsonPool(
      idsForPage.map((id) => `https://www.omdbapi.com/?apikey=${API_KEY}&i=${id}&plot=full`)
    ).then((results) => {
      if (cancelled) return;
      const parsed = results
        .filter((d) => d && d.Response !== "False")
        .map(parseDetailToMovie);
      const failed = results.filter((d) => !d || d.Response === "False");

      if (failed.length > 0) {
        const reason = failed.find((d) => d && d.Error)?.Error || "a network error";
        // eslint-disable-next-line no-console
        console.warn(
          `[MovieSearch] ${failed.length}/${results.length} browse title(s) failed to load ` +
            `from OMDb (${reason}). They were silently dropped from the grid.`
        );
        if (browsePage === 0) {
          setBrowseWarning(
            `Only ${parsed.length} of ${results.length} titles loaded (OMDb said: "${reason}").` +
              (reason.toLowerCase().includes("limit")
                ? " Your OMDb API key has likely hit its request limit — check your usage at omdbapi.com."
                : " Try refreshing the page.")
          );
        }
        // Not cached — a partial/failed batch shouldn't be remembered as
        // the answer for the next 24 hours.
      } else {
        writeCache(cacheKey, parsed);
        if (browsePage === 0) setBrowseWarning("");
      }

      setBrowseMovies((prev) => (browsePage === 0 ? parsed : [...prev, ...parsed]));
      if (browsePage === 0) setBrowseLoading(false);
      else setBrowseLoadingMore(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browsePage, kidsMode]);


  function loadMoreBrowse() {
    if (browseLoadingMore) return;
    setBrowsePage((p) => p + 1);
  }


  useEffect(() => {
    let cancelled = false;
    const cacheKey = `movieSearch:similarPool:${CACHE_VERSION}`;

    const cached = readCache(cacheKey);
    if (cached) {
      setSimilarPool(cached);
      return;
    }

    fetchJsonPool(
      SIMILAR_POOL_IDS.map((id) => `https://www.omdbapi.com/?apikey=${API_KEY}&i=${id}`)
    ).then((results) => {
      if (cancelled) return;
      const parsed = results
        .filter((d) => d && d.Response !== "False")
        .map(parseDetailToMovie);
      const failedCount = results.length - parsed.length;
      if (failedCount > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `[MovieSearch] ${failedCount}/${results.length} similar-pool title(s) failed to load from OMDb.`
        );
        // Not cached — see the browse-pool effect above for why a
        // partially-failed batch isn't remembered.
      } else {
        writeCache(cacheKey, parsed);
      }
      setSimilarPool(parsed);
    });

    return () => {
      cancelled = true;
    };
  }, []);


  useEffect(() => {
    const q = debouncedQuery.trim();
    // A fresh query (or clearing back to browse) invalidates whatever was
    // previously previewed in the hero banner — leaving it in place would
    // either pin an old browse title above new search results, or show a
    // stale search result after the visitor cleared the search box.
    setHeroMovie(null);
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

    // plot=full: search results start out with no Plot field at all.
    // Without fetching it here, previewing a search result in the hero
    // banner (see previewMovie/heroMovie below) would show a banner
    // with no synopsis until Play was clicked.
    fetchJsonPool(
      needsDetail.map((m) => `https://www.omdbapi.com/?apikey=${API_KEY}&i=${m.imdbID}&plot=full`)
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
            Plot: detail.Plot || "",
            Runtime: detail.Runtime || "",
            Rated: detail.Rated || "",
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

  // Hero banner title: whichever movie the visitor last clicked to preview
  // (heroMovie), falling back to the first title in the curated browse
  // pool so the banner has something to show before any click happens.
  // The fallback only applies on the browse view — search results don't
  // get an unrelated hero banner pinned above them unless the visitor has
  // actually clicked one of them to preview it.
  const defaultFeaturedMovie = !searched && browseMovies.length > 0 ? browseMovies[0] : null;
  const featuredMovie = heroMovie || defaultFeaturedMovie;

  const searchHasMore = searched && !loading && movies.length > 0 && movies.length < totalResults;
  const browseHasMore =
    !searched && !browseLoading && (browsePage + 1) * BROWSE_PAGE_SIZE < browseIdsSource.length;
  const hasMore = searchHasMore || browseHasMore;
  const loadingMoreAny = loadingMore || browseLoadingMore;

  // --- Derived: Top 10 Today ---
  // A lightweight "trending" row that needs no extra API calls: it's just
  // the titles already loaded for the browse grid and the similar-titles
  // pool, deduped and ranked by IMDb rating. It's not real trending data
  // (this app has no view-count analytics to rank by), but it gives the
  // browse page a Netflix-style ranked row using data that's already on
  // hand. Recomputes automatically as more of the browse pool streams in.
  const topTrending = useMemo(() => {
    const candidates = new Map();
    [...browseMovies, ...similarPool].forEach((m) => {
      if (!m || !m.imdbID || candidates.has(m.imdbID)) return;
      if (kidsMode && !isKidSafe(m)) return;
      candidates.set(m.imdbID, m);
    });
    return Array.from(candidates.values())
      .sort((a, b) => (b.imdbRating ?? -1) - (a.imdbRating ?? -1))
      .slice(0, 10);
  }, [browseMovies, similarPool, kidsMode]);

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

    if (kidsMode) list = list.filter(isKidSafe);

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
  }, [activeMovies, kidsMode, typeFilter, genreFilter, yearMin, yearMax, sortBy]);

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


  // Clicking a movie card previews it in the hero banner up top, so scroll
  // the page back to the top to bring that banner into view. Skipped when
  // the click is actually opening the trailer (selectedMovie already set
  // by the time this runs, since openResolvedMovie sets both selectedMovie
  // and heroMovie together) — that flow has its own scroll-to-trailer
  // effect right below, which should win instead.
  useEffect(() => {
    if (!heroMovie || selectedMovie) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroMovie]);

  useEffect(() => {
    if (!selectedMovie) return;
    if (trailerSectionRef.current) {
      trailerSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [selectedMovie]);


  // Previews a movie in the hero banner rather than opening its trailer —
  // this is what movie cards call now (browse grid, search grid, "You
  // Might Also Like", cast/crew rows). If a trailer/detail section is
  // already open, close it first so the hero banner is free to show.
  // Play / More Info on the hero banner is what calls openMovie() to
  // actually open the trailer.
  function previewMovie(movie) {
    setHeroMovie(movie);
    if (selectedId) closeTrailer();
  }


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
    // Keep the hero banner in sync with whatever title is now open, so
    // closing the trailer (X button) lands back on this title's preview
    // instead of falling back to the default browse title — this matters
    // for deep links (?movie=...) that never went through previewMovie.
    setHeroMovie(movie);
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
        if (kidsMode && !isKidSafe(m)) return;
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
  }, [movieDetail, browseMovies, similarPool, movies, kidsMode]);


  const personTitles = useMemo(() => {
    if (!selectedPerson) return [];
    const target = selectedPerson.trim().toLowerCase();
    if (!target) return [];

    const candidates = new Map();
    [...browseMovies, ...similarPool, ...movies].forEach((m) => {
      if (m.imdbID && !candidates.has(m.imdbID)) {
        if (kidsMode && !isKidSafe(m)) return;
        candidates.set(m.imdbID, m);
      }
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
  }, [selectedPerson, browseMovies, similarPool, movies, movieDetail, kidsMode]);


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
    <div className={`movie-search ${kidsMode ? "movie-search--kids" : ""}`}>
      <h1 className="movie-search__title">
        <span className="movie-search__title-text">
          {kidsMode ? "Kids Movie Search" : "Movie Search"}
          {kidsMode && <span className="movie-search__kids-badge">KIDS</span>}
        </span>
      </h1>

      <div className="movie-search__controls">
        <div className="movie-search__search-row">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              kidsMode ? "Search for a kid-friendly movie, e.g. Shrek" : "Search for a movie, e.g. Inception"
            }
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

      {featuredMovie && !selectedMovie && (
        <HeroBanner
          movie={featuredMovie}
          truncatePlot={truncatePlot}
          // "Featured Today" only describes the curated default pick —
          // once a movie has been clicked to preview, the banner is
          // showing that title, not today's pick, so the eyebrow drops.
          isDefaultFeatured={!heroMovie}
          onPlay={() => openMovie(featuredMovie)}
          onMoreInfo={() => openMovie(featuredMovie)}
        />
      )}

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
                            previewMovie(m);
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
                      {similarTitles.map((m) => renderPosterCard(m, () => previewMovie(m)))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {!searched && !activeLoading && topTrending.length > 0 && (
        <div className="movie-search__trending">
          <h2 className="movie-search__section-title">
            {kidsMode ? "Top 10 Kids’ Picks Today" : "Top 10 Today"}
          </h2>
          <div className="movie-search__trending-row">
            {topTrending.map((movie, i) => (
              <div
                key={movie.imdbID}
                className="movie-search__trending-item"
                onClick={() => previewMovie(movie)}
                role="button"
                tabIndex={0}
                aria-label={`Preview ${movie.Title}, ranked number ${i + 1}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    previewMovie(movie);
                  }
                }}
              >
                <span className="movie-search__trending-rank" aria-hidden="true">
                  {i + 1}
                </span>
                <div className="movie-search__trending-poster-col">
                  <div className="movie-search__trending-poster-wrap">
                    <div className="movie-search__trending-poster">
                      {movie.Poster !== "N/A" ? (
                        <img
                          src={movie.Poster}
                          alt={movie.Title}
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="movie-search__similar-poster-placeholder">No image</div>
                      )}
                    </div>
                  </div>
                  <p className="movie-search__trending-title">{movie.Title}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!searched && !activeLoading && (
        <h2 className="movie-search__section-title">
          {kidsMode ? "Kids' Picks" : "Popular Right Now"}
        </h2>
      )}

      {!searched && !activeLoading && browseWarning && (
        <p className="movie-search__status" role="status">
          {browseWarning}
        </p>
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
          {kidsMode
            ? "No kid-friendly matches found. Try a different search."
            : "No results match your filters. Try widening the year range or clearing a filter."}
        </p>
      )}

      {!activeLoading && !error && filteredMovies.length > 0 && (
        <div className="movie-search__grid">
          {filteredMovies.map((movie, index) => (
            <div
              key={movie.imdbID}
              className={`movie-card ${
                !selectedMovie && featuredMovie?.imdbID === movie.imdbID ? "movie-card--selected" : ""
              }`}
              onClick={() => previewMovie(movie)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  previewMovie(movie);
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
                {renderCardHoverOverlay(movie, () => openMovie(movie))}
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
          {loadingMoreAny ? (
            <span className="movie-search__load-more-status" role="status">
              Loading more…
            </span>
          ) : (
            // Always rendered now (not just as an IntersectionObserver
            // fallback) — scrolling near the sentinel above still
            // auto-loads the next batch on browsers that support it, but
            // this gives visitors an explicit, reliable control too
            // instead of relying purely on scroll position.
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