/**
 * Spectrogram plugin
 *
 * Render a spectrogram visualisation of the audio.
 *
 * @author Pavel Denisov (https://github.com/akreal)
 * @see https://github.com/wavesurfer-js/wavesurfer.js/pull/337
 *
 * @example
 * // ... initialising wavesurfer with the plugin
 * var wavesurfer = WaveSurfer.create({
 *   // wavesurfer options ...
 *   plugins: [
 *     SpectrogramPlugin.create({
 *       // plugin options ...
 *     })
 *   ]
 * });
 */
/**
 * Spectrogram plugin for wavesurfer.
 */
import BasePlugin, { type BasePluginEvents } from '../base-plugin.js';
export type SpectrogramPluginOptions = {
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
    /** Size of the overlapping window. Must be < fftSamples. Auto deduced from canvas size by default. */
    noverlap?: number;
    /** The window function to be used. */
    windowFunc?: 'bartlett' | 'bartlettHann' | 'blackman' | 'cosine' | 'gauss' | 'hamming' | 'hann' | 'lanczoz' | 'rectangular' | 'triangular';
    /** Some window functions have this extra value. (Between 0 and 1) */
    alpha?: number;
    /** Min frequency to scale spectrogram. */
    frequencyMin?: number;
    /** Max frequency to scale spectrogram. Set this to samplerate/2 to draw whole range of spectrogram. */
    frequencyMax?: number;
    /** Sample rate of the audio when using pre-computed spectrogram data. Required when using frequenciesDataUrl. */
    sampleRate?: number;
    /**
     * Based on: https://manual.audacityteam.org/man/spectrogram_settings.html
     * - Linear: Linear The linear vertical scale goes linearly from 0 kHz to 20 kHz frequency by default.
     * - Logarithmic: This view is the same as the linear view except that the vertical scale is logarithmic.
     * - Mel: The name Mel comes from the word melody to indicate that the scale is based on pitch comparisons. This is the default scale.
     * - Bark: This is a psychoacoustical scale based on subjective measurements of loudness. It is related to, but somewhat less popular than, the Mel scale.
     * - ERB: The Equivalent Rectangular Bandwidth scale or ERB is a measure used in psychoacoustics, which gives an approximation to the bandwidths of the filters in human hearing
     */
    scale?: 'linear' | 'logarithmic' | 'mel' | 'bark' | 'erb';
    /**
     * Increases / decreases the brightness of the display.
     * For small signals where the display is mostly "blue" (dark) you can increase this value to see brighter colors and give more detail.
     * If the display has too much "white", decrease this value.
     * The default is 20dB and corresponds to a -20 dB signal at a particular frequency being displayed as "white". */
    gainDB?: number;
    /**
     * Affects the range of signal sizes that will be displayed as colors.
     * The default is 80 dB and means that you will not see anything for signals 80 dB below the value set for "Gain".
     */
    rangeDB?: number;
    /**
     * Praat-style display pre-emphasis in dB per octave, applied before quantization: each bin
     * gets preEmphasis * log2(binHz / 1000) dB - 0 dB at 1 kHz, boosting higher frequencies and
     * attenuating lower ones (Praat's default is 6). Counteracts the natural ~-6 dB/oct spectral
     * slope of speech so formants above 1 kHz stay visible. Set 0 to disable. Only applies when
     * frequencies are computed from audio, not to pre-computed frequenciesDataUrl data.
     * (default: 0)
     */
    preEmphasis?: number;
    /**
     * Praat-style autoscaling: map the loudest bin of the computed spectrogram (found after
     * pre-emphasis) to the last colormap entry and everything rangeDB below it to the first,
     * instead of using the fixed gainDB white point. gainDB is ignored while enabled. With
     * splitChannels, a single maximum serves all channels, so inter-channel level differences
     * are preserved (a quieter channel renders lighter); per-channel scaling was rejected to
     * keep channels comparable. If the whole signal is digital silence, the spectrogram is left
     * blank instead of amplifying the numeric floor. SpectrogramPlugin only - the windowed
     * variant computes segments lazily and has no global maximum. No effect with
     * frequenciesDataUrl. (default: false)
     */
    autoGain?: boolean;
    /**
     * A 256 long array of 4-element arrays. Each entry should contain a float between 0 and 1 and specify r, g, b, and alpha.
     * Each entry should contain a float between 0 and 1 and specify r, g, b, and alpha.
     * - gray: Gray scale.
     * - igray: Inverted gray scale.
     * - roseus: From https://github.com/dofuuz/roseus/blob/main/roseus/cmap/roseus.py
     */
    colorMap?: number[][] | 'gray' | 'igray' | 'roseus';
    /** Render a spectrogram for each channel independently when true. */
    splitChannels?: boolean;
    /** URL with pre-computed spectrogram JSON data, the data must be a Uint8Array[][] **/
    frequenciesDataUrl?: string;
    /** Maximum width of individual canvas elements in pixels (default: 30000) */
    maxCanvasWidth?: number;
    /** Use web worker for FFT calculations (default: false) */
    useWebWorker?: boolean;
    /**
     * Max time in milliseconds to wait for the web worker FFT result before the calculation is
     * rejected (and falls back to the main thread). Set to 0 to disable the timeout. Only used when
     * useWebWorker is true. (default: 30000)
     */
    workerTimeout?: number;
    /**
     * Whether a failed or timed-out worker calculation silently recomputes the FFT on the main
     * thread. The default keeps that historical behavior. Set to false to emit an 'error' event
     * and skip rendering instead - on long files a main-thread FFT can freeze the page, which is
     * usually worse than a missing spectrogram. After a worker failure the worker is re-created
     * on the next render either way. Only applies when useWebWorker is true and a worker could
     * actually be created; environments without Worker support always compute on the main
     * thread. (default: true)
     */
    fallbackToMainThread?: boolean;
};
export type SpectrogramPluginEvents = BasePluginEvents & {
    ready: [];
    click: [relativeX: number];
    error: [error: Error];
};
declare class SpectrogramPlugin extends BasePlugin<SpectrogramPluginEvents, SpectrogramPluginOptions> {
    private static MAX_CANVAS_WIDTH;
    private static MAX_NODES;
    private frequenciesDataUrl?;
    private container;
    private wrapper;
    private labelsEl;
    private canvases;
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
    private autoGain;
    private autoGainBudgetBytes;
    private scale;
    private numMelFilters;
    private numLogFilters;
    private numBarkFilters;
    private numErbFilters;
    private useWebWorker;
    private worker;
    private workerTimeout;
    private fallbackToMainThread;
    private workerConstructionFailed;
    private workerPromises;
    private cachedFrequencies;
    private cachedResampledData;
    private cachedBuffer;
    private cachedWidth;
    private renderTimeout;
    private isRendering;
    private lastZoomLevel;
    private renderThrottleMs;
    private zoomThreshold;
    private drawnCanvases;
    private pendingBitmaps;
    private isScrollable;
    private scrollUnsubscribe;
    private _onWrapperClick;
    static create(options?: SpectrogramPluginOptions): SpectrogramPlugin;
    constructor(options: SpectrogramPluginOptions);
    private initializeWorker;
    private disposeWorker;
    onInit(): void;
    destroy(): void;
    loadFrequenciesData(url: string | URL): Promise<void>;
    getFrequenciesData(): Promise<Uint8Array[][] | null>;
    /** Clear cached frequency data to force recalculation */
    clearCache(): void;
    private createWrapper;
    private createCanvas;
    private createSingleCanvas;
    private clearCanvases;
    private clearExcessCanvases;
    private throttledRender;
    private render;
    private fastRender;
    private drawSpectrogram;
    private drawSpectrogramSegment;
    private getWidth;
    private getWrapperWidth;
    private calculateFrequenciesWithWorker;
    private getFrequencies;
    private loadLabels;
    private efficientResample;
    private resampleChannel;
    private fillImageDataQuality;
}
export default SpectrogramPlugin;
