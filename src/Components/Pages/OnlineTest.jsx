import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./Footer";
import {
  getPaperUrl,
  getScriptPostUrl,
  getRecordTestStartUrl,
  resolveQuestionImageSrc,
  getDriveThumbnailFallbackUrl,
} from "../../utils/scriptApi";
import { countQuestionsBySection } from "../../utils/pdfQuestionParser";
import { saveTestProgress, loadTestProgress, clearTestProgress } from "../../utils/onlineTestPersistence";
import {
  STORAGE_KEY_QUESTION_PAPER_ID,
  STORAGE_KEY_TEST_CODE,
  STORAGE_KEY_SECONDARY_CODE,
  STORAGE_KEY_ALREADY_SUBMITTED,
} from "../TestCodeGate";
import "/src/assets/css/onlineTest.css";
import adhyantLogo from "../../assets/img/adhyant-logo.png";

const PHASE = { REGISTRATION: "registration", INSTRUCTIONS: "instructions", PERMISSION: "permission", TEST: "test", RESULT: "result" };

// Minimum video dimensions for face/lighting/phone detection (works with 480x360 reduced capture)
const MIN_VIDEO_WIDTH = 160;
const MIN_VIDEO_HEIGHT = 120;

// Mobile/tablet detection: userAgent, touch, screen size – independent of video; works with reduced capture
function isMobileDevice() {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  const ua = (navigator.userAgent || "").toLowerCase();
  const plat = (navigator.platform || "").toLowerCase();
  const uaMobile =
    /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet|kindle|silk|crios|fxios|edgios|miui|oneui/i.test(ua) ||
    /android|iphone|ipad/i.test(plat);
  if (uaMobile) return true;
  const w = typeof window.innerWidth === "number" ? window.innerWidth : window.screen?.width ?? 0;
  const h = typeof window.innerHeight === "number" ? window.innerHeight : window.screen?.height ?? 0;
  if (w > 0 && (w <= 768 || h <= 768)) return true;
  if (window.matchMedia && (window.matchMedia("(max-width: 768px)").matches || window.matchMedia("(max-height: 768px)").matches)) return true;
  const touch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  if (touch && (w <= 1024 || h <= 1024)) return true;
  if (navigator.userAgentData && typeof navigator.userAgentData.mobile === "boolean" && navigator.userAgentData.mobile) return true;
  return false;
}

function getViewportSize() {
  return typeof window !== "undefined" ? { w: window.innerWidth, h: window.innerHeight } : { w: 0, h: 0 };
}

const DEFAULT_DATA = {
  title: "Online Assessment - PCM + IQ",
  durationMinutes: 6,
  maxMarks: null,
  readTimeMinutes: null,
  paperInstructions: [],
  paperTitleHint: null,
  /** When false, answers are not released to the client and scores are not computed (answer key uploaded separately). */
  answerKeyPresent: true,
  questions: [
    { id: "q1", type: "mcq", question: "The SI unit of force is:", options: ["Joule", "Newton", "Pascal", "Watt"], answer: "Newton" },
    { id: "q2", type: "integer", question: "How many electrons are in a neutral carbon atom? (Enter a whole number)", answer: 6, min: 0, max: 120 },
    { id: "q3", type: "mcq", question: "Which of the following is a vector quantity?", options: ["Mass", "Speed", "Velocity", "Temperature"], answer: "Velocity" },
    { id: "q4", type: "integer", question: "Atomic number of oxygen is ___. (Enter a whole number)", answer: 8, min: 1, max: 118 },
    { id: "q5", type: "mcq", question: "The chemical formula of water is:", options: ["CO2", "H2O", "NaCl", "O2"], answer: "H2O" },
    { id: "q6", type: "integer", question: "Number of bones in an adult human body (approximately). Enter the integer.", answer: 206, min: 200, max: 210 },
    { id: "q7", type: "mcq", question: "Which gas is most abundant in Earth's atmosphere?", options: ["Oxygen", "Carbon dioxide", "Nitrogen", "Argon"], answer: "Nitrogen" },
    { id: "q8", type: "integer", question: "Valency of carbon is ___. (Enter a whole number)", answer: 4, min: 1, max: 8 },
    { id: "q9", type: "mcq", question: "Acceleration due to gravity (g) on Earth is approximately:", options: ["8.9 m/s²", "9.8 m/s²", "10.2 m/s²", "11.0 m/s²"], answer: "9.8 m/s²" },
    { id: "q10", type: "integer", question: "How many planets are there in our Solar System? (Enter a whole number)", answer: 8, min: 7, max: 9 },
  ],
};

export default function OnlineTest() {
  const navigate = useNavigate();
  const [data, setData] = useState(DEFAULT_DATA);
  useEffect(() => {
    const paperId = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(STORAGE_KEY_QUESTION_PAPER_ID) : null;
    if (paperId && getPaperUrl(paperId)) {
      fetch(getPaperUrl(paperId))
        .then((r) => r.json())
        .then((res) => {
          if (res.status === "success" && res.paper && Array.isArray(res.paper.questions) && res.paper.questions.length > 0) {
            const p = res.paper;
            setData({
              title: p.title || p.name || "Online Assessment",
              durationMinutes: p.durationMinutes ?? 6,
              maxMarks: p.maxMarks != null ? Number(p.maxMarks) : null,
              readTimeMinutes: p.readTimeMinutes != null ? Number(p.readTimeMinutes) : null,
              paperInstructions: Array.isArray(p.instructions) ? p.instructions : [],
              paperTitleHint: p.paperTitleHint || null,
              answerKeyPresent: p.answerKeyPresent === true,
              questions: p.questions.map((q, i) => ({
                ...q,
                id: q.id || "q" + (i + 1),
                type: q.type === "integer" ? "integer" : "mcq",
                options: Array.isArray(q.options) ? q.options : [],
                min: q.min != null ? q.min : 0,
                max: q.max != null ? q.max : 999,
                imageUrl: resolveQuestionImageSrc(q) || undefined,
                imageFileId: q.imageFileId || undefined,
              }))
            });
          } else {
            loadDefaultQuestions();
          }
        })
        .catch(() => loadDefaultQuestions());
    } else {
      loadDefaultQuestions();
    }
    function loadDefaultQuestions() {
      import("../../data/onlineTestQuestions.json")
        .then((m) => m.default || m)
        .then((loaded) => {
          if (loaded && Array.isArray(loaded.questions) && loaded.questions.length > 0) {
            setData({
              title: loaded.title || "Online Assessment",
              durationMinutes: loaded.durationMinutes ?? 6,
              maxMarks: null,
              readTimeMinutes: null,
              paperInstructions: [],
              paperTitleHint: null,
              answerKeyPresent: loaded.answerKeyPresent !== false,
              questions: loaded.questions
            });
          }
        })
        .catch(() => {});
    }
  }, []);

  const { title, durationMinutes, questions, maxMarks, readTimeMinutes, paperInstructions, answerKeyPresent } = data;

  const sectionBreakdown = useMemo(() => countQuestionsBySection(questions), [questions]);
  const showSectionBreakdown =
    sectionBreakdown.length > 1 ||
    (sectionBreakdown.length === 1 && sectionBreakdown[0].section !== "General");
  const paletteGroups = useMemo(() => {
    const groups = [];
    questions.forEach((q, i) => {
      const s = (q.section && String(q.section).trim()) || "General";
      const last = groups[groups.length - 1];
      if (!last || last.section !== s) groups.push({ section: s, indices: [] });
      groups[groups.length - 1].indices.push(i);
    });
    return groups;
  }, [questions]);
  const showPaletteSections = paletteGroups.length > 1 || (paletteGroups[0] && paletteGroups[0].section !== "General");
  const [phase, setPhase] = useState(PHASE.REGISTRATION);
  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [studentPhone, setStudentPhone] = useState("");
  const [studentClass, setStudentClass] = useState("");
  const [studentAdhar, setStudentAdhar] = useState("");
  const [registrationError, setRegistrationError] = useState("");
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
  /** Shown on registration when a saved in-progress session exists for this paper + code */
  const [resumeOffer, setResumeOffer] = useState(null);
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
  const recordTestStartSentRef = useRef(false);
  const lastMultiFaceAlertPermissionRef = useRef(0);
  const lastMultiFaceAlertTestRef = useRef(0);
  const permissionPrevFaceCountRef = useRef(0);
  const testPhasePrevFaceCountRef = useRef(0);
  /** Consumed once in startRecording to restore timer & start time after resume */
  const resumeForRecordingRef = useRef(null);
  /** Latest values for background autosave during TEST */
  const persistDataRef = useRef({});

  useEffect(() => {
    if (questions.length === 0) {
      setResumeOffer(null);
      return;
    }
    if (typeof sessionStorage === "undefined") return;
    const paperId = sessionStorage.getItem(STORAGE_KEY_QUESTION_PAPER_ID) || "default";
    const testCode = sessionStorage.getItem(STORAGE_KEY_TEST_CODE) || "";
    const secondaryCode = sessionStorage.getItem(STORAGE_KEY_SECONDARY_CODE) || "";
    const snap = loadTestProgress(paperId, testCode, questions.length, secondaryCode);
    if (snap && snap.timeLeft > 0) {
      setResumeOffer({ timeLeft: snap.timeLeft, savedAt: snap.savedAt });
    } else {
      setResumeOffer(null);
    }
  }, [questions.length]);

  const currentQ = questions[currentIndex];
  const isMcq = currentQ?.type === "mcq";
  const hasQuestions = questions.length > 0;

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
    const raw = answers[q.id];
    const normalized = normalizeAnswer(q, raw);
    if (q.type === "integer") return normalized === q.answer;
    return String(raw).trim() === String(q.answer).trim();
  };
  const canComputeScore = answerKeyPresent === true;
  const gradedQuestions = canComputeScore ? questions.filter(hasGradedKey) : [];
  const score = canComputeScore ? gradedQuestions.filter(isCorrect).length : null;
  const gradedQuestionCount = canComputeScore ? gradedQuestions.length : null;

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
            const now = Date.now();
            if (now - lastMultiFaceAlertPermissionRef.current > 6000) {
              lastMultiFaceAlertPermissionRef.current = now;
              window.alert("Two or more faces detected. Only one person is allowed to take the test.");
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

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    const resume = resumeForRecordingRef.current;
    resumeForRecordingRef.current = null;

    chunksRef.current = [];
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
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      setRecordedBlob(blob);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
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
      recordTestStartSentRef.current = true;
    } else {
      questionTimesRef.current = [];
      testStartTimeRef.current = Date.now();
      const permissionViolations = violationsRef.current.filter((v) => v && v.permissionPhase === true);
      violationsRef.current = permissionViolations.slice();
      recordTestStartSentRef.current = false;
      setTimeLeft(durationMinutes * 60);
      alert5MinRef.current = false;
      alert1MinRef.current = false;
      mobileAlertShownRef.current = false;
    }

    setPhase(PHASE.TEST);
  }, [durationMinutes]);

  useEffect(() => {
    if (phase !== PHASE.TEST) return;
    if (!recordTestStartSentRef.current) {
      recordTestStartSentRef.current = true;
      const code = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(STORAGE_KEY_TEST_CODE) : null;
      const sec = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(STORAGE_KEY_SECONDARY_CODE) || "" : "";
      if (code) {
        const url = getRecordTestStartUrl(code, studentEmail || "", studentName || "", sec, studentClass || "");
        if (url) fetch(url).catch(() => {});
      }
    }
  }, [phase, studentEmail, studentName, studentClass]);

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
    const secondaryCode = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(STORAGE_KEY_SECONDARY_CODE) || "" : "";

    const persist = () => {
      const d = persistDataRef.current;
      if (!d.questionCount) return;
      saveTestProgress({
        paperId,
        testCode,
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
        questionTimesSeconds: questionTimesRef.current.slice(),
        testStartedAt: testStartTimeRef.current,
        seenIndices: d.seenIndices,
        flaggedIndices: d.flaggedIndices,
        violations: violationsRef.current.slice(),
      });
    };

    const id = setInterval(persist, 7000);
    window.addEventListener("pagehide", persist);
    window.addEventListener("beforeunload", persist);
    return () => {
      clearInterval(id);
      window.removeEventListener("pagehide", persist);
      window.removeEventListener("beforeunload", persist);
      persist();
    };
  }, [phase]);

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
            const nowTf = Date.now();
            if (nowTf - lastMultiFaceAlertTestRef.current > 8000) {
              lastMultiFaceAlertTestRef.current = nowTf;
              window.alert("Two or more faces detected. Only one person is allowed to take the test.");
            }
          } else if (n === 1) {
            noFaceCountRef.current = 0;
          } else {
            noFaceCountRef.current = (noFaceCountRef.current || 0) + 1;
            if (noFaceCountRef.current >= 1) {
              noFaceCountRef.current = 0;
              const ev = { type: "looked_away", timestamp: new Date().toISOString() };
              violationsRef.current.push(ev);
            }
          }
        } catch (e) {
          noFaceCountRef.current = (noFaceCountRef.current || 0) + 1;
          if (noFaceCountRef.current >= 2) {
            noFaceCountRef.current = 0;
            const ev = { type: "looked_away", timestamp: new Date().toISOString() };
            violationsRef.current.push(ev);
          }
        }
      }

      if (phoneInCameraModelRef.current && videoReady) {
        phoneCheckTicks += 1;
        if (phoneCheckTicks >= 1) {
          phoneCheckTicks = 0;
          try {
            const predictions = await phoneInCameraModelRef.current.detect(video, 20, 0.05);
            const isPhoneClass = (cls) => (cls && String(cls).toLowerCase().replace(/\s+/g, " ") === "cell phone");
            const hasPhone = predictions.some((p) => isPhoneClass(p.class) && p.score >= 0.08);
            const hasLaptop = predictions.some((p) => p.class && String(p.class).toLowerCase() === "laptop" && p.score >= 0.1);
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
      const secondaryCode = sessionStorage.getItem(STORAGE_KEY_SECONDARY_CODE) || "";
      clearTestProgress(paperId, testCode, secondaryCode);
      sessionStorage.setItem(STORAGE_KEY_ALREADY_SUBMITTED, "1");
    }
    setResumeOffer(null);
    if (questionStartTimeRef.current != null && currentIndex >= 0 && currentIndex < questions.length) {
      const elapsed = (Date.now() - questionStartTimeRef.current) / 1000;
      const times = questionTimesRef.current;
      times[currentIndex] = elapsed;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setPhase(PHASE.RESULT);
    setRecording(null);
  }, [currentIndex, questions.length]);

  const savedOnceRef = useRef(false);
  useEffect(() => {
    if (phase !== PHASE.RESULT || !recordedBlob || savedOnceRef.current) return;
    savedOnceRef.current = true;
    const uploadUrl = import.meta.env.NEXT_PUBLIC_RECORDING_UPLOAD_URL || import.meta.env.VITE_RECORDING_UPLOAD_URL || import.meta.env.VITE_TEST_SUBMISSION_URL;
    const testCode = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(STORAGE_KEY_TEST_CODE) : null;
    const secondaryCode =
      typeof sessionStorage !== "undefined" ? sessionStorage.getItem(STORAGE_KEY_SECONDARY_CODE) || "" : "";
    const metadata = {
      studentName: (studentName || "").trim(),
      studentEmail: (studentEmail || "").trim(),
      studentPhone: (studentPhone || "").trim().replace(/\s/g, ""),
      studentClass: (studentClass || "").trim(),
      studentAdhar: (studentAdhar || "").trim().replace(/\s/g, ""),
      questionTimesSeconds: questionTimesRef.current,
      isMobile: isMobileRef.current,
      events: violationsRef.current,
      score: canComputeScore ? score : null,
      gradedQuestionCount: canComputeScore ? gradedQuestionCount : null,
      answerKeyPresent: canComputeScore,
      ...(canComputeScore
        ? {}
        : { scoreStatus: "answer_key_not_present", scoreMessage: "Can't be Computed. Answer Key Not Present." }),
      totalQuestions: questions.length,
      durationMinutes,
      submittedAt: new Date().toISOString(),
      testStartedAt: testStartTimeRef.current ? new Date(testStartTimeRef.current).toISOString() : null,
      testCode: testCode || undefined,
      secondaryCode: secondaryCode || undefined,
    };
    const answersByQuestionId = {};
    questions.forEach((q) => {
      const v = answers[q.id];
      if (v !== undefined && v !== "") answersByQuestionId[q.id] = v;
    });
    const answersDetailed = questions.map((q) => ({
      questionId: q.id,
      paperQuestionNum: q.paperQuestionNum ?? null,
      section: q.section || null,
      type: q.type,
      selected: answers[q.id] !== undefined && answers[q.id] !== "" ? answers[q.id] : null,
    }));

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
      const zipMeta = { ...metadata, answersByQuestionId, answersDetailed, paperTitle: title };
      formData.append("metadata", JSON.stringify(zipMeta));
      fetch(uploadUrl, { method: "POST", body: formData })
        .then(() => setUploadStatus("uploaded"))
        .catch(() => setUploadStatus("upload_failed"));
    };
    import("jszip")
      .then(({ default: JSZip }) => {
        const zip = new JSZip();
        zip.file("recording.webm", recordedBlob);
        zip.file("metadata.json", JSON.stringify({ ...metadata, answersByQuestionId, answersDetailed, paperTitle: title }, null, 2));
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

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec < 10 ? "0" : ""}${sec}`;
  };

  const handleDiscardSavedSession = useCallback(() => {
    if (typeof sessionStorage !== "undefined") {
      const paperId = sessionStorage.getItem(STORAGE_KEY_QUESTION_PAPER_ID) || "default";
      const testCode = sessionStorage.getItem(STORAGE_KEY_TEST_CODE) || "";
      const secondaryCode = sessionStorage.getItem(STORAGE_KEY_SECONDARY_CODE) || "";
      clearTestProgress(paperId, testCode, secondaryCode);
    }
    setResumeOffer(null);
    setResumeTimeLeftHint(null);
  }, []);

  const handleResumeFromSnapshot = useCallback(() => {
    if (typeof sessionStorage === "undefined" || questions.length === 0) return;
    const paperId = sessionStorage.getItem(STORAGE_KEY_QUESTION_PAPER_ID) || "default";
    const testCode = sessionStorage.getItem(STORAGE_KEY_TEST_CODE) || "";
    const secondaryCode = sessionStorage.getItem(STORAGE_KEY_SECONDARY_CODE) || "";
    const snap = loadTestProgress(paperId, testCode, questions.length, secondaryCode);
    if (!snap || snap.timeLeft <= 0) {
      setResumeOffer(null);
      return;
    }
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
    recordTestStartSentRef.current = true;
    resumeForRecordingRef.current = {
      timeLeft: snap.timeLeft,
      testStartedAt: startedAt,
    };
    setSeenQuestions(new Set(Array.isArray(snap.seenIndices) && snap.seenIndices.length ? snap.seenIndices : [idx]));
    setFlaggedQuestions(new Set(Array.isArray(snap.flaggedIndices) ? snap.flaggedIndices : []));
    setResumeTimeLeftHint(snap.timeLeft);
    setResumeOffer(null);
    setRegistrationError("");
    setPhase(PHASE.INSTRUCTIONS);
  }, [questions.length]);

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
      setRegistrationError("Please enter your class / grade (e.g. Class 10, XII Science).");
      return false;
    }
    if (!/^\d{12}$/.test(adhar)) {
      setRegistrationError("Aadhaar must be 12 digits.");
      return false;
    }
    setRegistrationError("");
    return true;
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
                {resumeOffer && (
                  <div className="online-test-resume-banner" role="status">
                    <p className="online-test-resume-banner-text">
                      You have an unfinished attempt for this test.{" "}
                      <strong>{formatTime(resumeOffer.timeLeft)}</strong> left on the timer — you can continue where you left off.
                    </p>
                    <div className="online-test-resume-banner-actions">
                      <button type="button" className="online-test-reg-btn online-test-resume-continue" onClick={handleResumeFromSnapshot}>
                        Continue test
                      </button>
                      <button type="button" className="online-test-resume-discard" onClick={handleDiscardSavedSession}>
                        Start over
                      </button>
                    </div>
                  </div>
                )}
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
                    <input
                      type="text"
                      className="online-test-reg-input"
                      placeholder="e.g. Class 10, XII Science, 9th"
                      value={studentClass}
                      onChange={(e) => setStudentClass(e.target.value)}
                      maxLength={80}
                    />
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
                  onClick={() => {
                    if (validateRegistration()) setPhase(PHASE.INSTRUCTIONS);
                  }}
                >
                  Continue to instructions →
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
                  ? `${durationMinutes} min for this online session`
                  : `${durationMinutes} min`}
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
                      Resuming your session — <strong>{formatTime(resumeTimeLeftHint)}</strong> left on the timer. Enable camera and microphone below to continue.
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
                      This test has <strong>{questions.length} questions</strong>
                      {maxMarks != null && !Number.isNaN(maxMarks) ? (
                        <>
                          {" "}
                          · Maximum marks <strong>{maxMarks}</strong>
                        </>
                      ) : null}
                      {" "}
                      (multiple choice; integer type if shown).
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
                    {paperInstructions.length > 0 && (
                      <li className="online-test-instr-sections">
                        <strong>From the question paper (online-relevant):</strong>
                        <ul className="online-test-instr-section-list online-test-instr-paper-lines">
                          {paperInstructions.map((line, idx) => (
                            <li key={idx}>{line}</li>
                          ))}
                        </ul>
                      </li>
                    )}
                    <li>Options match the paper: choices are labelled <strong>(1)</strong> through <strong>(4)</strong> where applicable.</li>
                    <li>You need to allow <strong>camera and microphone</strong>. Recording starts when you click &quot;Start Test&quot;.</li>
                    <li>Stay on this test window; switching away may be logged (see warning above).</li>
                    <li>Answer all questions. Use the question palette (grouped by section) to jump between questions.</li>
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
                <h2 className="online-test-permission-title">🎥 Camera &amp; microphone</h2>
                <p className="online-test-permission-desc">Your video and audio will be recorded. Ensure your face is clearly visible and lighting is good.</p>
                <button
                  type="button"
                  className="online-test-reg-btn online-test-permission-btn"
                  disabled={!faceDetected || !lightingOk}
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
                    startRecording();
                  }}
                >
                  Start recording &amp; begin test
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
            {timerWarning && (
              <div className="online-test-timer-warning-overlay" role="dialog" aria-modal="true" aria-labelledby="timer-warning-title">
                <div className="online-test-timer-warning-card">
                  <div className="online-test-timer-warning-icon">⏱</div>
                  <h2 id="timer-warning-title" className="online-test-timer-warning-title">Time warning</h2>
                  <p className="online-test-timer-warning-message">
                    {timerWarning === "5min"
                      ? "5 minutes left. Please complete your answers and submit the test."
                      : "1 minute left. Submit your test now if you have not already."}
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
                <span
                  className={`online-test-timer ${timeLeft <= 60 ? "online-test-timer-red" : timeLeft <= 300 ? "online-test-timer-orange" : ""}`}
                >
                  ⏱ Time left: {formatTime(timeLeft)}
                </span>
                <span className="online-test-meta-text">Recording · Face &amp; activity monitored</span>
                <span className="online-test-env-badge">
                  {isMobileRef.current ? "Mobile" : "Desktop"}
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
                      {currentQ.section && (
                        <p className="online-test-question-section" title={currentQ.section}>{currentQ.section}</p>
                      )}
                    </div>
                    <h2 className="online-test-question-text">{currentQ.question}</h2>
                    {(currentQ.imageUrl || currentQ.questionImage) && (
                      <div className="online-test-question-image-wrap mb-3">
                        <img
                          src={currentQ.imageUrl || currentQ.questionImage}
                          alt="Question figure"
                          className="online-test-question-image"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={(ev) => {
                            const el = ev.currentTarget;
                            const fid = currentQ.imageFileId;
                            if (fid && el.dataset.imgFallback !== "thumb") {
                              el.dataset.imgFallback = "thumb";
                              el.src = getDriveThumbnailFallbackUrl(fid);
                            }
                          }}
                        />
                      </div>
                    )}

                    {isMcq ? (
                      <div className="online-test-options">
                        {currentQ.options.map((opt, i) => (
                          <button
                            key={i}
                            type="button"
                            className={`btn btn-outline-primary w-100 text-start mb-2 online-test-opt-btn ${String(answers[currentQ.id]) === String(opt) ? "active" : ""}`}
                            onClick={() => setAnswer(currentQ.id, opt)}
                          >
                            <span className="online-test-opt-label">({i + 1})</span>
                            <span className="online-test-opt-text">{opt}</span>
                          </button>
                        ))}
                      </div>
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
                    <div className="online-test-palette-legend">
                      <span className="online-test-legend-item seen">Seen</span>
                      <span className="online-test-legend-item flagged">Flag (later)</span>
                      <span className="online-test-legend-item answered">Answered</span>
                      <span className="online-test-legend-item answered-flagged">Answered + Marked</span>
                    </div>
                    <div className="online-test-palette-scroll">
                      <div className="online-test-palette online-test-palette-grouped">
                        {paletteGroups.map((g) => (
                          <div key={g.section} className="online-test-palette-group">
                            {showPaletteSections && (
                              <div className="online-test-palette-group-label" title={g.section}>
                                {g.section.replace(/^Part-[IVX]+ ·\s*/i, "").slice(0, 28)}
                                {g.section.length > 28 ? "…" : ""}
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
    const SMILEYS = [
      { value: 1, emoji: "😞", label: "Poor" },
      { value: 2, emoji: "😕", label: "Fair" },
      { value: 3, emoji: "😐", label: "OK" },
      { value: 4, emoji: "🙂", label: "Good" },
      { value: 5, emoji: "😊", label: "Great" },
    ];
    const handleCloseTest = () => navigate("/test");
    if (feedbackSubmitted) {
      return (
        <>
          <Navbar />
          <div className="online-test-wrapper online-test-result-wrap">
            <div className="container py-5">
              <div className="online-test-result-card">
                <div className="online-test-result-body">
                  <span className="online-test-result-popup-done-emoji">🎉</span>
                  <h2 className="online-test-result-title">Thank you</h2>
                  <p className="online-test-result-popup-text mb-4">Your test is complete. Please reach out to our experts for further steps.</p>
                  <button type="button" className="online-test-reg-btn" onClick={handleCloseTest}>
                    Close
                  </button>
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
                  <h2 className="online-test-result-title">Test submitted</h2>
                  {canComputeScore && gradedQuestionCount > 0 ? (
                    <p className="online-test-result-score">
                      Your score: {score} / {gradedQuestionCount}
                    </p>
                  ) : null}
                  <p className="online-test-result-score">Thank you for completing the test. Results will be shared by the organiser.</p>
                </div>
                <h3 className="online-test-result-popup-title mt-3">How was your experience?</h3>
                <p className="online-test-result-popup-subtitle">Tap a smiley to rate</p>
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
                  Submit feedback
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
