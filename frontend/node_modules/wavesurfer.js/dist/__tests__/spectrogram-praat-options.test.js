var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
jest.mock('web-worker:./spectrogram-worker.ts', () => ({
    __esModule: true,
    default: class MockSpectrogramWorker {
        constructor() {
            this.onmessage = null;
            this.onerror = null;
            this.postMessage = jest.fn();
            this.terminate = jest.fn();
        }
    },
}), { virtual: true });
import Spectrogram from '../plugins/spectrogram.js';
import WindowedSpectrogram from '../plugins/spectrogram-windowed.js';
import '../plugins/spectrogram-worker.js';
const SAMPLE_RATE = 8000;
function makeSine(length, amplitude = 1) {
    const signal = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        signal[i] = amplitude * Math.sin((2 * Math.PI * 1000 * i) / SAMPLE_RATE);
    }
    return signal;
}
/** Dispatch a message to the worker handler and return its response synchronously */
function runWorker(signal, options) {
    const postMessage = jest.fn();
    self.postMessage = postMessage;
    self.onmessage({
        data: {
            type: 'calculateFrequencies',
            id: 'test',
            audioData: [signal],
            options: Object.assign({ startTime: 0, endTime: signal.length / SAMPLE_RATE, sampleRate: SAMPLE_RATE, fftSamples: 256, windowFunc: 'hann', noverlap: 128, scale: 'linear', gainDB: 20, rangeDB: 80, splitChannels: false }, options),
        },
    });
    const response = postMessage.mock.calls[0][0];
    expect(response.error).toBeUndefined();
    return response.result;
}
const flatten = (result) => result[0].map((frame) => Array.from(frame));
beforeAll(() => {
    // jsdom has no Worker; the plugins only check its existence before using the bundled constructor
    ;
    globalThis.Worker = function Worker() { };
});
describe.each([
    ['SpectrogramPlugin', Spectrogram],
    ['WindowedSpectrogramPlugin', WindowedSpectrogram],
])('%s Praat display option validation', (_name, Plugin) => {
    it('rejects non-finite or non-positive rangeDB', () => {
        expect(() => Plugin.create({ rangeDB: 0 })).toThrow(TypeError);
        expect(() => Plugin.create({ rangeDB: -5 })).toThrow(TypeError);
        expect(() => Plugin.create({ rangeDB: NaN })).toThrow(TypeError);
        expect(() => Plugin.create({ rangeDB: Infinity })).toThrow(TypeError);
    });
    it('rejects non-finite gainDB and preEmphasis', () => {
        expect(() => Plugin.create({ gainDB: NaN })).toThrow(TypeError);
        expect(() => Plugin.create({ preEmphasis: NaN })).toThrow(TypeError);
        expect(() => Plugin.create({ preEmphasis: Infinity })).toThrow(TypeError);
    });
    it('accepts finite preEmphasis values including zero and negatives', () => {
        expect(() => Plugin.create({ preEmphasis: 0 })).not.toThrow();
        expect(() => Plugin.create({ preEmphasis: 6 })).not.toThrow();
        expect(() => Plugin.create({ preEmphasis: -3 })).not.toThrow();
    });
    it('rejects invalid alpha values per window function', () => {
        expect(() => Plugin.create({ alpha: NaN })).toThrow(TypeError);
        expect(() => Plugin.create({ windowFunc: 'gauss', alpha: 0 })).toThrow(TypeError);
        expect(() => Plugin.create({ windowFunc: 'gauss', alpha: -0.2 })).toThrow(TypeError);
    });
    it('accepts an explicit blackman alpha of 0', () => {
        expect(() => Plugin.create({ windowFunc: 'blackman', alpha: 0 })).not.toThrow();
    });
});
describe('worker compute with preEmphasis', () => {
    it('quantizes the DC bin to 0 and changes the output', () => {
        const signal = makeSine(4000);
        const plain = runWorker(signal, {});
        const tilted = runWorker(signal, { preEmphasis: 6 });
        expect(flatten(tilted)).not.toEqual(flatten(plain));
        for (const frame of tilted[0]) {
            expect(frame[0]).toBe(0);
        }
    });
    it('applies the tilt on non-linear scales using the row center frequencies', () => {
        const signal = makeSine(4000);
        const plain = runWorker(signal, { scale: 'mel' });
        const tilted = runWorker(signal, { scale: 'mel', preEmphasis: 6 });
        expect(flatten(tilted)).not.toEqual(flatten(plain));
        expect(tilted[0].some((frame) => frame.some((value) => value > 0))).toBe(true);
    });
});
describe('worker compute with autoGain', () => {
    it('produces identical output regardless of absolute signal level', () => {
        const loud = runWorker(makeSine(4000, 1), { autoGain: true });
        const quiet = runWorker(makeSine(4000, 0.01), { autoGain: true });
        expect(flatten(quiet)).toEqual(flatten(loud));
    });
    it('ignores gainDB while enabled', () => {
        const signal = makeSine(4000);
        const lowGain = runWorker(signal, { autoGain: true, gainDB: 0 });
        const highGain = runWorker(signal, { autoGain: true, gainDB: 60 });
        expect(flatten(highGain)).toEqual(flatten(lowGain));
    });
    it('maps the loudest bin to 255', () => {
        const result = runWorker(makeSine(4000, 0.05), { autoGain: true });
        const max = Math.max(...result[0].map((frame) => Math.max(...Array.from(frame))));
        expect(max).toBe(255);
    });
    it('leaves digital silence blank instead of amplifying the numeric floor', () => {
        const result = runWorker(new Float32Array(4000), { autoGain: true });
        expect(result[0].length).toBeGreaterThan(0);
        for (const frame of result[0]) {
            expect(frame.every((value) => value === 0)).toBe(true);
        }
    });
    it('produces identical output on the buffered and recompute memory strategies', () => {
        const signal = makeSine(4000);
        const options = { autoGain: true, preEmphasis: 6 };
        const buffered = runWorker(signal, options);
        const recomputed = runWorker(signal, Object.assign(Object.assign({}, options), { autoGainBufferBudgetBytes: 1 }));
        expect(flatten(recomputed)).toEqual(flatten(buffered));
    });
});
describe('main-thread parity with the worker for the new options', () => {
    function makeBuffer(signal) {
        return {
            sampleRate: SAMPLE_RATE,
            length: signal.length,
            duration: signal.length / SAMPLE_RATE,
            numberOfChannels: 1,
            getChannelData: () => signal,
        };
    }
    it.each([
        ['preEmphasis', { preEmphasis: 6 }],
        ['autoGain', { autoGain: true }],
        ['both combined on mel scale', { preEmphasis: 6, autoGain: true, scale: 'mel' }],
    ])('matches the worker byte for byte with %s', (_label, extra) => __awaiter(void 0, void 0, void 0, function* () {
        const signal = makeSine(4000);
        const plugin = Spectrogram.create(Object.assign({ fftSamples: 256, noverlap: 128, scale: 'linear' }, extra));
        const mainResult = yield plugin.getFrequencies(makeBuffer(signal));
        const workerResult = runWorker(signal, extra);
        expect(mainResult[0].length).toBe(workerResult[0].length);
        mainResult[0].forEach((frame, i) => {
            expect(Array.from(frame)).toEqual(Array.from(workerResult[0][i]));
        });
    }));
    it('uses the recompute strategy on the main thread when over budget, with identical output', () => __awaiter(void 0, void 0, void 0, function* () {
        const signal = makeSine(4000);
        const makePlugin = () => Spectrogram.create({ fftSamples: 256, noverlap: 128, autoGain: true });
        const buffered = yield makePlugin().getFrequencies(makeBuffer(signal));
        const constrained = makePlugin();
        constrained.autoGainBudgetBytes = 1;
        const recomputed = yield constrained.getFrequencies(makeBuffer(signal));
        expect(flatten(recomputed)).toEqual(flatten(buffered));
    }));
});
describe('explicit blackman alpha: 0 end-to-end', () => {
    function makeBuffer(signal) {
        return {
            sampleRate: SAMPLE_RATE,
            length: signal.length,
            duration: signal.length / SAMPLE_RATE,
            numberOfChannels: 1,
            getChannelData: () => signal,
        };
    }
    it('is honored on the worker path, byte-identical to the main thread', () => __awaiter(void 0, void 0, void 0, function* () {
        // Distinct fftSamples so the worker module's FFT cache (keyed on sizes only) cannot
        // serve a window built for another test's windowFunc/alpha
        const signal = makeSine(4000);
        const options = { fftSamples: 512, noverlap: 256, windowFunc: 'blackman', alpha: 0 };
        const workerResult = runWorker(signal, options);
        const plugin = Spectrogram.create(Object.assign(Object.assign({}, options), { scale: 'linear' }));
        const mainResult = yield plugin.getFrequencies(makeBuffer(signal));
        expect(mainResult[0].length).toBe(workerResult[0].length);
        mainResult[0].forEach((frame, i) => {
            expect(Array.from(frame)).toEqual(Array.from(workerResult[0][i]));
        });
    }));
    it('produces different output than the blackman default on the main thread', () => __awaiter(void 0, void 0, void 0, function* () {
        const signal = makeSine(4000);
        const create = (alpha) => Spectrogram.create({ fftSamples: 256, noverlap: 128, scale: 'linear', windowFunc: 'blackman', alpha });
        const explicitZero = yield create(0).getFrequencies(makeBuffer(signal));
        const defaulted = yield create(undefined).getFrequencies(makeBuffer(signal));
        expect(explicitZero[0].map((f) => Array.from(f))).not.toEqual(defaulted[0].map((f) => Array.from(f)));
    }));
});
describe('windowed plugin preEmphasis', () => {
    it('tilts the main-thread computation', () => __awaiter(void 0, void 0, void 0, function* () {
        const signal = makeSine(4000);
        const create = (preEmphasis) => {
            const plugin = WindowedSpectrogram.create({ fftSamples: 256, noverlap: 128, scale: 'linear', preEmphasis });
            plugin.buffer = {
                sampleRate: SAMPLE_RATE,
                length: signal.length,
                duration: signal.length / SAMPLE_RATE,
                numberOfChannels: 1,
                getChannelData: () => signal,
            };
            return plugin;
        };
        const plain = yield create(0).calculateFrequenciesMainThread(0, signal.length / SAMPLE_RATE);
        const tilted = yield create(6).calculateFrequenciesMainThread(0, signal.length / SAMPLE_RATE);
        expect(flatten(tilted)).not.toEqual(flatten(plain));
        for (const frame of tilted[0]) {
            expect(frame[0]).toBe(0);
        }
    }));
    it('forwards preEmphasis to the worker', () => __awaiter(void 0, void 0, void 0, function* () {
        const plugin = WindowedSpectrogram.create({ useWebWorker: true, noverlap: 128, preEmphasis: 6 });
        plugin.buffer = {
            sampleRate: SAMPLE_RATE,
            length: 4000,
            duration: 0.5,
            numberOfChannels: 1,
            getChannelData: () => makeSine(4000),
        };
        const promise = plugin.calculateFrequenciesWithWorker(0, 0.5);
        promise.catch(() => undefined);
        const worker = plugin.worker;
        expect(worker.postMessage).toHaveBeenCalledTimes(1);
        expect(worker.postMessage.mock.calls[0][0].options.preEmphasis).toBe(6);
        plugin.destroy();
    }));
});
