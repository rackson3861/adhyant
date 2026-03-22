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
      <div className="test-code-gate-page">
        <div className="gate-hero">
          <div className="container">
            <div className="row justify-content-center">
              <div className="col-12 col-md-8 col-lg-5">
                <div className="gate-card">
                  <div className="gate-card__header">
                    <div className="gate-card__icon">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                    </div>
                    <h2 className="gate-card__title">Enter your exam</h2>
                    <p className="gate-card__subtitle">
                      Enter the test code from your organiser and create a personal passcode.
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} className="gate-card__form">
                    {error && (
                      <div className="gate-alert" role="alert">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                        </svg>
                        {error}
                      </div>
                    )}

                    <div className="gate-field">
                      <label className="gate-field__label">Test code</label>
                      <input
                        type="text"
                        className="gate-field__input gate-field__input--code"
                        placeholder="ABC123456"
                        value={inputCode}
                        onChange={(e) => setInputCode(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 9))}
                        autoComplete="off"
                        disabled={loading}
                        spellCheck="false"
                      />
                    </div>

                    <div className="gate-field">
                      <label className="gate-field__label">Your passcode</label>
                      <input
                        type="text"
                        className="gate-field__input"
                        placeholder="Create a passcode (min 4 chars)"
                        autoComplete="off"
                        value={inputPassword}
                        onChange={(e) => setInputPassword(e.target.value)}
                        disabled={loading}
                      />
                      <p className="gate-field__hint">
                        Save this passcode — you'll need it to resume on another device.
                      </p>
                    </div>

                    <button type="submit" className="gate-submit" disabled={loading}>
                      {loading ? (
                        <span className="gate-submit__loading">
                          <span className="gate-spinner" />
                          Verifying…
                        </span>
                      ) : (
                        "Enter exam"
                      )}
                    </button>
                  </form>
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
