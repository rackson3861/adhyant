import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import Navbar from "./Pages/Navbar";
import Footer from "./Pages/Footer";
import { getValidateCodeUrl } from "../utils/scriptApi";

export const STORAGE_KEY_TEST_CODE = "adhyant_test_code";
export const STORAGE_KEY_QUESTION_PAPER_ID = "adhyant_question_paper_id";

export default function TestCodeGate({ children }) {
  const location = useLocation();
  const [storedCode, setStoredCode] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      if (location.pathname === "/test") {
        setStoredCode("");
        return;
      }
      const code = sessionStorage.getItem(STORAGE_KEY_TEST_CODE);
      if (code) setStoredCode(code);
    } catch (e) {
      setStoredCode("");
    }
  }, [location.pathname]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const code = (inputCode || "").trim();
    if (!code) {
      setError("Please enter a test code.");
      return;
    }
    setError("");
    setLoading(true);
    const url = getValidateCodeUrl(code);
    if (!url) {
      setError("Test code validation is not configured.");
      setLoading(false);
      return;
    }
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (data.status !== "success" || data.valid !== true) {
          setError("Invalid test code. Please check and try again.");
          return;
        }
        if (data.started !== true) {
          setError("Test not active yet. Please wait for organiser to start.");
          return;
        }
        const normalizedCode = code.toUpperCase();
        sessionStorage.setItem(STORAGE_KEY_TEST_CODE, normalizedCode);
        if (data.questionPaperId) {
          sessionStorage.setItem(STORAGE_KEY_QUESTION_PAPER_ID, data.questionPaperId);
        } else {
          sessionStorage.removeItem(STORAGE_KEY_QUESTION_PAPER_ID);
        }
        setStoredCode(normalizedCode);
      })
      .catch(() => setError("Network error. Please try again."))
      .finally(() => setLoading(false));
  };

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
                <h5 className="card-title mb-3">Enter test code</h5>
                <p className="text-muted small mb-3">
                  You need a test code to access the tests. Get the code from your instructor or admin.
                </p>
                <form onSubmit={handleSubmit}>
                  {error && (
                    <div className="alert alert-danger py-2 small" role="alert">
                      {error}
                    </div>
                  )}
                  <input
                    type="text"
                    className="form-control form-control-lg mb-3"
                    placeholder="e.g. ABC123456 (3 letters + 6 digits)"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 9))}
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
