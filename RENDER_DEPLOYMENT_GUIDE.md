# Complete Render Deployment Guide

This guide walks you through deploying the **Exam Hall Monitoring Assistant** to **[Render.com](https://render.com)** from scratch.

---

## 📑 Overview of What You Need
1. **GitHub Repository**: Your project pushed to GitHub.
2. **Free Render Account**: Sign up at [dashboard.render.com](https://dashboard.render.com).
3. **Free MongoDB Atlas Cluster**: For cloud persistence (takes 2 minutes to create).

---

## Step 1: Set Up MongoDB Atlas (Cloud Database)

Render web services are stateless (restarted on deploys), so persistent data (cameras, candidates, activity logs, thresholds) is stored in a free MongoDB Atlas cloud database.

1. Go to **[mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)** and sign in or create a free account.
2. Click **Create** -> choose **M0 Free Tier** -> pick any cloud provider & region close to you.
3. Under **Security Quickstart**:
   - **Username & Password**: Create a database user (e.g. `exam_admin` and a strong password). Save this password!
   - **IP Access List**: Choose **"Allow Access from Anywhere"** (`0.0.0.0/0`) so Render servers can connect.
4. Click **Create User** and **Finish and Close**.
5. On your Cluster page, click **Connect** -> **Drivers** (Node.js).
6. Copy the connection string. It will look like this:
   ```text
   mongodb+srv://exam_admin:<password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority
   ```
7. Replace `<password>` with the actual database user password you created.

---

## Step 2: Push Your Code to GitHub

Make sure your project is committed and pushed to GitHub:

```bash
git add .
git commit -m "Prepare repository for Render deployment"
git push origin main
```

*(Note: Sensitive files like `.env` are automatically ignored by `.gitignore`).*

---

## Step 3: Deploy on Render (Manual Web Service)

### 3.1 Create Web Service
1. Log in to your **[Render Dashboard](https://dashboard.render.com)**.
2. Click the **"New +"** button in the top navigation bar and select **"Web Service"**.
3. Choose **"Build and deploy from a Git repository"** and connect your GitHub account.
4. Select your **`exam-hall-monitoring-assistant`** repository.

### 3.2 Configure Service Settings
Fill in the configuration fields:

| Field | Value to Enter | Notes |
| :--- | :--- | :--- |
| **Name** | `exam-hall-monitoring` | Or any unique name you choose |
| **Region** | Closest to your users (e.g. `Singapore`, `Frankfurt`, `Oregon`) | Fast network latency |
| **Branch** | `main` | Production branch |
| **Runtime** | `Node` | Uses Node.js 20/22 |
| **Build Command** | `npm install && npm run build` | Installs dependencies, auto-downloads model, & compiles app |
| **Start Command** | `npm start` | Runs `node dist/server.cjs` |
| **Instance Type** | `Free` | Free tier supported |

---

## Step 4: Configure Environment Variables on Render

Scroll down to the **"Environment Variables"** section and click **"Add Environment Variable"** for each of the following:

| Key | Example Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production optimizations and bundle caching |
| `ADMIN_USERNAME` | `supervisor` | Your login username for the Admin Panel (`/admin`) |
| `ADMIN_PASSWORD` | `YourSecretAdminPassword123!` | Strong password for Admin Panel authentication |
| `MONGODB_URI` | `mongodb+srv://exam_admin:YourPass@cluster0.mongodb.net/?retryWrites=true&w=majority` | Connection string copied from MongoDB Atlas in Step 1 |
| `MONGODB_DB_NAME` | `exam_monitoring` | Name of database in your MongoDB cluster |
| `AUTO_START_CV` | `false` | Disables local Python worker on Node runtime (browser handles client-side vision) |

*(Note: Render automatically sets the `PORT` variable — you do not need to add it).*

---

## Step 5: Launch & Verify

1. Click **"Deploy Web Service"** at the bottom of the page.
2. Watch the live **Deploy Logs**:
   - `npm install` runs and `scripts/download-model.js` auto-downloads `yolov8n.pt`.
   - `vite build` bundles the React 19 frontend into `/dist/client`.
   - `esbuild` bundles the Express server into `dist/server.cjs`.
   - Output logs: `Exam Hall Monitoring Assistant running on port 10000`.
   - Output logs: `Connected to MongoDB database: exam_monitoring`.
3. Render will provide your public URL (e.g., `https://exam-hall-monitoring.onrender.com`).
4. Click the link to open your live web application!

---

## Alternative: 1-Click Deployment via Render Blueprint (`render.yaml`)

We have included a `render.yaml` Blueprint file in the repository root.

1. In your Render Dashboard, click **"New +"** -> **"Blueprint"**.
2. Select your repository.
3. Render will automatically read `render.yaml` and configure the build command, start command, and environment variable slots.
4. Fill in `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `MONGODB_URI` when prompted.
5. Click **"Apply"**.

---

## Step 6: Post-Deployment Verification Checklist

1. **Open the Homepage**:
   - Visit `https://your-app-name.onrender.com`.
   - Verify the camera player, candidate roster, and real-time detection stats load cleanly.
2. **Test Admin Login**:
   - Navigate to `/admin` or click the lock icon in the top header.
   - Enter your `ADMIN_USERNAME` and `ADMIN_PASSWORD`.
   - Ensure the login succeeds and opens the Camera & Configuration management tabs.
3. **Add a Live Feed**:
   - In Admin Panel -> **Camera Management** -> **+ Add Camera**.
   - Test adding a webcam stream, uploaded MP4, or external HLS/HTTP stream.
   - Verify the stream plays and candidate bounding boxes are tracked.
4. **Verify MongoDB Persistence**:
   - Refresh the page or open the site in an Incognito window.
   - Verify all added cameras, seat assignments, and candidate logs remain saved.

---

## 💡 Troubleshooting & FAQ

### Q: Why does the Render free tier sleep after 15 minutes of inactivity?
Free Render web services spin down when no web requests are received for 15 minutes. When a new user visits, it takes ~30–50 seconds to wake up (cold start). For zero downtime in real examinations, upgrade to Render's **Starter** plan ($7/month).

### Q: Can I run the Python YOLOv8 worker directly on Render?
Yes! On Render, the default `Node` runtime runs the full-stack Node.js server with the built-in browser-side TensorFlow.js detection engine. If you want the server to run the Python FastAPI microservice simultaneously, create a **Docker** Web Service on Render using the standard Docker runtime.

### Q: Uploaded video file error on Render free tier?
Render free tier has an ephemeral disk. Videos added via **Google Drive share link**, **RTSP**, **HLS stream URL**, or **Webcam** work without any local storage limitations. For large uploaded files, storing them on cloud storage (e.g. Google Drive/S3) is recommended.
