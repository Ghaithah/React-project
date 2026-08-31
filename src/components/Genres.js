import { Link } from "react-router-dom";
import "./Genres.css";

// A dedicated "Browse by Genre" entry point — Netflix keeps one of these
// under its own menu rather than only letting you find a genre by
// typing into search first. Each tile just deep-links into the main
// browse page with `?genre=<name>` pre-filled (MovieSearch reads that
// param once on mount and opens the Filters panel with it already
// applied — see the effect there), so this page itself needs no OMDb
// data of its own: it's pure navigation, and can never be "wrong" about
// what's in stock the way a page that tried to pre-fetch counts per
// genre would be.
//
// Colors are decorative only (no meaning tied to genre beyond "distinct
// enough to tell tiles apart at a glance"), picked to sit comfortably
// against the app's dark background rather than to match anything in
// particular.
const GENRE_TILES = [
  { name: "Action", color: "#7a2320" },
  { name: "Comedy", color: "#8a5a12" },
  { name: "Drama", color: "#2e3470" },
  { name: "Sci-Fi", color: "#155a6b" },
  { name: "Animation", color: "#1f6b45" },
  { name: "Horror", color: "#4a1030" },
  { name: "Thriller", color: "#39352f" },
  { name: "Adventure", color: "#6b4e12" },
  { name: "Crime", color: "#4f1f6b" },
  { name: "Romance", color: "#8a2d52" },
  { name: "Fantasy", color: "#245c46" },
  { name: "Documentary", color: "#4a5a1f" },
  { name: "Mystery", color: "#232f5c" },
  { name: "Family", color: "#1c6b5f" },
  { name: "War", color: "#5c4315" },
  { name: "Biography", color: "#5c3d24" },
];

export default function Genres() {
  return (
    <div className="genres-page">
      <h1 className="genres-page__title">Browse by Genre</h1>
      <p className="genres-page__subtitle">
        Pick a genre to jump straight to a filtered grid of titles.
      </p>
      <div className="genres-page__grid">
        {GENRE_TILES.map((g) => (
          <Link
            key={g.name}
            to={`/movies?genre=${encodeURIComponent(g.name)}`}
            className="genres-page__tile"
            style={{
              background: `linear-gradient(150deg, ${g.color}, ${g.color}, #0d0f14)`,
            }}
          >
            {g.name}
          </Link>
        ))}
      </div>
    </div>
  );
}