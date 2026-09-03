import { useState, useRef, useEffect, useCallback } from "react";
import { useMovieCatalog } from "./MovieCatalogContext";
import "./MovieChatBot.css";

// =============================================================================
// MovieChatbot — floating movie-only assistant
// =============================================================================
// This is the "basics" version: a real chat widget (button, panel,
// message history, typing indicator) wired up to a small RULE-BASED
// reply engine instead of a real AI model. There's no backend in this
// project yet (plain Create React App + OMDb/YouTube API keys — see
// MovieSearch.js), so hardwiring a real LLM call here would mean either
// shipping an API key to every visitor's browser or standing up a
// server first. Building the UI and the guardrail contract now means
// swapping in a real model later is a localized change — everything
// funnels through the two functions below, isMovieRelated() and
// generateReply(), so a real backend call replaces their bodies without
// touching any of the surrounding chat UI.
//
// --- Where a real AI model plugs in later ---
// Replace the body of respond() below with something like:
//
//   const res = await fetch("/api/movie-chat", {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({
//       message: userText,
//       history: messages,
//       catalog: catalogRef.current, // same grounding data used below
//     }),
//   });
//   const { reply } = await res.json();
//
// ...and let your backend own both the guardrail ("only answer
// movie/show questions") and the actual answer generation — a real
// model can enforce that instruction far more robustly than the
// keyword heuristic below, and the `catalog` payload is exactly the
// same shape MovieSearch already publishes into MovieCatalogContext,
// so no new wiring is needed on that side.
// =============================================================================

const WELCOME_MESSAGE = {
  role: "bot",
  text:
    "Hi, I'm your movie assistant! Ask me for recommendations, the best movies from a certain year or genre, or details on anything showing on this page. I only talk movies & shows, though.",
};

const OFF_TOPIC_REPLY =
  "I'm just here for movies and shows! Try asking me to recommend something, find the best titles from a year or genre, or tell you about a movie you've spotted on the page.";

const EXAMPLE_PROMPTS = [
  "What should I watch tonight?",
  "Best movies of 2022",
  "Recommend a comedy",
  "Tell me about Inception",
];

// --- Guardrail: is this even a movie-related question? ---
// A transparent keyword/heuristic gate, not a real classifier — good
// enough to catch the obviously off-topic stuff ("what's the weather",
// "write me a poem", "help with my homework") while this stays a
// rule-based placeholder. This is also the natural spot to swap in a
// real moderation/classification call once a backend exists (see the
// big comment above) — same signature, just an async model call in
// place of the keyword check.
const MOVIE_KEYWORDS = [
  "movie", "movies", "film", "films", "show", "shows", "series", "watch",
  "watching", "actor", "actress", "cast", "director", "genre", "trailer",
  "plot", "rating", "rated", "sequel", "prequel", "franchise", "recommend",
  "recommendation", "suggest", "suggestion", "best", "top", "worst",
  "review", "oscar", "award", "cinema", "documentary", "anime", "tv",
  "episode", "season", "imdb", "netflix", "starring", "stars", "plays",
  "screenplay", "box office", "streaming", "binge", "rom-com", "sitcom",
];

function isMovieRelated(text, catalog) {
  const lower = text.toLowerCase();
  if (MOVIE_KEYWORDS.some((kw) => lower.includes(kw))) return true;
  // Also on-topic if the visitor names a title that's actually loaded on
  // the page (e.g. "what's Inception about?") even without any of the
  // keywords above.
  return catalog.allLoaded.some((m) => m.Title && lower.includes(m.Title.toLowerCase()));
}

// --- Small text-matching helpers the reply engine below is built from ---

function extractYear(text) {
  const match = text.match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : null;
}

const GENRE_WORDS = [
  "action", "comedy", "drama", "horror", "thriller", "romance", "sci-fi",
  "science fiction", "fantasy", "animation", "documentary", "crime",
  "mystery", "adventure", "family", "war", "biography", "musical", "sport",
];

function extractGenre(text) {
  const lower = text.toLowerCase();
  const found = GENRE_WORDS.find((g) => lower.includes(g));
  if (!found) return null;
  if (found === "science fiction") return "Sci-Fi";
  return found
    .split(" ")
    .map((w) => (w === "sci-fi" ? "Sci-Fi" : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

function findMentionedMovie(text, catalog) {
  const lower = text.toLowerCase();
  let best = null;
  catalog.allLoaded.forEach((m) => {
    if (m.Title && lower.includes(m.Title.toLowerCase())) {
      if (!best || m.Title.length > best.Title.length) best = m;
    }
  });
  return best;
}

function formatMovieLine(m) {
  let line = m.Title;
  if (m.Year) line += ` (${m.Year})`;
  if (m.imdbRating) line += ` — ★ ${m.imdbRating}`;
  return line;
}

// --- The reply engine itself ---
// Deliberately simple, ordered pattern-matching over the catalog context
// MovieSearch publishes (see MovieCatalogContext.js): a title mention, a
// "best of <year>" ask, a genre ask, a general recommendation ask, and a
// fallback that points at what this bot can actually do. This is the
// single function to replace with a real model call later.
function generateReply(userText, catalog) {
  const lower = userText.toLowerCase();
  const pool = catalog.allLoaded;

  if (pool.length === 0) {
    return "Give me a moment — I'm still loading the movies on this page. Try asking again in a few seconds!";
  }

  const mentioned = findMentionedMovie(userText, catalog);
  if (mentioned) {
    const bits = [];
    if (mentioned.Year) bits.push(mentioned.Year);
    if (mentioned.Genre) bits.push(mentioned.Genre);
    if (mentioned.imdbRating) bits.push(`IMDb ★ ${mentioned.imdbRating}`);
    let reply = mentioned.Title + (bits.length ? ` — ${bits.join(" · ")}` : "");
    if (mentioned.Plot) reply += `\n\n${mentioned.Plot}`;
    return reply;
  }

  const year = extractYear(userText);
  if (year && (lower.includes("best") || lower.includes("top"))) {
    const matches = pool
      .filter((m) => m.Year && m.Year.includes(year) && m.imdbRating)
      .sort((a, b) => b.imdbRating - a.imdbRating)
      .slice(0, 5);
    if (matches.length === 0) {
      return `I don't have any ${year} titles loaded from what's shown here yet — try browsing a bit more, or search for a ${year} movie by name.`;
    }
    return `Here's what I've got loaded from ${year}, best rated first:\n\n${matches
      .map((m, i) => `${i + 1}. ${formatMovieLine(m)}`)
      .join("\n")}`;
  }

  const genre = extractGenre(userText);
  if (genre) {
    const matches = pool
      .filter((m) => m.Genre && m.Genre.includes(genre))
      .sort((a, b) => (b.imdbRating ?? -1) - (a.imdbRating ?? -1))
      .slice(0, 5);
    if (matches.length > 0) {
      return `A few ${genre} picks from what's loaded here:\n\n${matches
        .map((m, i) => `${i + 1}. ${formatMovieLine(m)}`)
        .join("\n")}`;
    }
  }

  if (
    lower.includes("recommend") ||
    lower.includes("suggest") ||
    lower.includes("what should i watch") ||
    lower.includes("what to watch") ||
    lower.includes("anything good")
  ) {
    const source = catalog.visible.length > 0 ? catalog.visible : pool;
    const matches = [...source]
      .filter((m) => m.imdbRating)
      .sort((a, b) => b.imdbRating - a.imdbRating)
      .slice(0, 5);
    if (matches.length > 0) {
      return `Based on what's on screen right now, you might like:\n\n${matches
        .map((m, i) => `${i + 1}. ${formatMovieLine(m)}`)
        .join("\n")}\n\nWant something in a specific genre or year instead?`;
    }
  }

  return (
    "I can help with recommendations, best-of lists by year or genre, or details on a title " +
    "shown here — try something like \"best movies of 2022\", \"recommend a comedy\", or " +
    "\"tell me about Inception\"."
  );
}

export default function MovieChatbot() {
  const { catalog } = useMovieCatalog();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const listRef = useRef(null);

  // A ref mirror of `catalog` so respond() (below) always reads the
  // latest on-screen data without needing to be recreated every time
  // MovieSearch republishes it (which can happen often while browsing).
  const catalogRef = useRef(catalog);
  useEffect(() => {
    catalogRef.current = catalog;
  }, [catalog]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, isTyping, isOpen]);

  const respond = useCallback((userText) => {
    const currentCatalog = catalogRef.current;
    const onTopic = isMovieRelated(userText, currentCatalog);

    setIsTyping(true);
    // Simulated thinking time so a reply doesn't just snap into place —
    // this whole timeout is what gets replaced by an actual async
    // request once a real backend/model is wired up (see the big
    // comment at the top of this file).
    const delay = 350 + Math.random() * 450;
    setTimeout(() => {
      const text = onTopic ? generateReply(userText, currentCatalog) : OFF_TOPIC_REPLY;
      setMessages((prev) => [...prev, { role: "bot", text }]);
      setIsTyping(false);
    }, delay);
  }, []);

  function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setInputValue("");
    respond(trimmed);
  }

  function handleSubmit(e) {
    e.preventDefault();
    sendMessage(inputValue);
  }

  return (
    <div className="movie-chatbot">
      {isOpen && (
        <div className="movie-chatbot__panel" role="dialog" aria-label="Movie assistant chat">
          <div className="movie-chatbot__header">
            <div className="movie-chatbot__header-title">
              <span className="movie-chatbot__header-icon" aria-hidden="true">🎬</span>
              Movie Assistant
            </div>
            <button
              type="button"
              className="movie-chatbot__close"
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
            >
              ✕
            </button>
          </div>

          <div className="movie-chatbot__messages" ref={listRef}>
            {messages.map((m, i) => (
              <div
                key={i}
                className={`movie-chatbot__message movie-chatbot__message--${m.role}`}
              >
                {m.text.split("\n").map((line, j) =>
                  line ? <p key={j}>{line}</p> : <br key={j} />
                )}
              </div>
            ))}

            {messages.length === 1 && !isTyping && (
              <div className="movie-chatbot__suggestions">
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="movie-chatbot__suggestion-chip"
                    onClick={() => sendMessage(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            {isTyping && (
              <div className="movie-chatbot__message movie-chatbot__message--bot movie-chatbot__message--typing">
                <span className="movie-chatbot__dot" />
                <span className="movie-chatbot__dot" />
                <span className="movie-chatbot__dot" />
              </div>
            )}
          </div>

          <form className="movie-chatbot__input-row" onSubmit={handleSubmit}>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask about a movie or show…"
              className="movie-chatbot__input"
              aria-label="Message the movie assistant"
            />
            <button
              type="submit"
              className="movie-chatbot__send"
              disabled={!inputValue.trim() || isTyping}
            >
              Send
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        className="movie-chatbot__toggle"
        onClick={() => setIsOpen((o) => !o)}
        aria-label={isOpen ? "Close movie assistant" : "Open movie assistant"}
        aria-expanded={isOpen}
      >
        {isOpen ? "✕" : "🎬"}
      </button>
    </div>
  );
}