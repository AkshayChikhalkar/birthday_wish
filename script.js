const missionTextEl = document.getElementById("missionText");
const replayBtn = document.getElementById("replayBtn");
const authScreenEl = document.getElementById("authScreen");
const authAgentInputEl = document.getElementById("authAgentInput");
const authPasswordInputEl = document.getElementById("authPasswordInput");
const authBtnEl = document.getElementById("authBtn");
const authStatusEl = document.getElementById("authStatus");
const authProgressEl = document.getElementById("authProgress");
const authProgressFillEl = document.getElementById("authProgressFill");
const profileScreenEl = document.getElementById("profileScreen");
const profileCardEl = document.getElementById("profileCard");
const profilePhotoEl = document.getElementById("profilePhoto");
const profileAgentAliasEl = document.getElementById("profileAgentAlias");
const profileNameEl = document.getElementById("profileName");
const profileDobEl = document.getElementById("profileDob");
const profileAgeEl = document.getElementById("profileAge");
const profileAddressEl = document.getElementById("profileAddress");
const profileLastSeenEl = document.getElementById("profileLastSeen");
const profileSpecialityEl = document.getElementById("profileSpeciality");
const profileClearanceEl = document.getElementById("profileClearance");
const profileStatusEl = document.getElementById("profileStatus");
const profileFavoriteIntelEl = document.getElementById("profileFavoriteIntel");
const profileClassifiedLevelEl = document.getElementById("profileClassifiedLevel");
const profileContinueBtnEl = document.getElementById("profileContinueBtn");
const nameInput = document.getElementById("nameInput");
const ageInput = document.getElementById("ageInput");
const countdownEl = document.getElementById("countdown");
const finalTextEl = document.getElementById("finalText");
const terminal = document.getElementById("terminal");
const agentNameEl = document.getElementById("agentName");
const appEl = document.querySelector(".app");
const celebrationScreenEl = document.getElementById("celebrationScreen");
const celebrationTitleEl = document.getElementById("celebrationTitle");
const celebrationSubtextEl = document.getElementById("celebrationSubtext");
const confettiCanvas = document.getElementById("confettiCanvas");
const confettiCtx = confettiCanvas ? confettiCanvas.getContext("2d") : null;
authBtnEl.disabled = true;
authPasswordInputEl.disabled = true;

const smokeCanvas = document.getElementById("smokeCanvas");
const ctx = smokeCanvas.getContext("2d");
let particles = [];
let animationHandle = null;
let countdownTimer = null;
let isRunning = false;
let voiceReady = false;
let speechUtterance = null;
let confettiPieces = [];
let confettiAnimationHandle = null;
let celebrationPopHandle = null;
let destructSoundStarted = false;
let isAuthenticated = false;
let missionAbortRequested = false;
let audioUnlocked = false;
let currentProfileSlug = "default";
const preloadedImageRefs = [];
/** When true, inline HTML retry kicks + deferred retries must not call play() (avoids double audio during auth). */
let startupAutoplayRetryIds = [];
/** Clears document-level listeners for “tap anywhere to start” startup audio. */
let removeStartupInteractionListeners = null;

/**
 * Single source of truth for all mix levels and related timing — edit here only (not in profile JSON).
 */
const AUDIO = {
  missionBackground: 0.2,
  startup: 0.38,
  celebration: 0.45,
  narration: 1,
  /** Reserved for future UI */
  celebrationCheer: 0.8,
  /** Mission BGM while self-destruct SFX plays */
  missionBackgroundDuringDestruct: 0.12,
  /** Narration duck: multiply mission BGM, then cap */
  narrationDuckMobileFactor: 0.2,
  narrationDuckMobileCap: 0.04,
  narrationDuckDesktopFactor: 0.42,
  narrationDuckDesktopCap: 0.1,
  destructionSfx: 0.95,
  /** Auth → profile startup bed dip */
  startupDipMinRatio: 0.35,
  startupDipSteps: 5,
  startupDipStepMs: 30,
  startupDipHoldMs: 55
};

const destructionAudio = new Audio("./assets/distruction.mp3");
const backgroundAudio = new Audio("./assets/background.mp3");
const celebrationMusicAudio = new Audio("./assets/happy-birthday.mp3");

function createStartupAudioFallback() {
  const a = new Audio("./assets/startup.mp3");
  a.preload = "auto";
  a.loop = true;
  return a;
}

const startupAudio = document.getElementById("startupAudio") ?? createStartupAudioFallback();
let config = {};
const narrationAudio = new Audio("./assets/narration/narration-default.mp3");
let MESSAGE_START_DELAY_MS = 4000;
/** Self-destruct countdown length (seconds); from profile `countdownSeconds`. */
let COUNTDOWN_SECONDS = 12;
let COUNTDOWN_BEEP_FROM = 10;
destructionAudio.preload = "auto";
backgroundAudio.preload = "auto";
celebrationMusicAudio.preload = "auto";
startupAudio.preload = "auto";
narrationAudio.preload = "auto";
backgroundAudio.loop = true;
backgroundAudio.muted = false;
celebrationMusicAudio.loop = true;
startupAudio.loop = true;
narrationAudio.loop = false;
applyAudioLevelsToMediaElements();

// Proactively load audio buffers to reduce first-play latency.
destructionAudio.load();
backgroundAudio.load();
celebrationMusicAudio.load();
startupAudio.load();
narrationAudio.load();

function applyAudioLevelsToMediaElements() {
  backgroundAudio.volume = Math.min(1, AUDIO.missionBackground);
  celebrationMusicAudio.volume = AUDIO.celebration;
  startupAudio.volume = AUDIO.startup;
  narrationAudio.volume = AUDIO.narration;
}

function preloadAuthPageAssets() {
  const profilePhotoPath = String(
    config.profilePhoto || `./assets/profile/profile-${currentProfileSlug}.jpg`
  );
  const fallbackPhotoPath = "./assets/profile/profile-default.jpg";
  for (const src of [profilePhotoPath, fallbackPhotoPath]) {
    const img = new Image();
    img.src = src;
    preloadedImageRefs.push(img);
  }
}

function resizeCanvas() {
  smokeCanvas.width = window.innerWidth;
  smokeCanvas.height = window.innerHeight;
  if (confettiCanvas) {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
  }
}
resizeCanvas();
window.addEventListener("resize", () => {
  resizeCanvas();
  syncBackgroundVolumeFromConfig();
});

function getRequestedProfileSlug() {
  const querySlug = new URLSearchParams(window.location.search).get("p");
  const pathSlug = window.location.pathname.split("/").filter(Boolean)[0];
  const raw = (querySlug || pathSlug || "default").trim().toLowerCase();
  return /^[a-z0-9-]+$/.test(raw) ? raw : "default";
}

/**
 * Mirrors profiles/default.json — used when fetch() fails (e.g. opening index.html via file://).
 * Browsers block loading local JSON with fetch from file URLs; use a local HTTP server for full profiles.
 */
const EMBEDDED_PROFILE_DEFAULT = {
  recipientName: "Akshay Chikhalkar",
  agentName: "Akshay",
  recipientDob: "15-11-1995",
  profilePhoto: "./assets/profile/profile-default.jpg",
  clearanceLevel: "OMEGA-7",
  agentStatus: "ACTIVE",
  agentAddress: "UNKNOWN // SAFEHOUSE REDACTED",
  lastSeen: "Near cake storage, 22:14 IST",
  speciality: "SOCIAL OPS / JOY ENGINEERING",
  favoriteIntel: "Double chocolate, low evidence",
  greeting: "Good evening",
  introLine: "Your next assignment has been delivered with full birthday-level priority.",
  yearLinePrefix: "As of this moment, you are officially entering Year",
  objectivesHeading: "Mission objectives:",
  objectives: [
    "Celebrate without hesitation.",
    "Accept cake, compliments, and unreasonable happiness.",
    "Upgrade confidence, joy, and legendary energy."
  ],
  acceptanceLine: "If you choose to accept this mission, your {ageOrdinal} year will be your boldest one yet.",
  selfDestructLineTemplate: "This message will self-destruct in {seconds} seconds.",
  countdownSeconds: 12,
  countdownBeepFromSeconds: 10,
  messageStartDelayMs: 2500,
  narrationFile: "./assets/narration/narration-default.mp3",
  narrationVoice: "en-US-ChristopherNeural",
  narrationRate: "-5%",
  closingLine: "Good luck, Agent."
};

function cloneEmbeddedDefaultProfile() {
  return JSON.parse(JSON.stringify(EMBEDDED_PROFILE_DEFAULT));
}

async function fetchProfileConfig(slug) {
  const profilePath = `./profiles/${slug}.json`;
  const fallbackPath = "./profiles/default.json";

  try {
    const response = await fetch(profilePath, { cache: "no-store" });
    if (response.ok) {
      return response.json();
    }
  } catch {
    // file://, CORS, or offline
  }

  try {
    const fallbackResponse = await fetch(fallbackPath, { cache: "no-store" });
    if (fallbackResponse.ok) {
      return fallbackResponse.json();
    }
  } catch {
    // file:// cannot load sibling JSON
  }

  if (slug !== "default") {
    console.warn(
      `[birthday_wish] Could not load profiles/${slug}.json (try opening via a local server). Using embedded default profile.`
    );
  }
  return cloneEmbeddedDefaultProfile();
}

/** Narrow / touch UI: used for narration ducking and default narration boost — not for BGM scaling. */
function isMissionBackgroundMobileReduction() {
  return (
    window.matchMedia("(max-width: 768px)").matches || window.matchMedia("(pointer: coarse)").matches
  );
}

function syncBackgroundVolumeFromConfig() {
  backgroundAudio.volume = Math.min(1, AUDIO.missionBackground);
}

/** While narration plays, pull mission BGM down so voice is intelligible (especially on phones). */
function duckBackgroundForNarration() {
  if (backgroundAudio.paused) {
    return;
  }
  const base = AUDIO.missionBackground;
  if (isMissionBackgroundMobileReduction()) {
    backgroundAudio.volume = Math.min(base * AUDIO.narrationDuckMobileFactor, AUDIO.narrationDuckMobileCap);
  } else {
    backgroundAudio.volume = Math.min(base * AUDIO.narrationDuckDesktopFactor, AUDIO.narrationDuckDesktopCap);
  }
}

function restoreBackgroundAfterNarration() {
  syncBackgroundVolumeFromConfig();
}

function applyRuntimeConfig() {
  MESSAGE_START_DELAY_MS = Number(config.messageStartDelayMs) || 4000;
  COUNTDOWN_SECONDS = Number(config.countdownSeconds) || 12;
  COUNTDOWN_BEEP_FROM = Number(config.countdownBeepFromSeconds) || 10;
  const narrationFile = String(config.narrationFile || "./assets/narration/narration-default.mp3");
  if (narrationAudio.src !== new URL(narrationFile, window.location.href).href) {
    narrationAudio.src = narrationFile;
  }

  backgroundAudio.loop = true;
  backgroundAudio.muted = false;
  celebrationMusicAudio.loop = true;
  startupAudio.loop = true;
  narrationAudio.loop = false;
  applyAudioLevelsToMediaElements();
  destructionAudio.preload = "auto";
  backgroundAudio.preload = "auto";
  celebrationMusicAudio.preload = "auto";
  startupAudio.preload = "auto";
  narrationAudio.preload = "auto";

  destructionAudio.load();
  backgroundAudio.load();
  celebrationMusicAudio.load();
  startupAudio.load();
  narrationAudio.load();
}

function buildMessage(name, age, agentAlias) {
  const enteringYear = Number(age) + 1;
  const enteringYearOrdinal = formatOrdinal(enteringYear);
  const greeting = config.greeting || "Good evening";
  const introLine =
    config.introLine ||
    "Your next assignment has been delivered with full birthday-level priority.";
  const yearLinePrefix = config.yearLinePrefix || "As of this moment, you are officially entering Year";
  const objectivesHeading = config.objectivesHeading || "Mission objectives:";
  const objectives =
    Array.isArray(config.objectives) && config.objectives.length
      ? config.objectives
      : [
          "Celebrate without hesitation.",
          "Accept cake, compliments, and unreasonable happiness.",
          "Upgrade confidence, joy, and legendary energy."
        ];
  const acceptanceTemplate =
    config.acceptanceLine ||
    "If you choose to accept this mission, your {ageOrdinal} year will be your boldest one yet.";
  const acceptanceLine = acceptanceTemplate
    .replaceAll("{ageOrdinal}", enteringYearOrdinal)
    .replaceAll("{age}", String(enteringYear));
  const selfDestructLineTemplate =
    config.selfDestructLineTemplate || "This message will self-destruct in {seconds} seconds.";
  const selfDestructLine = selfDestructLineTemplate.replace("{seconds}", String(COUNTDOWN_SECONDS));
  const closingLine = config.closingLine || "Good luck, Agent.";

  return [
    `${greeting}, Agent ${agentAlias}.`,
    "",
    introLine,
    `${yearLinePrefix} ${enteringYear}.`,
    "",
    objectivesHeading,
    ...objectives.map((objective) => `- ${objective}`),
    "",
    acceptanceLine,
    "",
    selfDestructLine,
    "",
    closingLine
  ].join("\n");
}

function formatOrdinal(value) {
  const num = Math.abs(Number(value));
  const mod100 = num % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${num}th`;
  }
  const mod10 = num % 10;
  if (mod10 === 1) {
    return `${num}st`;
  }
  if (mod10 === 2) {
    return `${num}nd`;
  }
  if (mod10 === 3) {
    return `${num}rd`;
  }
  return `${num}th`;
}

async function typeText(text, speed = 60) {
  missionTextEl.textContent = "";
  missionTextEl.scrollTop = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (missionAbortRequested) {
      return;
    }
    missionTextEl.textContent += text[i];
    // Keep latest decoded line visible while typing.
    missionTextEl.scrollTop = missionTextEl.scrollHeight;
    // Add slight jitter to mimic terminal decoding effect.
    await wait(speed + Math.random() * 20);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateAgeFromDob(dobValue) {
  const dobRaw = String(dobValue || "").trim();
  if (!dobRaw) {
    return null;
  }

  const parts = dobRaw.split(/[./-]/).map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  let day;
  let month;
  let year;

  // Supports DD-MM-YYYY and YYYY-MM-DD formats.
  if (parts[0] > 999) {
    [year, month, day] = parts;
  } else {
    [day, month, year] = parts;
  }

  if (!year || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - year;
  const birthdayPassed =
    today.getMonth() + 1 > month ||
    (today.getMonth() + 1 === month && today.getDate() >= day);

  if (!birthdayPassed) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

function getRecipientAge() {
  return calculateAgeFromDob(config.recipientDob || config.dob) || 27;
}

function getExpectedPassword() {
  const configuredAge = getRecipientAge();
  return `iam${Math.max(configuredAge, 0)}`;
}

function setupProfileData() {
  const alias = String(config.agentName || config.recipientName || "Unknown");
  const name = String(config.recipientName || alias);
  const age = String(getRecipientAge());
  const dob = String(config.recipientDob || config.dob || "CLASSIFIED");
  const clearance = String(config.clearanceLevel || "OMEGA-7");
  const status = String(config.agentStatus || "ACTIVE");
  const address = String(config.agentAddress || "UNKNOWN // SAFEHOUSE REDACTED");
  const lastSeen = String(config.lastSeen || "UNKNOWN // TRACKING OFFLINE");
  const speciality = String(config.speciality || "SOCIAL OPS / JOY ENGINEERING");
  const favoriteIntel = String(config.favoriteIntel || "CAKE ACQUISITION");
  const photoPath = String(config.profilePhoto || `./assets/profile/profile-${currentProfileSlug}.jpg`);

  profileAgentAliasEl.textContent = alias;
  profileNameEl.textContent = name;
  profileDobEl.textContent = dob;
  profileAgeEl.textContent = age;
  profileAddressEl.textContent = address;
  profileLastSeenEl.textContent = lastSeen;
  profileSpecialityEl.textContent = speciality;
  profileClearanceEl.textContent = clearance;
  profileStatusEl.textContent = status;
  profileFavoriteIntelEl.textContent = favoriteIntel;
  profileClassifiedLevelEl.textContent = clearance;
  profilePhotoEl.onerror = () => {
    profilePhotoEl.onerror = null;
    profilePhotoEl.src = "./assets/profile/profile-default.jpg";
  };
  profilePhotoEl.src = photoPath;
}

function showProfileScreen() {
  setupProfileData();
  profileCardEl.classList.remove("booting");
  // Restart one-time sweep when profile becomes visible.
  void profileCardEl.offsetWidth;
  profileCardEl.classList.add("booting");
  profileScreenEl.classList.remove("hidden");
}

/**
 * Startup music: we call play() from HTML (inline), here, retries, load, rAF, and first tap anywhere.
 * Browsers may still block audible autoplay until the user has engaged with this origin
 * (Media Engagement) or allowed sound for the site — there is no JS bypass for that.
 */
function tryStartStartupMusic() {
  startupAudio.volume = AUDIO.startup;
  startupAudio.muted = false;
  if (!startupAudio.paused) {
    removeStartupInteractionListeners?.();
    return Promise.resolve();
  }
  const playPromise = startupAudio.play();
  if (playPromise && typeof playPromise.then === "function") {
    playPromise
      .then(() => {
        removeStartupInteractionListeners?.();
      })
      .catch(() => {});
    return playPromise;
  }
  removeStartupInteractionListeners?.();
  return Promise.resolve();
}

function bindStartupMusicOnFirstPageInteraction() {
  removeStartupInteractionListeners?.();
  let lastStartupGestureMs = 0;
  const onInteraction = () => {
    const t = Date.now();
    if (t - lastStartupGestureMs < 320) {
      return;
    }
    lastStartupGestureMs = t;
    if (isAuthenticated || window.__BW_SUPPRESS_STARTUP_KICKS) {
      return;
    }
    tryStartStartupMusic();
  };
  document.addEventListener("pointerdown", onInteraction, true);
  document.addEventListener("touchstart", onInteraction, true);
  removeStartupInteractionListeners = () => {
    document.removeEventListener("pointerdown", onInteraction, true);
    document.removeEventListener("touchstart", onInteraction, true);
    removeStartupInteractionListeners = null;
  };
}

function clearStartupAutoplayRetries() {
  for (const id of startupAutoplayRetryIds) {
    clearTimeout(id);
  }
  startupAutoplayRetryIds = [];
}

/** Stops deferred play() bursts from overlapping real playback (e.g. on Authenticate). */
function suppressStartupAutoplayKicks() {
  window.__BW_SUPPRESS_STARTUP_KICKS = true;
  clearStartupAutoplayRetries();
  removeStartupInteractionListeners?.();
}

/** Re-tries after boot: slow networks + engagement can allow play() to succeed without a tap. */
function scheduleStartupAutoplayRetries() {
  clearStartupAutoplayRetries();
  const delays = [0, 20, 80, 160, 320, 640, 1200, 2000, 3200, 5000, 8000];
  for (const ms of delays) {
    const id = setTimeout(() => {
      if (isAuthenticated || window.__BW_SUPPRESS_STARTUP_KICKS) {
        return;
      }
      if (startupAudio.paused) {
        tryStartStartupMusic();
      }
    }, ms);
    startupAutoplayRetryIds.push(id);
  }
}

/** Volume dip between auth and profile — same track, continuous playback. */
async function startupAuthToProfileTransition() {
  if (startupAudio.paused) {
    return;
  }
  const base = startupAudio.volume || AUDIO.startup;
  const low = base * AUDIO.startupDipMinRatio;
  const steps = AUDIO.startupDipSteps;
  for (let i = 0; i < steps; i += 1) {
    startupAudio.volume = base - ((base - low) * (i + 1)) / steps;
    await wait(AUDIO.startupDipStepMs);
  }
  await wait(AUDIO.startupDipHoldMs);
  for (let i = 0; i < steps; i += 1) {
    startupAudio.volume = low + ((base - low) * (i + 1)) / steps;
    await wait(AUDIO.startupDipStepMs);
  }
  startupAudio.volume = base;
}

async function fadeOutStartupAudio(durationMs = 700) {
  const steps = 14;
  const initial = startupAudio.volume || AUDIO.startup;
  for (let step = 0; step < steps; step += 1) {
    const ratio = 1 - (step + 1) / steps;
    startupAudio.volume = Math.max(initial * ratio, 0);
    await wait(durationMs / steps);
  }
  startupAudio.pause();
  startupAudio.currentTime = 0;
  startupAudio.volume = AUDIO.startup;
}

async function openMissionTerminal() {
  await fadeOutStartupAudio(650);
  profileScreenEl.classList.add("hidden");
  appEl.classList.remove("pre-auth");
  runMission();
}

async function runAuthSequence() {
  if (isAuthenticated) {
    return;
  }
  const typedPassword = authPasswordInputEl.value.trim().toLowerCase();
  const expectedPassword = getExpectedPassword();

  if (typedPassword !== expectedPassword) {
    authStatusEl.classList.remove("loading");
    authStatusEl.classList.add("error");
    authStatusEl.textContent = "ACCESS DENIED. INVALID PASSWORD.";
    authProgressEl.classList.remove("visible");
    authProgressFillEl.style.width = "0%";
    authPasswordInputEl.value = "";
    return;
  }

  authBtnEl.disabled = true;
  authPasswordInputEl.disabled = true;
  authPasswordInputEl.blur();
  suppressStartupAutoplayKicks();
  await unlockAudioIfNeeded();
  if (startupAudio.paused) {
    tryStartStartupMusic();
  }
  authStatusEl.classList.remove("error");
  authStatusEl.classList.add("loading");
  authStatusEl.textContent = "VERIFYING CREDENTIALS...";
  authProgressEl.classList.add("visible");

  for (const progress of [18, 37, 61, 83, 100]) {
    authProgressFillEl.style.width = `${progress}%`;
    await wait(220);
  }
  await wait(220);
  authStatusEl.classList.remove("loading");
  authStatusEl.textContent = "AUTHENTICATED. SECURE CHANNEL OPEN.";
  isAuthenticated = true;
  await startupAuthToProfileTransition();
  authScreenEl.classList.add("hidden");
  showProfileScreen();
}

function safeStopSpeech() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  narrationAudio.pause();
  narrationAudio.currentTime = 0;
  speechUtterance = null;
}

function getPreferredVoice() {
  if (!("speechSynthesis" in window)) {
    return null;
  }
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) {
    return null;
  }

  const preferredTokens = [
    "natural",
    "neural",
    "online",
    "guy",
    "david",
    "mark",
    "english",
    "en-us",
    "google us english"
  ];

  const ranked = voices
    .map((voice) => {
      const name = `${voice.name} ${voice.lang}`.toLowerCase();
      let score = 0;
      for (const token of preferredTokens) {
        if (name.includes(token)) {
          score += 1;
        }
      }
      return { voice, score };
    })
    .sort((a, b) => b.score - a.score);

  return ranked[0].voice;
}

function createNarrationUtterance(text) {
  const utterance = new SpeechSynthesisUtterance(text.replace(/\n/g, " "));
  const selected = getPreferredVoice();
  if (selected) {
    utterance.voice = selected;
  }
  utterance.rate = 0.84;
  utterance.pitch = 0.9;
  utterance.volume = AUDIO.narration;
  return utterance;
}

function initVoices() {
  if (!("speechSynthesis" in window) || voiceReady) {
    return;
  }
  window.speechSynthesis.getVoices();
  voiceReady = true;
}

function speakMessage(text) {
  duckBackgroundForNarration();
  if (narrationAudio.currentSrc || narrationAudio.src) {
    playAudioFile(narrationAudio, AUDIO.narration).then((played) => {
      if (played) {
        narrationAudio.addEventListener("ended", () => restoreBackgroundAfterNarration(), { once: true });
        narrationAudio.addEventListener(
          "error",
          () => {
            restoreBackgroundAfterNarration();
          },
          { once: true }
        );
      } else if ("speechSynthesis" in window) {
        safeStopSpeech();
        const utterance = createNarrationUtterance(text);
        utterance.onend = () => {
          restoreBackgroundAfterNarration();
        };
        speechUtterance = utterance;
        window.speechSynthesis.speak(utterance);
      } else {
        restoreBackgroundAfterNarration();
      }
    });
    return;
  }
  if (!("speechSynthesis" in window)) {
    restoreBackgroundAfterNarration();
    return;
  }
  safeStopSpeech();
  const utterance = createNarrationUtterance(text);
  utterance.onend = () => {
    restoreBackgroundAfterNarration();
  };
  speechUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

function stopMediaAudio() {
  destructionAudio.pause();
  destructionAudio.currentTime = 0;
  backgroundAudio.pause();
  backgroundAudio.currentTime = 0;
  backgroundAudio.volume = Math.min(1, AUDIO.missionBackground);
  startupAudio.pause();
  startupAudio.currentTime = 0;
  startupAudio.volume = AUDIO.startup;
  celebrationMusicAudio.pause();
  celebrationMusicAudio.currentTime = 0;
  narrationAudio.pause();
  narrationAudio.currentTime = 0;
  if (celebrationPopHandle) {
    clearInterval(celebrationPopHandle);
    celebrationPopHandle = null;
  }
}

function playAudioFile(audioEl, volume = 1) {
  return new Promise((resolve) => {
    audioEl.volume = volume;
    audioEl.currentTime = 0;
    const playPromise = audioEl.play();
    if (playPromise && typeof playPromise.then === "function") {
      playPromise.then(() => resolve(true)).catch(() => resolve(false));
    } else {
      resolve(true);
    }
  });
}

async function startBackgroundAudio() {
  backgroundAudio.currentTime = 0;
  const v = Math.min(1, AUDIO.missionBackground);
  backgroundAudio.volume = v;
  return playAudioFile(backgroundAudio, v);
}

async function unlockAudioIfNeeded() {
  if (audioUnlocked) {
    return;
  }
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (AudioCtx) {
    const audioCtx = playTone.audioCtx || new AudioCtx();
    playTone.audioCtx = audioCtx;
    if (audioCtx.state === "suspended") {
      await audioCtx.resume().catch(() => {});
    }
  }
  // Do not include startupAudio: the unlock helper pauses + resets currentTime, which would restart
  // the auth→profile startup bed. Startup is already playing before Authenticate or is started below.
  const unlockTargets = [destructionAudio, backgroundAudio, celebrationMusicAudio, narrationAudio];
  await Promise.all(
    unlockTargets.map(async (audioEl) => {
      try {
        audioEl.muted = true;
        await audioEl.play();
      } catch (_error) {
        // Ignore here; real playback has its own fallback logic.
      } finally {
        audioEl.pause();
        audioEl.currentTime = 0;
        audioEl.muted = false;
      }
    })
  );
  audioUnlocked = true;
}

async function fadeOutBackgroundAudio(durationMs = 1300) {
  const steps = 12;
  const initialVolume = backgroundAudio.volume || AUDIO.missionBackground;
  for (let step = 0; step < steps; step += 1) {
    const ratio = 1 - (step + 1) / steps;
    backgroundAudio.volume = Math.max(initialVolume * ratio, 0);
    await wait(durationMs / steps);
  }
  backgroundAudio.pause();
  backgroundAudio.currentTime = 0;
  backgroundAudio.volume = Math.min(1, AUDIO.missionBackground);
}

function playTone(type, start, duration, frequency, volume = 0.12) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    return;
  }
  const audioCtx = playTone.audioCtx || new AudioCtx();
  playTone.audioCtx = audioCtx;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, audioCtx.currentTime + start);
  gain.gain.setValueAtTime(0.001, audioCtx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(volume, audioCtx.currentTime + start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + start + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(audioCtx.currentTime + start);
  osc.stop(audioCtx.currentTime + start + duration + 0.04);
}

function playAcceptSequence() {
  playTone("square", 0, 0.14, 740, 0.08);
  playTone("square", 0, 0.14, 880, 0.08);
}

function startCelebrationPops() {
  if (celebrationPopHandle) {
    return;
  }
  celebrationPopHandle = setInterval(() => {
    const randomFrequency = 560 + Math.random() * 420;
    playTone("triangle", 0, 0.06, randomFrequency, 0.045);
  }, 520);
}

async function startCelebrationAudio() {
  const musicPlayed = await playAudioFile(celebrationMusicAudio, AUDIO.celebration);
  if (!musicPlayed) {
    startCelebrationPops();
  }
}

function setupCelebrationMessage() {
  const celebrationAgentName = String(config.agentName || config.recipientName || "Agent");
  const enteringYear = getRecipientAge() + 1;
  celebrationTitleEl.textContent = `Happy Birthday,\n${celebrationAgentName}!`;
  celebrationSubtextEl.textContent = `Welcome to your amazing ${formatOrdinal(enteringYear)} year. Celebrate big and enjoy every moment.`;
}

function getConfettiCount() {
  const configured = Number(config.confettiCount);
  if (configured > 0) {
    return configured;
  }
  const isMobileLike = window.matchMedia("(max-width: 768px)").matches;
  return isMobileLike ? 140 : 220;
}

function spawnConfetti(count = getConfettiCount(), fillViewport = true) {
  confettiPieces = Array.from({ length: count }, () => ({
    x: Math.random() * confettiCanvas.width,
    y: fillViewport ? Math.random() * confettiCanvas.height : -20 - Math.random() * confettiCanvas.height,
    vx: -1.2 + Math.random() * 2.4,
    vy: 2.1 + Math.random() * 3.3,
    size: 4 + Math.random() * 8,
    rot: Math.random() * Math.PI * 2,
    rotSpeed: -0.2 + Math.random() * 0.4,
    color: ["#ffd166", "#ef476f", "#06d6a0", "#118ab2", "#f8f9fa", "#c77dff"][
      Math.floor(Math.random() * 6)
    ]
  }));
}

function animateConfetti() {
  if (!confettiCtx) {
    return;
  }
  confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  for (const piece of confettiPieces) {
    piece.x += piece.vx;
    piece.y += piece.vy;
    piece.rot += piece.rotSpeed;
    if (piece.y > confettiCanvas.height + 20) {
      piece.y = -20;
      piece.x = Math.random() * confettiCanvas.width;
    }
    confettiCtx.save();
    confettiCtx.translate(piece.x, piece.y);
    confettiCtx.rotate(piece.rot);
    confettiCtx.fillStyle = piece.color;
    confettiCtx.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * 0.6);
    confettiCtx.restore();
  }
  confettiAnimationHandle = requestAnimationFrame(animateConfetti);
}

function showCelebrationScreen() {
  missionAbortRequested = true;
  safeStopSpeech();
  stopMediaAudio();
  // Stop expensive smoke updates before starting celebration particles.
  particles = [];
  if (animationHandle) {
    cancelAnimationFrame(animationHandle);
    animationHandle = null;
  }
  ctx.clearRect(0, 0, smokeCanvas.width, smokeCanvas.height);
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  appEl.classList.add("fade-out");
  celebrationScreenEl.classList.add("visible");
  setupCelebrationMessage();
  if (confettiCanvas && !confettiAnimationHandle) {
    spawnConfetti(getConfettiCount(), true);
    animateConfetti();
  }
  startCelebrationAudio();
}

async function playDestructSequence() {
  // Lower BGM during self-destruct for clarity.
  backgroundAudio.volume = AUDIO.missionBackgroundDuringDestruct;
  const played = await playAudioFile(destructionAudio, AUDIO.destructionSfx);
  if (played) {
    return;
  }
  for (let i = 0; i < 10; i += 1) {
    playTone("sawtooth", i * 0.115, 0.09, 1080 - i * 82, 0.11);
  }
  playTone("triangle", 1.1, 0.5, 64, 0.2);
  playTone("square", 1.22, 0.13, 1800, 0.06);
  playTone("triangle", 1.34, 0.28, 46, 0.2);
}

function spawnSmokeCloud(intensity = 90) {
  const rect = terminal.getBoundingClientRect();
  const sourceX = rect.left + rect.width * 0.5;
  const sourceY = rect.top + rect.height * 0.55;
  for (let i = 0; i < intensity; i += 1) {
    const spreadX = rect.width * (0.15 + Math.random() * 0.8);
    const spreadY = rect.height * (0.08 + Math.random() * 0.45);
    const radius = 12 + Math.random() * 28;
    const angle = Math.random() * Math.PI * 2;
    const speed = 3.6 + Math.random() * 5.4;
    particles.push({
      x: sourceX + (Math.random() - 0.5) * spreadX,
      y: sourceY + (Math.random() - 0.5) * spreadY,
      vx: Math.cos(angle) * speed * (0.85 + Math.random() * 0.35),
      vy: Math.sin(angle) * speed * (0.7 + Math.random() * 0.5) - 0.75,
      radius,
      alpha: 0.24 + Math.random() * 0.28,
      fade: 0.0034 + Math.random() * 0.007,
      growth: 0.34 + Math.random() * 0.56,
      drag: 0.9 + Math.random() * 0.02,
      driftDrag: 0.976 + Math.random() * 0.01,
      gravity: 0.006 + Math.random() * 0.015,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.11 + Math.random() * 0.2,
      wobbleAmount: 0.2 + Math.random() * 0.55,
      gray: 65 + Math.floor(Math.random() * 100),
      life: 0
    });
  }
  if (!animationHandle) {
    animateSmoke();
  }
}

function animateSmoke() {
  ctx.clearRect(0, 0, smokeCanvas.width, smokeCanvas.height);
  particles = particles.filter((p) => p.alpha > 0);
  for (const p of particles) {
    p.life += 1;
    p.wobble += p.wobbleSpeed;
    // Fast explosive kick, then natural slow powder drift.
    if (p.life < 8) {
      p.vx *= p.drag;
      p.vy *= p.drag;
    } else {
      p.vx *= p.driftDrag;
      p.vy *= p.driftDrag;
    }
    p.vy += p.gravity;
    p.vx += Math.sin(p.wobble) * 0.02;
    p.x += p.vx;
    p.y += p.vy;
    p.x += Math.sin(p.wobble) * p.wobbleAmount;
    p.alpha -= p.fade;
    p.radius += p.growth;

    const visibleAlpha = Math.max(p.alpha, 0);
    const grad = ctx.createRadialGradient(
      p.x - p.radius * 0.2,
      p.y - p.radius * 0.24,
      p.radius * 0.18,
      p.x,
      p.y,
      p.radius
    );
    grad.addColorStop(0, `rgba(${p.gray + 18}, ${p.gray + 18}, ${p.gray + 18}, ${visibleAlpha * 0.55})`);
    grad.addColorStop(0.52, `rgba(${p.gray}, ${p.gray}, ${p.gray}, ${visibleAlpha * 0.32})`);
    grad.addColorStop(1, `rgba(${p.gray - 10}, ${p.gray - 10}, ${p.gray - 10}, 0)`);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(
      p.x,
      p.y,
      p.radius * (0.82 + Math.sin(p.wobble) * 0.05),
      p.radius * (1.02 + Math.cos(p.wobble * 0.85) * 0.06),
      p.wobble * 0.14,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
  if (particles.length > 0) {
    animationHandle = requestAnimationFrame(animateSmoke);
  } else {
    animationHandle = null;
  }
}

function startCountdown(seconds) {
  countdownEl.classList.remove("hidden");
  let remaining = seconds;
  countdownEl.textContent = `SELF-DESTRUCT IN ${remaining}...`;
  destructSoundStarted = false;

  countdownTimer = setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      countdownEl.textContent = `SELF-DESTRUCT IN ${remaining}...`;
      if (remaining === 1 && !destructSoundStarted) {
        destructSoundStarted = true;
        playDestructSequence();
      }
      if (remaining <= COUNTDOWN_BEEP_FROM) {
        playTone("square", 0, 0.08, 1100, 0.08);
      }
    } else {
      clearInterval(countdownTimer);
      countdownTimer = null;
      triggerSelfDestruct();
    }
  }, 1000);
}

async function triggerSelfDestruct() {
  safeStopSpeech();
  if (!destructSoundStarted) {
    destructSoundStarted = true;
    await playDestructSequence();
  }
  fadeOutBackgroundAudio();
  terminal.classList.add("smokeout");
  spawnSmokeCloud(1200);
  countdownEl.textContent = "SELF-DESTRUCT ACTIVATED";
  await wait(2200);
  missionTextEl.textContent = "";
  finalTextEl.classList.remove("hidden");
  countdownEl.classList.add("hidden");
  isRunning = false;
  showCelebrationScreen();
}

async function runMission() {
  if (!isAuthenticated) {
    return;
  }
  if (isRunning) {
    return;
  }
  missionAbortRequested = false;
  isRunning = true;

  const rawName = nameInput.value.trim();
  const defaultName = config.recipientName || "PHOENIX";
  const defaultAgentName = config.agentName || defaultName;
  const defaultAge = getRecipientAge();
  const name = rawName || defaultName;
  const agentAlias = defaultAgentName;
  const age = Number.parseInt(ageInput.value, 10) || defaultAge;

  agentNameEl.textContent = String(agentAlias).toUpperCase();
  finalTextEl.classList.add("hidden");
  terminal.classList.remove("smokeout");
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }

  const msg = buildMessage(name, age, agentAlias);
  await startBackgroundAudio();
  if (missionAbortRequested) {
    isRunning = false;
    return;
  }
  await wait(MESSAGE_START_DELAY_MS);
  if (missionAbortRequested) {
    isRunning = false;
    return;
  }
  playAcceptSequence();
  if (missionAbortRequested) {
    isRunning = false;
    return;
  }
  speakMessage(msg);
  await typeText(msg);
  if (missionAbortRequested) {
    isRunning = false;
    return;
  }
  startCountdown(COUNTDOWN_SECONDS);
}

replayBtn.addEventListener("click", showCelebrationScreen);
authBtnEl.addEventListener("click", runAuthSequence);
profileContinueBtnEl.addEventListener("click", openMissionTerminal);
authPasswordInputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    runAuthSequence();
  }
});
initVoices();
if ("speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = initVoices;
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    safeStopSpeech();
    stopMediaAudio();
  } else if (!isAuthenticated) {
    tryStartStartupMusic();
  }
});

window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    window.__BW_SUPPRESS_STARTUP_KICKS = false;
    bindStartupMusicOnFirstPageInteraction();
    tryStartStartupMusic();
    scheduleStartupAutoplayRetries();
  }
});

window.addEventListener("load", () => {
  if (!isAuthenticated && startupAudio.paused) {
    tryStartStartupMusic();
  }
});

async function bootApp() {
  window.__BW_SUPPRESS_STARTUP_KICKS = false;
  const requestedSlug = getRequestedProfileSlug();
  currentProfileSlug = requestedSlug;
  config = await fetchProfileConfig(requestedSlug);
  applyRuntimeConfig();

  if (config.recipientName) {
    nameInput.value = String(config.recipientName);
  }
  ageInput.value = String(getRecipientAge());
  const initialAgentName = config.agentName || config.recipientName || "AGENT";
  agentNameEl.textContent = String(initialAgentName).toUpperCase();
  authAgentInputEl.value = String(initialAgentName);
  authPasswordInputEl.disabled = false;
  authBtnEl.disabled = false;
  authStatusEl.classList.remove("error");
  authStatusEl.textContent = "AWAITING CREDENTIALS...";
  preloadAuthPageAssets();
  bindStartupMusicOnFirstPageInteraction();
  startupAudio.addEventListener(
    "canplaythrough",
    () => {
      if (!isAuthenticated && startupAudio.paused) {
        tryStartStartupMusic();
      }
    },
    { once: true }
  );
  tryStartStartupMusic();
  scheduleStartupAutoplayRetries();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!isAuthenticated && startupAudio.paused) {
        tryStartStartupMusic();
      }
    });
  });
}

bootApp().catch(() => {
  authStatusEl.classList.add("error");
  authStatusEl.textContent = "PROFILE LOAD FAILED. TRY AGAIN.";
});
