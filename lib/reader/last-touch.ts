// When the reader was last touched (a finger lifted), on the page or in the
// book's iframe. A click that follows a touch closely is the browser's
// emulated click for that touch, not a separate action.
let lastTouchEnd = -Infinity;

export function noteTouchEnd() {
  lastTouchEnd = performance.now();
}

export function msSinceTouch() {
  return performance.now() - lastTouchEnd;
}
