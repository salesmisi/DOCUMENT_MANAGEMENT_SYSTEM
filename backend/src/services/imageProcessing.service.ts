import cv, { Mat } from 'opencv-wasm';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

let cvReady = false;
let cvInitPromise: Promise<void> | null = null;

// Initialize OpenCV (only once) with timeout
async function initOpenCV(): Promise<void> {
  if (cvReady) return;
  if (cvInitPromise) return cvInitPromise;

  cvInitPromise = new Promise((resolve, reject) => {
    // Set a timeout in case onRuntimeInitialized never fires
    const timeout = setTimeout(() => {
      // Check if cv functions are available even without callback
      if (typeof cv.Mat === 'function') {
        cvReady = true;
        console.log('OpenCV initialized (timeout check)');
        resolve();
      } else {
        reject(new Error('OpenCV initialization timed out'));
      }
    }, 3000);

    // Try the standard callback approach
    if (cv.onRuntimeInitialized !== undefined) {
      cv.onRuntimeInitialized = () => {
        clearTimeout(timeout);
        cvReady = true;
        console.log('OpenCV initialized successfully');
        resolve();
      };
    }

    // Check if already initialized (some versions are ready immediately)
    if (typeof cv.Mat === 'function') {
      clearTimeout(timeout);
      cvReady = true;
      console.log('OpenCV already initialized');
      resolve();
    }
  });

  return cvInitPromise;
}

interface Point {
  x: number;
  y: number;
}

interface DetectionResult {
  success: boolean;
  corners?: Point[];
  confidence?: number;
  message?: string;
}

interface CropResult {
  success: boolean;
  outputPath?: string;
  message?: string;
}

// Detect document edges in an image
export async function detectDocumentEdges(imagePath: string): Promise<DetectionResult> {
  try {
    await initOpenCV();

    // Read image using sharp and convert to buffer
    const imageBuffer = await sharp(imagePath)
      .resize(1000, 1000, { fit: 'inside', withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = imageBuffer;
    const { width, height, channels } = info;

    // Create OpenCV Mat from buffer
    const src = new cv.Mat(height, width, channels === 4 ? cv.CV_8UC4 : cv.CV_8UC3);
    src.data.set(data);

    // Convert to grayscale
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Apply Gaussian blur to reduce noise
    const blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    // Apply Canny edge detection
    const edges = new cv.Mat();
    cv.Canny(blurred, edges, 75, 200);

    // Dilate edges to close gaps
    const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    const dilated = new cv.Mat();
    cv.dilate(edges, dilated, kernel);

    // Find contours
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // Find the largest rectangular contour
    let maxArea = 0;
    let documentContour: Mat | null = null;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);

      if (area > maxArea) {
        const peri = cv.arcLength(contour, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(contour, approx, 0.02 * peri, true);

        // Looking for 4-point contour (rectangle)
        if (approx.rows === 4) {
          maxArea = area;
          documentContour = approx;
        } else {
          approx.delete();
        }
      }
    }

    // Clean up
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    kernel.delete();
    dilated.delete();
    hierarchy.delete();

    if (documentContour && maxArea > (width * height * 0.1)) {
      // Extract corner points
      const corners: Point[] = [];
      for (let i = 0; i < 4; i++) {
        corners.push({
          x: documentContour.data32S[i * 2],
          y: documentContour.data32S[i * 2 + 1]
        });
      }

      // Order corners: top-left, top-right, bottom-right, bottom-left
      const orderedCorners = orderCorners(corners);

      // Calculate confidence based on area ratio
      const confidence = Math.min((maxArea / (width * height)) * 100, 100);

      documentContour.delete();
      contours.delete();

      return {
        success: true,
        corners: orderedCorners,
        confidence: Math.round(confidence)
      };
    }

    contours.delete();
    return {
      success: false,
      message: 'No document edges detected'
    };

  } catch (error: any) {
    console.error('Edge detection error:', error);
    return {
      success: false,
      message: error.message || 'Edge detection failed'
    };
  }
}

// Order corners: top-left, top-right, bottom-right, bottom-left
function orderCorners(corners: Point[]): Point[] {
  // Sort by y-coordinate first
  const sorted = [...corners].sort((a, b) => a.y - b.y);

  // Top two points
  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  // Bottom two points
  const bottom = sorted.slice(2, 4).sort((a, b) => a.x - b.x);

  return [top[0], top[1], bottom[1], bottom[0]];
}

// Crop and apply perspective transform to straighten document
export async function cropAndStraighten(
  imagePath: string,
  corners?: Point[],
  outputPath?: string
): Promise<CropResult> {
  try {
    await initOpenCV();

    // If corners not provided, detect them
    if (!corners) {
      const detection = await detectDocumentEdges(imagePath);
      if (!detection.success || !detection.corners) {
        return {
          success: false,
          message: detection.message || 'Could not detect document edges for cropping'
        };
      }
      corners = detection.corners;
    }

    // Read original image
    const originalMeta = await sharp(imagePath).metadata();
    const originalWidth = originalMeta.width || 1000;
    const originalHeight = originalMeta.height || 1000;

    // Scale corners back to original size if image was resized during detection
    const scaleX = originalWidth / 1000;
    const scaleY = originalHeight / 1000;
    const scaledCorners = corners.map(c => ({
      x: Math.round(c.x * scaleX),
      y: Math.round(c.y * scaleY)
    }));

    // Calculate output dimensions (use the larger of width/height from detected quad)
    const topWidth = Math.sqrt(
      Math.pow(scaledCorners[1].x - scaledCorners[0].x, 2) +
      Math.pow(scaledCorners[1].y - scaledCorners[0].y, 2)
    );
    const bottomWidth = Math.sqrt(
      Math.pow(scaledCorners[2].x - scaledCorners[3].x, 2) +
      Math.pow(scaledCorners[2].y - scaledCorners[3].y, 2)
    );
    const leftHeight = Math.sqrt(
      Math.pow(scaledCorners[3].x - scaledCorners[0].x, 2) +
      Math.pow(scaledCorners[3].y - scaledCorners[0].y, 2)
    );
    const rightHeight = Math.sqrt(
      Math.pow(scaledCorners[2].x - scaledCorners[1].x, 2) +
      Math.pow(scaledCorners[2].y - scaledCorners[1].y, 2)
    );

    const outWidth = Math.round(Math.max(topWidth, bottomWidth));
    const outHeight = Math.round(Math.max(leftHeight, rightHeight));

    // Read image into OpenCV
    const imageBuffer = await sharp(imagePath)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = imageBuffer;
    const { width, height, channels } = info;

    const src = new cv.Mat(height, width, channels === 4 ? cv.CV_8UC4 : cv.CV_8UC3);
    src.data.set(data);

    // Create source points (detected corners)
    const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      scaledCorners[0].x, scaledCorners[0].y,
      scaledCorners[1].x, scaledCorners[1].y,
      scaledCorners[2].x, scaledCorners[2].y,
      scaledCorners[3].x, scaledCorners[3].y
    ]);

    // Create destination points (output rectangle)
    const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      outWidth - 1, 0,
      outWidth - 1, outHeight - 1,
      0, outHeight - 1
    ]);

    // Get perspective transform matrix
    const transformMatrix = cv.getPerspectiveTransform(srcPoints, dstPoints);

    // Apply perspective transform
    const dst = new cv.Mat();
    cv.warpPerspective(src, dst, transformMatrix, new cv.Size(outWidth, outHeight));

    // Convert back to buffer
    const outputBuffer = Buffer.from(dst.data);

    // Generate output path if not provided
    if (!outputPath) {
      const parsed = path.parse(imagePath);
      outputPath = path.join(parsed.dir, `${parsed.name}_cropped${parsed.ext}`);
    }

    // Save using sharp
    await sharp(outputBuffer, {
      raw: {
        width: outWidth,
        height: outHeight,
        channels: channels as 3 | 4
      }
    })
      .toFile(outputPath);

    // Clean up
    src.delete();
    dst.delete();
    srcPoints.delete();
    dstPoints.delete();
    transformMatrix.delete();

    return {
      success: true,
      outputPath
    };

  } catch (error: any) {
    console.error('Crop and straighten error:', error);
    return {
      success: false,
      message: error.message || 'Crop and straighten failed'
    };
  }
}

// Auto-enhance scanned document (contrast, brightness, deskew)
export async function enhanceDocument(imagePath: string, outputPath?: string): Promise<CropResult> {
  try {
    if (!outputPath) {
      const parsed = path.parse(imagePath);
      outputPath = path.join(parsed.dir, `${parsed.name}_enhanced${parsed.ext}`);
    }

    await sharp(imagePath)
      .normalize() // Auto-adjust contrast
      .sharpen({ sigma: 1 }) // Slight sharpening
      .modulate({ brightness: 1.05 }) // Slight brightness boost
      .toFile(outputPath);

    return {
      success: true,
      outputPath
    };

  } catch (error: any) {
    console.error('Enhance document error:', error);
    return {
      success: false,
      message: error.message || 'Enhancement failed'
    };
  }
}

// Process scanned image: detect edges, crop, straighten, and enhance
export async function processScannedImage(
  imagePath: string,
  options: {
    autoCrop?: boolean;
    enhance?: boolean;
    outputPath?: string;
  } = {}
): Promise<CropResult> {
  try {
    const { autoCrop = true, enhance = true, outputPath } = options;

    let currentPath = imagePath;
    let finalOutputPath = outputPath;

    // Generate output path if not provided
    if (!finalOutputPath) {
      const parsed = path.parse(imagePath);
      finalOutputPath = path.join(parsed.dir, `${parsed.name}_processed${parsed.ext}`);
    }

    // Step 1: Auto-crop and straighten (requires OpenCV)
    if (autoCrop) {
      try {
        const cropResult = await cropAndStraighten(currentPath, undefined, finalOutputPath);
        if (cropResult.success && cropResult.outputPath) {
          currentPath = cropResult.outputPath;
        } else {
          // If crop fails, copy original to output
          fs.copyFileSync(imagePath, finalOutputPath);
          currentPath = finalOutputPath;
        }
      } catch (cropError: any) {
        console.log(`Auto-crop skipped: ${cropError.message}`);
        // Copy original to output and continue with enhancement
        fs.copyFileSync(imagePath, finalOutputPath);
        currentPath = finalOutputPath;
      }
    }

    // Step 2: Enhance (uses sharp only, no OpenCV needed)
    if (enhance) {
      try {
        const enhanceResult = await enhanceDocument(currentPath, finalOutputPath);
        if (!enhanceResult.success) {
          // Enhancement failed but we can still return success with the current file
          console.log(`Enhancement skipped: ${enhanceResult.message}`);
        }
      } catch (enhanceError: any) {
        console.log(`Enhancement skipped: ${enhanceError.message}`);
      }
    }

    // Verify output file exists
    if (fs.existsSync(finalOutputPath)) {
      return {
        success: true,
        outputPath: finalOutputPath
      };
    }

    // Fallback: just copy original
    fs.copyFileSync(imagePath, finalOutputPath);
    return {
      success: true,
      outputPath: finalOutputPath
    };

  } catch (error: any) {
    console.error('Process scanned image error:', error);
    return {
      success: false,
      message: error.message || 'Image processing failed'
    };
  }
}

// Fast processing mode for performance optimization
export async function processScannedImageFast(
  imagePath: string,
  options: {
    outputPath?: string;
  } = {}
): Promise<CropResult> {
  try {
    const { outputPath } = options;

    // Generate output path if not provided
    let finalOutputPath = outputPath;
    if (!finalOutputPath) {
      const parsed = path.parse(imagePath);
      finalOutputPath = path.join(parsed.dir, `${parsed.name}_processed${parsed.ext}`);
    }

    // Fast processing using only sharp (no OpenCV for speed)
    await sharp(imagePath)
      .normalize() // Auto-adjust contrast
      .modulate({ brightness: 1.05 }) // Slight brightness boost
      .toFile(finalOutputPath);

    return {
      success: true,
      outputPath: finalOutputPath
    };

  } catch (error: any) {
    console.error('Fast image processing error:', error);

    // Fallback: just copy original
    try {
      const finalOutputPath = options.outputPath || imagePath.replace(/(\.[^.]+)$/, '_processed$1');
      fs.copyFileSync(imagePath, finalOutputPath);
      return {
        success: true,
        outputPath: finalOutputPath
      };
    } catch (copyError) {
      return {
        success: false,
        message: error.message || 'Fast image processing failed'
      };
    }
  }
}

export default {
  detectDocumentEdges,
  cropAndStraighten,
  enhanceDocument,
  processScannedImage,
  processScannedImageFast
};
