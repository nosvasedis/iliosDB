export type ScannerStatus =
  | 'opening'
  | 'warming'
  | 'ready'
  | 'difficult-print'
  | 'success'
  | 'permission-denied'
  | 'camera-busy'
  | 'camera-unavailable'
  | 'error';

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScannerCapabilities {
  torch: boolean;
  zoom: { min: number; max: number; step: number } | null;
  continuousFocus: boolean;
  tapToFocus: boolean;
}

/** A decoded QR code located in the pixel space of the image that was decoded. */
export interface QrCandidate {
  text: string;
  x: number;
  y: number;
  size: number;
}

export interface DecodeFrameMessage {
  type: 'decode';
  sessionId: number;
  requestId: number;
  width: number;
  height: number;
  rgba: ArrayBuffer;
  enhanced: boolean;
  fullFrame: boolean;
  source: 'camera' | 'photo';
}

export type DecoderWorkerRequest = DecodeFrameMessage;

export type DecoderWorkerResponse =
  | { type: 'ready' }
  | { type: 'init-error'; message: string }
  | {
      type: 'result';
      sessionId: number;
      requestId: number;
      candidates: QrCandidate[];
      width: number;
      height: number;
      durationMs: number;
      brightness: number;
      sharpness: number;
      source: 'camera' | 'photo';
    }
  | {
      type: 'decode-error';
      sessionId: number;
      requestId: number;
      message: string;
      source: 'camera' | 'photo';
    };
