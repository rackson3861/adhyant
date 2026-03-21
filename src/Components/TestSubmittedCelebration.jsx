import React from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "./Pages/Navbar";
import Footer from "./Pages/Footer";
import "/src/assets/css/testSubmittedCelebration.css";

/**
 * Full-page state after a test was already submitted for this test code + passcode (and/or email).
 */
export default function TestSubmittedCelebration() {
  const navigate = useNavigate();
  return (
    <>
      <Navbar />
      <div className="test-submitted-page">
        <div className="test-submitted-bg" aria-hidden="true" />
        <div className="container test-submitted-inner py-5">
          <div className="test-submitted-card">
            <div className="test-submitted-icon-wrap">
              <span className="test-submitted-check" aria-hidden="true">✓</span>
            </div>
            <p className="test-submitted-kicker">All set</p>
            <h1 className="test-submitted-title">You have successfully submitted the test</h1>
            <p className="test-submitted-lead">Our team will reach out to you for further steps.</p>
            <div className="test-submitted-actions">
              <button type="button" className="test-submitted-home-btn" onClick={() => navigate("/")}>
                Return to home
              </button>
            </div>
            <div className="test-submitted-footnote">
              <span className="test-submitted-dot" />
              If you need anything urgently, contact your test organiser.
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
