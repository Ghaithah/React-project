import { useEffect, useRef } from 'react';


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


const PROGRESS_SAVE_INTERVAL_MS = 5000;


export const RESUME_MIN_FRACTION = 0.03;
export const RESUME_MAX_FRACTION = 0.95;

export default function TrailerPlayer({ videoId, initialProgress = 0, onProgress, onEnded }) {
  const wrapperRef = useRef(null);
  const playerRef = useRef(null);
  const intervalRef = useRef(null);

  const onProgressRef = useRef(onProgress);
  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  // Same ref-mirror pattern as onProgressRef above: onEnded is read via
  // this ref (rather than listed in the effect's own dependency array)
  // so a fresh onEnded closure from the parent re-rendering (which
  // happens on essentially every state change in MovieSearch.js) never
  // tears down and reconstructs the real YT.Player this effect is in the
  // middle of managing.
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

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
              // Lets the parent offer an "Up Next" autoplay card (see
              // MovieSearch.js) the same way Netflix chains into the
              // next episode/title once playback genuinely finishes —
              // distinct from PAUSED, which just means the visitor
              // stopped watching partway through.
              if (onEndedRef.current) onEndedRef.current();
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