declare module 'opencv-wasm' {
  export class Mat {
    constructor();
    constructor(rows: number, cols: number, type: number);
    data: Uint8Array;
    data32S: Int32Array;
    rows: number;
    cols: number;
    delete(): void;
    static ones(rows: number, cols: number, type: number): Mat;
  }

  export class MatVector {
    size(): number;
    get(index: number): Mat;
    delete(): void;
  }

  export class Size {
    constructor(width: number, height: number);
  }

  export const CV_8U: number;
  export const CV_8UC1: number;
  export const CV_8UC3: number;
  export const CV_8UC4: number;
  export const CV_32FC2: number;

  export const COLOR_RGBA2GRAY: number;
  export const COLOR_BGR2GRAY: number;
  export const COLOR_RGB2GRAY: number;

  export const RETR_EXTERNAL: number;
  export const RETR_LIST: number;
  export const RETR_TREE: number;

  export const CHAIN_APPROX_SIMPLE: number;
  export const CHAIN_APPROX_NONE: number;

  export function cvtColor(src: Mat, dst: Mat, code: number): void;
  export function GaussianBlur(src: Mat, dst: Mat, ksize: Size, sigmaX: number): void;
  export function Canny(src: Mat, dst: Mat, threshold1: number, threshold2: number): void;
  export function dilate(src: Mat, dst: Mat, kernel: Mat): void;
  export function erode(src: Mat, dst: Mat, kernel: Mat): void;
  export function findContours(src: Mat, contours: MatVector, hierarchy: Mat, mode: number, method: number): void;
  export function contourArea(contour: Mat): number;
  export function arcLength(contour: Mat, closed: boolean): number;
  export function approxPolyDP(contour: Mat, approx: Mat, epsilon: number, closed: boolean): void;
  export function getPerspectiveTransform(src: Mat, dst: Mat): Mat;
  export function warpPerspective(src: Mat, dst: Mat, M: Mat, dsize: Size): void;
  export function matFromArray(rows: number, cols: number, type: number, array: number[]): Mat;

  export let onRuntimeInitialized: () => void;

  const cv: typeof import('opencv-wasm');
  export default cv;
}
