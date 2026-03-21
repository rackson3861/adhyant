import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import Navbar from "./Pages/Navbar";
import Footer from "./Pages/Footer";
import { getValidateCodeUrl } from "../utils/scriptApi";
import TestSubmittedCelebration from "./TestSubmittedCelebration";

export const STORAGE_KEY_TEST_CODE = "adhyant_test_code";
/** Personal session / resume code (maps to test code on server). */
export const STORAGE_KEY_SECONDARY_CODE = "adhyant_secondary_code";
export const STORAGE_KEY_QUESTION_PAPER_ID = "adhyant_question_paper_id";
/** Set when this browser session has completed / locked the test for this code pair. */
export const STORAGE_KEY_ALREADY_SUBMITTED = "adhyant_test_already_submitted_v1";

export default function TestCodeGate({ children }) {
  const location = useLocation();
  const [bootstrapped, setBootstrapped] = useState(false);
  const [storedCode, setStoredCode] = useState("");
  const [showSubmitted, setShowSubmitted] = useState(false);
  const [inputCode, setInputCode] = useState("");
  const [inputSecondary, setInputSecondary] = useState("");
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
      const sec = sessionStorage.getItem(STORAGE_KEY_SECONDARY_CODE) || "";
      if (sessionStorage.getItem(STORAGE_KEY_ALREADY_SUBMITTED) === "1") {
        setStoredCode(code);
        setShowSubmitted(true);
        setBootstrapped(true);
        return;
      }
      const url = getValidateCodeUrl(code, sec);
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
    const secondary = (inputSecondary || "").trim().toUpperCase();
    if (!code) {
      setError("Please enter the test code.");
      return;
    }
    setError("");
    setLoading(true);
    const url = getValidateCodeUrl(code, secondary);
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
          } else if (data.reason === "secondary_required") {
            setError("Enter your session code (personal code issued with this test).");
          } else if (data.reason === "invalid_secondary") {
            setError("Session code does not match this test code. Check both codes and try again.");
          } else {
            setError("Invalid test or session code. Please check and try again.");
          }
          return;
        }
        const normalizedCode = code.toUpperCase();
        sessionStorage.setItem(STORAGE_KEY_TEST_CODE, normalizedCode);
        if (secondary) sessionStorage.setItem(STORAGE_KEY_SECONDARY_CODE, secondary);
        else sessionStorage.removeItem(STORAGE_KEY_SECONDARY_CODE);
        if (data.questionPaperId) {
          sessionStorage.setItem(STORAGE_KEY_QUESTION_PAPER_ID, data.questionPaperId);
        } else {
          sessionStorage.removeItem(STORAGE_KEY_QUESTION_PAPER_ID);
        }

        if (data.alreadySubmitted === true) {
          sessionStorage.setItem(STORAGE_KEY_ALREADY_SUBMITTED, "1");
          setShowSubmitted(true);
        } else {
          sessionStorage.removeItem(STORAGE_KEY_ALREADY_SUBMITTED);
          setShowSubmitted(false);
        }

        if (data.started !== true && data.alreadySubmitted !== true) {
          setError("Test not active yet. Please wait for organiser to start.");
          sessionStorage.removeItem(STORAGE_KEY_TEST_CODE);
          sessionStorage.removeItem(STORAGE_KEY_SECONDARY_CODE);
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
        <div className="test-code-gate-page container py-5 text-center text-muted">
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
      <div className="test-code-gate-page container py-5">
        <div className="row justify-content-center">
          <div className="col-md-6 col-lg-5">
            <div className="card shadow">
              <div className="card-body p-4">
                <h5 className="card-title mb-3">Enter test &amp; session codes</h5>
                <p className="text-muted small mb-3">
                  Enter the shared <strong>test code</strong> you received from the organiser.
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
                  <label className="form-label small text-muted mb-1">Session code</label>
                  <p className="small text-muted mb-2">
                    Create your session code as a <strong>6-digit number</strong> if your organiser asked you to choose one; otherwise <strong>enter the session code you were given</strong>.
                    <strong> Note it down</strong>—if you leave the test or get disconnected for any reason, you will need the <strong>same test code and session code</strong> to access the test again.
                  </p>
                  <input
                    type="text"
                    className="form-control form-control-lg mb-3"
                    placeholder="e.g. 123456"
                    inputMode="numeric"
                    value={inputSecondary}
                    onChange={(e) => setInputSecondary(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12))}
                    autoComplete="off"
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
