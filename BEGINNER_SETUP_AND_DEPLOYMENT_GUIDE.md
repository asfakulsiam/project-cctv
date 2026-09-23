# Beginner Setup & Deployment Guide

This guide provides step-by-step instructions for installing, configuring, running, and deploying the **Exam Hall Monitoring Assistant** on a brand-new computer or server. No prior experience with computer vision is required.

---

## 1. Prerequisites Installation

### A. Installing Node.js (v20 or v22)
Node.js executes the full-stack server and compiles the frontend application.

- **Windows**: Download the 64-bit MSI installer for Node.js LTS (v20.x or v22.x) from [nodejs.org](https://nodejs.org/) and run the installer. Ensure "Add to PATH" is checked.
- **macOS**: Install using Homebrew in the terminal:
  ```bash
  brew install node@20
  ```
  Or download the macOS `.pkg` installer from [nodejs.org](https://nodejs.org/).
- **Linux (Ubuntu/Debian)**:
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```
- **Verification**:
  ```bash
  node -v   # Should output v20.x.x or v22.x.x
  npm -v    # Should output 10.x.x
  ```

---

### B. Installing Python 3 (Optional for YOLOv8 Server Worker)
The application includes a client-side in-browser vision engine by default. If you wish to enable the high-performance server-side YOLOv8 + ByteTrack detection worker, install Python 3.10+:

- **Windows**: Download Python 3.10 or 3.11 from [python.org](https://python.org/). Check **"Add python.exe to PATH"** during installation.
- **macOS**: `brew install python@3.11`
- **Linux (Ubuntu/Debian)**:
  ```bash
  sudo apt-get update
  sudo apt-get install -y python3 python3-pip python3-venv
  ```

---

### C. Installing `ffmpeg` (System Multimedia Package)
`ffmpeg` is a system binary used by the server (`server/ingestion.ts`) to probe stream connections, extract frames, and test live RTSP video feeds.

- **Windows**: `choco install ffmpeg` or download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH.
- **macOS**: `brew install ffmpeg`
- **Linux (Ubuntu/Debian)**:
  ```bash
  sudo apt-get update
  sudo apt-get install -y ffmpeg
  ```
- **Verification**:
  ```bash
  ffmpeg -version
  ```

---

## 2. All-In-One Single Command Installation

Clone the repository and run the single setup command:

```bash
# 1. Clone the repository
git clone <repository-url>
cd exam-hall-monitoring-assistant

# 2. Single-command setup (Installs npm packages, downloads YOLOv8 model weights, & installs Python packages)
npm run setup
```

### What `npm run setup` Does Automatically:
1. **Installs all Node.js dependencies** (`express`, `react`, `mongodb`, `vite`, `tailwindcss`).
2. **Auto-Downloads YOLOv8 Model Weights**: The postinstall script automatically fetches `yolov8n.pt` from official Ultralytics releases directly into `cv_service/models/` and the root folder. You do **not** need to search for or configure model file paths.
3. **Installs Python Requirements**: Installs packages from `requirements.txt` (`fastapi`, `uvicorn`, `ultralytics`, `opencv-python-headless`) if Python is detected on your system.

*(Note: Standard `npm install` also runs the automatic model download).*

---

## 3. Environment Variables Configuration (`.env`)

Create your `.env` file from the provided template:

```bash
cp .env.example .env
```

Open `.env` in any text editor and configure your administrator credentials and optional MongoDB database:

```env
# 1. Server Configuration
PORT=3000
NODE_ENV=development

# 2. Administrator Credentials (Required for Admin Portal)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password_here

# 3. Database Configuration (MongoDB Persistence)
# Local MongoDB example: mongodb://localhost:27017
# MongoDB Atlas Cloud example: mongodb+srv://<user>:<password>@cluster0.mongodb.net/?retryWrites=true&w=majority
# (If omitted, system automatically falls back to local data/exam_monitoring.json)
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=exam_monitoring

# 4. Computer Vision Configuration (Optional - Auto-configured)
# During npm install, yolov8n.pt is auto-placed in cv_service/models/ and root.
CV_MODEL_PATH=cv_service/models/yolov8n.pt
AUTO_START_CV=true
CV_CONF_THRESHOLD=0.30
DETECTION_INTERVAL_MS=250
```

---

## 4. Running the Application with a Single Command

### A. Development Mode (Instant Hot-Reloading)
Run one single command:
```bash
npm run dev
```
Open **`http://localhost:3000`** in your browser.

---

### B. Production Mode (Single-Command Build & Launch)
Run one single command:
```bash
npm run prod
```
This single command:
1. Compiles the React 19 frontend into optimized production bundles.
2. Compiles and bundles the Express backend server with `esbuild`.
3. Starts the production HTTP server on your configured `PORT` with static asset caching enabled.

*(Alternatively, in standard CI/CD environments: `npm run build` followed by `npm start`).*

---

## 5. Screen-by-Screen Guide: How to Add a Camera

Access the **Protected Admin Panel** to configure video feeds:

1. **Open the Admin Panel**: Navigate to `http://localhost:3000/admin` in your web browser.
2. **Authenticate**: In the login prompt, enter your `ADMIN_USERNAME` and `ADMIN_PASSWORD` (as defined in your `.env` file).
3. **Open Camera Form**: Click the **"+ Add Camera"** button under the **Camera Management** tab.

### Adding Camera Types:

#### A. RTSP IP Camera Stream
- **Camera Name**: `Room 101 Front Angle`
- **Source Type**: Select `RTSP Camera Stream (rtsp://...)`
- **Source Stream URL**: Enter `rtsp://192.168.1.100:554/live/ch0`
- **Username / Password**: Enter optional credentials (e.g. `admin` / `pass123`). The server automatically formats the stream URL.
- **Location Label**: `Science Wing Hall A`
- **Test Connection**: Click **"Test Connection"**. The server captures 1 test frame via `ffmpeg` to verify connectivity.
- **Save**: Click **"Save Camera"**.

#### B. IP Camera (MJPEG / Network Stream)
- **Camera Name**: `Side Aisle Camera`
- **Source Type**: Select `IP Camera (MJPEG / Network Stream)`
- **Source Stream URL**: Enter `http://192.168.1.50:8080/video`
- **Test Connection**: Click **"Test Connection"** to verify stream accessibility.
- **Save**: Click **"Save Camera"**.

#### C. Direct Video Link or HLS Stream
- **Camera Name**: `Remote Feed 1`
- **Source Type**: Select `Live Stream URL (.m3u8 / HLS / HTTP)`
- **Source Stream URL**: Enter direct URL e.g. `https://stream.example.com/hls/hall1.m3u8` or sample file path `/assets/classroom.mp4`.
- **Save**: Click **"Save Camera"**.

#### D. Google Drive Share Link
- **Camera Name**: `Drive Recording Feed`
- **Source Type**: Select `Cloud Video Share Link (Google Drive, S3, Dropbox, CDN)`
- **Source Stream URL**: Paste the Google Drive public share link: `https://drive.google.com/file/d/1A2B3C4D5E6F/view?usp=sharing`
- **Automatic Resolution**: The system automatically converts the share URL into a direct playable download stream.
- **Save**: Click **"Save Camera"**.

#### E. Uploaded Local Video File
- **Camera Name**: `Uploaded Hall Recording`
- **Source Type**: Select `Uploaded Video File (Local Storage)`
- **Upload File**: Click **"Choose File"** and select a local MP4/WebM file (up to 1GB).
- **Save**: Click **"Save Camera"**.

#### F. Local USB / Invigilator Webcam
- **Camera Name**: `Proctor Desk Webcam`
- **Source Type**: Select `Local USB / Invigilator Webcam (Browser Ingest)`
- **Save**: Click **"Save Camera"**.

---

## 6. Cloud Production Deployment (Render, Railway, VPS, Docker)

> 🚀 **Dedicated Render Guide**: For a detailed, step-by-step walkthrough for deploying to Render with free MongoDB Atlas database setup and `render.yaml` blueprint support, see the **[Render Deployment Guide](RENDER_DEPLOYMENT_GUIDE.md)**.

When deploying to a cloud host (such as Render or Railway):

1. **Build Command**:
   ```bash
   npm run build
   ```
2. **Start Command**:
   ```bash
   npm start
   ```
   *(Or all-in-one: `npm run prod`)*
3. **Environment Variables**:
   Configure in your cloud dashboard:
   - `NODE_ENV=production`
   - `ADMIN_USERNAME=your_admin`
   - `ADMIN_PASSWORD=your_secure_password`
   - `MONGODB_URI=mongodb+srv://...`
   - `MONGODB_DB_NAME=exam_monitoring`
