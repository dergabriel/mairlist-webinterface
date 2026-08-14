/**
 * FFT (Fast Fourier Transform) implementation
 * Based on https://github.com/corbanbrook/dsp.js
 *
 * Centralized FFT functionality for spectrogram plugins
 */
export declare const ERB_A: number;
export declare function hzToMel(hz: number): number;
export declare function melToHz(mel: number): number;
export declare function hzToLog(hz: number): number;
export declare function logToHz(log: number): number;
export declare function hzToBark(hz: number): number;
export declare function barkToHz(bark: number): number;
export declare function hzToErb(hz: number): number;
export declare function erbToHz(erb: number): number;
export declare function hzToScale(hz: number, scale: 'linear' | 'logarithmic' | 'mel' | 'bark' | 'erb'): number;
export declare function scaleToHz(scale: number, scaleType: 'linear' | 'logarithmic' | 'mel' | 'bark' | 'erb'): number;
export declare function applyFilterBank(fftPoints: Float32Array, filterBank: number[][]): Float32Array;
export declare function createFilterBankForScale(scale: 'linear' | 'logarithmic' | 'mel' | 'bark' | 'erb', numFilters: number, fftSamples: number, sampleRate: number): number[][] | null;
/**
 * One output row of a sparse frequency-scale filter bank. Every row produced by
 * createFilterBank() has exactly two adjacent non-zero taps, so storing just those (plus the
 * row's center frequency) lets the bank be applied in O(filters) instead of O(filters × bins).
 */
export interface SparseFilter {
    /** Index of the lower of the two adjacent FFT bins (the upper tap is lo + 1) */
    lo: number;
    /** Weight of the lower bin */
    weightLo: number;
    /** Weight of the upper bin */
    weightHi: number;
    /** Center frequency of this output row in Hz */
    centerHz: number;
}
export declare function applySparseFilterBank(fftPoints: Float32Array, filterBank: SparseFilter[]): Float32Array;
export declare function createSparseFilterBankForScale(scale: 'linear' | 'logarithmic' | 'mel' | 'bark' | 'erb', numFilters: number, fftSamples: number, sampleRate: number): SparseFilter[] | null;
/**
 * Global-peak level below which autoGain treats the whole signal as digital silence and leaves
 * the spectrogram blank instead of amplifying the numeric floor. -180 dBFS is well below the
 * quantization floor of 24-bit audio (~-144 dBFS) and float32 near full scale (~-138 dB), but
 * far above denormals, so it only triggers on true silence.
 */
export declare const SILENCE_FLOOR_DB = -180;
/**
 * autoGain transient-memory budget: below this estimate (frames x bins x 4 bytes x channels)
 * the Float32 dB frames are kept between the two passes (single FFT pass, fastest); at or
 * above it, only the running maximum is kept and the spectra are recomputed for quantization,
 * trading a second FFT pass on very long short-window files for a bounded heap.
 */
export declare const AUTO_GAIN_BUFFER_BUDGET_BYTES: number;
/**
 * Per-bin display tilt in dB: preEmphasis dB/octave relative to 1 kHz - 0 dB at 1 kHz,
 * boosting above, attenuating below. This is Praat's display pre-emphasis formula, including
 * its 1e-308 guard that sends the DC bin toward -infinity instead of NaN.
 */
export declare function createPreEmphasisTilt(preEmphasis: number, binFrequencies: ArrayLike<number>): Float64Array;
/** Center frequency in Hz of each output row: sparse scale rows, or linear FFT bins */
export declare function getBinFrequencies(filterBank: SparseFilter[] | null, fftLength: number, sampleRate: number): Float64Array;
/**
 * Convert one frame of FFT magnitudes into 8-bit color indices.
 * dB = 20*log10(max(magnitude, 1e-12)); clipped to 0 at or below floorDb (whiteDb - rangeDB)
 * and to 255 at or above whiteDb, with a linear mapping ((valueDB - floorDb) / rangeDB) * 255
 * for everything in between. The optional tilt (createPreEmphasisTilt) is added to each bin's
 * dB value before mapping.
 */
export declare function magnitudesToColorIndices(spectrum: Float32Array, whiteDb: number, rangeDB: number, tilt?: Float64Array | null): Uint8Array;
/**
 * One frame of FFT magnitudes to dB (same floor and tilt semantics as
 * magnitudesToColorIndices), materialized as Float32 for autoGain's deferred quantization.
 * Pass `out` to reuse a scratch buffer when the frame is not retained.
 */
export declare function magnitudesToDb(spectrum: Float32Array, tilt?: Float64Array | null, out?: Float32Array): Float32Array;
/**
 * Quantize a dB frame produced by magnitudesToDb: 255 at/above whiteDb, 0 at/below
 * whiteDb - rangeDB, linear mapping ((valueDB - floorDb) / rangeDB) * 255 in between.
 * Used by autoGain, whose white point is the exact spectrogram maximum.
 */
export declare function dbToColorIndices(db: Float32Array, whiteDb: number, rangeDB: number): Uint8Array;
export declare const COLOR_MAPS: {
    gray: () => number[][];
    igray: () => number[][];
    roseus: () => number[][];
};
/**
 * Set up color map based on options
 */
export declare function setupColorMap(colorMap?: number[][] | 'gray' | 'igray' | 'roseus'): number[][];
/**
 * Format frequency value for display
 */
export declare function freqType(freq: number): string;
/**
 * Get frequency unit for display
 */
export declare function unitType(freq: number): string;
/**
 * Get frequency value for label at given index
 */
export declare function getLabelFrequency(index: number, labelIndex: number, frequencyMin: number, frequencyMax: number, scale: 'linear' | 'logarithmic' | 'mel' | 'bark' | 'erb'): number;
/**
 * Create wrapper click handler for relative position calculation
 */
export declare function createWrapperClickHandler(wrapper: HTMLElement, emit: (event: string, ...args: any[]) => void): (e: MouseEvent) => void;
/**
 * Calculate FFT - Based on https://github.com/corbanbrook/dsp.js
 */
declare function FFT(bufferSize: number, sampleRate: number, windowFunc: string, alpha: number, windowLength?: number): void;
export declare class FFT {
    constructor(bufferSize: number, sampleRate: number, windowFunc: string, alpha: number, windowLength?: number);
    bufferSize: number;
    windowLength: number;
    calculateSpectrum(buffer: Float32Array): Float32Array;
}
export { FFT };
export default FFT;
