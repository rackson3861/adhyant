import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./Footer";
import {
  getScriptPostUrl,
  getRecordTestStartUrl,
  getValidateCodeUrl,
  resolveQuestionImageSrc,
  getDriveThumbnailFallbackUrl,
  resolveStemImageSrcForOnlineTest,
} from "../../utils/scriptApi";
import { fetchLocalQuestionsPaper } from "../../utils/localQuestionsPaper";
import {
  countQuestionsBySection,
  getSectionPaletteOrderForPaperId,
  normalizeQuestionSection,
  paletteSectionDisplay,
} from "../../utils/pdfQuestionParser";
import { isMcqAnswerCorrect, isMcqOptionSelected } from "../../utils/mcqChoice";
import {
  saveTestProgress,
  loadTestProgress,
  clearTestProgress,
  findLatestTestProgressForPaperAndCode,
  saveProgressToServer,
  loadProgressFromServer,
  clearProgressOnServer,
} from "../../utils/onlineTestPersistence";
import { preloadAllQuestionStemImages } from "../../utils/preloadQuestionImages";
import { markGatePairSubmittedLocally } from "../../utils/gateSubmittedLocal";
import {
  CHUNK_INTERVAL_MS,
  PRE_END_FLUSH_AT_SEC_LEFT,
  buildChunkFileBaseNames,
  buildChunkUploadPrefix,
} from "../../utils/onlineTestRecordingChunks";
import { buildQuestionTimeSpentMaps } from "../../utils/onlineTestQuestionTimeMetadata";
import { buildQuestionEngagementPayload } from "../../utils/onlineTestQuestionEngagementMetadata";
import {
  STORAGE_KEY_QUESTION_PAPER_ID,
  STORAGE_KEY_TEST_CODE,
  STORAGE_KEY_GATE_PASSWORD,
  STORAGE_KEY_ALREADY_SUBMITTED,
} from "../TestCodeGate";

function readGatePasscodeForSession() {
  try {
    return (sessionStorage.getItem(STORAGE_KEY_GATE_PASSWORD) || "").trim();
  } catch {
    return "";
  }
}
import "/src/assets/css/onlineTest.css";
import adhyantLogo from "../../assets/img/adhyant-logo.png";

const PHASE = { REGISTRATION: "registration", INSTRUCTIONS: "instructions", PERMISSION: "permission", TEST: "test", RESULT: "result" };

function isAppsScriptRecordingUrl(url) {
  return typeof url === "string" && /script\.google\.com|google\.com\/macos\/script/i.test(url);
}

/** Fresh URL each call — chunk stop handler must not capture a stale empty URL from mount. */
function getRecordingPostUrl() {
  return (
    import.meta.env.NEXT_PUBLIC_RECORDING_UPLOAD_URL ||
    import.meta.env.VITE_RECORDING_UPLOAD_URL ||
    import.meta.env.VITE_TEST_SUBMISSION_URL ||
    ""
  );
}

function buildAnswersDetailedSnapshot(questions, answers) {
  return questions.map((q) => {
    const sel = answers[q.id] !== undefined && answers[q.id] !== "" ? answers[q.id] : null;
    let selectedChoice = null;
    let selectedOptionText = null;
    if (q.type === "mcq" && sel != null) {
      const s = String(sel).trim();
      const opts = Array.isArray(q.options) ? q.options : [];
      if (/^[1-4]$/.test(s)) {
        selectedChoice = s;
        const i = parseInt(s, 10) - 1;
        if (opts[i] != null) selectedOptionText = String(opts[i]);
      } else {
        const i = opts.findIndex((o) => String(o).trim() === s);
        if (i >= 0) {
          selectedChoice = String(i + 1);
          selectedOptionText = String(opts[i]);
        }
      }
    }
    return {
      questionId: q.id,
      paperQuestionNum: q.paperQuestionNum ?? null,
      section: q.section || null,
      type: q.type,
      selected: sel,
      selectedChoice,
      selectedOptionText,
    };
  });
}

const CLASS_GRADE_OPTIONS = [
  { value: "", label: "Select class / grade" },
  ...["6th", "7th", "8th", "9th", "10th", "11th", "12th"].map((label) => ({ value: label, label })),
  { value: "13th (Dropper)", label: "13th (Dropper)" },
];

function classGradeSelectOptions(studentClass) {
  const extra = (studentClass || "").trim();
  if (extra && !CLASS_GRADE_OPTIONS.some((o) => o.value === extra)) {
    return [
      CLASS_GRADE_OPTIONS[0],
      { value: extra, label: `${extra} (saved)` },
      ...CLASS_GRADE_OPTIONS.slice(1),
    ];
  }
  return CLASS_GRADE_OPTIONS;
}

// Minimum video dimensions for face/lighting/phone detection (works with 480x360 reduced capture)
const MIN_VIDEO_WIDTH = 160;
const MIN_VIDEO_HEIGHT = 120;

// Mobile/tablet detection: userAgent + screen heuristics. Avoids false positives on desktop
// laptops with touch screens or smaller monitors.
function isMobileDevice() {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  // 1) UserAgent-based (most reliable)
  const ua = (navigator.userAgent || "").toLowerCase();
  const plat = (navigator.platform || "").toLowerCase();
  if (/android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|kindle|silk/i.test(ua)) return true;
  if (/android|iphone|ipad/i.test(plat)) return true;
  // 2) Modern UA Client Hints
  if (navigator.userAgentData && typeof navigator.userAgentData.mobile === "boolean" && navigator.userAgentData.mobile) return true;
  // 3) Screen-based: only flag if BOTH dimensions are small (phone/small tablet portrait/landscape).
  //    Using screen size (physical), not viewport (can be resized).
  const sw = window.screen?.width ?? 0;
  const sh = window.screen?.height ?? 0;
  const screenSmall = sw > 0 && sh > 0 && Math.max(sw, sh) <= 1024 && Math.min(sw, sh) <= 768;
  // 4) Touch + small screen = mobile. Touch alone is not enough (many laptops have touch).
  const touch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  if (touch && screenSmall) return true;
  // 5) Very small screen even without touch (some old phones)
  if (sw > 0 && sh > 0 && Math.max(sw, sh) <= 768) return true;
  return false;
}

function getViewportSize() {
  return typeof window !== "undefined" ? { w: window.innerWidth, h: window.innerHeight } : { w: 0, h: 0 };
}

/** No client-side scoring; sample stems until /questions/paper.json or bundled JSON loads. */
const DEFAULT_DATA = {
  title: "Online Assessment - PCM + IQ",
  paperId: "",
  durationMinutes: 120,
  maxMarks: null,
  readTimeMinutes: null,
  paperTitleHint: null,
  instructionsCallout: null,
  streamInstructionsCallout: null,
  answerKeyPresent: false,
  questions: [
    { id: "q1", type: "mcq", question: "The SI unit of force is:", options: ["Joule", "Newton", "Pascal", "Watt"] },
    { id: "q2", type: "integer", question: "How many electrons are in a neutral carbon atom? (Enter a whole number)", min: 0, max: 120 },
    { id: "q3", type: "mcq", question: "Which of the following is a vector quantity?", options: ["Mass", "Speed", "Velocity", "Temperature"] },
    { id: "q4", type: "integer", question: "Atomic number of oxygen is ___. (Enter a whole number)", min: 1, max: 118 },
    { id: "q5", type: "mcq", question: "The chemical formula of water is:", options: ["CO2", "H2O", "NaCl", "O2"] },
    { id: "q6", type: "integer", question: "Number of bones in an adult human body (approximately). Enter the integer.", min: 200, max: 210 },
    { id: "q7", type: "mcq", question: "Which gas is most abundant in Earth's atmosphere?", options: ["Oxygen", "Carbon dioxide", "Nitrogen", "Argon"] },
    { id: "q8", type: "integer", question: "Valency of carbon is ___. (Enter a whole number)", min: 1, max: 8 },
    { id: "q9", type: "mcq", question: "Acceleration due to gravity (g) on Earth is approximately:", options: ["8.9 m/s²", "9.8 m/s²", "10.2 m/s²", "11.0 m/s²"] },
    { id: "q10", type: "integer", question: "How many planets are there in our Solar System? (Enter a whole number)", min: 7, max: 9 },
  ],
};

export default function OnlineTest() {
  const navigate = useNavigate();
  const [data, setData] = useState(DEFAULT_DATA);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = await fetchLocalQuestionsPaper();
      if (cancelled) return;
      if (local && local.questions.length > 0) {
        try {
          if (typeof sessionStorage !== "undefined") {
            sessionStorage.setItem(STORAGE_KEY_QUESTION_PAPER_ID, local.paperId);
          }
        } catch {
          /* ignore */
        }
        setData({
          title: local.title,
          paperId: local.paperId || "",
          durationMinutes: local.durationMinutes,
          maxMarks: local.maxMarks,
          readTimeMinutes: local.readTimeMinutes,
          paperTitleHint: local.paperTitleHint,
          instructionsCallout: local.instructionsCallout ?? null,
          streamInstructionsCallout: local.streamInstructionsCallout ?? null,
          answerKeyPresent: false,
          questions: local.questions,
        });
        return;
      }
      import("../../data/onlineTestQuestions.json")
        .then((m) => m.default || m)
        .then((loaded) => {
          if (cancelled || !loaded || !Array.isArray(loaded.questions) || loaded.questions.length === 0) return;
          try {
            if (typeof sessionStorage !== "undefined") {
              sessionStorage.setItem(STORAGE_KEY_QUESTION_PAPER_ID, "bundled-sample");
            }
          } catch {
            /* ignore */
          }
          setData({
            title: loaded.title || "Online Assessment",
            paperId: "bundled-sample",
            durationMinutes: loaded.durationMinutes ?? 120,
            maxMarks: null,
            readTimeMinutes: null,
            paperTitleHint: null,
            instructionsCallout: null,
            streamInstructionsCallout: null,
            answerKeyPresent: false,
            questions: loaded.questions.map((q, i) => ({
              ...q,
              id: q.id || `q${i + 1}`,
              answer: undefined,
              correctChoice: undefined,
              needsAnswerKey: undefined,
            })),
          });
        })
        .catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const {
    title,
    paperId: activePaperId,
    durationMinutes,
    questions,
    maxMarks,
    readTimeMinutes,
    instructionsCallout,
    streamInstructionsCallout,
    answerKeyPresent,
  } = data;

  const sectionBreakdown = useMemo(
    () => countQuestionsBySection(questions, activePaperId),
    [questions, activePaperId]
  );
  const showSectionBreakdown =
    sectionBreakdown.length > 1 ||
    (sectionBreakdown.length === 1 && sectionBreakdown[0].section !== "General");

  /** Class XI–XIII stream papers: how many questions count toward max marks (typically 80 of 100). */
  const streamMcqAttemptCount = useMemo(() => {
    if (!streamInstructionsCallout) return null;
    if (maxMarks != null && !Number.isNaN(Number(maxMarks)) && Number(maxMarks) > 0) {
      return Math.round(Number(maxMarks) / 4);
    }
    if (questions.length === 100) return 80;
    return null;
  }, [streamInstructionsCallout, maxMarks, questions.length]);

  const paletteGroups = useMemo(() => {
    const keyToGroup = new Map();
    const order = [];
    questions.forEach((q, i) => {
      const raw = (q.section && String(q.section).trim()) || "";
      const sectionKey = normalizeQuestionSection(raw || "General");
      const section = paletteSectionDisplay(sectionKey, raw);
      if (!keyToGroup.has(sectionKey)) {
        keyToGroup.set(sectionKey, { sectionKey, section, indices: [] });
        order.push(sectionKey);
      }
      keyToGroup.get(sectionKey).indices.push(i);
    });
    const paletteOrderArr = getSectionPaletteOrderForPaperId(activePaperId);
    const rank = (k) => {
      const i = paletteOrderArr.indexOf(k);
      return i >= 0 ? i : 999;
    };
    order.sort((a, b) => {
      const dr = rank(a) - rank(b);
      if (dr !== 0) return dr;
      const ga = keyToGroup.get(a);
      const gb = keyToGroup.get(b);
      return Math.min(...ga.indices) - Math.min(...gb.indices) || String(a).localeCompare(String(b));
    });
    return order.map((k) => keyToGroup.get(k));
  }, [questions, activePaperId]);
  const showPaletteSections = paletteGroups.length > 1 || (paletteGroups[0] && paletteGroups[0].section !== "General");
  const [phase, setPhase] = useState(PHASE.REGISTRATION);
  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [studentPhone, setStudentPhone] = useState("");
  const [studentClass, setStudentClass] = useState("");
  const [studentAdhar, setStudentAdhar] = useState("");
  const [registrationError, setRegistrationError] = useState("");
  const [registrationSubmitting, setRegistrationSubmitting] = useState(false);
  /** Shown on test screen if recordTestStart fails (e.g. exam full). */
  const [sessionStartError, setSessionStartError] = useState("");
  const [stemImageLoaded, setStemImageLoaded] = useState(false);
  /** After preload: question id → blob URL or original URL (read during test from this map first). */
  const [stemSrcOverrideById, setStemSrcOverrideById] = useState({});
  const [isPreloadingQuestionAssets, setIsPreloadingQuestionAssets] = useState(false);
  const [preloadProgress, setPreloadProgress] = useState({ done: 0, total: 0 });
  const blobUrlsToRevokeRef = useRef([]);
  const preloadRunIdRef = useRef(0);
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  // Do not sync timeLeft to durationMinutes in an effect — paper JSON loads async and would reset the timer mid-test.
  const [timeLeft, setTimeLeft] = useState(() => DEFAULT_DATA.durationMinutes * 60);
  const [recording, setRecording] = useState(null);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [mediaError, setMediaError] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [savedRecordingId, setSavedRecordingId] = useState(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [lightingOk, setLightingOk] = useState(false);
  const [detectionReady, setDetectionReady] = useState(false);
  const [showCompletionPopup, setShowCompletionPopup] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(null);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [seenQuestions, setSeenQuestions] = useState(() => new Set());
  const [flaggedQuestions, setFlaggedQuestions] = useState(() => new Set());
  const [timerWarning, setTimerWarning] = useState(null);
  /** Bumps after local progress cleared so resume eligibility recalculates from localStorage. */
  const [resumeTick, setResumeTick] = useState(0);
  /** After "Continue test", show remaining time on instructions before camera */
  const [resumeTimeLeftHint, setResumeTimeLeftHint] = useState(null);

  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const videoPreviewRef = useRef(null);
  const sidePreviewRef = useRef(null);
  const canvasRef = useRef(null);
  const faceOverlayRef = useRef(null);
  const timerRef = useRef(null);
  const detectionIntervalRef = useRef(null);
  const faceModelRef = useRef(null);
  const alert5MinRef = useRef(false);
  const alert1MinRef = useRef(false);
  const questionTimesRef = useRef([]);
  const questionStartTimeRef = useRef(null);
  const isMobileRef = useRef(false);
  const testStartTimeRef = useRef(null);
  const violationsRef = useRef([]);
  const visibilityHiddenAtRef = useRef(null);
  const noFaceCountRef = useRef(0);
  const mobileAlertShownRef = useRef(false);
  const initialViewportRef = useRef(null);
  const lastMobileCheckRef = useRef(false);
  const blurCountRef = useRef(0);
  const phoneInCameraModelRef = useRef(null);
  const lastPhoneFlagRef = useRef(0);
  /** Set true only after Apps Script recordTestStart returns success (so we retry on failure / backfill gate passcode). */
  const recordTestStartSucceededRef = useRef(false);
  const recordTestStartAttemptsRef = useRef(0);
  const [recordTestStartRetryKey, setRecordTestStartRetryKey] = useState(0);
  const permissionPrevFaceCountRef = useRef(0);
  const testPhasePrevFaceCountRef = useRef(0);
  /** Consumed once in startRecording to restore timer & start time after resume */
  const resumeForRecordingRef = useRef(null);
  /** Apps Script: one submissionKey for all 10‑min segments + final clip */
  const submissionKeyRef = useRef("");
  const recordingSegmentIndexRef = useRef(0);
  const segmentWallStartMsRef = useRef(0);
  const chunkUploadInProgressRef = useRef(false);
  const chunkedUploadPipelineDoneRef = useRef(false);
  const chunkedRecordingEnabledRef = useRef(false);
  const phaseRef = useRef(PHASE.REGISTRATION);
  const preEndFlushDoneRef = useRef(false);
  const flushRecordingSegmentRef = useRef(() => {});
  const recordingChunkStopHandlerRef = useRef(() => {});
  const latestChunkStopContextRef = useRef({
    studentName: "",
    studentEmail: "",
    studentPhone: "",
    studentClass: "",
    studentAdhar: "",
    title: "",
    questions: [],
    answers: {},
    seenIndices: [],
    flaggedIndices: [],
    durationMinutes: 120,
    maxMarks: null,
    readTimeMinutes: null,
    canComputeScore: false,
    score: null,
    gradedQuestionCount: null,
    answerKeyPresent: false,
  });
  /** Latest values for background autosave during TEST */
  const persistDataRef = useRef({});
  /** Skip student-details form when resuming saved in-progress test (same browser). */
  const resumeBootRef = useRef(false);
  /** Stem <img> — detect already-decoded (cached) images so we are not stuck with loading overflow */
  const stemImageElRef = useRef(null);

  const resumeEligibleSeconds = useMemo(() => {
    if (questions.length === 0 || typeof sessionStorage === "undefined") return 0;
    const paperId = sessionStorage.getItem(STORAGE_KEY_QUESTION_PAPER_ID) || "default";
    const testCode = sessionStorage.getItem(STORAGE_KEY_TEST_CODE) || "";
    const gatePw = readGatePasscodeForSession();
    const keyEmail = (studentEmail || "").trim().toLowerCase();
    const snap = keyEmail
      ? loadTestProgress(paperId, testCode, questions.length, keyEmail, gatePw)
      : findLatestTestProgressForPaperAndCode(paperId, testCode, questions.length, gatePw);
    return snap && snap.timeLeft > 0 ? snap.timeLeft : 0;
  }, [questions.length, resumeTick, studentEmail]);

  const currentQ = questions[currentIndex];
  const currentSectionPaletteLabel = useMemo(() => {
    const raw = (currentQ?.section && String(currentQ.section).trim()) || "";
    if (!raw) return "";
    const key = normalizeQuestionSection(raw);
    return paletteSectionDisplay(key, raw);
  }, [currentQ?.section]);
  const isMcq = currentQ?.type === "mcq";
  const hasQuestions = questions.length > 0;

  const paperIdForQuestionImages =
    typeof sessionStorage !== "undefined" ? (sessionStorage.getItem(STORAGE_KEY_QUESTION_PAPER_ID) || "").trim() : "";
  const stemImageSrc = useMemo(() => {
    if (!currentQ) return "";
    const override = stemSrcOverrideById[currentQ.id];
    if (override) return override;
    return resolveStemImageSrcForOnlineTest(currentQ, paperIdForQuestionImages, currentIndex);
  }, [currentQ, currentIndex, paperIdForQuestionImages, stemSrcOverrideById]);

  useEffect(() => {
    if (!stemImageSrc) {
      setStemImageLoaded(true);
      return;
    }
    setStemImageLoaded(false);
    const id = requestAnimationFrame(() => {
      const el = stemImageElRef.current;
      if (el && el.complete && el.naturalHeight > 0) {
        setStemImageLoaded(true);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [stemImageSrc, currentIndex]);

  useEffect(() => {
    return () => {
      preloadRunIdRef.current += 1;
      blobUrlsToRevokeRef.current.forEach((u) => {
        try {
          if (u && String(u).startsWith("blob:")) URL.revokeObjectURL(u);
        } catch {
          /* ignore */
        }
      });
      blobUrlsToRevokeRef.current = [];
    };
  }, []);

  const setAnswer = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };
  const normalizeAnswer = (q, value) => {
    if (q.type === "integer") {
      const n = parseInt(value, 10);
      return isNaN(n) ? null : n;
    }
    return value;
  };
  /** Question has a key for auto-scoring (uploaded ALLEN papers often have no key yet). */
  const hasGradedKey = (q) => {
    if (q.type === "integer") return q.answer !== undefined && q.answer !== null && !Number.isNaN(Number(q.answer));
    return q.answer !== undefined && q.answer !== null && String(q.answer).trim() !== "";
  };
  const isCorrect = (q) => {
    if (!hasGradedKey(q)) return false;
    if (q.type === "integer") {
      const raw = answers[q.id];
      const normalized = normalizeAnswer(q, raw);
      return normalized === q.answer;
    }
    if (q.type === "mcq") return isMcqAnswerCorrect(answers, q);
    return false;
  };
  const canComputeScore = answerKeyPresent === true;
  const gradedQuestions = canComputeScore ? questions.filter(hasGradedKey) : [];
  const score = canComputeScore ? gradedQuestions.filter(isCorrect).length : null;
  const gradedQuestionCount = canComputeScore ? gradedQuestions.length : null;

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    latestChunkStopContextRef.current = {
      studentName,
      studentEmail,
      studentPhone,
      studentClass,
      studentAdhar,
      title,
      questions,
      answers,
      seenIndices: Array.from(seenQuestions),
      flaggedIndices: Array.from(flaggedQuestions),
      durationMinutes,
      maxMarks,
      readTimeMinutes,
      canComputeScore,
      score,
      gradedQuestionCount,
      answerKeyPresent,
    };
  });

  const startMedia = useCallback(async () => {
    setMediaError(null);
    setFaceDetected(false);
    setLightingOk(false);
    setDetectionReady(false);
    try {
      // Lower resolution helps stay within ~100 MB/hr at low bitrate (recording only; preview still usable)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 480, max: 640 }, height: { ideal: 360, max: 480 } },
        audio: true,
      });
      streamRef.current = stream;
      setPhase(PHASE.PERMISSION);
    } catch (err) {
      setMediaError(err.message || "Camera/microphone access denied.");
    }
  }, []);

  useEffect(() => {
    if (phase !== PHASE.PERMISSION || !streamRef.current || !videoPreviewRef.current) return;
    const video = videoPreviewRef.current;
    video.srcObject = streamRef.current;
    video.play().catch(() => {});
  }, [phase]);

  useEffect(() => {
    if (phase !== PHASE.PERMISSION || !streamRef.current || !videoPreviewRef.current || !canvasRef.current || !faceOverlayRef.current) return;
    const video = videoPreviewRef.current;
    const canvas = canvasRef.current;
    const overlay = faceOverlayRef.current;
    const ctx = canvas.getContext("2d");
    let cancelled = false;

    // Lighting range valid for 480x360 and higher; slightly relaxed min for lower-res capture
    const LIGHT_MIN = 40;
    const LIGHT_MAX = 225;

    const toPoint = (p) => (Array.isArray(p) ? p : (p && p.dataSync ? Array.from(p.dataSync()) : [0, 0]));

    const drawFaceOverlay = (predictions) => {
      if (!overlay || !video || video.readyState < 2) return;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw < MIN_VIDEO_WIDTH || vh < MIN_VIDEO_HEIGHT) return;
      overlay.width = vw;
      overlay.height = vh;
      const oCtx = overlay.getContext("2d");
      oCtx.clearRect(0, 0, vw, vh);
      if (!Array.isArray(predictions) || predictions.length === 0) return;
      oCtx.strokeStyle = "rgba(0, 255, 100, 0.9)";
      oCtx.lineWidth = 3;
      for (const face of predictions) {
        const topLeft = toPoint(face.topLeft);
        const bottomRight = toPoint(face.bottomRight);
        const x = topLeft[0];
        const y = topLeft[1];
        const w = bottomRight[0] - x;
        const h = bottomRight[1] - y;
        const cx = x + w / 2;
        const cy = y + h / 2;
        const rx = w / 2;
        const ry = h / 2;
        oCtx.beginPath();
        oCtx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
        oCtx.stroke();
        oCtx.strokeStyle = "rgba(0, 255, 100, 0.6)";
        oCtx.strokeRect(x, y, w, h);
        oCtx.strokeStyle = "rgba(0, 255, 100, 0.9)";
      }
    };

    const runDetection = async () => {
      if (cancelled || video.readyState < 2) return;
      try {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (vw < MIN_VIDEO_WIDTH || vh < MIN_VIDEO_HEIGHT) return;
        canvas.width = vw;
        canvas.height = vh;
        ctx.drawImage(video, 0, 0);
        const imageData = ctx.getImageData(0, 0, vw, vh);
        const data = imageData.data;
        let sum = 0;
        const step = 4 * 10;
        for (let i = 0; i < data.length; i += step) {
          sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
        const avgBrightness = sum / Math.floor(data.length / step);
        const lighting = avgBrightness >= LIGHT_MIN && avgBrightness <= LIGHT_MAX;
        setLightingOk(lighting);

        if (faceModelRef.current) {
          const predictions = await faceModelRef.current.estimateFaces(video, false);
          const n = Array.isArray(predictions) ? predictions.length : 0;
          const prev = permissionPrevFaceCountRef.current;
          permissionPrevFaceCountRef.current = n;
          if (n > 1) {
            setFaceDetected(false);
            drawFaceOverlay(predictions);
            if (prev <= 1) {
              violationsRef.current.push({
                type: "multiple_faces",
                faceCount: n,
                message: "Two or more faces detected. Only one person is allowed to take the test.",
                timestamp: new Date().toISOString(),
                permissionPhase: true,
              });
            }
          } else if (n === 1) {
            setFaceDetected(true);
            drawFaceOverlay(predictions);
          } else {
            setFaceDetected(false);
            drawFaceOverlay([]);
          }
        } else {
          drawFaceOverlay([]);
        }
      } catch (e) {
        setFaceDetected(false);
        drawFaceOverlay([]);
      }
    };

    const interval = setInterval(async () => {
      await runDetection();
    }, 400);

    (async () => {
      try {
        const blazeface = await import("@tensorflow-models/blazeface");
        await import("@tensorflow/tfjs");
        faceModelRef.current = await blazeface.load();
        setDetectionReady(true);
      } catch (err) {
        console.warn("Face detection model failed to load:", err);
        setDetectionReady(true);
        setFaceDetected(true);
      }
      try {
        const coco = await import("@tensorflow-models/coco-ssd");
        if (coco.default) phoneInCameraModelRef.current = await coco.default.load();
      } catch (e) {
        console.warn("Phone-in-camera model preload failed:", e);
      }
    })();

    detectionIntervalRef.current = interval;
    return () => {
      cancelled = true;
      clearInterval(interval);
      detectionIntervalRef.current = null;
    };
  }, [phase]);

  const startRecording = useCallback(async () => {
    if (!streamRef.current) return;
    const resume = resumeForRecordingRef.current;
    resumeForRecordingRef.current = null;

    const runId = ++preloadRunIdRef.current;
    setIsPreloadingQuestionAssets(true);
    const figureTotal = questions.reduce((n, q, idx) => {
      return n + (resolveStemImageSrcForOnlineTest(q, paperIdForQuestionImages, idx) ? 1 : 0);
    }, 0);
    setPreloadProgress({ done: 0, total: figureTotal });
    try {
      const { idToSrc, blobUrlsToRevoke } = await preloadAllQuestionStemImages(
        questions,
        paperIdForQuestionImages,
        (done, total) => {
          if (preloadRunIdRef.current === runId) setPreloadProgress({ done, total });
        }
      );
      if (preloadRunIdRef.current !== runId) return;
      blobUrlsToRevokeRef.current.forEach((u) => {
        try {
          if (u && String(u).startsWith("blob:")) URL.revokeObjectURL(u);
        } catch {
          /* ignore */
        }
      });
      blobUrlsToRevokeRef.current = blobUrlsToRevoke;
      setStemSrcOverrideById(idToSrc);
    } catch (err) {
      console.warn("Preload question images failed, continuing with network URLs:", err);
      if (preloadRunIdRef.current === runId) setStemSrcOverrideById({});
    } finally {
      if (preloadRunIdRef.current === runId) setIsPreloadingQuestionAssets(false);
    }
    if (preloadRunIdRef.current !== runId) return;

    chunksRef.current = [];
    const uploadEnvUrl = getRecordingPostUrl();
    chunkedRecordingEnabledRef.current = isAppsScriptRecordingUrl(uploadEnvUrl);
    if (resume?.submissionKey && String(resume.submissionKey).trim()) {
      submissionKeyRef.current = String(resume.submissionKey).trim();
    } else {
      submissionKeyRef.current = `${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
    }
    recordingSegmentIndexRef.current = 0;
    segmentWallStartMsRef.current = Date.now();
    preEndFlushDoneRef.current = false;
    chunkedUploadPipelineDoneRef.current = false;
    // Target ~100 MB per hour: 100*8*1024*1024/3600 ≈ 233 kbps total → video 180 + audio 48
    const mr = new MediaRecorder(streamRef.current, {
      mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm",
      videoBitsPerSecond: 180000,
      audioBitsPerSecond: 48000,
    });
    mr.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    mr.onstop = () => {
      recordingChunkStopHandlerRef.current();
    };
    mr.start(2000);
    mediaRecorderRef.current = mr;
    setRecording(mr);
    testPhasePrevFaceCountRef.current = 0;

    isMobileRef.current = isMobileDevice();
    lastMobileCheckRef.current = isMobileRef.current;
    initialViewportRef.current = getViewportSize();
    noFaceCountRef.current = 0;
    blurCountRef.current = 0;
    visibilityHiddenAtRef.current = null;
    questionStartTimeRef.current = Date.now();

    if (resume && typeof resume.timeLeft === "number" && resume.timeLeft > 0) {
      setTimeLeft(resume.timeLeft);
      testStartTimeRef.current = typeof resume.testStartedAt === "number" ? resume.testStartedAt : Date.now();
      alert5MinRef.current = resume.timeLeft <= 300;
      alert1MinRef.current = resume.timeLeft <= 60;
      mobileAlertShownRef.current = true;
    } else {
      questionTimesRef.current = [];
      testStartTimeRef.current = Date.now();
      const permissionViolations = violationsRef.current.filter((v) => v && v.permissionPhase === true);
      violationsRef.current = permissionViolations.slice();
      setTimeLeft(durationMinutes * 60);
      alert5MinRef.current = false;
      alert1MinRef.current = false;
      mobileAlertShownRef.current = false;
    }

    setPhase(PHASE.TEST);
  }, [durationMinutes, questions, paperIdForQuestionImages]);

  useEffect(() => {
    if (phase === PHASE.REGISTRATION) {
      recordTestStartSucceededRef.current = false;
      recordTestStartAttemptsRef.current = 0;
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== PHASE.TEST) {
      if (phase !== PHASE.REGISTRATION) setSessionStartError("");
      return;
    }
    if (recordTestStartSucceededRef.current) return;
    if (recordTestStartAttemptsRef.current >= 5) {
      setSessionStartError(
        (prev) =>
          prev ||
          "Could not confirm your session on the server after several tries. Check your connection or refresh the page."
      );
      return;
    }
    const code = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(STORAGE_KEY_TEST_CODE) : null;
    const sec = (studentEmail || "").trim().toLowerCase();
    const gatePc = readGatePasscodeForSession();
    if (!code) return;
    if (!gatePc) {
      setSessionStartError(
        "This browser does not have your gate passcode. Go back to the test entry page, enter your test code and the same personal passcode you created, then open the test again."
      );
      return;
    }
    recordTestStartAttemptsRef.current += 1;
    const url = getRecordTestStartUrl(
      code,
      studentEmail || "",
      studentName || "",
      sec,
      studentClass || "",
      gatePc,
      gatePc
    );
    if (!url) return;
    let cancelled = false;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data && data.status === "success") {
          recordTestStartSucceededRef.current = true;
          setSessionStartError("");
        } else {
          setSessionStartError(
            typeof data?.message === "string" && data.message.trim()
              ? data.message
              : "Could not start your session on the server. Contact the organiser if this continues."
          );
          setRecordTestStartRetryKey((k) => k + 1);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSessionStartError("Network error while starting your session. Check your connection.");
          setRecordTestStartRetryKey((k) => k + 1);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [phase, studentEmail, studentName, studentClass, recordTestStartRetryKey]);

  useEffect(() => {
    if (phase !== PHASE.TEST) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleSubmit();
          return 0;
        }
        const next = prev - 1;
        if (prev === 300 && !alert5MinRef.current) {
          alert5MinRef.current = true;
          setTimerWarning("5min");
        }
        if (prev === 60 && !alert1MinRef.current) {
          alert1MinRef.current = true;
          setTimerWarning("1min");
        }
        if (
          prev === PRE_END_FLUSH_AT_SEC_LEFT &&
          chunkedRecordingEnabledRef.current &&
          !preEndFlushDoneRef.current
        ) {
          preEndFlushDoneRef.current = true;
          try {
            flushRecordingSegmentRef.current(false);
          } catch {
            /* ignore */
          }
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase]);

  useEffect(() => {
    if (phase === PHASE.TEST) setResumeTimeLeftHint(null);
  }, [phase]);

  useEffect(() => {
    persistDataRef.current = {
      timeLeft,
      answers,
      currentIndex,
      studentName,
      studentEmail,
      studentPhone,
      studentClass,
      studentAdhar,
      durationMinutes,
      questionCount: questions.length,
      seenIndices: Array.from(seenQuestions),
      flaggedIndices: Array.from(flaggedQuestions),
    };
  });

  useEffect(() => {
    if (phase !== PHASE.TEST) return;
    const paperId =
      typeof sessionStorage !== "undefined" ? sessionStorage.getItem(STORAGE_KEY_QUESTION_PAPER_ID) || "default" : "default";
    const testCode = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(STORAGE_KEY_TEST_CODE) || "" : "";
    const persist = () => {
      const d = persistDataRef.current;
      if (!d.questionCount) return;
      const secondaryCode = (d.studentEmail || "").trim().toLowerCase();
      const gatePw =
        typeof sessionStorage !== "undefined" ? (sessionStorage.getItem(STORAGE_KEY_GATE_PASSWORD) || "").trim() : "";
      saveTestProgress({
        paperId,
        testCode,
        gatePasscode: gatePw,
        secondaryCode,
        timeLeft: d.timeLeft,
        durationMinutes: d.durationMinutes,
        questionCount: d.questionCount,
        answers: d.answers,
        currentIndex: d.currentIndex,
        studentName: d.studentName,
        studentEmail: d.studentEmail,
        studentPhone: d.studentPhone,
        studentClass: d.studentClass,
        studentAdhar: d.studentAdhar,
        studentResumePassword: "",
        questionTimesSeconds: questionTimesRef.current.slice(),
        testStartedAt: testStartTimeRef.current,
        seenIndices: d.seenIndices,
        flaggedIndices: d.flaggedIndices,
        violations: violationsRef.current.slice(),
        submissionKey: submissionKeyRef.current || "",
      });
    };

    const persistToServer = () => {
      const d = persistDataRef.current;
      if (!d.questionCount) return;
      const secondaryCode = (d.studentEmail || "").trim().toLowerCase();
      const gatePw =
        typeof sessionStorage !== "undefined" ? (sessionStorage.getItem(STORAGE_KEY_GATE_PASSWORD) || "").trim() : "";
      if (!testCode || !gatePw || !secondaryCode) return;
      saveProgressToServer(testCode, gatePw, secondaryCode, {
        v: 1,
        savedAt: Date.now(),
        paperId,
        testCode: testCode.toUpperCase(),
        secondaryCode,
        timeLeft: Math.floor(d.timeLeft),
        durationMinutes: d.durationMinutes,
        questionCount: d.questionCount,
        answers: d.answers && typeof d.answers === "object" ? d.answers : {},
        currentIndex: Math.max(0, Math.floor(d.currentIndex || 0)),
        studentName: d.studentName || "",
        studentEmail: d.studentEmail || "",
        studentPhone: d.studentPhone || "",
        studentClass: d.studentClass || "",
        studentAdhar: d.studentAdhar || "",
        questionTimesSeconds: questionTimesRef.current.slice(),
        testStartedAt: testStartTimeRef.current,
        seenIndices: d.seenIndices,
        flaggedIndices: d.flaggedIndices,
        violations: violationsRef.current.slice(),
        submissionKey: submissionKeyRef.current || "",
      });
    };

    const id = setInterval(persist, 7000);
    const serverId = setInterval(persistToServer, 5 * 60 * 1000);
    window.addEventListener("pagehide", persist);
    window.addEventListener("beforeunload", persist);
    return () => {
      clearInterval(id);
      clearInterval(serverId);
      window.removeEventListener("pagehide", persist);
      window.removeEventListener("beforeunload", persist);
      persist();
      persistToServer();
    };
  }, [phase]);

  const flushRecordingSegment = useCallback((isFinal) => {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state !== "recording") return;
    /**
     * Bind "final" to THIS recorder instance — not a shared ref. Otherwise a late onstop from a
     * periodic segment can read isFinal=true after the student clicked submit, and wrongly run the
     * final-upload path (stops camera, ends chunks) while the exam should still be running.
     */
    try {
      mr.__adhyantFinalSegment = !!isFinal;
    } catch {
      /* ignore */
    }
    try {
      mr.stop();
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    flushRecordingSegmentRef.current = flushRecordingSegment;
  }, [flushRecordingSegment]);

  useEffect(() => {
    if (phase !== PHASE.TEST) return;
    if (!chunkedRecordingEnabledRef.current) return;
    const id = setInterval(() => {
      try {
        flushRecordingSegmentRef.current(false);
      } catch {
        /* ignore */
      }
    }, CHUNK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    const postPlain = (payload) => {
      const uploadUrl = getRecordingPostUrl();
      if (!uploadUrl) return Promise.resolve();
      return fetch(uploadUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload),
      });
    };

    recordingChunkStopHandlerRef.current = () => {
      const uploadUrl = getRecordingPostUrl();
      const stoppedMr = mediaRecorderRef.current;
      const finalStop = !!(stoppedMr && stoppedMr.__adhyantFinalSegment);
      if (stoppedMr) {
        try {
          delete stoppedMr.__adhyantFinalSegment;
        } catch {
          try {
            stoppedMr.__adhyantFinalSegment = false;
          } catch {
            /* ignore */
          }
        }
      }

      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const streamNow = streamRef.current;
      const useChunk = chunkedRecordingEnabledRef.current && !!uploadUrl;

      if (!useChunk) {
        if (blob.size) setRecordedBlob(blob);
        else setRecordedBlob(null);
        if (streamNow) {
          streamNow.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        return;
      }

      const segStart = segmentWallStartMsRef.current;
      const segEnd = Date.now();
      const segIdx = recordingSegmentIndexRef.current;
      const submissionKey = submissionKeyRef.current;
      const ctx = latestChunkStopContextRef.current;
      const testCode =
        typeof sessionStorage !== "undefined" ? sessionStorage.getItem(STORAGE_KEY_TEST_CODE) || "" : "";
      const questionPaperId =
        typeof sessionStorage !== "undefined" ? sessionStorage.getItem(STORAGE_KEY_QUESTION_PAPER_ID) || undefined : undefined;
      const sessionSecondary = (ctx.studentEmail || "").trim().toLowerCase();
      const gatePasscodeMeta = readGatePasscodeForSession();
      const chunkFilePrefix = buildChunkUploadPrefix(ctx.studentName, gatePasscodeMeta);
      const { snapshotFileName, videoFileName } = buildChunkFileBaseNames(segStart, segEnd, chunkFilePrefix);

      const answersByQuestionId = {};
      ctx.questions.forEach((q) => {
        const v = ctx.answers[q.id];
        if (v !== undefined && v !== "") answersByQuestionId[q.id] = v;
      });
      const answersDetailed = buildAnswersDetailedSnapshot(ctx.questions, ctx.answers);
      const answersAttemptedCount = ctx.questions.filter(
        (q) => ctx.answers[q.id] !== undefined && ctx.answers[q.id] !== ""
      ).length;

      const buildMeta = (chunkPhaseStr) => {
        const qtSlice = questionTimesRef.current.slice();
        const timeSpentMeta = buildQuestionTimeSpentMaps(ctx.questions, qtSlice);
        const engagementMeta = buildQuestionEngagementPayload(
          ctx.questions,
          ctx.answers,
          ctx.seenIndices || [],
          ctx.flaggedIndices || []
        );
        const base = {
          studentName: (ctx.studentName || "").trim(),
          studentEmail: (ctx.studentEmail || "").trim(),
          studentPhone: (ctx.studentPhone || "").trim().replace(/\s/g, ""),
          studentClass: (ctx.studentClass || "").trim(),
          studentAdhar: (ctx.studentAdhar || "").trim().replace(/\s/g, ""),
          questionTimesSeconds: qtSlice,
          ...timeSpentMeta,
          ...engagementMeta,
          isMobile: isMobileRef.current,
          events: violationsRef.current.slice(),
          activityEvents: violationsRef.current.slice(),
          score: ctx.canComputeScore ? ctx.score : null,
          gradedQuestionCount: ctx.canComputeScore ? ctx.gradedQuestionCount : null,
          answerKeyPresent: false,
          scoringMode: "metadata_only",
          paperSource: "local_questions",
          questionPaperId,
          answersAttemptedCount,
          totalQuestions: ctx.questions.length,
          durationMinutes: ctx.durationMinutes,
          submittedAt: new Date().toISOString(),
          testStartedAt: testStartTimeRef.current ? new Date(testStartTimeRef.current).toISOString() : null,
          testCode: testCode || undefined,
          secondaryCode: sessionSecondary || undefined,
          gatePasscode: gatePasscodeMeta || undefined,
          submissionKey,
          answersByQuestionId,
          answersDetailed,
          paperTitle: ctx.title,
          testSessionPayload: {
            answersByQuestionId,
            answersDetailed,
            questionTimesSeconds: qtSlice,
            ...timeSpentMeta,
            ...engagementMeta,
            activityEvents: violationsRef.current.slice(),
          },
          chunkedUpload: true,
          chunkPhase: chunkPhaseStr,
          segmentIndex: segIdx,
          segmentStartedAt: new Date(segStart).toISOString(),
          segmentEndedAt: new Date(segEnd).toISOString(),
          snapshotFileName,
        };
        if (ctx.maxMarks != null && !Number.isNaN(ctx.maxMarks)) base.maxMarks = ctx.maxMarks;
        if (ctx.readTimeMinutes != null && !Number.isNaN(ctx.readTimeMinutes)) base.readTimeMinutes = ctx.readTimeMinutes;
        return base;
      };

      const videoMetaSmall = {
        studentName: (ctx.studentName || "").trim(),
        studentEmail: (ctx.studentEmail || "").trim(),
        studentAdhar: (ctx.studentAdhar || "").trim().replace(/\s/g, ""),
        studentPhone: (ctx.studentPhone || "").trim().replace(/\s/g, ""),
        studentClass: (ctx.studentClass || "").trim(),
        testCode: testCode || undefined,
        secondaryCode: sessionSecondary || undefined,
      };

      const attachNewSegment = () => {
        const s = streamRef.current;
        if (!s || phaseRef.current !== PHASE.TEST) return;
        chunksRef.current = [];
        try {
          const mr = new MediaRecorder(s, {
            mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm",
            videoBitsPerSecond: 180000,
            audioBitsPerSecond: 48000,
          });
          mr.ondataavailable = (e) => {
            if (e.data.size) chunksRef.current.push(e.data);
          };
          mr.onstop = () => recordingChunkStopHandlerRef.current();
          mr.start(2000);
          mediaRecorderRef.current = mr;
          setRecording(mr);
        } catch {
          /* ignore */
        }
      };

      if (!finalStop) {
        if (blob.size === 0) {
          segmentWallStartMsRef.current = Date.now();
          attachNewSegment();
          return;
        }
        const metaPeriodic = buildMeta("periodic");
        const segIdxForUpload = segIdx;
        recordingSegmentIndexRef.current = segIdx + 1;
        segmentWallStartMsRef.current = Date.now();
        /** Resume recording immediately; metadata/video upload does not block the student UI or the next segment. */
        attachNewSegment();
        const uploadBlob = blob;
        queueMicrotask(() => {
          try {
            postPlain({ action: "submitTestMetadata", submissionKey, metadata: metaPeriodic });
          } catch {
            /* ignore */
          }
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const base64 = typeof reader.result === "string" ? reader.result.split(",")[1] : "";
              postPlain({
                action: "submitTestVideo",
                submissionKey,
                chunkedUpload: true,
                isLastChunk: false,
                videoFileName,
                chunkSegmentIndex: segIdxForUpload,
                videoBase64: base64,
                metadata: videoMetaSmall,
              });
            } catch {
              /* ignore */
            }
          };
          reader.onerror = () => {};
          reader.readAsDataURL(uploadBlob);
        });
        return;
      }

      if (blob.size) setRecordedBlob(blob);
      else setRecordedBlob(null);
      chunkedUploadPipelineDoneRef.current = true;
      setUploadStatus("uploading");
      chunkUploadInProgressRef.current = true;
      const metaFinal = buildMeta("final");
      postPlain({ action: "submitTestMetadata", submissionKey, metadata: metaFinal });
      if (blob.size === 0) {
        chunkUploadInProgressRef.current = false;
        setUploadStatus("uploaded");
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        return;
      }
      const reader2 = new FileReader();
      reader2.onload = () => {
        const base64 = typeof reader2.result === "string" ? reader2.result.split(",")[1] : "";
        postPlain({
          action: "submitTestVideo",
          submissionKey,
          chunkedUpload: true,
          isLastChunk: true,
          videoFileName,
          chunkSegmentIndex: segIdx,
          videoBase64: base64,
          metadata: videoMetaSmall,
        });
        chunkUploadInProgressRef.current = false;
        setUploadStatus("uploaded");
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
      };
      reader2.onerror = () => {
        chunkUploadInProgressRef.current = false;
        setUploadStatus("upload_failed");
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
      };
      reader2.readAsDataURL(blob);
    };
  }, [setRecordedBlob, setRecording, setUploadStatus]);

  useEffect(() => {
    if (phase !== PHASE.TEST || !streamRef.current || !sidePreviewRef.current) return;
    sidePreviewRef.current.srcObject = streamRef.current;
    sidePreviewRef.current.play().catch(() => {});
    if (isMobileRef.current && !mobileAlertShownRef.current) {
      mobileAlertShownRef.current = true;
      violationsRef.current.push({ type: "mobile_device_at_start", timestamp: new Date().toISOString() });
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== PHASE.TEST) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        visibilityHiddenAtRef.current = Date.now();
      } else {
        if (visibilityHiddenAtRef.current != null) {
          const durationSec = (Date.now() - visibilityHiddenAtRef.current) / 1000;
          const ev = {
            type: durationSec >= 10 ? "away_from_screen" : "tab_switched_brief",
            durationSeconds: Math.round(durationSec),
            timestamp: new Date().toISOString(),
          };
          violationsRef.current.push(ev);
          visibilityHiddenAtRef.current = null;
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [phase]);

  useEffect(() => {
    if (phase !== PHASE.TEST) return;
    setSeenQuestions((prev) => new Set(prev).add(currentIndex));
  }, [phase]);

  useEffect(() => {
    if (phase !== PHASE.TEST || !streamRef.current || !sidePreviewRef.current) return;
    let cancelled = false;
    const FACE_INTERVAL_MS = 800;
    let mobileCheckTicks = 0;
    let phoneCheckTicks = 0;
    (async () => {
      try {
        const coco = await import("@tensorflow-models/coco-ssd");
        if (!coco.default) return;
        await import("@tensorflow/tfjs");
        phoneInCameraModelRef.current = await coco.default.load();
      } catch (e) {
        console.warn("Phone-in-camera model failed to load:", e);
      }
    })();
    const interval = setInterval(async () => {
      if (cancelled) return;
      const video = sidePreviewRef.current;
      if (!video) return;

      mobileCheckTicks += 1;
      if (mobileCheckTicks >= 2) {
        mobileCheckTicks = 0;
        const currentlyMobile = isMobileDevice();
        if (currentlyMobile && !lastMobileCheckRef.current) {
          const ev = { type: "mobile_detected_during_test", timestamp: new Date().toISOString() };
          violationsRef.current.push(ev);
        }
        lastMobileCheckRef.current = currentlyMobile;
        isMobileRef.current = currentlyMobile;
      }

      const videoReady = video.readyState >= 1 && video.videoWidth >= MIN_VIDEO_WIDTH && video.videoHeight >= MIN_VIDEO_HEIGHT;
      if (faceModelRef.current && videoReady) {
        try {
          const predictions = await faceModelRef.current.estimateFaces(video, false);
          const n = Array.isArray(predictions) ? predictions.length : 0;
          const prevN = testPhasePrevFaceCountRef.current;
          testPhasePrevFaceCountRef.current = n;
          if (n > 1) {
            noFaceCountRef.current = 0;
            if (prevN <= 1) {
              violationsRef.current.push({
                type: "multiple_faces",
                faceCount: n,
                message: "Two or more faces detected. Only one person is allowed to take the test.",
                timestamp: new Date().toISOString(),
              });
            }
          } else if (n === 1) {
            noFaceCountRef.current = 0;
          } else {
            noFaceCountRef.current = (noFaceCountRef.current || 0) + 1;
            if (noFaceCountRef.current >= 4) {
              noFaceCountRef.current = 0;
              const ev = { type: "looked_away", timestamp: new Date().toISOString() };
              violationsRef.current.push(ev);
            }
          }
        } catch (e) {
          noFaceCountRef.current = (noFaceCountRef.current || 0) + 1;
          if (noFaceCountRef.current >= 5) {
            noFaceCountRef.current = 0;
            const ev = { type: "looked_away", timestamp: new Date().toISOString() };
            violationsRef.current.push(ev);
          }
        }
      }

      if (phoneInCameraModelRef.current && videoReady) {
        phoneCheckTicks += 1;
        if (phoneCheckTicks >= 3) {
          phoneCheckTicks = 0;
          try {
            const predictions = await phoneInCameraModelRef.current.detect(video, 20, 0.25);
            const isPhoneClass = (cls) => (cls && String(cls).toLowerCase().replace(/\s+/g, " ") === "cell phone");
            const hasPhone = predictions.some((p) => isPhoneClass(p.class) && p.score >= 0.35);
            const hasLaptop = predictions.some((p) => p.class && String(p.class).toLowerCase() === "laptop" && p.score >= 0.3);
            const suspicious = hasPhone || hasLaptop;
            if (suspicious && Date.now() - lastPhoneFlagRef.current > 5000) {
              lastPhoneFlagRef.current = Date.now();
              const ev = { type: "phone_in_camera", device: hasPhone ? "cell phone" : "laptop", timestamp: new Date().toISOString() };
              violationsRef.current.push(ev);
            }
          } catch (e) {}
        }
      }
    }, FACE_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== PHASE.TEST) return;
    const onBlur = () => {
      blurCountRef.current += 1;
      const ev = { type: "window_blur", count: blurCountRef.current, timestamp: new Date().toISOString() };
      violationsRef.current.push(ev);
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [phase]);

  useEffect(() => {
    if (phase !== PHASE.TEST) return;
    const onResize = () => {
      const { w, h } = getViewportSize();
      const initial = initialViewportRef.current;
      if (w <= 480 || h <= 480) {
        const ev = { type: "viewport_resized_small", width: w, height: h, timestamp: new Date().toISOString() };
        violationsRef.current.push(ev);
      } else if (initial && ((initial.w > 768 && w <= 768) || (initial.h > 768 && h <= 768))) {
        const ev = { type: "viewport_resized_to_mobile_size", width: w, height: h, timestamp: new Date().toISOString() };
        violationsRef.current.push(ev);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase]);

  useEffect(() => {
    if (phase !== PHASE.TEST) return;
    const preventAndFlag = (e, action) => {
      e.preventDefault();
      const ev = { type: action, timestamp: new Date().toISOString() };
      violationsRef.current.push(ev);
    };
    const onCopy = (e) => preventAndFlag(e, "copy_attempt");
    const onCut = (e) => preventAndFlag(e, "cut_attempt");
    const onPaste = (e) => preventAndFlag(e, "paste_attempt");
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
    };
  }, [phase]);

  const handleSubmit = useCallback(() => {
    if (typeof sessionStorage !== "undefined") {
      const paperId = sessionStorage.getItem(STORAGE_KEY_QUESTION_PAPER_ID) || "default";
      const testCode = sessionStorage.getItem(STORAGE_KEY_TEST_CODE) || "";
      const secondaryCode = (studentEmail || "").trim().toLowerCase();
      const gatePw = readGatePasscodeForSession();
      clearTestProgress(paperId, testCode, secondaryCode, gatePw);
      clearProgressOnServer(testCode, gatePw, secondaryCode);
      sessionStorage.setItem(STORAGE_KEY_ALREADY_SUBMITTED, "1");
      const gp = readGatePasscodeForSession();
      if (testCode && gp) {
        markGatePairSubmittedLocally(testCode, gp);
      }
    }
    setResumeTick((t) => t + 1);
    if (questionStartTimeRef.current != null && currentIndex >= 0 && currentIndex < questions.length) {
      const elapsed = (Date.now() - questionStartTimeRef.current) / 1000;
      const times = questionTimesRef.current;
      times[currentIndex] = elapsed;
    }
    const mrSubmit = mediaRecorderRef.current;
    if (mrSubmit && mrSubmit.state === "recording") {
      try {
        mrSubmit.__adhyantFinalSegment = true;
      } catch {
        /* ignore */
      }
      try {
        mrSubmit.stop();
      } catch {
        /* ignore */
      }
    }
    setPhase(PHASE.RESULT);
    setRecording(null);
  }, [currentIndex, questions.length, studentEmail]);

  const savedOnceRef = useRef(false);
  const redirectedAfterSubmitRef = useRef(false);
  /** After feedback: 5 → 1 then redirect (null = not started yet). */
  const [postFeedbackRedirectSeconds, setPostFeedbackRedirectSeconds] = useState(null);
  const postFeedbackRedirectStartedRef = useRef(false);

  const clearSessionAndGoHome = useCallback(() => {
    if (redirectedAfterSubmitRef.current) return;
    redirectedAfterSubmitRef.current = true;
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(STORAGE_KEY_TEST_CODE);
        sessionStorage.removeItem(STORAGE_KEY_GATE_PASSWORD);
        sessionStorage.removeItem(STORAGE_KEY_QUESTION_PAPER_ID);
        sessionStorage.removeItem(STORAGE_KEY_ALREADY_SUBMITTED);
      }
    } catch {
      /* ignore */
    }
    navigate("/");
  }, [navigate]);

  /**
   * After student submits feedback: when upload has finished (or no recording), start 5s countdown then go home.
   */
  useEffect(() => {
    if (phase !== PHASE.RESULT) {
      postFeedbackRedirectStartedRef.current = false;
      setPostFeedbackRedirectSeconds(null);
      return;
    }
    if (!feedbackSubmitted) {
      postFeedbackRedirectStartedRef.current = false;
      setPostFeedbackRedirectSeconds(null);
      return;
    }
    if (redirectedAfterSubmitRef.current) return;

    const uploadSettled =
      !recordedBlob ||
      uploadStatus === "uploaded" ||
      uploadStatus === "local_only" ||
      uploadStatus === "upload_failed" ||
      uploadStatus === "save_failed";
    if (!uploadSettled) return;
    if (recordedBlob && (uploadStatus === null || uploadStatus === "uploading")) return;

    if (!postFeedbackRedirectStartedRef.current) {
      postFeedbackRedirectStartedRef.current = true;
      setPostFeedbackRedirectSeconds(5);
    }
  }, [phase, feedbackSubmitted, recordedBlob, uploadStatus]);

  useEffect(() => {
    if (postFeedbackRedirectSeconds === null) return;
    if (postFeedbackRedirectSeconds <= 0) {
      clearSessionAndGoHome();
      return;
    }
    const t = setTimeout(() => {
      setPostFeedbackRedirectSeconds((s) => (s == null ? null : s - 1));
    }, 1000);
    return () => clearTimeout(t);
  }, [postFeedbackRedirectSeconds, clearSessionAndGoHome]);

  useEffect(() => {
    if (phase !== PHASE.RESULT || savedOnceRef.current) return;
    if (chunkedUploadPipelineDoneRef.current) {
      savedOnceRef.current = true;
      if (recordedBlob) {
        import("../../utils/recordingDb")
          .then(({ saveRecording }) =>
            saveRecording({
              blob: recordedBlob,
              score: canComputeScore ? score : null,
              totalQuestions: questions.length,
              durationMinutes,
            })
          )
          .then((id) => {
            if (id != null) setSavedRecordingId(id);
          })
          .catch(() => {});
      }
      return;
    }
    if (!recordedBlob) return;
    savedOnceRef.current = true;
    const uploadUrl = import.meta.env.NEXT_PUBLIC_RECORDING_UPLOAD_URL || import.meta.env.VITE_RECORDING_UPLOAD_URL || import.meta.env.VITE_TEST_SUBMISSION_URL;
    const testCode = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(STORAGE_KEY_TEST_CODE) : null;
    const questionPaperId =
      typeof sessionStorage !== "undefined" ? sessionStorage.getItem(STORAGE_KEY_QUESTION_PAPER_ID) || undefined : undefined;
    const sessionSecondary = (studentEmail || "").trim().toLowerCase();
    const gatePasscodeMeta = readGatePasscodeForSession();
    const answersAttemptedCount = questions.filter(
      (q) => answers[q.id] !== undefined && answers[q.id] !== ""
    ).length;
    const qtForMeta = Array.isArray(questionTimesRef.current) ? questionTimesRef.current.slice() : [];
    const timeSpentMetaSubmit = buildQuestionTimeSpentMaps(questions, qtForMeta);
    const engagementMetaSubmit = buildQuestionEngagementPayload(questions, answers, seenQuestions, flaggedQuestions);
    const metadata = {
      studentName: (studentName || "").trim(),
      studentEmail: (studentEmail || "").trim(),
      studentPhone: (studentPhone || "").trim().replace(/\s/g, ""),
      studentClass: (studentClass || "").trim(),
      studentAdhar: (studentAdhar || "").trim().replace(/\s/g, ""),
      questionTimesSeconds: qtForMeta,
      ...timeSpentMetaSubmit,
      ...engagementMetaSubmit,
      isMobile: isMobileRef.current,
      /** Proctoring / integrity signals (tab blur, copy, resize, face, etc.) */
      events: violationsRef.current,
      activityEvents: violationsRef.current,
      score: canComputeScore ? score : null,
      gradedQuestionCount: canComputeScore ? gradedQuestionCount : null,
      answerKeyPresent: false,
      scoringMode: "metadata_only",
      paperSource: "local_questions",
      questionPaperId,
      answersAttemptedCount,
      totalQuestions: questions.length,
      durationMinutes,
      submittedAt: new Date().toISOString(),
      testStartedAt: testStartTimeRef.current ? new Date(testStartTimeRef.current).toISOString() : null,
      testCode: testCode || undefined,
      secondaryCode: sessionSecondary || undefined,
      gatePasscode: gatePasscodeMeta || undefined,
    };
    const answersByQuestionId = {};
    questions.forEach((q) => {
      const v = answers[q.id];
      if (v !== undefined && v !== "") answersByQuestionId[q.id] = v;
    });
    const answersDetailed = questions.map((q) => {
      const sel = answers[q.id] !== undefined && answers[q.id] !== "" ? answers[q.id] : null;
      let selectedChoice = null;
      let selectedOptionText = null;
      if (q.type === "mcq" && sel != null) {
        const s = String(sel).trim();
        const opts = Array.isArray(q.options) ? q.options : [];
        if (/^[1-4]$/.test(s)) {
          selectedChoice = s;
          const i = parseInt(s, 10) - 1;
          if (opts[i] != null) selectedOptionText = String(opts[i]);
        } else {
          const i = opts.findIndex((o) => String(o).trim() === s);
          if (i >= 0) {
            selectedChoice = String(i + 1);
            selectedOptionText = String(opts[i]);
          }
        }
      }
      return {
        questionId: q.id,
        paperQuestionNum: q.paperQuestionNum ?? null,
        section: q.section || null,
        type: q.type,
        selected: sel,
        selectedChoice,
        selectedOptionText,
      };
    });

    const runLocalSave = () =>
      import("../../utils/recordingDb")
        .then(({ saveRecording }) =>
          saveRecording({
            blob: recordedBlob,
            score: canComputeScore ? score : null,
            totalQuestions: questions.length,
            durationMinutes,
          })
        )
        .then((id) => setSavedRecordingId(id));

    if (!uploadUrl) {
      setUploadStatus("local_only");
      runLocalSave().catch(() => {});
      return;
    }

    setUploadStatus("uploading");
    const isAppsScript = /script\.google\.com|google\.com\/macos\/script/i.test(uploadUrl);

    if (isAppsScript) {
      const submissionKey = `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
      const fullMeta = {
        ...metadata,
        submissionKey,
        answersByQuestionId,
        answersDetailed,
        paperTitle: title,
        testSessionPayload: {
          answersByQuestionId,
          answersDetailed,
          questionTimesSeconds: qtForMeta,
          ...timeSpentMetaSubmit,
          ...engagementMetaSubmit,
          activityEvents: violationsRef.current,
        },
        ...(maxMarks != null && !Number.isNaN(maxMarks) ? { maxMarks } : {}),
        ...(readTimeMinutes != null && !Number.isNaN(readTimeMinutes) ? { readTimeMinutes } : {}),
      };
      const postPlain = (payload) =>
        fetch(uploadUrl, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify(payload),
        });
      postPlain({ action: "submitTestMetadata", submissionKey, metadata: fullMeta }).catch(() => {});
      const vReader = new FileReader();
      vReader.onload = () => {
        const base64 = typeof vReader.result === "string" ? vReader.result.split(",")[1] : "";
        postPlain({
          action: "submitTestVideo",
          submissionKey,
          videoBase64: base64,
          metadata: {
            studentName: metadata.studentName,
            studentEmail: metadata.studentEmail,
            studentAdhar: metadata.studentAdhar,
            studentPhone: metadata.studentPhone,
            studentClass: metadata.studentClass,
            testCode: metadata.testCode,
            secondaryCode: metadata.secondaryCode,
          },
        })
          .then(() => setUploadStatus("uploaded"))
          .catch(() => setUploadStatus("upload_failed"));
      };
      vReader.onerror = () => setUploadStatus("upload_failed");
      vReader.readAsDataURL(recordedBlob);
      runLocalSave().catch(() => setUploadStatus("save_failed"));
      return;
    }

    const runUpload = (zipBlob) => {
      const formData = new FormData();
      formData.append("zip", zipBlob, `test-${metadata.studentName.replace(/\s+/g, "-")}-${Date.now()}.zip`);
      const zipMeta = {
        ...metadata,
        answersByQuestionId,
        answersDetailed,
        paperTitle: title,
        testSessionPayload: {
          answersByQuestionId,
          answersDetailed,
          questionTimesSeconds: qtForMeta,
          ...timeSpentMetaSubmit,
          ...engagementMetaSubmit,
          activityEvents: violationsRef.current,
        },
      };
      formData.append("metadata", JSON.stringify(zipMeta));
      fetch(uploadUrl, { method: "POST", body: formData })
        .then(() => setUploadStatus("uploaded"))
        .catch(() => setUploadStatus("upload_failed"));
    };
    import("jszip")
      .then(({ default: JSZip }) => {
        const zip = new JSZip();
        zip.file("recording.webm", recordedBlob);
        zip.file(
          "metadata.json",
          JSON.stringify(
            {
              ...metadata,
              answersByQuestionId,
              answersDetailed,
              paperTitle: title,
              testSessionPayload: {
                answersByQuestionId,
                answersDetailed,
                questionTimesSeconds: qtForMeta,
                ...timeSpentMetaSubmit,
                ...engagementMetaSubmit,
                activityEvents: violationsRef.current,
              },
            },
            null,
            2
          )
        );
        return zip.generateAsync({ type: "blob" });
      })
      .then((zipBlob) => {
        runUpload(zipBlob);
        return runLocalSave();
      })
      .catch(() => setUploadStatus("save_failed"));
  }, [
    phase,
    recordedBlob,
    score,
    gradedQuestionCount,
    durationMinutes,
    questions,
    answers,
    title,
    maxMarks,
    readTimeMinutes,
    studentName,
    studentEmail,
    studentPhone,
    studentClass,
    studentAdhar,
    canComputeScore,
    answerKeyPresent,
  ]);

  /** Live countdown for header / resume: m:ss or h:mm:ss */
  const formatTimeCountdown = (totalSeconds) => {
    const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n) => String(n).padStart(2, "0");
    if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
    return `${m}:${pad(sec)}`;
  };

  const applySnapshot = useCallback((snap) => {
    if (!snap || snap.timeLeft <= 0) return false;
    if (typeof snap.questionCount === "number" && questions.length > 0 && snap.questionCount !== questions.length) return false;
    setStudentName(snap.studentName || "");
    setStudentEmail(snap.studentEmail || "");
    setStudentPhone(snap.studentPhone || "");
    setStudentClass(snap.studentClass || "");
    setStudentAdhar(snap.studentAdhar || "");
    setAnswers(snap.answers && typeof snap.answers === "object" ? { ...snap.answers } : {});
    const idx = Math.max(0, Math.min(Math.floor(snap.currentIndex || 0), questions.length - 1));
    setCurrentIndex(idx);
    const qt = Array.isArray(snap.questionTimesSeconds) ? [...snap.questionTimesSeconds] : [];
    while (qt.length < questions.length) qt.push(undefined);
    questionTimesRef.current = qt.slice(0, questions.length);
    violationsRef.current = Array.isArray(snap.violations) ? snap.violations.slice() : [];
    const startedAt = typeof snap.testStartedAt === "number" ? snap.testStartedAt : Date.now();
    testStartTimeRef.current = startedAt;
    resumeForRecordingRef.current = {
      timeLeft: snap.timeLeft,
      testStartedAt: startedAt,
      submissionKey: typeof snap.submissionKey === "string" ? snap.submissionKey : "",
    };
    setSeenQuestions(new Set(Array.isArray(snap.seenIndices) && snap.seenIndices.length ? snap.seenIndices : [idx]));
    setFlaggedQuestions(new Set(Array.isArray(snap.flaggedIndices) ? snap.flaggedIndices : []));
    setResumeTimeLeftHint(snap.timeLeft);
    setRegistrationError("");
    setPhase(PHASE.INSTRUCTIONS);
    return true;
  }, [questions.length]);

  const handleResumeFromSnapshot = useCallback(() => {
    if (typeof sessionStorage === "undefined" || questions.length === 0) return;
    const paperId = sessionStorage.getItem(STORAGE_KEY_QUESTION_PAPER_ID) || "default";
    const testCode = sessionStorage.getItem(STORAGE_KEY_TEST_CODE) || "";
    const keyEmail = (studentEmail || "").trim().toLowerCase();
    const gatePw = readGatePasscodeForSession();
    let snap = keyEmail
      ? loadTestProgress(paperId, testCode, questions.length, keyEmail, gatePw)
      : findLatestTestProgressForPaperAndCode(paperId, testCode, questions.length, gatePw);
    if (snap && snap.timeLeft > 0) {
      if (applySnapshot(snap)) return;
    }
    // No local snapshot — try server (cross-device resume)
    if (keyEmail && testCode && gatePw) {
      loadProgressFromServer(testCode, gatePw, keyEmail).then((serverSnap) => {
        if (serverSnap && serverSnap.timeLeft > 0) {
          applySnapshot(serverSnap);
        } else {
          resumeBootRef.current = false;
        }
      });
    } else {
      resumeBootRef.current = false;
    }
  }, [questions.length, studentEmail, applySnapshot]);

  useLayoutEffect(() => {
    if (phase !== PHASE.REGISTRATION) return;
    if (!questions.length) return;
    if (resumeBootRef.current) return;
    if (typeof sessionStorage === "undefined") return;
    const paperId = sessionStorage.getItem(STORAGE_KEY_QUESTION_PAPER_ID) || "default";
    const testCode = sessionStorage.getItem(STORAGE_KEY_TEST_CODE) || "";
    const keyEmail = (studentEmail || "").trim().toLowerCase();
    const gatePw = readGatePasscodeForSession();
    // Check local first
    let snapPre = keyEmail
      ? loadTestProgress(paperId, testCode, questions.length, keyEmail, gatePw)
      : findLatestTestProgressForPaperAndCode(paperId, testCode, questions.length, gatePw);
    if (snapPre && snapPre.timeLeft > 0) {
      resumeBootRef.current = true;
      handleResumeFromSnapshot();
      return;
    }
    // No local snapshot — check server for cross-device resume
    if (keyEmail && testCode && gatePw) {
      resumeBootRef.current = true;
      loadProgressFromServer(testCode, gatePw, keyEmail).then((serverSnap) => {
        if (serverSnap && serverSnap.timeLeft > 0) {
          applySnapshot(serverSnap);
        } else {
          resumeBootRef.current = false;
        }
      });
    }
  }, [phase, questions.length, resumeEligibleSeconds, handleResumeFromSnapshot, studentEmail, applySnapshot]);

  const goToQuestion = (index) => {
    if (index < 0 || index >= questions.length) return;
    if (questionStartTimeRef.current != null && currentIndex >= 0 && currentIndex < questions.length) {
      const elapsed = (Date.now() - questionStartTimeRef.current) / 1000;
      const times = questionTimesRef.current;
      times[currentIndex] = elapsed;
    }
    questionStartTimeRef.current = Date.now();
    setCurrentIndex(index);
    setSeenQuestions((prev) => new Set(prev).add(index));
  };

  const toggleFlagCurrent = () => {
    setFlaggedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(currentIndex)) next.delete(currentIndex);
      else next.add(currentIndex);
      return next;
    });
  };

  const validateRegistration = () => {
    const name = (studentName || "").trim();
    const email = (studentEmail || "").trim();
    const phone = (studentPhone || "").trim().replace(/\s/g, "");
    const adhar = (studentAdhar || "").trim().replace(/\s/g, "");
    if (!name) {
      setRegistrationError("Please enter your full name.");
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setRegistrationError("Please enter a valid email address.");
      return false;
    }
    if (!/^\d{10}$/.test(phone)) {
      setRegistrationError("Please enter a valid 10-digit contact number.");
      return false;
    }
    if (!(studentClass || "").trim()) {
      setRegistrationError("Please select your class / grade from the list.");
      return false;
    }
    if (!/^\d{12}$/.test(adhar)) {
      setRegistrationError("Aadhaar must be 12 digits.");
      return false;
    }
    setRegistrationError("");
    return true;
  };

  const handleContinueFromRegistration = async () => {
    if (!validateRegistration()) return;
    const code = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(STORAGE_KEY_TEST_CODE) || "" : "";
    if (!code) {
      setRegistrationError("Session expired. Open the test again from the menu and enter your test code and gate password.");
      return;
    }
    const gatePw = typeof sessionStorage !== "undefined" ? (sessionStorage.getItem(STORAGE_KEY_GATE_PASSWORD) || "").trim() : "";
    if (!gatePw) {
      setRegistrationError("Session expired. Open the test again from the menu and enter your test code and gate password.");
      return;
    }
    const url = getValidateCodeUrl(code, gatePw, undefined);
    if (!url) {
      setPhase(PHASE.INSTRUCTIONS);
      return;
    }
    setRegistrationSubmitting(true);
    setRegistrationError("");
    try {
      const r = await fetch(url);
      const data = await r.json();
      if (data.status === "success" && data.valid === true && data.alreadySubmitted === true) {
        sessionStorage.setItem(STORAGE_KEY_ALREADY_SUBMITTED, "1");
        window.location.reload();
        return;
      }
      setPhase(PHASE.INSTRUCTIONS);
    } catch {
      setRegistrationError("Could not verify your attempt. Check your connection and try again.");
    } finally {
      setRegistrationSubmitting(false);
    }
  };

  if (phase === PHASE.REGISTRATION) {
    return (
      <>
        <Navbar />
        <div className="online-test-wrapper online-test-registration">
          <div className="online-test-reg-hero">
            <div className="online-test-reg-hero-inner">
              <h1 className="online-test-reg-title online-test-exam-name">{title}</h1>
            </div>
          </div>
          <div className="container py-4 pb-5">
            <div className="online-test-reg-card">
              <div className="online-test-reg-card-body">
                <div className="online-test-reg-head">
                  <span className="online-test-reg-icon">👤</span>
                  <h2 className="online-test-reg-heading">Student details</h2>
                  <p className="online-test-reg-desc">Fill in your details before starting the test.</p>
                </div>
                {registrationError && <div className="online-test-reg-error">{registrationError}</div>}
                <div className="online-test-reg-form">
                  <div className="online-test-reg-field">
                    <label className="online-test-reg-label">Full name</label>
                    <input
                      type="text"
                      className="online-test-reg-input"
                      placeholder="Your full name"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                    />
                  </div>
                  <div className="online-test-reg-field">
                    <label className="online-test-reg-label">Email address</label>
                    <input
                      type="email"
                      className="online-test-reg-input"
                      placeholder="your@email.com"
                      value={studentEmail}
                      onChange={(e) => setStudentEmail(e.target.value)}
                    />
                  </div>
                  <div className="online-test-reg-field">
                    <label className="online-test-reg-label">Contact number (10 digits)</label>
                    <input
                      type="tel"
                      className="online-test-reg-input"
                      placeholder="10-digit mobile number"
                      value={studentPhone}
                      onChange={(e) => setStudentPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      maxLength={10}
                    />
                  </div>
                  <div className="online-test-reg-field">
                    <label className="online-test-reg-label">Class / grade</label>
                    <select
                      className="online-test-reg-input"
                      value={studentClass}
                      onChange={(e) => setStudentClass(e.target.value)}
                      aria-label="Class or grade"
                    >
                      {classGradeSelectOptions(studentClass).map((o) => (
                        <option key={o.value || "placeholder"} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="online-test-reg-field">
                    <label className="online-test-reg-label">Aadhaar number (12 digits)</label>
                    <input
                      type="text"
                      className="online-test-reg-input"
                      placeholder="12-digit Aadhaar"
                      value={studentAdhar}
                      onChange={(e) => setStudentAdhar(e.target.value.replace(/\D/g, "").slice(0, 12))}
                      maxLength={12}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="online-test-reg-btn"
                  disabled={registrationSubmitting}
                  onClick={() => void handleContinueFromRegistration()}
                >
                  {registrationSubmitting ? "Checking…" : "Continue to instructions →"}
                </button>
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  if (phase === PHASE.INSTRUCTIONS) {
    return (
      <>
        <Navbar />
        <div className="online-test-wrapper online-test-instructions-wrap">
          <div className="online-test-reg-hero online-test-reg-hero-sm">
            <div className="online-test-reg-hero-inner">
              <h1 className="online-test-reg-title online-test-exam-name">{title}</h1>
              <p className="online-test-reg-subtitle online-test-instr-hero-meta">
                {questions.length} questions
                {maxMarks != null && !Number.isNaN(maxMarks) ? ` · ${maxMarks} marks` : ""}
                {" · "}
                {readTimeMinutes != null && readTimeMinutes > 0 && readTimeMinutes !== durationMinutes
                  ? `${durationMinutes} minutes for this online session`
                  : `${durationMinutes} minutes`}
              </p>
            </div>
          </div>
          <div className="container py-4 pb-5">
            {!hasQuestions ? (
              <div className="online-test-reg-card">
                <div className="online-test-reg-card-body">
                  <div className="alert alert-warning mb-0">
                    No questions loaded. Please check the test data or try again later.
                    <button type="button" className="btn btn-sm btn-outline-dark ms-2" onClick={() => navigate("/test")}>Back to tests</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="online-test-instructions online-test-instructions-card online-test-no-copy" onContextMenu={(e) => e.preventDefault()}>
                <div className="online-test-instructions-body">
                  {resumeTimeLeftHint != null && resumeTimeLeftHint > 0 && (
                    <div className="online-test-resume-instr-hint" role="status">
                      Resuming your session — <strong>{formatTimeCountdown(resumeTimeLeftHint)}</strong> left on the timer. Enable camera and microphone below to continue.
                    </div>
                  )}
                  <div className="online-test-instr-logo-wrap">
                    <img
                      src={adhyantLogo}
                      alt="Adhyant — For You"
                      className="online-test-instr-logo"
                      width={280}
                      height={280}
                      decoding="async"
                    />
                  </div>
                  <h2 className="online-test-instr-title">📋 Instructions</h2>
                  {(studentName || studentClass) && (
                    <p className="online-test-instr-student-meta small text-muted mb-3">
                      {(studentName || "").trim() && (
                        <>
                          <strong>Student:</strong> {(studentName || "").trim()}
                          {(studentClass || "").trim() ? " · " : ""}
                        </>
                      )}
                      {(studentClass || "").trim() && (
                        <>
                          <strong>Class:</strong> {(studentClass || "").trim()}
                        </>
                      )}
                    </p>
                  )}
                  <div className="online-test-instr-proctor-warning" role="note">
                    <strong>Important — proctoring (recorded):</strong> This test uses camera and microphone recording. The system also records technical
                    events for review, including when your face is not visible, tab or window changes, time away from the test, copy/cut/paste attempts, and
                    certain screen or device changes. Continuing means you understand these checks are active and may be reviewed.
                  </div>
                  <ul className="online-test-instr-list">
                    <li>
                      {streamInstructionsCallout ? (
                        <>
                          This test has <strong>{questions.length} MCQ-based questions</strong>
                          {streamMcqAttemptCount != null ? (
                            <>
                              , out of which <strong>{streamMcqAttemptCount}</strong> are to be attempted based on your
                              stream (Engineering or Medical)
                            </>
                          ) : (
                            <>
                              ; attempt the questions that match your stream (Engineering or Medical) as described
                              below
                            </>
                          )}
                          . Maximum marks{" "}
                          {maxMarks != null && !Number.isNaN(maxMarks) ? (
                            <strong>{maxMarks}</strong>
                          ) : (
                            <strong>
                              {streamMcqAttemptCount != null ? streamMcqAttemptCount * 4 : "—"}
                            </strong>
                          )}
                          .
                        </>
                      ) : (
                        <>
                          This test has <strong>{questions.length} questions</strong>
                          {maxMarks != null && !Number.isNaN(maxMarks) ? (
                            <>
                              {" "}
                              · Maximum marks <strong>{maxMarks}</strong>
                            </>
                          ) : null}
                          .
                        </>
                      )}
                    </li>
                    <li>
                      <strong>Time:</strong>{" "}
                      {readTimeMinutes != null && readTimeMinutes > 0 && readTimeMinutes !== durationMinutes ? (
                        <>
                          This online session is <strong>{durationMinutes} minutes</strong> (timer auto-submits when time ends).
                        </>
                      ) : (
                        <>
                          <strong>{durationMinutes} minutes</strong> total. The timer auto-submits when time ends.
                        </>
                      )}
                    </li>
                    {showSectionBreakdown && (
                      <li className="online-test-instr-sections">
                        <strong>Sections (question counts):</strong>
                        <ul className="online-test-instr-section-list">
                          {sectionBreakdown.map(({ section, count }) => (
                            <li key={section}>
                              <span className="online-test-instr-section-name">{section}</span>
                              {" — "}
                              <strong>{count}</strong> question{count === 1 ? "" : "s"}
                            </li>
                          ))}
                        </ul>
                      </li>
                    )}
                    {instructionsCallout && (
                      <li className="online-test-instr-stream-li">
                        <div className="online-test-instr-stream-callout" role="region" aria-label="Marking scheme">
                          <p className="online-test-instr-stream-title">{instructionsCallout.heading}</p>
                          {instructionsCallout.lines.map((row, idx) => (
                            <p key={idx} className="online-test-instr-stream-line">
                              <strong className="online-test-instr-stream-label">{row.label}:</strong>{" "}
                              <span className="online-test-instr-stream-text">{row.text}</span>
                            </p>
                          ))}
                        </div>
                      </li>
                    )}
                    {streamInstructionsCallout && (
                      <li className="online-test-instr-stream-li">
                        <div className="online-test-instr-stream-callout" role="region" aria-label="Engineering and medical stream rules">
                          <p className="online-test-instr-stream-title">{streamInstructionsCallout.heading}</p>
                          {streamInstructionsCallout.lines.map((row, idx) => (
                            <p key={`stream-${idx}`} className="online-test-instr-stream-line">
                              <strong className="online-test-instr-stream-label">{row.label}:</strong>{" "}
                              <span className="online-test-instr-stream-text">{row.text}</span>
                            </p>
                          ))}
                        </div>
                      </li>
                    )}
                    <li>
                      For multiple choice, tap <strong>1</strong>, <strong>2</strong>, <strong>3</strong>, or <strong>4</strong>; your response is saved as that choice (question text and any figure above count as one question).
                    </li>
                    <li>You need to allow <strong>camera and microphone</strong>. Recording starts when you click &quot;Start Test&quot;.</li>
                    <li>
                      You can use a <strong>phone or tablet</strong>—prefer stable <strong>Wi‑Fi</strong>, good lighting for face detection, and keep the device steady.
                      On iPhone, choose <strong>Allow</strong> when the browser asks for camera/microphone.
                    </li>
                    <li>Stay on this test window; switching away may be logged (see warning above).</li>
                    <li>
                      Use the <strong>question palette</strong> (grouped by section) to jump between questions.
                    </li>
                    <li>
                      If you are logged out or continue on another device, use the same <strong>test code</strong> and <strong>passcode</strong> you saved at the entry screen. Use the same <strong>email</strong> on this browser if you want to restore saved progress.
                    </li>
                  </ul>
                  <button type="button" className="online-test-reg-btn online-test-instr-btn" onClick={startMedia}>
                    I agree, Start Test
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <Footer />
      </>
    );
  }

  if (phase === PHASE.PERMISSION) {
    return (
      <>
        <Navbar />
        <div className="online-test-wrapper online-test-permission-wrap">
          <div className="online-test-perm-exam-strip">
            <div className="container">
              <p className="online-test-perm-exam-title online-test-exam-name online-test-exam-name--compact">{title}</p>
            </div>
          </div>
          <div className="container py-4 pb-5">
            {mediaError && (
              <div className="online-test-permission-error">
                {mediaError} Please allow camera and microphone and try again.
              </div>
            )}
            <div className="online-test-permission-grid">
              <div className="online-test-permission-card online-test-permission-card-steps">
                <h2 className="online-test-permission-title">🎥 Camera & microphone</h2>
                <p className="online-test-permission-desc">Your video and audio will be recorded. Ensure your face is clearly visible and lighting is good.</p>
                <button
                  type="button"
                  className="online-test-reg-btn online-test-permission-btn"
                  disabled={!faceDetected || !lightingOk || isPreloadingQuestionAssets}
                  onClick={() => {
                    if (!faceDetected || !lightingOk) {
                      if (!faceDetected && !lightingOk) {
                        alert("Face not detected and lighting is not suitable.\n\n• Position your face clearly in front of the camera.\n• Improve lighting (avoid backlight, ensure your face is well lit).");
                      } else if (!faceDetected) {
                        alert("Face not detected. Please position your face clearly in front of the camera.");
                      } else {
                        alert("Lighting is not suitable. Please improve the lighting (avoid backlight, ensure your face is well lit).");
                      }
                      return;
                    }
                    void startRecording();
                  }}
                >
                  {isPreloadingQuestionAssets ? "Loading questions…" : "Start recording & begin test"}
                </button>
                {(!faceDetected || !lightingOk) && detectionReady && (
                  <p className="online-test-permission-hint">Button enabled when face is detected and lighting is good.</p>
                )}
              </div>
              <div className="online-test-permission-card online-test-permission-card-preview">
                <p className="online-test-permission-preview-label">Live preview</p>
                <div className="online-test-permission-preview-box">
                  <video
                    ref={videoPreviewRef}
                    autoPlay
                    playsInline
                    muted
                    className="online-test-permission-video"
                  />
                  <canvas
                    ref={faceOverlayRef}
                    className="online-test-permission-overlay"
                  />
                  <canvas ref={canvasRef} className="d-none" />
                </div>
                <div className="online-test-permission-status">
                  <span className={faceDetected ? "online-test-status-ok" : "online-test-status-fail"}>
                    {faceDetected ? "✓" : "✗"} Face: {faceDetected ? "Detected" : "Not detected"}
                  </span>
                  <span className={lightingOk ? "online-test-status-ok" : "online-test-status-fail"}>
                    {lightingOk ? "✓" : "✗"} Lighting: {lightingOk ? "Good" : "Adjust lighting"}
                  </span>
                </div>
              </div>
            </div>
          </div>
          {isPreloadingQuestionAssets ? (
            <div className="online-test-preload-overlay" role="status" aria-live="polite" aria-busy="true">
              <div className="online-test-preload-card">
                <div className="online-test-preload-spinner" aria-hidden />
                <p className="online-test-preload-title">Loading all question images</p>
                <p className="online-test-preload-sub">
                  {preloadProgress.total > 0
                    ? `Cached locally: ${preloadProgress.done} / ${preloadProgress.total} figure(s). Please wait…`
                    : "Preparing figures from your question paper…"}
                </p>
                <p className="online-test-preload-hint text-muted small mb-0">
                  The timer starts only after this step finishes. Images are then shown from memory for a smoother test.
                </p>
              </div>
            </div>
          ) : null}
        </div>
        <Footer />
      </>
    );
  }

  if (phase === PHASE.TEST) {
    return (
      <>
        <Navbar />
        <div className="online-test-wrapper online-test-phase-test online-test-no-copy" onContextMenu={(e) => e.preventDefault()}>
          <div className="container py-4">
            {sessionStartError ? (
              <div className="alert alert-warning small mb-3" role="status">
                {sessionStartError}
              </div>
            ) : null}
            {timerWarning && (
              <div className="online-test-timer-warning-overlay" role="dialog" aria-modal="true" aria-labelledby="timer-warning-title">
                <div className="online-test-timer-warning-card">
                  <div className="online-test-timer-warning-icon">⏱</div>
                  <h2 id="timer-warning-title" className="online-test-timer-warning-title">Time warning</h2>
                  <p className="online-test-timer-warning-message">
                    {timerWarning === "5min"
                      ? "5mins left. Please complete your answers and submit the test."
                      : "1min left. Submit your test now if you have not already."}
                  </p>
                  <button type="button" className="btn btn-primary online-test-timer-warning-btn" onClick={() => setTimerWarning(null)}>
                    OK
                  </button>
                </div>
              </div>
            )}

            <div className="online-test-header">
              <h1 className="online-test-header-title online-test-exam-name online-test-exam-name--compact">{title}</h1>
              <div className="online-test-header-meta">
                <span className="online-test-meta-text">Recording · Face & activity monitored</span>
                <span className="online-test-env-badge">
                  {isMobileRef.current ? "Mobile" : "Desktop"}
                </span>
                <span
                  className={`online-test-timer online-test-timer--end ${timeLeft <= 60 ? "online-test-timer-red" : timeLeft <= 300 ? "online-test-timer-orange" : ""}`}
                >
                  ⏱ Time left: {formatTimeCountdown(timeLeft)}
                </span>
              </div>
            </div>

            <div className="online-test-main-layout">
              <div className="online-test-content-col">
                <div className="online-test-question-card">
                  <div className="online-test-question-body">
                    <div className="online-test-question-head">
                      <h2 className="online-test-question-num">Question No. {currentIndex + 1}</h2>
                      <p className="online-test-question-meta">Question {currentIndex + 1} of {questions.length}</p>
                      {currentSectionPaletteLabel && (
                        <p className="online-test-question-section" title={currentSectionPaletteLabel}>
                          {currentSectionPaletteLabel}
                        </p>
                      )}
                    </div>
                    <div className="online-test-question-stem-block">
                      {String(currentQ.question || "").trim() ? (
                        <h2 className="online-test-question-text">{currentQ.question}</h2>
                      ) : null}
                      {stemImageSrc ? (
                        <div
                          className={`online-test-question-image-wrap mb-0${stemImageLoaded ? " online-test-question-image-wrap--loaded" : ""}`}
                        >
                          {!stemImageLoaded ? (
                            <div className="online-test-question-image-skeleton" role="status" aria-label="Loading question image" />
                          ) : null}
                          <img
                            ref={stemImageElRef}
                            key={`qfig-${currentIndex}-${currentQ.id}`}
                            src={stemImageSrc}
                            alt="Question figure — part of this question"
                            className="online-test-question-image"
                            loading="eager"
                            decoding="async"
                            fetchPriority="high"
                            onLoad={() => setStemImageLoaded(true)}
                            onError={(ev) => {
                              const el = ev.currentTarget;
                              const fid = currentQ.imageFileId;
                              if (fid && el.dataset.imgFallback !== "thumb") {
                                el.dataset.imgFallback = "thumb";
                                el.src = getDriveThumbnailFallbackUrl(fid);
                                return;
                              }
                              if (fid && el.dataset.imgFallback !== "fullthumb") {
                                el.dataset.imgFallback = "fullthumb";
                                el.src = resolveQuestionImageSrc({ imageFileId: fid });
                                return;
                              }
                              setStemImageLoaded(true);
                            }}
                          />
                        </div>
                      ) : null}
                    </div>

                    {isMcq ? (
                      <>
                        <p className="online-test-options-prompt small text-muted mb-2">Select your answer: <strong>1</strong>, <strong>2</strong>, <strong>3</strong>, or <strong>4</strong></p>
                        <div
                          className={`online-test-options${currentQ.options.length === 4 && currentQ.options.every((o, j) => String(o).trim() === String(j + 1)) ? " online-test-options--grid-2x2" : ""}`}
                        >
                          {currentQ.options.map((opt, i) => {
                            const onlyDigit =
                              currentQ.options.length === 4 &&
                              currentQ.options.every((o, j) => String(o).trim() === String(j + 1));
                            return (
                              <button
                                key={i}
                                type="button"
                                className={`online-test-opt-btn ${onlyDigit ? "online-test-opt-btn--digit-only" : "text-start mb-2 w-100"} ${isMcqOptionSelected(answers, currentQ, i) ? "active" : ""}`}
                                onClick={() => setAnswer(currentQ.id, String(i + 1))}
                                aria-label={`Choice ${i + 1}`}
                              >
                                {onlyDigit ? (
                                  <span className="online-test-opt-num online-test-opt-num--solo">{i + 1}</span>
                                ) : (
                                  <>
                                    <span className="online-test-opt-num" aria-hidden>
                                      {i + 1}
                                    </span>
                                    <span className="online-test-opt-body">
                                      <span className="online-test-opt-text">{opt}</span>
                                    </span>
                                  </>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <div>
                        <input
                          type="number"
                          className="form-control form-control-lg"
                          placeholder="Enter integer answer"
                          min={currentQ.min}
                          max={currentQ.max}
                          value={answers[currentQ.id] ?? ""}
                          onChange={(e) => setAnswer(currentQ.id, e.target.value)}
                        />
                        {(currentQ.min != null || currentQ.max != null) && (
                          <p className="small text-muted mt-1 mb-0">
                            Range: {currentQ.min ?? "—"} to {currentQ.max ?? "—"}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="online-test-footer-bar">
                  <button
                    type="button"
                    className="online-test-footer-btn online-test-footer-prev"
                    onClick={() => goToQuestion(currentIndex - 1)}
                    disabled={currentIndex === 0}
                  >
                    Previous question
                  </button>
                  <button
                    type="button"
                    className="online-test-footer-btn online-test-footer-flag"
                    onClick={toggleFlagCurrent}
                    title={flaggedQuestions.has(currentIndex) ? "Unmark: come back later" : "Mark: come back later"}
                  >
                    {flaggedQuestions.has(currentIndex) ? "✓ Marked for review" : "Mark for review"}
                  </button>
                  <button
                    type="button"
                    className="online-test-footer-btn online-test-footer-clear"
                    onClick={() => setAnswer(currentQ.id, undefined)}
                  >
                    Clear response
                  </button>
                  {currentIndex < questions.length - 1 ? (
                    <button type="button" className="online-test-footer-btn online-test-footer-next" onClick={() => goToQuestion(currentIndex + 1)}>
                      Next question
                    </button>
                  ) : (
                    <button type="button" className="online-test-footer-btn online-test-footer-submit" onClick={handleSubmit}>
                      Submit test
                    </button>
                  )}
                </div>
              </div>

              <div className="online-test-sidebar-col">
                <div className="online-test-sidebar-inner">
                  <div className="online-test-palette-section">
                    <h3 className="online-test-palette-title">Choose a question</h3>
                    <div className="online-test-palette-legend" aria-label="Answer status key">
                      <span className="online-test-palette-legend-prefix">Key —</span>
                      <span className="online-test-legend-item seen">Seen</span>
                      <span className="online-test-legend-item flagged">Flag (later)</span>
                      <span className="online-test-legend-item answered">Answered</span>
                      <span className="online-test-legend-item answered-flagged">Answered + Marked</span>
                    </div>
                    <div className="online-test-palette-scroll">
                      <div className="online-test-palette online-test-palette-grouped">
                        {paletteGroups.map((g) => (
                          <div key={g.sectionKey} className="online-test-palette-group">
                            {showPaletteSections && (
                              <div className="online-test-palette-group-label" title={g.section}>
                                {g.section.length > 28 ? `${g.section.slice(0, 28)}…` : g.section}
                              </div>
                            )}
                            <div className="online-test-palette-group-btns">
                              {g.indices.map((i) => {
                                const q = questions[i];
                                const answered = answers[q.id] !== undefined && answers[q.id] !== "";
                                const flagged = flaggedQuestions.has(i);
                                const seen = seenQuestions.has(i);
                                const statusClass =
                                  answered && flagged ? "answered-flagged" : answered ? "answered" : flagged ? "flagged" : seen ? "seen" : "";
                                const label = q.paperQuestionNum != null ? q.paperQuestionNum : i + 1;
                                return (
                                  <button
                                    key={q.id}
                                    type="button"
                                    title={`Q ${label}${g.section ? ` · ${g.section}` : ""}`}
                                    className={`palette-btn ${i === currentIndex ? "current" : ""} ${statusClass}`}
                                    onClick={() => goToQuestion(i)}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="online-test-video-section">
                    <p className="online-test-video-label">Live recording</p>
                    <div className="online-test-video-box">
                      <video
                        ref={sidePreviewRef}
                        autoPlay
                        playsInline
                        muted
                        className="online-test-video-el"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  if (phase === PHASE.RESULT) {
    const answersAttemptedCount = questions.filter(
      (q) => answers[q.id] !== undefined && answers[q.id] !== ""
    ).length;
    const totalQuestionsCount = questions.length;
    const answeredFractionLabel =
      totalQuestionsCount > 0
        ? `${answersAttemptedCount}/${totalQuestionsCount}`
        : `${answersAttemptedCount}/0`;
    const SMILEYS = [
      { value: 1, emoji: "😞", label: "Poor" },
      { value: 2, emoji: "😕", label: "Fair" },
      { value: 3, emoji: "😐", label: "OK" },
      { value: 4, emoji: "🙂", label: "Good" },
      { value: 5, emoji: "😊", label: "Great" },
    ];
    if (feedbackSubmitted) {
      const waitingOnUpload =
        !!recordedBlob && (uploadStatus === null || uploadStatus === "uploading");
      const showRedirectTimer =
        !waitingOnUpload && postFeedbackRedirectSeconds != null && postFeedbackRedirectSeconds > 0;
      return (
        <>
          <Navbar />
          <div className="online-test-wrapper online-test-result-wrap">
            <div className="container py-5">
              <div className="online-test-result-card">
                <div className="online-test-result-body">
                  <span className="online-test-result-popup-done-emoji" aria-hidden="true">
                    ✓
                  </span>
                  <h2 className="online-test-result-title">You have successfully submitted the test</h2>
                  <div className="online-test-result-answered-summary online-test-result-answered-summary--compact">
                    <p className="online-test-result-answered-label">Questions answered</p>
                    <p className="online-test-result-answered-fraction" aria-label={`${answersAttemptedCount} of ${totalQuestionsCount} questions answered`}>
                      {answeredFractionLabel}
                    </p>
                  </div>
                  {waitingOnUpload ? (
                    <p className="online-test-result-popup-text mb-0">
                      Saving your recording and responses… You’ll be redirected shortly after upload finishes.
                    </p>
                  ) : showRedirectTimer ? (
                    <p className="online-test-result-popup-text mb-0" role="status" aria-live="polite">
                      Thank you for your feedback.{" "}
                      <span className="online-test-result-redirect-countdown">
                        Redirecting to home in{" "}
                        <span className="online-test-result-redirect-countdown-num">{postFeedbackRedirectSeconds}</span>s
                      </span>
                    </p>
                  ) : (
                    <p className="online-test-result-popup-text mb-0">Preparing redirect…</p>
                  )}
                </div>
              </div>
            </div>
          </div>
          <Footer />
        </>
      );
    }
    return (
      <>
        <Navbar />
        <div className="online-test-wrapper online-test-result-wrap">
          <div className="container py-5">
            <div className="online-test-result-card">
              <div className="online-test-result-body">
                <div className="online-test-result-score-box">
                  <h2 className="online-test-result-title">You have successfully submitted the test</h2>
                  <div className="online-test-result-answered-summary">
                    <p className="online-test-result-answered-label">Questions answered</p>
                    <p className="online-test-result-answered-fraction" aria-label={`${answersAttemptedCount} of ${totalQuestionsCount} questions answered`}>
                      {answeredFractionLabel}
                    </p>
                  </div>
                  {canComputeScore && gradedQuestionCount > 0 ? (
                    <p className="online-test-result-score">
                      Your score: {score} / {gradedQuestionCount}
                    </p>
                  ) : (
                    <p className="online-test-result-score text-muted">
                      Responses are saved with your submission for the organiser to review.
                    </p>
                  )}
                  <p className="online-test-result-score">Results will be shared by the organiser.</p>
                </div>
                <h3 className="online-test-result-popup-title mt-3">How was your experience?</h3>
                <p className="online-test-result-popup-subtitle">Tap a smiley to rate (optional), add a comment, then continue</p>
                <div className="online-test-result-smileys">
                  {SMILEYS.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      className={`online-test-result-smiley ${feedbackRating === s.value ? "selected" : ""}`}
                      onClick={() => setFeedbackRating(s.value)}
                      title={s.label}
                    >
                      <span className="online-test-result-smiley-emoji">{s.emoji}</span>
                      <span className="online-test-result-smiley-label">{s.label}</span>
                    </button>
                  ))}
                </div>
                <div className="online-test-result-feedback-comment">
                  <label className="online-test-result-feedback-label">Any comments? (optional)</label>
                  <textarea
                    className="online-test-result-feedback-textarea"
                    placeholder="Tell us more..."
                    value={feedbackComment}
                    onChange={(e) => setFeedbackComment(e.target.value)}
                    rows={3}
                  />
                </div>
                <button
                  type="button"
                  className="online-test-reg-btn online-test-result-popup-submit"
                  onClick={() => {
                    const feedbackUrl = getScriptPostUrl();
                    if (feedbackUrl) {
                      const body = JSON.stringify({
                        action: "submitFeedback",
                        rating: feedbackRating,
                        comment: feedbackComment.trim(),
                        studentName: (studentName || "").trim(),
                        studentEmail: (studentEmail || "").trim(),
                        studentPhone: (studentPhone || "").trim(),
                        studentClass: (studentClass || "").trim(),
                      });
                      fetch(feedbackUrl, {
                        method: "POST",
                        mode: "no-cors",
                        headers: { "Content-Type": "text/plain" },
                        body,
                      }).catch(() => {});
                    }
                    setFeedbackSubmitted(true);
                  }}
                >
                  Submit feedback and return home
                </button>
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  return null;
}
