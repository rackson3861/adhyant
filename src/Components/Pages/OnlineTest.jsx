import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./Footer";
import { getPaperUrl, getScriptPostUrl, getRecordTestStartUrl } from "../../utils/scriptApi";
import { STORAGE_KEY_QUESTION_PAPER_ID, STORAGE_KEY_TEST_CODE } from "../TestCodeGate";
import "/src/assets/css/onlineTest.css";

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
              questions: p.questions.map((q, i) => ({
                ...q,
                id: q.id || "q" + (i + 1),
                type: q.type === "integer" ? "integer" : "mcq",
                options: q.options || [],
                min: q.min != null ? q.min : 0,
                max: q.max != null ? q.max : 999
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
            setData({ title: loaded.title || "Online Assessment", durationMinutes: loaded.durationMinutes ?? 6, questions: loaded.questions });
          }
        })
        .catch(() => {});
    }
  }, []);
  const { title, durationMinutes, questions } = data;
  const [phase, setPhase] = useState(PHASE.REGISTRATION);
  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [studentPhone, setStudentPhone] = useState("");
  const [studentAdhar, setStudentAdhar] = useState("");
  const [registrationError, setRegistrationError] = useState("");
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(durationMinutes * 60);
  const [recording, setRecording] = useState(null);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [mediaError, setMediaError] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [savedRecordingId, setSavedRecordingId] = useState(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [lightingOk, setLightingOk] = useState(false);
  const [detectionReady, setDetectionReady] = useState(false);
  const [violationAlert, setViolationAlert] = useState(null);
  const [showCompletionPopup, setShowCompletionPopup] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(null);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [seenQuestions, setSeenQuestions] = useState(() => new Set());
  const [flaggedQuestions, setFlaggedQuestions] = useState(() => new Set());
  const [timerWarning, setTimerWarning] = useState(null);

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
  const isCorrect = (q) => {
    const raw = answers[q.id];
    const normalized = normalizeAnswer(q, raw);
    if (q.type === "integer") return normalized === q.answer;
    return String(raw).trim() === String(q.answer).trim();
  };
  const score = questions.filter(isCorrect).length;

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
          const hasFace = Array.isArray(predictions) && predictions.length > 0;
          setFaceDetected(hasFace);
          drawFaceOverlay(hasFace ? predictions : []);
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
    questionTimesRef.current = [];
    questionStartTimeRef.current = Date.now();
    testStartTimeRef.current = Date.now();
    isMobileRef.current = isMobileDevice();
    lastMobileCheckRef.current = isMobileRef.current;
    initialViewportRef.current = getViewportSize();
    violationsRef.current = [];
    noFaceCountRef.current = 0;
    blurCountRef.current = 0;
    visibilityHiddenAtRef.current = null;
    setViolationAlert(null);
    setPhase(PHASE.TEST);
    setTimeLeft(durationMinutes * 60);
  }, [durationMinutes]);

  useEffect(() => {
    if (phase !== PHASE.TEST) return;
    if (!recordTestStartSentRef.current) {
      recordTestStartSentRef.current = true;
      const code = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(STORAGE_KEY_TEST_CODE) : null;
      if (code) {
        const url = getRecordTestStartUrl(code, studentEmail || "", studentName || "");
        if (url) fetch(url).catch(() => {});
      }
    }
  }, [phase, studentEmail, studentName]);

  useEffect(() => {
    if (phase !== PHASE.TEST) return;
    alert5MinRef.current = false;
    alert1MinRef.current = false;
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
    if (phase !== PHASE.TEST || !streamRef.current || !sidePreviewRef.current) return;
    sidePreviewRef.current.srcObject = streamRef.current;
    sidePreviewRef.current.play().catch(() => {});
    if (isMobileRef.current && !mobileAlertShownRef.current) {
      mobileAlertShownRef.current = true;
      violationsRef.current.push({ type: "mobile_device_at_start", timestamp: new Date().toISOString() });
      setViolationAlert({ message: "You are on a mobile device. This has been recorded.", type: "mobile" });
      setTimeout(() => setViolationAlert(null), 5000);
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
          if (durationSec >= 10) {
            setViolationAlert({ message: `Warning: You were away from the screen for ${Math.round(durationSec)}s. This has been logged.`, type: "away" });
            setTimeout(() => setViolationAlert(null), 6000);
          } else if (durationSec >= 2) {
            setViolationAlert({ message: "Tab/window switch detected. This has been logged.", type: "away" });
            setTimeout(() => setViolationAlert(null), 4000);
          }
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
          setViolationAlert({ message: "Mobile or small screen detected during test. This has been logged.", type: "mobile" });
          setTimeout(() => setViolationAlert(null), 5000);
        }
        lastMobileCheckRef.current = currentlyMobile;
        isMobileRef.current = currentlyMobile;
      }

      const videoReady = video.readyState >= 1 && video.videoWidth >= MIN_VIDEO_WIDTH && video.videoHeight >= MIN_VIDEO_HEIGHT;
      if (faceModelRef.current && videoReady) {
        try {
          const predictions = await faceModelRef.current.estimateFaces(video, false);
          const hasFace = Array.isArray(predictions) && predictions.length > 0;
          if (hasFace) {
            noFaceCountRef.current = 0;
          } else {
            noFaceCountRef.current = (noFaceCountRef.current || 0) + 1;
            if (noFaceCountRef.current >= 1) {
              noFaceCountRef.current = 0;
              const ev = { type: "looked_away", timestamp: new Date().toISOString() };
              violationsRef.current.push(ev);
              setViolationAlert({ message: "Warning: Face not detected. Please look at the camera. This has been logged.", type: "looked_away" });
              setTimeout(() => setViolationAlert(null), 5000);
            }
          }
        } catch (e) {
          noFaceCountRef.current = (noFaceCountRef.current || 0) + 1;
          if (noFaceCountRef.current >= 2) {
            noFaceCountRef.current = 0;
            const ev = { type: "looked_away", timestamp: new Date().toISOString() };
            violationsRef.current.push(ev);
            setViolationAlert({ message: "Warning: Face not detected. Please look at the camera. This has been logged.", type: "looked_away" });
            setTimeout(() => setViolationAlert(null), 5000);
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
              setViolationAlert({ message: "Warning: A phone or device was detected in the camera view. This has been logged.", type: "looked_away" });
              setTimeout(() => setViolationAlert(null), 6000);
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
      setViolationAlert({ message: "Window lost focus. Do not switch apps. This has been logged.", type: "away" });
      setTimeout(() => setViolationAlert(null), 5000);
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
        setViolationAlert({ message: "Small screen size detected. This has been logged.", type: "mobile" });
        setTimeout(() => setViolationAlert(null), 5000);
      } else if (initial && ((initial.w > 768 && w <= 768) || (initial.h > 768 && h <= 768))) {
        const ev = { type: "viewport_resized_to_mobile_size", width: w, height: h, timestamp: new Date().toISOString() };
        violationsRef.current.push(ev);
        setViolationAlert({ message: "Screen resized to mobile size. This has been logged.", type: "mobile" });
        setTimeout(() => setViolationAlert(null), 5000);
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
      const actionLabel = action.replace(/_/g, " ");
      setViolationAlert({ message: `${actionLabel} is not allowed during the test. This has been logged.`, type: "looked_away" });
      setTimeout(() => setViolationAlert(null), 4000);
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
    const metadata = {
      studentName: (studentName || "").trim(),
      studentEmail: (studentEmail || "").trim(),
      studentPhone: (studentPhone || "").trim().replace(/\s/g, ""),
      studentAdhar: (studentAdhar || "").trim().replace(/\s/g, ""),
      questionTimesSeconds: questionTimesRef.current,
      isMobile: isMobileRef.current,
      events: violationsRef.current,
      score,
      totalQuestions: questions.length,
      durationMinutes,
      submittedAt: new Date().toISOString(),
      testStartedAt: testStartTimeRef.current ? new Date(testStartTimeRef.current).toISOString() : null,
      testCode: testCode || undefined,
    };
    const runUpload = (zipBlob) => {
      if (!uploadUrl) {
        setUploadStatus("local_only");
        return;
      }
      setUploadStatus("uploading");
      const isAppsScript = /script\.google\.com|google\.com\/macos\/script/i.test(uploadUrl);
      if (isAppsScript) {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = typeof reader.result === "string" ? reader.result.split(",")[1] : "";
          // text/plain + no-cors avoids CORS preflight; script still receives and parses JSON body
          const body = JSON.stringify({ zipBase64: base64, metadata });
          fetch(uploadUrl, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain" },
            body,
          })
            .then(() => setUploadStatus("uploaded"))
            .catch(() => setUploadStatus("upload_failed"));
        };
        reader.readAsDataURL(zipBlob);
      } else {
        const formData = new FormData();
        formData.append("zip", zipBlob, `test-${metadata.studentName.replace(/\s+/g, "-")}-${Date.now()}.zip`);
        formData.append("metadata", JSON.stringify(metadata));
        fetch(uploadUrl, { method: "POST", body: formData })
          .then(() => setUploadStatus("uploaded"))
          .catch(() => setUploadStatus("upload_failed"));
      }
    };
    import("jszip")
      .then(({ default: JSZip }) => {
        const zip = new JSZip();
        zip.file("recording.webm", recordedBlob);
        zip.file("metadata.json", JSON.stringify(metadata, null, 2));
        return zip.generateAsync({ type: "blob" });
      })
      .then((zipBlob) => {
        runUpload(zipBlob);
        return import("../../utils/recordingDb").then(({ saveRecording }) =>
          saveRecording({
            blob: recordedBlob,
            score,
            totalQuestions: questions.length,
            durationMinutes,
          })
        );
      })
      .then((id) => setSavedRecordingId(id))
      .catch(() => setUploadStatus("save_failed"));
  }, [phase, recordedBlob, score, durationMinutes, questions.length, studentName, studentEmail, studentPhone, studentAdhar]);

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec < 10 ? "0" : ""}${sec}`;
  };

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
              <span className="online-test-reg-badge">Assessment</span>
              <h1 className="online-test-reg-title">{title}</h1>
              <p className="online-test-reg-subtitle">Enter your details below. Your information will be sent securely with your test recording.</p>
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
              <h1 className="online-test-reg-title">{title}</h1>
              <p className="online-test-reg-subtitle">{questions.length} questions · {durationMinutes} minutes</p>
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
                  <h2 className="online-test-instr-title">📋 Instructions</h2>
                  <ul className="online-test-instr-list">
                    <li>This test has <strong>{questions.length} questions</strong> (MCQ and integer type).</li>
                    <li>Duration: <strong>{durationMinutes} minutes</strong>. Timer will auto-submit when time ends.</li>
                    <li>You need to allow <strong>camera and microphone</strong>. Recording starts when you click &quot;Start Test&quot;.</li>
                    <li>Do not switch tabs or minimize the window during the test.</li>
                    <li>Answer all questions. Use the question palette to jump between questions.</li>
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
            {violationAlert && (
              <div className={`online-test-violation-alert ${violationAlert.type === "away" || violationAlert.type === "looked_away" ? "online-test-violation-warn" : "online-test-violation-info"}`} role="alert">
                {violationAlert.message}
              </div>
            )}

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
              <h1 className="online-test-header-title">{title}</h1>
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
                    </div>
                    <h2 className="online-test-question-text">{currentQ.question}</h2>

                    {isMcq ? (
                      <div className="online-test-options">
                        {currentQ.options.map((opt, i) => (
                          <button
                            key={i}
                            type="button"
                            className={`btn btn-outline-primary w-100 text-start mb-2 ${String(answers[currentQ.id]) === String(opt) ? "active" : ""}`}
                            onClick={() => setAnswer(currentQ.id, opt)}
                          >
                            {opt}
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
                      <div className="online-test-palette">
                        {questions.map((q, i) => {
                          const answered = answers[q.id] !== undefined && answers[q.id] !== "";
                          const flagged = flaggedQuestions.has(i);
                          const seen = seenQuestions.has(i);
                          const statusClass = answered && flagged ? "answered-flagged" : answered ? "answered" : flagged ? "flagged" : seen ? "seen" : "";
                          return (
                            <button
                              key={q.id}
                              type="button"
                              className={`palette-btn ${i === currentIndex ? "current" : ""} ${statusClass}`}
                              onClick={() => goToQuestion(i)}
                            >
                              {i + 1}
                            </button>
                          );
                        })}
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
