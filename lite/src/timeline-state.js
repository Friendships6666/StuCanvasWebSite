// Zero duration represents an unbounded timeline and remains valid JSON.
export const defaultTimeline = () => ({ time: 0, duration: 0, playbackRate: 1, running: false });
// Keep integer 120 Hz frame indices exactly representable.
export const MAX_TIMELINE_TIME = Math.floor(Number.MAX_SAFE_INTEGER / 120);
