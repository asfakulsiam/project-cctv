# Complete Beginner's Guide: Setup, Local Development, and Production Deployment

A step-by-step, zero-to-hero manual for setting up the **Smart Classroom Exam Monitoring System** on a completely fresh Windows, macOS, or Linux computer.

---

## Table of Contents
1. [Phase 1: Installing Required Software on a Fresh PC](#phase-1-installing-required-software-on-a-fresh-pc)
   - [1.1 Install Git](#11-install-git)
   - [1.2 Install Node.js & npm](#12-install-nodejs--npm)
   - [1.3 Install Python](#13-install-python)
   - [1.4 Install Visual Studio Code (VS Code)](#14-install-visual-studio-code-vs-code)
2. [Phase 2: Downloading & Extracting the Project](#phase-2-downloading--extracting-the-project)
   - [Option A: Git Clone (Recommended)](#option-a-git-clone-recommended)
   - [Option B: Download & Extract ZIP](#option-b-download--extract-zip)
3. [Phase 3: Setting Up Environment Variables (.env)](#phase-3-setting-up-environment-variables-env)
4. [Phase 4: Installing Dependencies & Running Locally](#phase-4-installing-dependencies--running-locally)
5. [Phase 5: Testing & Building for Production](#phase-5-testing--building-for-production)
6. [Phase 6: Pushing Code to Your GitHub Repository](#phase-6-pushing-code-to-your-github-repository)
7. [Phase 7: Deploying to Production (Render.com)](#phase-7-deploying-to-production-rendercom)
8. [Phase 8: Common Beginner Troubleshooting](#phase-8-common-beginner-troubleshooting)

---

## Phase 1: Installing Required Software on a Fresh PC

Before touching the project code, make sure your computer has the essential development tools installed.

### 1.1 Install Git
Git allows you to clone repositories and push your code to GitHub.

* **Windows**:
  1. Download the installer from [git-scm.com/download/win](https://git-scm.com/download/win).
  2. Run the `.exe` file. During setup, keep all default options selected, but ensure **"Git from the command line and also from 3rd-party software"** is checked.
  3. Click **Install**.
* **macOS**:
  - Open the **Terminal** app and type `git --version`. If not installed, macOS will prompt you to install Apple's Command Line Developer Tools. Click **Install**.
  - Alternatively, if you use Homebrew: `brew install git`.
* **Linux (Ubuntu/Debian)**:
  ```bash
  sudo apt update && sudo apt install git -y
  ```

> **Verify Git Installation**: Open your Command Prompt (CMD), PowerShell, or Terminal and run:
> ```bash
> git --version
> ```
> *(Example output: `git version 2.44.0`)*

---

### 1.2 Install Node.js & npm
Node.js runs the JavaScript backend and build tools. **Node.js 18.x or 20.x LTS** is recommended.

* **Windows & macOS**:
  1. Visit the official Node.js website: [nodejs.org](https://nodejs.org/).
  2. Download the **LTS (Long Term Support)** installer (e.g., v20.x).
  3. Run the installer and accept the standard defaults.
* **Linux (Ubuntu/Debian)**:
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
  ```

> **Verify Node.js and npm**:
> ```bash
> node -v
> npm -v
> ```
> *(Example output: Node `v20.12.0`, npm `10.5.0`)*

---

### 1.3 Install Python
Python (version 3.10 or higher) is used for the standalone Computer Vision algorithms and testing scripts.

* **Windows**:
  1. Go to [python.org/downloads](https://www.python.org/downloads/).
  2. Download Python 3.10, 3.11, or 3.12.
  3. ⚠️ **CRITICAL STEP FOR WINDOWS**: At the very bottom of the installer window, **check the box: "Add python.exe to PATH"** before clicking "Install Now".
* **macOS**:
  - Download the official `.pkg` installer from [python.org/downloads/macos](https://www.python.org/downloads/macos/) or run: `brew install python`.
* **Linux (Ubuntu/Debian)**:
  ```bash
  sudo apt update && sudo apt install python3 python3-pip python3-venv -y
  ```

> **Verify Python**:
> ```bash
> python --version
> # or on Mac/Linux:
> python3 --version
> ```

---

### 1.4 Install Visual Studio Code (VS Code)
1. Download from [code.visualstudio.com](https://code.visualstudio.com/).
2. Run the installer. On Windows, check **"Add 'Open with Code' action to Windows Explorer file context menu"**.
3. Launch VS Code and open the Extensions tab (`Ctrl + Shift + X` on Windows / `Cmd + Shift + X` on Mac).
4. Recommended extensions to search and install:
   - **Tailwind CSS IntelliSense**
   - **ESLint**
   - **Prettier - Code formatter**
   - **Python** (by Microsoft)

---

## Phase 2: Downloading & Extracting the Project

You can either clone the repository using Git or download it as a `.zip` archive.

### Option A: Git Clone (Recommended)
1. Open your terminal (PowerShell, Command Prompt, or Terminal).
2. Navigate to the directory where you store projects (for example, your Desktop or `Documents` folder):
   ```bash
   cd Desktop
   ```
3. Clone the repository from GitHub:
   ```bash
   git clone https://github.com/asfakulsiam/project-cctv.git
   ```
4. Enter the newly downloaded project directory:
   ```bash
   cd project-cctv
   ```

---

### Option B: Download & Extract ZIP
1. Open your browser and navigate to: `https://github.com/asfakulsiam/project-cctv`
2. Click the green **Code** button and select **Download ZIP**.
3. Locate the downloaded `project-cctv-main.zip` in your `Downloads` folder.
4. Right-click the file and select **Extract All...** (or double-click on Mac/Linux to extract).
5. Open the extracted folder. Ensure you see files like `package.json`, `server.ts`, and the `src/` folder directly inside.
6. Open VS Code, click **File > Open Folder...**, and choose the extracted project folder.

---

## Phase 3: Setting Up Environment Variables (.env)

The project includes an example environment file named `.env.example`. You need a local `.env` file so the app knows your configuration.

1. In VS Code's integrated terminal (`Ctrl + ~` or **Terminal > New Terminal**), run:
   - **Windows PowerShell**:
     ```powershell
     Copy-Item .env.example .env
     ```
   - **macOS / Linux / Git Bash**:
     ```bash
     cp .env.example .env
     ```
   *(Or simply right-click `.env.example` in VS Code's file tree, copy it, paste it, and rename it to `.env`)*

2. Open the newly created `.env` file and review its contents:
   ```env
   # Server Port
   PORT=3000

   # Admin Credentials for /admin
   ADMIN_USERNAME="admin"
   ADMIN_PASSWORD="academic_exam_2026"

   # MONGODB CONNECTION STRING
   # Leave this completely empty to use the built-in resilient embedded persistence engine!
   MONGODB_URI=""

   # GEMINI_API_KEY (Optional for AI analytics features)
   GEMINI_API_KEY=""
   ```

> **Note on Database**: You do **not** need to install or configure MongoDB to run this project. The system includes an automatic embedded fallback database that creates a local persistent file store out of the box!

---

## Phase 4: Installing Dependencies & Running Locally

### 4.1 Install Node.js Packages
In your VS Code terminal, run:
```bash
npm install
```
This installs Express, React 19, Tailwind CSS, Lucide icons, Vite, TypeScript, and the WebSocket gateway libraries.

### 4.2 (Optional) Install Python CV Testing Dependencies
If you want to run the standalone Python computer vision algorithm tests:
```bash
# Windows:
pip install -r cv/requirements.txt

# macOS / Linux:
pip3 install -r cv/requirements.txt
```

### 4.3 Start the Development Server
Execute the single startup command:
```bash
npm run dev
```

You will see output in the terminal:
```
Server running on http://localhost:3000
Express backend & WebSocket surveillance gateway online
```

### 4.4 Open and Explore the Application
Open your web browser (Chrome, Safari, Edge, or Firefox) and navigate to:
1. **Public Proctor Interface**: [http://localhost:3000](http://localhost:3000)
   - Live Primary Camera view with real-time detection bounding boxes.
   - Interactive camera angle selector bar (Camera 1, Camera 2, etc.).
   - Instant student inspection drawer and activity timeline.
2. **Dedicated Admin Console**: [http://localhost:3000/admin](http://localhost:3000/admin)
   - Log in using the credentials from your `.env` file:
     - **Username**: `admin`
     - **Password**: `academic_exam_2026`
   - Manage student enrollments, adjust behavior suspicion weights, assign camera feeds, and customize institutional branding.

---

## Phase 5: Testing & Building for Production

Before deploying, always test that the project compiles cleanly without TypeScript errors.

### 5.1 Run the Type-Check & Linter
```bash
npm run lint
```
*Expected result: Exits cleanly with no errors.*

### 5.2 (Optional) Run the Python CV Algorithm Tests
```bash
# Windows:
python cv/test_cv_pipeline.py

# macOS / Linux:
python3 cv/test_cv_pipeline.py
```
*Verifies tracking ID isolation, temporal cooldown logic, and cross-camera mapping.*

### 5.3 Build the Production Bundle
```bash
npm run build
```
This runs `vite build` for the client and compiles the standalone backend server into `dist/server.cjs`.

### 5.4 Test the Production Build Locally
Test how your app will perform in production:
```bash
npm run start
```
Open [http://localhost:3000](http://localhost:3000). The app should load quickly using pre-compiled, optimized static assets. Stop the server with `Ctrl + C` when finished.

---

## Phase 6: Pushing Code to Your GitHub Repository

If you made modifications or extracted the project from a ZIP file and want to host it on your own GitHub account:

### 6.1 Initialize Git (if extracted from ZIP)
```bash
git init
git branch -M main
```

### 6.2 Stage and Commit Your Changes
```bash
git add .
git commit -m "Initial commit: Smart Classroom Exam Monitoring System"
```

### 6.3 Link to Your GitHub Repository
1. Go to [github.com/new](https://github.com/new).
2. Create a new repository (e.g., `project-cctv`). Keep it Public or Private, and leave "Initialize with README" unchecked.
3. Copy your repository's URL (e.g., `https://github.com/YOUR_USERNAME/project-cctv.git`).
4. In your terminal, link your local repository and push:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/project-cctv.git
   git push -u origin main
   ```

---

## Phase 7: Deploying to Production (Render.com)

Render is a cloud hosting platform with a free tier supporting Node.js web services and WebSockets.

### Step 1: Sign up and Link GitHub
1. Go to [render.com](https://render.com/) and create a free account.
2. Authorize Render to access your GitHub account.

### Step 2: Create a New Web Service
1. On the Render Dashboard, click **New +** and select **Web Service**.
2. Select **Build and deploy from a Git repository**.
3. Find your repository (`project-cctv`) and click **Connect**.

### Step 3: Configure the Web Service Settings
Fill in the service details:
- **Name**: `smart-exam-monitoring` (or your preferred name)
- **Region**: Choose the region closest to you (e.g., Oregon (US West), Frankfurt (EU), or Singapore)
- **Branch**: `main`
- **Root Directory**: *(Leave blank)*
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

### Step 4: Add Environment Variables
Scroll down to the **Environment Variables** section and add the following keys:

| Key | Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production optimizations |
| `PORT` | `3000` | Port for Express and WebSockets |
| `ADMIN_USERNAME` | `admin` | Your custom admin username |
| `ADMIN_PASSWORD` | `ChooseAStrongPassword123!` | Your secret admin password |

*(Optional)* If you have a MongoDB Atlas connection string, add `MONGODB_URI`. If left blank, the app runs on its embedded storage.

### Step 5: Deploy
1. Click **Create Web Service**.
2. Render will automatically clone your repository, run `npm install`, compile the Vite bundle with `npm run build`, and boot the server using `npm run start`.
3. Once the deployment finishes, Render will provide your public URL:
   `https://smart-exam-monitoring.onrender.com`
4. Test the live link in your browser:
   - Primary video monitoring loads at the root URL.
   - Admin console is available at `/admin`.

---

## Phase 8: Common Beginner Troubleshooting

### 1. `command not found: node` or `git is not recognized`
- **Cause**: The software was installed, but the computer's PATH environment variable was not updated, or your terminal was open during installation.
- **Fix**: Completely close all Command Prompt, PowerShell, or VS Code windows and reopen them. On Windows, verify you checked "Add to PATH" during installation.

### 2. `Error: listen EADDRINUSE: address already in use :::3000`
- **Cause**: Another program (or a previously running instance of this project) is already using port 3000.
- **Fix**:
  - **Windows**: Run `netstat -ano | findstr :3000` to find the Process ID (PID), then run `taskkill /PID <PID> /F`.
  - **Mac/Linux**: Run `lsof -ti:3000 | xargs kill -9`.
  - Or change `PORT=3001` in your `.env` file.

### 3. Windows PowerShell Execution Policy Error
If running `npm` or `tsx` gives `scripts is disabled on this system`:
- **Fix**: Open PowerShell as Administrator and run:
  ```powershell
  Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```
  Then type `Y` and press Enter.

### 4. Build Fails with Out of Memory on Low-Spec Machines
- **Fix**: Increase Node.js memory limit for the build:
  ```bash
  NODE_OPTIONS="--max-old-space-size=4096" npm run build
  ```

---

*You are now ready to run, modify, and deploy the Smart Classroom Exam Monitoring System!*
