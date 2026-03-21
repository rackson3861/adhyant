import React from "react";
import Navbar from "./Pages/Navbar";
import Footer from "./Pages/Footer";
import "/src/assets/css/testSubmittedCelebration.css";

/**
 * Full-page state after a test was already submitted for this test + session code pair.
 */
export default function TestSubmittedCelebration() {
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
            <p className="test-submitted-lead">
              Our experts will reach out to you soon with the next steps. Thank you for taking the time to complete your assessment.
            </p>
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
