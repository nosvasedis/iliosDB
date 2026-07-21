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
      text: string;
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
