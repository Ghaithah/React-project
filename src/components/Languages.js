import { Link } from "react-router-dom";
import "./Languages.css";

// A dedicated "Browse by Languages" entry point, mirroring Genres.js:
// each tile deep-links into the main browse page with `?language=<name>`
// pre-filled (MovieSearch reads that param once on mount and opens the
// Filters panel with it already applied — see the effect there), so this
// page itself needs no OMDb data of its own: it's pure navigation.
//
// OMDb's "Language" field is free-text and inconsistent across titles
// (it might say "English", "English, French", "N/A", etc.), so rather
// than trying to enumerate every value that could ever show up, this
// curates the handful of languages visitors are most likely to look
// for — MovieSearch's Language filter (in the Filters panel) still
// matches a substring of that field, so a title tagged "English, French"
// shows up under either tile.
const LANGUAGE_TILES = [
  { name: "English", color: "#2e3470" },
  { name: "Spanish", color: "#7a2320" },
  { name: "French", color: "#155a6b" },
  { name: "German", color: "#39352f" },
  { name: "Italian", color: "#1f6b45" },
  { name: "Japanese", color: "#8a2d52" },
  { name: "Korean", color: "#4f1f6b" },
  { name: "Mandarin", color: "#6b4e12" },
  { name: "Hindi", color: "#8a5a12" },
  { name: "Portuguese", color: "#245c46" },
  { name: "Russian", color: "#4a1030" },
  { name: "Arabic", color: "#5c3d24" },
];

export default function Languages() {
  return (
    <div className="languages-page">
      <h1 className="languages-page__title">Browse by Languages</h1>
      <p className="languages-page__subtitle">
        Pick a language to jump straight to a filtered grid of titles.
      </p>
      <div className="languages-page__grid">
        {LANGUAGE_TILES.map((l) => (
          <Link
            key={l.name}
            to={`/movies?language=${encodeURIComponent(l.name)}`}
            className="languages-page__tile"
            style={{
              background: `linear-gradient(150deg, ${l.color}, ${l.color}, #0d0f14)`,
            }}
          >
            {l.name}
          </Link>
        ))}
      </div>
    </div>
  );
}