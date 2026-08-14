var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import Decoder from '../decoder.js';
describe('Decoder', () => {
    const originalAudioContext = global.AudioContext;
    const audioBuffer = {};
    const decodeAudioData = jest.fn();
    const close = jest.fn();
    let state;
    beforeEach(() => {
        state = 'running';
        decodeAudioData.mockReset().mockResolvedValue(audioBuffer);
        close.mockReset().mockResolvedValue(undefined);
        global.AudioContext = jest.fn().mockImplementation(() => ({
            decodeAudioData,
            close,
            get state() {
                return state;
            },
        }));
    });
    afterAll(() => {
        global.AudioContext = originalAudioContext;
    });
    test('closes an active AudioContext after decoding', () => __awaiter(void 0, void 0, void 0, function* () {
        const result = yield Decoder.decode(new ArrayBuffer(0), 8000);
        expect(result).toBe(audioBuffer);
        expect(close).toHaveBeenCalledTimes(1);
    }));
    test('does not close an AudioContext that is already closed', () => __awaiter(void 0, void 0, void 0, function* () {
        state = 'closed';
        yield expect(Decoder.decode(new ArrayBuffer(0), 8000)).resolves.toBe(audioBuffer);
        expect(close).not.toHaveBeenCalled();
    }));
});
