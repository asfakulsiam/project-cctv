# Complete Beginner's Guide: Setup, Local Development, and Production Deployment

A comprehensive, step-by-step manual for running the **Smart Classroom Exam Monitoring System** on a completely fresh Windows, macOS, or Linux computer.

---

## Table of Contents
1. [Phase 1: Installing Required Software on a Fresh PC](#phase-1-installing-required-software-on-a-fresh-pc)
   - [1.1 Install Git](#11-install-git)
   - [1.2 Install Node.js & npm](#12-install-nodejs--npm)
   - [1.3 Install Python (3.10+)](#13-install-python-310)
   - [1.4 Install Visual Studio Code (VS Code)](#14-install-visual-studio-code-vs-code)
2. [Phase 2: Downloading & Extracting the Project from GitHub](#phase-2-downloading--extracting-the-project-from-github)
   - [Option A: Download & Extract ZIP (Direct Download)](#option-a-download--extract-zip-direct-download)
   - [Option B: Git Clone](#option-b-git-clone)
3. [Phase 3: Environment Variables Setup (.env)](#phase-3-environment-variables-setup-env)
4. [Phase 4: Installing Dependencies & Running Locally](#phase-4-installing-dependencies--running-locally)
5. [Phase 5: Camera Setup & Google Drive Decoding Guide](#phase-5-camera-setup--google-drive-decoding-guide)
   - [5.1 Why Google Drive Video Errors Happen (Quota Limits)](#51-why-google-drive-video-errors-happen-quota-limits)
   - [5.2 How Our Automatic Resilient Proxy Solves It](#52-how-our-automatic-resilient-proxy-solves-it)
   - [5.3 Quick 1-Click Camera Options (Webcam, Sample CCTV, IP Webcam)](#53-quick-1-click-camera-options-webcam-sample-cctv-ip-webcam)
6. [Phase 6: Testing & Building for Production Locally](#phase-6-testing--building-for-production-locally)
7. [Phase 7: Pushing Your Changes Back to GitHub](#phase-7-pushing-your-changes-back-to-github)
8. [Phase 8: Production Deployment on Render.com](#phase-8-production-deployment-on-rendercom)
9. [Phase 9: Common Beginner Troubleshooting](#phase-9-common-beginner-troubleshooting)

---

## Phase 1: Installing Required Software on a Fresh PC

Before touching project files, make sure your computer has the four essential tools installed.

### 1.1 Install Git
Git tracks file changes and lets you push your project to GitHub.

* **Windows**:
  1. Download the official installer: [git-scm.com/download/win](https://git-scm.com/download/win).
  2. Run the downloaded `.exe`.
  3. Keep the default options, but make sure **"Git from the command line and also from 3rd-party software"** is checked.
  4. Click **Install**.
* **macOS**:
  - Open **Terminal** (press `Cmd + Space`, type `Terminal`, and press Enter).
  - Type `git --version`. If not installed, macOS will show a prompt to install Command Line Tools. Click **Install**.
  - Or if using Homebrew: `brew install git`.
* **Linux (Ubuntu / Debian)**:
  ```bash
  sudo apt update && sudo apt install git -y
  ```

> **Verify Git**:
> In your terminal or Command Prompt, run:
> ```bash
> git --version
> ```
> *(Should display something like `git version 2.44.0`)*

---

### 1.2 Install Node.js & npm
Node.js runs the JavaScript runtime for our backend and Vite frontend. **Node.js 20.x LTS or 18.x LTS** is recommended.

* **Windows & macOS**:
  1. Go to the official website: [nodejs.org](https://nodejs.org/).
  2. Click the **LTS (Long Term Support)** green button (recommended for most users).
  3. Run the installer and click **Next** through the setup with default settings.
* **Linux (Ubuntu / Debian)**:
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
  ```

> **Verify Node.js and npm**:
> ```bash
> node -v
> npm -v
> ```
> *(Example output: Node `v20.12.0` and npm `10.5.0`)*

---

### 1.3 Install Python (3.10+)
Python is used for the standalone Computer Vision pipeline and CV test scripts (`cv/test_cv_pipeline.py`).

* **Windows**:
  1. Go to [python.org/downloads](https://www.python.org/downloads/).
  2. Download Python 3.10, 3.11, or 3.12 installer.
  3. ⚠️ **VERY IMPORTANT FOR WINDOWS**: Before clicking "Install Now", **check the box at the bottom: "Add python.exe to PATH"**. If you skip this, Windows will not recognize `python` in your terminal.
  4. Click **Install Now**.
* **macOS**:
  - Download the official `.pkg` installer from [python.org/downloads/macos](https://www.python.org/downloads/macos/) or run: `brew install python`.
* **Linux (Ubuntu / Debian)**:
  ```bash
  sudo apt update && sudo apt install python3 python3-pip python3-venv -y
  ```

> **Verify Python**:
> ```bash
> python --version
> # or on macOS/Linux:
> python3 --version
> ```

---

### 1.4 Install Visual Studio Code (VS Code)
1. Download from [code.visualstudio.com](https://code.visualstudio.com/).
2. Run the installer. On Windows, check the box: **"Add 'Open with Code' to context menu"**.
3. Open VS Code. Press `Ctrl + Shift + X` (or `Cmd + Shift + X` on Mac) to open the Extensions store.
4. Recommended extensions to install:
   - **Tailwind CSS IntelliSense** (by Tailwind Labs)
   - **ESLint** (by Microsoft)
   - **Prettier - Code formatter** (by Prettier)
   - **Python** (by Microsoft)

---

## Phase 2: Downloading & Extracting the Project from GitHub

Repository URL: `https://github.com/asfakulsiam/project-cctv.git`

### Option A: Download & Extract ZIP (Direct Download)
1. Open your browser and go to:
   `https://github.com/asfakulsiam/project-cctv`
2. Click the green **Code** button, then click **Download ZIP**.
   *(Direct link: `https://github.com/asfakulsiam/project-cctv/archive/refs/heads/main.zip`)*
3. Go to your **Downloads** folder, locate `project-cctv-main.zip`.
4. Right-click the `.zip` file and choose **Extract All...** (Windows) or double-click to unzip (Mac).
5. Extract it to a clean working folder, e.g.:
   - Windows: `C:\Projects\project-cctv` or `Desktop\project-cctv`
   - Mac/Linux: `~/Projects/project-cctv`
6. Open **VS Code**.
7. Click **File > Open Folder...**, select the extracted `project-cctv` folder (the folder containing `package.json`, `server.ts`, and `src/`).

---

### Option B: Git Clone
If you prefer using Git in your terminal:
```bash
# Navigate to where you want the project
cd Desktop

# Clone the repository
git clone https://github.com/asfakulsiam/project-cctv.git

# Enter the project directory
cd project-cctv

# Open directly in VS Code
code .
```

---

## Phase 3: Environment Variables Setup (.env)

The project includes an example template `.env.example`. You need a real `.env` file in the root directory.

1. In VS Code, open the built-in terminal by pressing **`Ctrl + ~`** (or **Terminal > New Terminal**).
2. Copy `.env.example` to create your local `.env`:
   - **Windows PowerShell**:
     ```powershell
     Copy-Item .env.example .env
     ```
   - **macOS / Linux / Git Bash**:
     ```bash
     cp .env.example .env
     ```
3. Open your new `.env` file. It should look like this:
   ```env
   # Server Port (Runs on port 3000)
   PORT=3000

   # Admin Console Authentication
   ADMIN_USERNAME="admin"
   ADMIN_PASSWORD="academic_exam_2026"
   # Note: The system also supports your custom password: Aa627550

   # MongoDB Connection String (OPTIONAL)
   # Leave this completely blank! The system includes an automatic embedded
   # in-memory/file storage engine that works instantly without installing MongoDB.
   MONGODB_URI=""

   # Google Gemini API Key (OPTIONAL for AI proctor summaries)
   GEMINI_API_KEY=""
   ```

---

## Phase 4: Installing Dependencies & Running Locally

### 4.1 Install Node.js Dependencies
In your VS Code terminal, run:
```bash
npm install
```
This installs Express, React 19, Vite, Tailwind CSS, Lucide icons, and the full-stack server tools.

### 4.2 (Optional) Install Standalone Python CV Dependencies
If you plan to run or test the Python Computer Vision scripts:
```bash
# Windows:
pip install -r cv/requirements.txt

# macOS / Linux:
pip3 install -r cv/requirements.txt
```

### 4.3 Start the Development Server
Run the single start command:
```bash
npm run dev
```

You will see output in the terminal:
```
Server running on http://localhost:3000
Express backend & WebSocket surveillance gateway online
```

### 4.4 Open the Application
Open your browser (Chrome, Edge, Safari, or Firefox):
1. **Public Invigilation Interface**: [http://localhost:3000](http://localhost:3000)
   - Live CCTV surveillance feed with AI Computer Vision bounding boxes.
   - Interactive camera angle selector bar.
   - Student behavioral analysis panel and real-time incident notifications.
2. **Admin Management Portal**: [http://localhost:3000/admin](http://localhost:3000/admin)
   - Log in using your credentials:
     - **Username**: `admin`
     - **Password**: `academic_exam_2026` *(or `Aa627550`)*
   - Manage camera configurations, classroom seat layouts, student roster, and AI detection sensitivities.

---

## Phase 5: Camera Setup & Google Drive Decoding Guide

### 5.1 Why Google Drive Video Errors Happen (Quota Limits)
When using a public Google Drive video link (like `https://drive.google.com/file/d/1Ww9Yv7WprUGF0cDLZPfQpZ2szGB7saIG/view`), Google enforces an undocumented **bandwidth/quota download cap**.
When that cap is reached:
- Google stops serving the raw MP4 video bytes.
- Instead, Google returns an **HTML web page** saying *"Download quota exceeded for this file, so you cannot download it at this time."*
- When an HTML5 `<video>` tag tries to decode that HTML page as video frames, the browser reports:
  `Could not decode video stream. Verifying direct access...`

### 5.2 How Our Automatic Resilient Proxy Solves It
Our system includes a resilient backend proxy:
1. When Google Drive returns the quota exceeded HTML page, our server **detects it instantly**.
2. Instead of crashing or leaving a black screen, the server **seamlessly pipes a local high-definition CCTV surveillance feed (`/api/video/sample`)**.
3. In the UI, the proctor sees an informative banner with quick 1-click recovery actions:
   - **[💻 Switch to Webcam]**: Instantly switches to your laptop or external webcam.
   - **[📹 Switch to Resilient CCTV]**: Plays the verified surveillance exam feed.
   - **[Retry]**: Tries reconnecting to the stream.

### 5.3 Quick 1-Click Camera Options
In the **Admin Console** (`/admin` -> Cameras tab), every camera card now includes **1-Click Quick Switch Buttons**:
- **💻 Webcam**: Uses your computer's built-in webcam (`webcam:default`) via HTML5 `getUserMedia`.
- **📹 CCTV Sample**: Uses the built-in resilient surveillance sample feed (`/api/video/sample`).
- **📱 Mobile IP Webcam**: Use your Android or iPhone as a wireless CCTV camera using the free **IP Webcam** app (`http://192.168.1.X:8080/video`).
- **📁 Drive Link**: Reconnects to the Google Drive video feed.
- **"Test Stream Link" Button**: Inside the camera edit dialog, click **Test Stream Link** to verify any URL before saving!

---

## Phase 6: Testing & Building for Production Locally

Before deploying to the cloud, test the production compilation:

### 6.1 Check Code for Syntax Errors
```bash
npm run lint
```
*(Should complete cleanly without errors).*

### 6.2 (Optional) Test Python Computer Vision Algorithm
```bash
# Windows:
python cv/test_cv_pipeline.py

# macOS / Linux:
python3 cv/test_cv_pipeline.py
```

### 6.3 Compile the Production Build
```bash
npm run build
```
This builds the client assets into `dist/` and compiles the backend into `dist/server.cjs` using `esbuild`.

### 6.4 Test the Production Build Locally
```bash
npm run start
```
Open [http://localhost:3000](http://localhost:3000). The app will run in high-performance production mode. Press `Ctrl + C` in your terminal to stop it.

---

## Phase 7: Pushing Your Changes Back to GitHub

If you downloaded the project as a ZIP and want to push your updates back to GitHub:

### 7.1 Initialize Git (if not already initialized)
```bash
git init
git branch -M main
```

### 7.2 Stage and Commit All Files
```bash
git add .
git commit -m "feat: robust CCTV video proxy, quota recovery, and beginner setup"
```

### 7.3 Connect and Push to Your Repository
```bash
# If pushing to your repository:
git remote add origin https://github.com/asfakulsiam/project-cctv.git

# Or if the remote is already configured:
git remote set-url origin https://github.com/asfakulsiam/project-cctv.git

# Push to main branch:
git push -u origin main
```
*(Enter your GitHub username and Personal Access Token / password when prompted).*

---

## Phase 8: Production Deployment on Render.com

Render is a cloud hosting service that supports Node.js web services with WebSockets and persistent servers for free.

### Step 1: Sign Up on Render
1. Go to [render.com](https://render.com/) and create a free account.
2. Link your GitHub account.

### Step 2: Create a New Web Service
1. Click the blue **New +** button in the top right.
2. Select **Web Service**.
3. Choose **Build and deploy from a Git repository**.
4. Select `asfakulsiam/project-cctv` (or your repository name) and click **Connect**.

### Step 3: Configure Build & Start Commands
Fill in the following fields:
- **Name**: `smart-exam-cctv` *(or any name you prefer)*
- **Region**: Choose the region closest to you (e.g. Frankfurt, Oregon, Singapore).
- **Branch**: `main`
- **Root Directory**: *(Leave empty)*
- **Runtime**: **Node**
- **Build Command**:
  ```bash
  npm install && npm run build
  ```
- **Start Command**:
  ```bash
  npm run start
  ```
- **Instance Type**: **Free**

### Step 4: Configure Environment Variables
Scroll down to the **Environment Variables** section and click **Add Environment Variable** for each:

| Key | Value | Notes |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production mode |
| `PORT` | `3000` | Render forwards external HTTP traffic here |
| `ADMIN_USERNAME` | `admin` | Your admin portal login |
| `ADMIN_PASSWORD` | `Aa627550` | Your secret admin password |

*(Note: `MONGODB_URI` can be left empty; the embedded storage engine handles all persistence automatically).*

### Step 5: Click Deploy
1. Click **Create Web Service**.
2. Render will stream the build logs:
   - Clones your repository
   - Runs `npm install`
   - Runs `npm run build` (Vite client build + backend bundle)
   - Boots `npm run start` (`dist/server.cjs`)
3. When deployment finishes, Render gives you a public URL (e.g., `https://smart-exam-cctv.onrender.com`).
4. Open the URL in your browser:
   - Proctoring live feed loads at `/`.
   - Admin console loads at `/admin`.

---

## Phase 9: Common Beginner Troubleshooting

### 1. `command not found: node` or `git is not recognized`
- **Cause**: The terminal was open during installation, or "Add to PATH" was not checked.
- **Fix**: Completely close all terminal and VS Code windows and reopen them.

### 2. `Error: listen EADDRINUSE: address already in use :::3000`
- **Cause**: Another program is already running on port 3000.
- **Fix**:
  - Windows: Run `netstat -ano | findstr :3000` to find the Process ID (PID), then run `taskkill /PID <PID> /F`.
  - Mac / Linux: Run `lsof -ti:3000 | xargs kill -9`.

### 3. Windows PowerShell: `running scripts is disabled on this system`
- **Cause**: Windows PowerShell security policy blocks local scripts.
- **Fix**: Open PowerShell as Administrator and run:
  ```powershell
  Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```
  Type `Y` and hit Enter.

### 4. Google Drive Stream says "Direct decode limited"
- **Cause**: Google Drive has enforced a temporary download quota on the shared file.
- **Fix**: Use the 1-click **[📹 Switch to Resilient CCTV]** or **[💻 Switch to Webcam]** button on the player, or use the Admin panel to set the feed to `/api/video/sample` or your own camera URL.

---

*Enjoy running the Smart Classroom Exam Monitoring System!*
