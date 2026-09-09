import { useCallback, useEffect, useRef, useState } from 'react';

// How much of the track's own visible width one arrow click scrolls by.
// Slightly under a full page so the trailing card from the previous
// "page" stays partly visible on the far edge — a continuity cue that
// this is the same shelf continuing, not a new one starting, echoing
// the paging behavior Netflix's own row arrows use.
const SCROLL_PAGE_FRACTION = 0.9;

// Below this many leftover pixels of scroll room, treat the track as
// "at the end" — real layouts rarely land on an exact 0, and without a
// little slack the trailing arrow can flicker in and out at the very
// last pixel of scroll.
const EDGE_SLACK_PX = 4;

/**
 * Wraps a horizontally-scrolling shelf (Continue Watching, My List,
 * genre rows, Top 10 Today, "You Might Also Like", a person's other
 * titles, ...) with Netflix-style ‹ › paging arrows, layered on top of
 * the plain scroll/drag/swipe every one of these rows already supports.
 * An arrow click pages the track roughly one screen at a time instead of
 * requiring a trackpad swipe or a click-drag; an arrow hides itself the
 * moment its direction has nothing left to reveal, so there's never a
 * dead click at either end of a shelf.
 *
 * `trackClassName` is whichever of MovieSearch.css's existing row
 * classes (`movie-search__row-track`, `movie-search__trending-row`,
 * `movie-search__similar-row`) this particular shelf already used before
 * this component existed — passed through unchanged so the scrolling
 * track itself keeps 100% of its previous layout, sizing, and edge-fade
 * styling. This component only adds the arrows and the positioning
 * context they sit in; it owns no opinion of its own about how the
 * track's children should look.
 *
 * `ariaLabel` names the shelf ("Continue Watching", "Action", "Top 10
 * Today", ...) for the arrow buttons' own accessible names, so a screen
 * reader announces "Scroll Action left" rather than just "Scroll left"
 * on a page with a dozen different rows.
 */
export default function ScrollableRow({ trackClassName, ariaLabel, children }) {
  const trackRef = useRef(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const updateArrows = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollPrev(el.scrollLeft > EDGE_SLACK_PX);
    setCanScrollNext(el.scrollLeft < maxScroll - EDGE_SLACK_PX);
  }, []);

  // Re-checks on every scroll (drag/swipe/wheel, not just an arrow
  // click) and whenever the track's own content changes size — a genre
  // row's card count grows as more of the browse pool streams in via
  // "Load more", and a shelf that only just became scrollable (or just
  // stopped being scrollable, e.g. after My List shrinks by one) needs
  // its arrows to reflect that without waiting for the visitor to
  // scroll first. ResizeObserver isn't in every very old browser; this
  // component simply keeps the arrows in their last-known state there
  // rather than failing to render.
  useEffect(() => {
    updateArrows();
    const el = trackRef.current;
    if (!el) return undefined;

    el.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);

    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(updateArrows);
      ro.observe(el);
    }

    return () => {
      el.removeEventListener('scroll', updateArrows);
      window.removeEventListener('resize', updateArrows);
      if (ro) ro.disconnect();
    };
    // Re-runs whenever this row's own items change (children) so a row
    // that grows/shrinks without a resize event (e.g. React re-rendering
    // the same DOM node with a different child count) still gets its
    // arrow visibility re-checked.
  }, [updateArrows, children]);

  function scrollByPage(direction) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: el.clientWidth * SCROLL_PAGE_FRACTION * direction, behavior: 'smooth' });
  }

  const label = ariaLabel ? ariaLabel.trim() : '';

  return (
    <div className="scrollable-row">
      {canScrollPrev && (
        <button
          type="button"
          className="scrollable-row__arrow scrollable-row__arrow--prev"
          onClick={() => scrollByPage(-1)}
          aria-label={label ? `Scroll ${label} left` : 'Scroll left'}
        >
          <span aria-hidden="true">‹</span>
        </button>
      )}

      <div className={trackClassName} ref={trackRef}>
        {children}
      </div>

      {canScrollNext && (
        <button
          type="button"
          className="scrollable-row__arrow scrollable-row__arrow--next"
          onClick={() => scrollByPage(1)}
          aria-label={label ? `Scroll ${label} right` : 'Scroll right'}
        >
          <span aria-hidden="true">›</span>
        </button>
      )}
    </div>
  );
}