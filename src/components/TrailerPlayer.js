import { useEffect, useRef } from 'react';

// --- YouTube IFrame Player API loader ---
// A bare `<iframe src="https://www.youtube.com/embed/...">` (what the main
// trailer panel used before this) has no way to report back how far into
// the video the visitor got — there's simply nothing to read. The real
// IFrame Player API (loaded here, once, and shared by every TrailerPlayer
// instance) replaces that with an actual `YT.Player` object that exposes
// `getCurrentTime()`/`getDuration()` and playback-state events, which is
// what makes both halves of "playback polish" possible: the Continue
// Watching progress bar (MovieCard.js) and resuming a trailer from where
// you left off instead of always restarting at 0:00.
let youtubeApiPromise = null;

function loadYoutubeIframeApi() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve) => {
    // YouTube's loader calls a single GLOBAL callback once the API is
    // ready, not a per-instance one — chaining onto whatever was already
    // registered (rather than overwriting it) means a second
    // TrailerPlayer that starts loading before the first load finishes
    // doesn't clobber the first one's resolve().
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousReady === 'function') previousReady();
      resolve(window.YT);
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });

  return youtubeApiPromise;
}

// How often (ms) to persist playback progress while a trailer is
// actively playing. Frequent enough that closing the trailer mid-watch
// still leaves a reasonably up-to-date Continue Watching progress bar;
// spaced out enough that it isn't writing to localStorage (via
// onProgress -> WatchHistoryContext.updateProgress) many times a second.
const PROGRESS_SAVE_INTERVAL_MS = 5000;

// A saved position only counts as "worth resuming" in this range — not
// at the very start (barely watched, no point seeking at all) and not
// right at the end (functionally finished; starting over from 0 reads
// better than picking back up three seconds before the end). Exported so
// MovieCard.js's "Resume" hover-label switch uses exactly the same
// window as the player itself actually seeks within — one definition of
// "worth resuming" instead of two that could quietly drift apart.
export const RESUME_MIN_FRACTION = 0.03;
export const RESUME_MAX_FRACTION = 0.95;

/**
 * Wraps a single trailer in the real YouTube IFrame Player API so
 * playback progress can actually be read back, instead of a bare
 * `<iframe src="...">` that plays but reports nothing.
 *
 * `initialProgress` is this title's last-saved progress (0-1, from
 * WatchHistoryContext.getProgress) — read once, on mount, to seek the
 * player to roughly that point right before it starts playing.
 * `onProgress` is called periodically during playback (see
 * PROGRESS_SAVE_INTERVAL_MS above) and once more on pause, on the video
 * ending, and on unmount/close, each time with the latest 0-1 fraction.
 *
 * Deliberately keyed by `videoId` alone in its effect: this mounts one
 * real player per trailer and tears it down when the trailer changes or
 * the panel closes, rather than trying to reconfigure a live player in
 * place.
 *
 * --- Why the player target is created imperatively, not with JSX ---
 * The YouTube IFrame Player API doesn't render INTO the element you
 * hand it — per YouTube's own docs, it REPLACES that element with a
 * real <iframe>, removing the original node from the DOM outright. The
 * previous version of this component handed `new YT.Player(...)` a
 * React-rendered div (via a ref) directly, so the moment a title's
 * trailer was opened, YouTube would silently rip that div out of the
 * document and put an iframe in its place — a DOM mutation React never
 * finds out about. That was invisible the FIRST time a trailer opened
 * (nothing had to be torn down yet), but the moment a second trailer
 * opened — e.g. clicking "Shuffle Trailer" again while one was already
 * playing — the outgoing <TrailerPlayer key={oldVideoId}> instance had
 * to unmount, and React tried to remove the div it still believed was
 * there. It wasn't (YouTube had already swapped it for an iframe), so
 * the browser threw "Failed to execute 'removeChild' on 'Node'", which
 * bubbled straight into the nearest error boundary as "This page hit a
 * snag." Only ever surfaced on the second-and-later trailer for exactly
 * that reason.
 *
 * The fix: React only ever renders and owns `wrapperRef`'s div, and
 * that div is never the thing handed to `new YT.Player(...)` — a plain
 * `target` div is created here with `document.createElement`, appended
 * as a child of the wrapper, and IT is what YouTube is given (and free
 * to replace with an iframe). React has no opinion about anything
 * inside the wrapper, so however YouTube rearranges that subtree,
 * unmounting the wrapper later is a single, ordinary DOM removal with
 * no conflict.
 */
export default function TrailerPlayer({ videoId, initialProgress = 0, onProgress }) {
  const wrapperRef = useRef(null);
  const playerRef = useRef(null);
  const intervalRef = useRef(null);
  // onProgress is a fresh closure on every parent render (it wraps
  // selectedMovie.imdbID) — routing calls through a ref means the
  // onReady/onStateChange callbacks registered once below always reach
  // the latest version without this effect needing to depend on
  // onProgress itself (which would tear down and recreate the whole
  // player far more often than the trailer actually changes).
  const onProgressRef = useRef(onProgress);
  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    let cancelled = false;
    let player = null;

    function saveProgress() {
      if (!player || typeof player.getCurrentTime !== 'function') return;
      const duration = typeof player.getDuration === 'function' ? player.getDuration() : 0;
      if (!duration) return;
      const fraction = player.getCurrentTime() / duration;
      if (onProgressRef.current) onProgressRef.current(fraction);
    }

    loadYoutubeIframeApi().then((YT) => {
      if (cancelled || !YT || !wrapperRef.current) return;

      // See the "Why the player target is created imperatively" note
      // above — this is a plain DOM node React never renders or
      // reconciles, so YouTube is free to replace it with an <iframe>
      // without React ever needing to know.
      const target = document.createElement('div');
      wrapperRef.current.appendChild(target);

      player = new YT.Player(target, {
        videoId,
        playerVars: { autoplay: 1 },
        events: {
          onReady: (event) => {
            if (cancelled) return;
            const duration =
              typeof event.target.getDuration === 'function' ? event.target.getDuration() : 0;
            // Duration isn't known until the player is actually ready,
            // so the resume seek happens here rather than via a
            // playerVars `start=` second count computed up front.
            if (
              duration &&
              initialProgress > RESUME_MIN_FRACTION &&
              initialProgress < RESUME_MAX_FRACTION
            ) {
              event.target.seekTo(duration * initialProgress, true);
            }
            event.target.playVideo();
          },
          onStateChange: (event) => {
            if (cancelled) return;
            const { PLAYING, PAUSED, ENDED } = YT.PlayerState;
            clearInterval(intervalRef.current);
            if (event.data === PLAYING) {
              intervalRef.current = setInterval(saveProgress, PROGRESS_SAVE_INTERVAL_MS);
            } else if (event.data === PAUSED) {
              saveProgress();
            } else if (event.data === ENDED) {
              if (onProgressRef.current) onProgressRef.current(1);
            }
          },
        },
      });
      playerRef.current = player;
    });

    return () => {
      cancelled = true;
      clearInterval(intervalRef.current);
      // One last save on close/unmount so navigating away mid-trailer
      // (closing the panel, opening a different title) doesn't lose
      // whatever progress was made since the last periodic save.
      saveProgress();
      // Guarded: by the time this runs, the wrapper (and whatever
      // YouTube left inside it) may already be detached from the
      // document as part of this component unmounting, and destroy()
      // reaching into an already-detached iframe isn't guaranteed to
      // be a no-op in every browser. Teardown either way doesn't
      // depend on destroy() actually succeeding, so a failure here is
      // safe to swallow rather than letting it crash the page.
      try {
        if (playerRef.current && typeof playerRef.current.destroy === 'function') {
          playerRef.current.destroy();
        }
      } catch {
        // Ignore — see comment above.
      }
      playerRef.current = null;
    };
    // Deliberately keyed on videoId alone — initialProgress/onProgress
    // are read via closure/ref above rather than listed here, so a
    // periodic progress save (which hands the parent a new onProgress
    // closure on every render) doesn't tear down and reconstruct the
    // real YT.Player it's in the middle of reporting from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  return <div ref={wrapperRef} className="trailer-player" />;
}