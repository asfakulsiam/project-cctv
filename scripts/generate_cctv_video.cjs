const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TEMP_DIR = path.join(__dirname, '../temp_cctv_frames');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const TOTAL_FRAMES = 150; // 10 seconds at 15 FPS
const FPS = 15;

console.log(`[CCTV Generator] Generating ${TOTAL_FRAMES} high-fidelity SVG classroom frames...`);

for (let i = 0; i < TOTAL_FRAMES; i++) {
  const t = i / TOTAL_FRAMES;
  const timeSec = (i / FPS).toFixed(2);
  const clockSec = (i % 60) * 6; // degrees
  const proctorY = 320 + Math.sin(t * Math.PI * 2) * 110;
  const s3HeadAngle = Math.sin(t * Math.PI * 4) * 25; // Student B1 glances around
  const s1HandX = Math.sin(i * 0.8) * 8; // Student A1 writing
  const s4HandX = Math.cos(i * 0.9) * 7; // Student B2 writing
  const recDot = (i % 15 < 8) ? '#ef4444' : 'transparent';
  const secStr = (20 + (i / FPS)).toFixed(2).padStart(5, '0');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">
    <defs>
      <linearGradient id="wallGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="100%" stop-color="#1e293b"/>
      </linearGradient>
      <linearGradient id="floorGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#334155"/>
        <stop offset="100%" stop-color="#0f172a"/>
      </linearGradient>
      <linearGradient id="boardGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#020617"/>
        <stop offset="100%" stop-color="#0f172a"/>
      </linearGradient>
      <linearGradient id="deskGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#b45309"/>
        <stop offset="100%" stop-color="#78350f"/>
      </linearGradient>
      <filter id="cctvGlow">
        <feGaussianBlur stdDeviation="1" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>

    <!-- Classroom Walls & Perspective Floor -->
    <rect x="0" y="0" width="1280" height="230" fill="url(#wallGrad)"/>
    <polygon points="0,230 1280,230 1280,720 0,720" fill="url(#floorGrad)"/>

    <!-- Floor Perspective Tiles -->
    <line x1="0" y1="350" x2="1280" y2="350" stroke="#475569" stroke-width="1" opacity="0.3"/>
    <line x1="0" y1="480" x2="1280" y2="480" stroke="#475569" stroke-width="1.5" opacity="0.3"/>
    <line x1="0" y1="620" x2="1280" y2="620" stroke="#475569" stroke-width="2" opacity="0.3"/>
    <line x1="220" y1="230" x2="80" y2="720" stroke="#475569" stroke-width="1.5" opacity="0.25"/>
    <line x1="450" y1="230" x2="380" y2="720" stroke="#475569" stroke-width="1.5" opacity="0.25"/>
    <line x1="640" y1="230" x2="640" y2="720" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="8,6" opacity="0.3"/>
    <line x1="830" y1="230" x2="900" y2="720" stroke="#475569" stroke-width="1.5" opacity="0.25"/>
    <line x1="1060" y1="230" x2="1200" y2="720" stroke="#475569" stroke-width="1.5" opacity="0.25"/>

    <!-- Ceiling Lights -->
    <rect x="250" y="8" width="300" height="20" rx="3" fill="#f8fafc" opacity="0.8"/>
    <rect x="730" y="8" width="300" height="20" rx="3" fill="#f8fafc" opacity="0.8"/>

    <!-- Front Board -->
    <rect x="340" y="45" width="600" height="155" rx="6" fill="url(#boardGrad)" stroke="#475569" stroke-width="3"/>
    <text x="640" y="82" fill="#38bdf8" font-family="system-ui, sans-serif" font-size="19" font-weight="bold" text-anchor="middle">UNIVERSITY EXAMINATIONS 2026</text>
    <text x="640" y="115" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="15" text-anchor="middle">EXAM HALL A • ARTIFICIAL INTELLIGENCE &amp; SURVEILLANCE</text>
    <text x="640" y="145" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="13" text-anchor="middle">SESSION: 09:00 - 12:00 | HARDWARE CCTV ACTIVE</text>
    <text x="640" y="175" fill="#f59e0b" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">⚠️ STRICT SILENCE • NO MOBILE DEVICES • CCTV PROTOCOL IN EFFECT</text>

    <!-- Analog Wall Clock -->
    <circle cx="1070" cy="100" r="34" fill="#f8fafc" stroke="#334155" stroke-width="3"/>
    <circle cx="1070" cy="100" r="2.5" fill="#0f172a"/>
    <line x1="1070" y1="100" x2="1070" y2="78" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>
    <line x1="1070" y1="100" x2="1088" y2="100" stroke="#0f172a" stroke-width="2" stroke-linecap="round"/>
    <line x1="1070" y1="100" x2="${1070 + Math.sin(clockSec * Math.PI / 180) * 25}" y2="${100 - Math.cos(clockSec * Math.PI / 180) * 25}" stroke="#ef4444" stroke-width="1.5"/>

    <!-- Invigilator / Proctor Pacing in Center Aisle -->
    <g transform="translate(640, ${proctorY})">
      <ellipse cx="0" cy="52" rx="28" ry="10" fill="#020617" opacity="0.4"/>
      <rect x="-18" y="0" width="36" height="50" rx="8" fill="#1e1b4b"/>
      <circle cx="0" cy="-14" r="14" fill="#fcd34d"/>
      <path d="M-14,-17 Q0,-30 14,-17 Q13,-24 0,-26 Q-13,-24 -14,-17" fill="#18181b"/>
      <path d="M-6,0 L0,16 L6,0" stroke="#3b82f6" stroke-width="2" fill="none"/>
      <rect x="-8" y="16" width="16" height="12" rx="2" fill="#ffffff" stroke="#3b82f6" stroke-width="1"/>
      <rect x="-6" y="19" width="12" height="3" fill="#ef4444"/>
    </g>

    <!-- Student Desks -->
    <!-- Row 1 Left (Seat A1) -->
    <g transform="translate(240, 310)">
      <ellipse cx="0" cy="45" rx="75" ry="18" fill="#020617" opacity="0.45"/>
      <rect x="-24" y="-35" width="48" height="28" rx="6" fill="#334155"/>
      <circle cx="0" cy="-28" r="18" fill="#fbcfe8"/>
      <path d="M-16,-32 Q0,-45 16,-32 Q15,-40 0,-42 Q-15,-40 -16,-32" fill="#3f3f46"/>
      <rect x="-22" y="-10" width="44" height="42" rx="8" fill="#2563eb"/>
      <path d="M-18,5 Q-10,25 ${s1HandX},22" stroke="#fbcfe8" stroke-width="7" stroke-linecap="round" fill="none"/>
      <polygon points="-80,25 80,25 90,65 -90,65" fill="url(#deskGrad)" stroke="#78350f" stroke-width="2"/>
      <rect x="-30" y="32" width="40" height="26" fill="#ffffff" rx="2" transform="rotate(-4)"/>
      <line x1="${s1HandX}" y1="42" x2="${s1HandX + 12}" y2="38" stroke="#0f172a" stroke-width="2"/>
      <text x="-75" y="55" fill="#fef3c7" font-family="monospace" font-size="11" font-weight="bold">SEAT A1</text>
    </g>

    <!-- Row 1 Right (Seat A2) -->
    <g transform="translate(1040, 310)">
      <ellipse cx="0" cy="45" rx="75" ry="18" fill="#020617" opacity="0.45"/>
      <rect x="-24" y="-35" width="48" height="28" rx="6" fill="#334155"/>
      <circle cx="0" cy="-28" r="18" fill="#fed7aa"/>
      <path d="M-16,-30 Q0,-45 16,-30" fill="#713f12" stroke="#713f12" stroke-width="6"/>
      <rect x="-22" y="-10" width="44" height="42" rx="8" fill="#059669"/>
      <polygon points="-80,25 80,25 90,65 -90,65" fill="url(#deskGrad)" stroke="#78350f" stroke-width="2"/>
      <rect x="-20" y="32" width="40" height="26" fill="#ffffff" rx="2" transform="rotate(3)"/>
      <text x="-75" y="55" fill="#fef3c7" font-family="monospace" font-size="11" font-weight="bold">SEAT A2</text>
    </g>

    <!-- Row 2 Left (Seat B1) - Head Turning Behavior -->
    <g transform="translate(210, 480)">
      <ellipse cx="0" cy="55" rx="90" ry="22" fill="#020617" opacity="0.5"/>
      <rect x="-30" y="-42" width="60" height="36" rx="8" fill="#334155"/>
      <rect x="-28" y="-12" width="56" height="52" rx="10" fill="#dc2626"/>
      <g transform="rotate(${s3HeadAngle}, 0, -32)">
        <circle cx="0" cy="-32" r="22" fill="#fde047"/>
        <path d="M-18,-38 Q0,-54 18,-38 Q18,-48 0,-50 Q-18,-48 -18,-38" fill="#18181b"/>
        <circle cx="6" cy="-32" r="3" fill="#0f172a"/>
        <circle cx="14" cy="-32" r="3" fill="#0f172a"/>
      </g>
      <polygon points="-100,30 100,30 115,80 -115,80" fill="url(#deskGrad)" stroke="#78350f" stroke-width="2"/>
      <rect x="-35" y="38" width="50" height="32" fill="#ffffff" rx="2" transform="rotate(-6)"/>
      <text x="-95" y="68" fill="#fef3c7" font-family="monospace" font-size="13" font-weight="bold">SEAT B1</text>
    </g>

    <!-- Row 2 Right (Seat B2) -->
    <g transform="translate(1070, 480)">
      <ellipse cx="0" cy="55" rx="90" ry="22" fill="#020617" opacity="0.5"/>
      <rect x="-30" y="-42" width="60" height="36" rx="8" fill="#334155"/>
      <circle cx="0" cy="-32" r="22" fill="#fed7aa"/>
      <path d="M-20,-36 Q0,-54 20,-36" fill="#18181b" stroke="#18181b" stroke-width="8"/>
      <rect x="-28" y="-12" width="56" height="52" rx="10" fill="#475569"/>
      <path d="M-22,8 Q-10,32 ${s4HandX},28" stroke="#fed7aa" stroke-width="9" stroke-linecap="round" fill="none"/>
      <polygon points="-100,30 100,30 115,80 -115,80" fill="url(#deskGrad)" stroke="#78350f" stroke-width="2"/>
      <rect x="-25" y="38" width="50" height="32" fill="#ffffff" rx="2" transform="rotate(4)"/>
      <text x="-95" y="68" fill="#fef3c7" font-family="monospace" font-size="13" font-weight="bold">SEAT B2</text>
    </g>

    <!-- CCTV Camera Overlay (On Screen Display) -->
    <rect x="24" y="24" width="350" height="36" rx="6" fill="#020617" opacity="0.85" stroke="#334155" stroke-width="1.5"/>
    <text x="36" y="48" fill="#22c55e" font-family="monospace" font-size="14" font-weight="bold" filter="url(#cctvGlow)">● CAM-01 [HALL-A] OPTICAL 1080p</text>

    <rect x="910" y="24" width="346" height="36" rx="6" fill="#020617" opacity="0.85" stroke="#334155" stroke-width="1.5"/>
    <circle cx="932" cy="42" r="6" fill="${recDot}"/>
    <text x="948" y="48" fill="#f8fafc" font-family="monospace" font-size="14" font-weight="bold">REC  2026-09-20 11:45:${secStr}</text>

    <rect x="24" y="666" width="500" height="30" rx="4" fill="#020617" opacity="0.8"/>
    <text x="36" y="686" fill="#94a3b8" font-family="monospace" font-size="12">FPS: 15.0 | AI SURVEILLANCE ACTIVE | HALL A MONITORED</text>
  </svg>`;

  const fileName = path.join(TEMP_DIR, `frame_${String(i).padStart(4, '0')}.svg`);
  fs.writeFileSync(fileName, svg);
}

console.log('[CCTV Generator] SVGs generated. Encoding H.264 MP4 with ffmpeg...');
const outputPath = path.join(__dirname, '../public/sample_cctv.mp4');

const cmd = `ffmpeg -y -r ${FPS} -i "${path.join(TEMP_DIR, 'frame_%04d.svg')}" -c:v libx264 -pix_fmt yuv420p -profile:v high -level 4.0 -movflags +faststart -crf 20 -maxrate 2M -bufsize 4M "${outputPath}"`;
execSync(cmd, { stdio: 'inherit' });

console.log('[CCTV Generator] Successfully created high-fidelity classroom surveillance video at:', outputPath);

// Clean up temp dir
try {
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
} catch {
  // ignore
}
