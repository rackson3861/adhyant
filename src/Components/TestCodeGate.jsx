import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import Navbar from "./Pages/Navbar";
import Footer from "./Pages/Footer";
import { getValidateCodeUrl } from "../utils/scriptApi";
import { isGatePairSubmittedLocally, markGatePairSubmittedLocally } from "../utils/gateSubmittedLocal";
import TestSubmittedCelebration from "./TestSubmittedCelebration";

export const STORAGE_KEY_TEST_CODE = "adhyant_test_code";
/** Passcode the student chooses at the gate (min length enforced server-side), or organiser-set sheet password for older rows. */
export const STORAGE_KEY_GATE_PASSWORD = "adhyant_gate_access_password_v1";
export const STORAGE_KEY_QUESTION_PAPER_ID = "adhyant_question_paper_id";
/** Set when this browser session has completed / locked the test for this code pair. */
export const STORAGE_KEY_ALREADY_SUBMITTED = "adhyant_test_already_submitted_v1";

function readStoredGatePassword() {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY_GATE_PASSWORD);
    if (v) return v.trim();
  } catch {
    /* ignore */
  }
  return "";
}

export default function TestCodeGate({ children }) {
  const location = useLocation();
  const [bootstrapped, setBootstrapped] = useState(false);
  const [storedCode, setStoredCode] = useState("");
  const [showSubmitted, setShowSubmitted] = useState(false);
  const [inputCode, setInputCode] = useState("");
  const [inputPassword, setInputPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      if (location.pathname === "/test") {
        sessionStorage.removeItem(STORAGE_KEY_ALREADY_SUBMITTED);
        setStoredCode("");
        setShowSubmitted(false);
        setBootstrapped(true);
        return;
      }
      const code = sessionStorage.getItem(STORAGE_KEY_TEST_CODE);
      if (!code) {
        setStoredCode("");
        setShowSubmitted(false);
        setBootstrapped(true);
        return;
      }
      const gatePw = readStoredGatePassword();
      if (gatePw && isGatePairSubmittedLocally(code, gatePw)) {
        setStoredCode(code);
        setShowSubmitted(true);
        setBootstrapped(true);
        return;
      }
      if (sessionStorage.getItem(STORAGE_KEY_ALREADY_SUBMITTED) === "1") {
        setStoredCode(code);
        setShowSubmitted(true);
        setBootstrapped(true);
        return;
      }
      if (!gatePw) {
        setStoredCode("");
        setShowSubmitted(false);
        setBootstrapped(true);
        return;
      }
      const url = getValidateCodeUrl(code, gatePw, undefined);
      if (!url) {
        setStoredCode(code);
        setShowSubmitted(false);
        setBootstrapped(true);
        return;
      }
      fetch(url)
        .then((r) => r.json())
        .then((data) => {
          if (data.status === "success" && data.valid === true && data.alreadySubmitted === true) {
            sessionStorage.setItem(STORAGE_KEY_ALREADY_SUBMITTED, "1");
            if (gatePw) markGatePairSubmittedLocally(code, gatePw);
            setShowSubmitted(true);
          } else {
            setShowSubmitted(false);
          }
          setStoredCode(code);
        })
        .catch(() => {
          setStoredCode(code);
          setShowSubmitted(false);
        })
        .finally(() => setBootstrapped(true));
    } catch {
      setBootstrapped(true);
    }
  }, [location.pathname]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const code = (inputCode || "").trim();
    const password = (inputPassword || "").trim();
    if (!code) {
      setError("Please enter the test code.");
      return;
    }
    if (!password) {
      setError("Please enter your passcode.");
      return;
    }
    setError("");
    setLoading(true);
    if (isGatePairSubmittedLocally(code, password)) {
      const normalizedCode = code.toUpperCase();
      sessionStorage.setItem(STORAGE_KEY_TEST_CODE, normalizedCode);
      sessionStorage.setItem(STORAGE_KEY_GATE_PASSWORD, password);
      sessionStorage.setItem(STORAGE_KEY_ALREADY_SUBMITTED, "1");
      setStoredCode(normalizedCode);
      setShowSubmitted(true);
      setLoading(false);
      return;
    }
    const url = getValidateCodeUrl(code, password, undefined);
    if (!url) {
      setError("Test code validation is not configured.");
      setLoading(false);
      return;
    }
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (data.status !== "success" || data.valid !== true) {
          if (data.reason === "inactive") {
            setError("This test code is no longer active. Contact the organiser if you need access.");
          } else if (data.reason === "password_too_short") {
            setError("Choose a gate password with at least 4 characters. Use the same one if you continue on another device.");
          } else if (data.reason === "invalid_password") {
            setError("Wrong gate password. If your organiser gave you a password for this test, type it exactly; otherwise use the passcode you chose here.");
          } else {
            setError("Invalid test code or password. Please check and try again.");
          }
          return;
        }
        const normalizedCode = code.toUpperCase();
        sessionStorage.setItem(STORAGE_KEY_TEST_CODE, normalizedCode);
        sessionStorage.setItem(STORAGE_KEY_GATE_PASSWORD, password);
        if (data.questionPaperId) {
          sessionStorage.setItem(STORAGE_KEY_QUESTION_PAPER_ID, data.questionPaperId);
        } else {
          sessionStorage.removeItem(STORAGE_KEY_QUESTION_PAPER_ID);
        }

        if (data.alreadySubmitted === true) {
          sessionStorage.setItem(STORAGE_KEY_ALREADY_SUBMITTED, "1");
          markGatePairSubmittedLocally(normalizedCode, password);
          setShowSubmitted(true);
        } else {
          sessionStorage.removeItem(STORAGE_KEY_ALREADY_SUBMITTED);
          setShowSubmitted(false);
        }

        if (data.started !== true && data.alreadySubmitted !== true) {
          setError("Test not active yet. Please wait for organiser to start.");
          sessionStorage.removeItem(STORAGE_KEY_TEST_CODE);
          sessionStorage.removeItem(STORAGE_KEY_GATE_PASSWORD);
          sessionStorage.removeItem(STORAGE_KEY_QUESTION_PAPER_ID);
          sessionStorage.removeItem(STORAGE_KEY_ALREADY_SUBMITTED);
          return;
        }
        setStoredCode(normalizedCode);
      })
      .catch(() => setError("Network error. Please try again."))
      .finally(() => setLoading(false));
  };

  if (!bootstrapped) {
    return (
      <>
        <Navbar />
        <div className="test-code-gate-page container py-4 py-md-5 px-3 text-center text-muted">
          <p className="mt-5">Loading…</p>
        </div>
        <Footer />
      </>
    );
  }

  if (storedCode && showSubmitted) {
    return <TestSubmittedCelebration />;
  }

  if (storedCode) {
    return children;
  }

  return (
    <>
      <Navbar />
      <div className="test-code-gate-page container py-4 py-md-5 px-3">
        <div className="row justify-content-center">
          <div className="col-12 col-md-8 col-lg-5">
            <div className="card shadow">
              <div className="card-body p-4">
                <h5 className="card-title mb-3">Enter test code & your passcode</h5>
                <p className="text-muted small mb-3">
                  Enter the <strong>test code</strong> from your organiser, then <strong>create a passcode</strong> (at least 4 characters). <strong>Save or write down this passcode</strong> — you will need it with the test code to resume on another device or browser. Use the <strong>same</strong> test code and passcode on <strong>any browser or tab</strong> to continue. On the next screen you will enter your details (including your email).
                </p>
                <form onSubmit={handleSubmit}>
                  {error && (
                    <div className="alert alert-danger py-2 small" role="alert">
                      {error}
                    </div>
                  )}
                  <label className="form-label small text-muted mb-1">Test code</label>
                  <input
                    type="text"
                    className="form-control form-control-lg mb-3"
                    placeholder="e.g. ABC123456"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 9))}
                    autoComplete="off"
                    disabled={loading}
                  />
                  <label className="form-label small text-muted mb-1">
                    Your passcode{" "}
                    <span className="fw-normal">(remember this to log back in if you accidentally log out from the test)</span>
                  </label>
                  <input
                    type="text"
                    className="form-control form-control-lg mb-3"
                    placeholder="Create a passcode (min 4 characters)"
                    autoComplete="off"
                    value={inputPassword}
                    onChange={(e) => setInputPassword(e.target.value)}
                    disabled={loading}
                  />
                  <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                    {loading ? "Checking…" : "Continue"}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
