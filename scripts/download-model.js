/**
 * scripts/download-model.js
 * Automatically downloads the YOLOv8n object detection model weights (yolov8n.pt)
 * during `npm install` or via `npm run download:model`.
 * Saves the file directly to both `cv_service/models/yolov8n.pt` and `./yolov8n.pt`
 * so no manual path configuration is ever needed.
 */
import fs from 'fs';
import path from 'path';

const MODEL_FILENAME = 'yolov8n.pt';
const MODEL_URL = 'https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8n.pt';

const TARGET_DIR = path.join(process.cwd(), 'cv_service', 'models');
const TARGET_PATH = path.join(TARGET_DIR, MODEL_FILENAME);
const ROOT_TARGET_PATH = path.join(process.cwd(), MODEL_FILENAME);

async function downloadModel() {
  try {
    // Check if valid model already exists
    if (fs.existsSync(TARGET_PATH) && fs.statSync(TARGET_PATH).size > 1000000) {
      console.log(`[Model Downloader] ✓ ${MODEL_FILENAME} already exists at cv_service/models/ (${(fs.statSync(TARGET_PATH).size / (1024 * 1024)).toFixed(2)} MB).`);
      if (!fs.existsSync(ROOT_TARGET_PATH)) {
        try {
          fs.copyFileSync(TARGET_PATH, ROOT_TARGET_PATH);
        } catch (_) {}
      }
      return;
    }

    if (fs.existsSync(ROOT_TARGET_PATH) && fs.statSync(ROOT_TARGET_PATH).size > 1000000) {
      console.log(`[Model Downloader] ✓ ${MODEL_FILENAME} exists in root (${(fs.statSync(ROOT_TARGET_PATH).size / (1024 * 1024)).toFixed(2)} MB).`);
      if (!fs.existsSync(TARGET_DIR)) {
        fs.mkdirSync(TARGET_DIR, { recursive: true });
      }
      if (!fs.existsSync(TARGET_PATH)) {
        try {
          fs.copyFileSync(ROOT_TARGET_PATH, TARGET_PATH);
        } catch (_) {}
      }
      return;
    }

    console.log(`[Model Downloader] Downloading ${MODEL_FILENAME} from official Ultralytics releases...`);
    if (!fs.existsSync(TARGET_DIR)) {
      fs.mkdirSync(TARGET_DIR, { recursive: true });
    }

    const response = await fetch(MODEL_URL, { redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save to cv_service/models/yolov8n.pt
    fs.writeFileSync(TARGET_PATH, buffer);

    // Also mirror to root yolov8n.pt so any default path works immediately
    try {
      fs.writeFileSync(ROOT_TARGET_PATH, buffer);
    } catch (_) {}

    const sizeMb = (buffer.length / (1024 * 1024)).toFixed(2);
    console.log(`[Model Downloader] ✓ Successfully downloaded ${MODEL_FILENAME} (${sizeMb} MB) to cv_service/models/ and root directory.`);
  } catch (err) {
    console.warn(`[Model Downloader] Note: Automated model download failed or offline: ${err?.message || err}.`);
    console.warn(`[Model Downloader] The Python Ultralytics worker will auto-download it on its first launch, or you can run: npm run download:model`);
  }
}

downloadModel();
