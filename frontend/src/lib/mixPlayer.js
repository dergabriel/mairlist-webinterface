// Sample-accurate multi-track playback engine for the Mix Editor. Wavesurfer
// instances are used only for waveform display; actual playback runs through
// a single shared AudioContext here so all tracks share one clock and can
// truly overlap (setTimeout-per-instance can't guarantee that).
import { getAudioUrl } from "./api";

let ctx = null;
function getContext() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

// AudioBuffer cache keyed by item id, so repeated plays don't re-fetch/decode.
const bufferCache = new Map();

export async function loadBuffer(itemId) {
  if (bufferCache.has(itemId)) return bufferCache.get(itemId);
  const promise = (async () => {
    const res = await fetch(getAudioUrl(itemId));
    if (!res.ok) throw new Error(`Audio konnte nicht geladen werden (${res.status})`);
    const arrayBuffer = await res.arrayBuffer();
    return getContext().decodeAudioData(arrayBuffer);
  })();
  bufferCache.set(itemId, promise);
  try {
    const buffer = await promise;
    bufferCache.set(itemId, buffer); // replace the in-flight promise with the resolved buffer
    return buffer;
  } catch (err) {
    bufferCache.delete(itemId);
    throw err;
  }
}

export async function preloadBuffers(itemIds) {
  return Promise.all(itemIds.map(loadBuffer));
}

export function resumeContext() {
  const c = getContext();
  if (c.state === "suspended") return c.resume();
  return Promise.resolve();
}

// Applies fadeIn/fadeOut/fadeEnd gain automation relative to `trackStartCtxTime`
// (the AudioContext time at which the track's own time 0 lands), scheduled in
// the track's own in-track seconds. `trackStartCtxTime` itself can be in the
// past (or even negative) when starting mid-track via a large sourceOffset —
// every AudioParam call below is guarded against that, since the Web Audio
// API throws a RangeError for any scheduling time before ctx.currentTime.
//
// A ramp whose *endpoint* already lies in the past can't be scheduled at
// all (there's nothing left to ramp) — in that case we skip straight to the
// value the ramp would have reached by now (its target), rather than
// throwing or leaving gain at a stale value. A ramp whose start lies in the
// past but whose end is still upcoming is repositioned to begin "now" at the
// value it should already be holding (linear interpolation at the jump-in
// point), so the audible fade from that point on still sounds correct
// instead of restarting the ramp from the wrong level.
function scheduleFades(gainNode, trackStartCtxTime, cues, duration) {
  const gain = gainNode.gain;
  const { cueIn = 0, fadeIn, fadeOut, fadeEnd } = cues;
  const now = getContext().currentTime;
  // cancelScheduledValues itself throws for a negative time; clamping to
  // `now` is safe since nothing before "now" can still be pending anyway.
  gain.cancelScheduledValues(Math.max(trackStartCtxTime, now));

  const fadeInEnd = fadeIn != null && fadeIn !== "" ? Number(fadeIn) : null;
  const fadeOutStart = fadeOut != null && fadeOut !== "" ? Number(fadeOut) : null;
  const fadeOutEnd = fadeEnd != null && fadeEnd !== "" ? Number(fadeEnd) : duration;

  // Schedules a linear ramp from (fromValue at fromCtxTime) to (toValue at
  // toCtxTime), clamped so it never asks the AudioParam for a past time.
  const scheduleRamp = (fromValue, fromCtxTime, toValue, toCtxTime) => {
    if (toCtxTime <= now) {
      // The whole ramp is already behind us — jump straight to its target.
      gain.setValueAtTime(toValue, now);
      return;
    }
    if (fromCtxTime < now) {
      // We're jumping in partway through the ramp: interpolate the value it
      // should have right now and restart the ramp from here, so the audible
      // fade continues at the correct level instead of snapping to fromValue.
      const progress = (now - fromCtxTime) / (toCtxTime - fromCtxTime);
      const currentValue = fromValue + (toValue - fromValue) * progress;
      gain.setValueAtTime(currentValue, now);
      gain.linearRampToValueAtTime(toValue, toCtxTime);
      return;
    }
    gain.setValueAtTime(fromValue, fromCtxTime);
    gain.linearRampToValueAtTime(toValue, toCtxTime);
  };

  if (fadeInEnd != null && fadeInEnd > cueIn) {
    scheduleRamp(0, trackStartCtxTime + cueIn, 1, trackStartCtxTime + fadeInEnd);
  } else {
    gain.setValueAtTime(1, Math.max(trackStartCtxTime + cueIn, now));
  }

  if (fadeOutStart != null && fadeOutEnd > fadeOutStart) {
    scheduleRamp(1, trackStartCtxTime + fadeOutStart, 0, trackStartCtxTime + fadeOutEnd);
  }
}

// One active playback session. `tracks` entries: { itemId, duration, cueIn,
// start (shared-timeline seconds), sourceOffset (in-track seconds to start
// reading from), cues: { fadeIn, fadeOut, fadeEnd } }.
class MixPlayer {
  constructor() {
    this.sources = [];
    this.startCtxTime = null; // ctx.currentTime at which timeline position 0 played
    this.timelineOffset = 0; // timeline seconds that correspond to startCtxTime
    this.playing = false;
  }

  // Schedules every track so it lands at the right point on the shared
  // timeline, starting playback from `startAtSeconds` (shared-timeline time).
  // Tracks whose (start + duration) already lies before startAtSeconds are
  // skipped; tracks already in progress start mid-way via sourceOffset.
  play(tracks, startAtSeconds = 0) {
    this.stop();
    const c = getContext();
    const now = c.currentTime + 0.05; // small lead-in so scheduling isn't racing the clock
    this.startCtxTime = now;
    this.timelineOffset = startAtSeconds;
    this.playing = true;

    tracks.forEach((t) => {
      const buffer = bufferCache.get(t.itemId);
      if (!buffer || typeof buffer.then === "function") return; // not decoded yet
      const trackEnd = t.start + t.duration;
      if (trackEnd <= startAtSeconds) return;

      const sourceOffset = Math.max(startAtSeconds - t.start, t.cueIn ?? 0);
      const whenCtx = now + Math.max(t.start - startAtSeconds, 0);
      const playDuration = Math.max(t.duration - sourceOffset, 0);
      if (playDuration <= 0) return;

      const source = c.createBufferSource();
      source.buffer = buffer;
      const gainNode = c.createGain();
      source.connect(gainNode).connect(c.destination);

      scheduleFades(gainNode, whenCtx - sourceOffset, t.cues || {}, t.duration);

      source.start(whenCtx, sourceOffset, playDuration);
      this.sources.push(source);
    });
  }

  // Moves the playhead to a timeline position. If playback is currently
  // running, all tracks are stopped and immediately restarted from the new
  // position (kept sample-synchronised); otherwise just remembers the
  // position for the next play() call.
  seek(timelineSec, tracks) {
    if (this.playing && tracks) {
      this.play(tracks, timelineSec);
    } else {
      this.timelineOffset = timelineSec;
    }
  }

  stop() {
    // Freeze the playhead at the current position before clearing the
    // running clock, so a caller reading getCurrentTime() right after stop()
    // (e.g. pausing mid-drag) sees where playback actually was, not where it
    // last started from.
    this.timelineOffset = this.getCurrentTime();
    this.sources.forEach((s) => {
      try { s.stop(); } catch { /* already stopped */ }
      try { s.disconnect(); } catch { /* already disconnected */ }
    });
    this.sources = [];
    this.playing = false;
    this.startCtxTime = null;
  }

  // Current position on the shared timeline, in seconds.
  getCurrentTime() {
    if (!this.playing || this.startCtxTime == null) return this.timelineOffset;
    return this.timelineOffset + (getContext().currentTime - this.startCtxTime);
  }

  isPlaying() {
    return this.playing;
  }
}

export const mixPlayer = new MixPlayer();
