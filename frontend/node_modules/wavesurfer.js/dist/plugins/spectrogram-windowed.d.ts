/**
 * Windowed Spectrogram plugin - Optimized for very long audio files
 *
 * Only renders frequency data in a sliding window around the current viewport,
 * keeping memory usage constant regardless of audio length.
 */
import BasePlugin, { type BasePluginEvents } from '../base-plugin.js';
export type WindowedSpectrogramPluginOptions = {
    /** Selector of element or element in which to render */
    container?: string | HTMLElement;
    /** Number of samples per analysis window. Must be a power of 2, unless fftSize is set (then any integer from 2 to fftSize). */
    fftSamples?: number;
    /**
     * Length of the zero-padded FFT, in samples. Must be a power of two, and at least fftSamples.
     * When set, each fftSamples-long analysis window is zero-padded to fftSize before the FFT, which
     * only adds interpolated frequency bins (fftSize / 2 in total) - it does not improve the true
     * frequency resolution, and the time resolution (window and hop) is unchanged. Same split as
     * win_length vs n_fft in librosa/scipy or AnalyserNode.fftSize. When fftSize is set, fftSamples
     * may be any integer from 2 up to fftSize (the power-of-two requirement moves to fftSize).
     * (default: fftSamples)
     */
    fftSize?: number;
    /** Height of the spectrogram view in CSS pixels */
    height?: number;
    /** Set to true to display frequency labels. */
    labels?: boolean;
    labelsBackground?: string;
    labelsColor?: string;
    labelsHzColor?: string;
    /** Size of the overlapping window. Must be < fftSamples. */
    noverlap?: number;
    /** The window function to be used. */
    windowFunc?: 'bartlett' | 'bartlettHann' | 'blackman' | 'cosine' | 'gauss' | 'hamming' | 'hann' | 'lanczoz' | 'rectangular' | 'triangular';
    /** Some window functions have this extra value. (Between 0 and 1) */
    alpha?: number;
    /** Min frequency to scale spectrogram. */
    frequencyMin?: number;
    /** Max frequency to scale spectrogram. */
    frequencyMax?: number;
    /** Sample rate of the audio when using pre-computed spectrogram data. */
    sampleRate?: number;
    /** Frequency scale type */
    scale?: 'linear' | 'logarithmic' | 'mel' | 'bark' | 'erb';
    /** Gain in dB */
    gainDB?: number;
    /** Range in dB */
    rangeDB?: number;
    /**
     * Praat-style display pre-emphasis in dB per octave, applied before quantization: each bin
     * gets preEmphasis * log2(binHz / 1000) dB - 0 dB at 1 kHz, boosting higher frequencies and
     * attenuating lower ones (Praat's default is 6). Set 0 to disable. Note: the autoGain option
     * of SpectrogramPlugin is not available here - segments are computed lazily while scrolling,
     * so no global maximum exists. (default: 0)
     */
    preEmphasis?: number;
    /** Color map */
    colorMap?: number[][] | 'gray' | 'igray' | 'roseus';
    /** Render a spectrogram for each channel independently when true. */
    splitChannels?: boolean;
    /** Window size in seconds (how much data to keep in memory) */
    windowSize?: number;
    /** Buffer size in pixels (how much extra to render beyond viewport) */
    bufferSize?: number;
    /** Enable progressive background loading of all segments (default: true) */
    progressiveLoading?: boolean;
    /** Use web worker for FFT calculations (default: true) */
    useWebWorker?: boolean;
    /**
     * Whether a failed or timed-out worker calculation silently recomputes the FFT on the main
     * thread. The default keeps that historical behavior. Set to false to emit an 'error' event
     * and skip the segment instead - on long files a main-thread FFT can freeze the page. After
     * a worker failure the worker is re-created on the next computation either way. Only applies
     * when a worker could actually be created. (default: true)
     */
    fallbackToMainThread?: boolean;
};
export type WindowedSpectrogramPluginEvents = BasePluginEvents & {
    ready: [];
    click: [relativeX: number];
    progress: [progress: number];
    error: [error: Error];
};
declare class WindowedSpectrogramPlugin extends BasePlugin<WindowedSpectrogramPluginEvents, WindowedSpectrogramPluginOptions> {
    private container;
    private wrapper;
    private labelsEl;
    private canvasContainer;
    private colorMap;
    private fftSamples;
    private fftSize;
    private height;
    private noverlap;
    private windowFunc;
    private alpha;
    private frequencyMin;
    private frequencyMax;
    private gainDB;
    private rangeDB;
    private preEmphasis;
    private scale;
    private windowSize;
    private bufferSize;
    private progressiveLoading;
    private useWebWorker;
    private fallbackToMainThread;
    private workerConstructionFailed;
    private segments;
    private buffer;
    private currentPosition;
    private pixelsPerSecond;
    private isRendering;
    private renderTimeout;
    private fft;
    private numMelFilters;
    private numLogFilters;
    private numBarkFilters;
    private numErbFilters;
    private progressiveLoadTimeout;
    private isProgressiveLoading;
    private nextProgressiveSegmentTime;
    private worker;
    private workerPromises;
    static create(options?: WindowedSpectrogramPluginOptions): WindowedSpectrogramPlugin;
    constructor(options: WindowedSpectrogramPluginOptions);
    private initializeWorker;
    private disposeWorker;
    onInit(): void;
    private createWrapper;
    private createCanvas;
    private handleRedraw;
    private updateSegmentPositions;
    private scheduleSegmentQualityUpdate;
    private qualityUpdateTimeout;
    private updateVisibleSegmentQuality;
    private getScrollLeft;
    private getViewportWidth;
    private handleScroll;
    private updatePosition;
    private scheduleRender;
    private renderVisibleWindow;
    private generateSegments;
    private findUncoveredTimeRanges;
    private startProgressiveLoading;
    private progressiveLoadNextSegment;
    private _stopProgressiveLoading;
    /** Get the current loading progress as a percentage (0-100) */
    getLoadingProgress(): number;
    private emitProgress;
    private calculateFrequencies;
    private calculateFrequenciesWithWorker;
    private calculateFrequenciesMainThread;
    private renderSegment;
    private renderChannelToCanvas;
    private clearAllSegments;
    private getFilterBank;
    private _onWrapperClick;
    private freqType;
    private unitType;
    private getLabelFrequency;
    private loadLabels;
    render(audioData: AudioBuffer): Promise<void>;
    destroy(): void;
    private getWidth;
    private getPixelsPerSecond;
    /** Stop progressive loading if it's currently running */
    stopProgressiveLoading(): void;
    /** Restart progressive loading from the beginning */
    restartProgressiveLoading(): void;
}
export default WindowedSpectrogramPlugin;
