/**
 * scripts/setup-python.js
 *
 * Safe cross-platform Python CV dependency installer.
 * Detects whether Python 3 and pip are available in the local or server environment.
 * If available, installs requirements.txt for the optional server-side YOLO/Torch CV worker.
 * If Python or pip is not detected, exits cleanly (exit code 0) so Render/cloud deployments
 * and standard Node-only environments build reliably using the embedded vision engine.
 */

import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

function checkCommand(cmd, args) {
  try {
    const res = spawnSync(cmd, args, { stdio: "ignore", shell: true });
    return res.status === 0;
  } catch {
    return false;
  }
}

function setupPython() {
  const reqPath = path.join(process.cwd(), "requirements.txt");
  if (!fs.existsSync(reqPath)) {
    console.log("[Setup] No requirements.txt found. Skipping Python setup.");
    process.exit(0);
  }

  // Find suitable python / pip command
  const candidates = [
    {
      cmd: "python3",
      testArgs: ["--version"],
      pipArgs: ["-m", "pip", "install", "-r", "requirements.txt"],
    },
    {
      cmd: "python",
      testArgs: ["--version"],
      pipArgs: ["-m", "pip", "install", "-r", "requirements.txt"],
    },
    {
      cmd: "pip3",
      testArgs: ["--version"],
      pipArgs: ["install", "-r", "requirements.txt"],
    },
    {
      cmd: "pip",
      testArgs: ["--version"],
      pipArgs: ["install", "-r", "requirements.txt"],
    },
  ];

  let selected = null;
  for (const item of candidates) {
    if (checkCommand(item.cmd, item.testArgs)) {
      // Also verify pip works
      if (item.pipArgs.includes("-m")) {
        if (checkCommand(item.cmd, ["-m", "pip", "--version"])) {
          selected = item;
          break;
        }
      } else {
        selected = item;
        break;
      }
    }
  }

  if (!selected) {
    console.log(
      "[Setup] Python/pip not detected. Embedded browser vision engine will be used.",
    );
    process.exit(0);
  }

  console.log(
    `[Setup] Detected Python environment via '${selected.cmd}'. Installing CV dependencies...`,
  );
  try {
    const installRes = spawnSync(selected.cmd, selected.pipArgs, {
      stdio: "inherit",
      shell: true,
    });

    if (installRes.status === 0) {
      console.log("[Setup] ✓ Python CV dependencies installed successfully.");
    } else {
      console.warn(
        "[Setup] Note: Python pip install finished with non-zero status. Embedded browser vision engine will be active.",
      );
    }
  } catch (err) {
    console.warn(
      `[Setup] Note: Python setup error (${err?.message || err}). Embedded browser vision engine will be active.`,
    );
  }

  // Always exit with 0 so the build process on platforms like Render never breaks
  process.exit(0);
}

setupPython();
