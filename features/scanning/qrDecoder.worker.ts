/// <reference lib="webworker" />

import { prepareZXingModule } from 'zxing-wasm/reader';
import zxingWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { getFrameDiagnostics } from './scannerEngine';
import { decodeQrImage } from './qrDecoderPipeline';
import { DecoderWorkerRequest, DecoderWorkerResponse } from './scannerTypes';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

const moduleReady = prepareZXingModule({
  overrides: {
    locateFile: (path: string) => (path.endsWith('.wasm') ? zxingWasmUrl : path),
  },
  fireImmediately: true,
});

moduleReady
  .then(() => workerScope.postMessage({ type: 'ready' } satisfies DecoderWorkerResponse))
  .catch((error) => workerScope.postMessage({
    type: 'init-error',
    message: error instanceof Error ? error.message : 'QR engine failed to initialize.',
  } satisfies DecoderWorkerResponse));

workerScope.onmessage = async (event: MessageEvent<DecoderWorkerRequest>) => {
  const message = event.data;
  if (message.type !== 'decode') return;

  const startedAt = performance.now();
  try {
    await moduleReady;
    const pixels = new Uint8ClampedArray(message.rgba);
    const image = new ImageData(pixels, message.width, message.height);
    const diagnostics = getFrameDiagnostics(pixels, message.width, message.height);
    const text = await decodeQrImage(image, message.enhanced, message.fullFrame);

    workerScope.postMessage({
      type: 'result',
      sessionId: message.sessionId,
      requestId: message.requestId,
      text,
      durationMs: performance.now() - startedAt,
      ...diagnostics,
      source: message.source,
    } satisfies DecoderWorkerResponse);
  } catch (error) {
    workerScope.postMessage({
      type: 'decode-error',
      sessionId: message.sessionId,
      requestId: message.requestId,
      message: error instanceof Error ? error.message : 'QR decode failed.',
      source: message.source,
    } satisfies DecoderWorkerResponse);
  }
};

export {};
