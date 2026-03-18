import React, { useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./Footer";
import "../../assets/css/RegistrationModal.css";

const ONLINE_DATE_OPTIONS = [
  { value: "", label: "Select date" },
  { value: "22-mar", label: "22 March" },
];
const OFFLINE_DATE_OPTIONS = [
  { value: "", label: "Select date" },
  { value: "22-mar", label: "22 March" },
];

export default function TestSignUp() {
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    testType: "",
    testDate: "",
    message: "",
  });
  const [errors, setErrors] = useState({
    fullName: "",
    email: "",
    phone: "",
    testType: "",
    testDate: "",
  });
  const dateOptions = formData.testType === "offline" ? OFFLINE_DATE_OPTIONS : ONLINE_DATE_OPTIONS;
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedTestType, setSubmittedTestType] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validatePhone = (phone) => /^[6-9]\d{9}$/.test(phone);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "testType") next.testDate = "";
      return next;
    });
    setErrors((prev) => ({ ...prev, [name]: "" }));
    if (name === "email" && value && !validateEmail(value)) {
      setErrors((prev) => ({ ...prev, email: "Please enter a valid email address" }));
    }
    if (name === "phone" && value && !validatePhone(value)) {
      setErrors((prev) => ({ ...prev, phone: "Enter a valid 10-digit mobile number starting with 6-9" }));
    }
  };

  const validateForm = () => {
    const newErrors = { fullName: "", email: "", phone: "", testType: "", testDate: "" };
    let isValid = true;
    if (!formData.fullName.trim()) {
      newErrors.fullName = "Full name is required";
      isValid = false;
    }
    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
      isValid = false;
    } else if (!validateEmail(formData.email)) {
      newErrors.email = "Please enter a valid email address";
      isValid = false;
    }
    if (!formData.phone.trim()) {
      newErrors.phone = "Phone number is required";
      isValid = false;
    } else if (!validatePhone(formData.phone)) {
      newErrors.phone = "Enter a valid 10-digit mobile number starting with 6-9";
      isValid = false;
    }
    if (!formData.testType) {
      newErrors.testType = "Please select test type (Online or Offline)";
      isValid = false;
    }
    if (!formData.testDate) {
      newErrors.testDate = "Please select a test date";
      isValid = false;
    }
    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);
    const SCRIPT_URL = import.meta.env.VITE_RECORDING_UPLOAD_URL || import.meta.env.VITE_TEST_SUBMISSION_URL || "";
    try {
      const payload = {
        action: "testSignUp",
        timestamp: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
        fullName: formData.fullName.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim().replace(/\s/g, ""),
        testType: formData.testType,
        testDate: formData.testDate,
        message: (formData.message || "").trim() || "",
      };
      await fetch(SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error(err);
    }
    setIsLoading(false);
    setSubmittedTestType(formData.testType);
    setIsSubmitted(true);
    setFormData({ fullName: "", email: "", phone: "", testType: "", testDate: "", message: "" });
    setErrors({ fullName: "", email: "", phone: "", testType: "", testDate: "" });
  };

  return (
    <>
      <Navbar />
      <div className="test-form-page container py-5" style={{ minHeight: "80vh" }}>
        <div className="row justify-content-center">
          <div className="col-md-8 col-lg-6">
            <div className="modal-container test-signup-modal p-4 shadow rounded-3" style={{ maxWidth: "100%" }}>
              {isLoading ? (
                <div className="text-center py-5">
                  <div className="spinner-border text-primary" role="status" />
                  <p className="mt-3 mb-0">Submitting your sign-up...</p>
                </div>
              ) : isSubmitted ? (
                <div className="text-center py-4">
                  <div className="mb-3">
                    <i className="fa fa-check-circle text-success" style={{ fontSize: "3rem" }} />
                  </div>
                  <h2 className="h4 mb-2">You're signed up!</h2>
                  <p className="text-muted mb-3">
                    We've received your details for the <strong>{submittedTestType === "offline" ? "offline" : "online"} test</strong>. You'll receive further instructions before your chosen date.
                  </p>
                  {submittedTestType === "online" && (
                    <p className="text-primary small mb-4 fw-medium">
                      You will be notified via email for the online test 2 days before the exam. Look out for the email.
                    </p>
                  )}
                  <Link to="/" className="btn test-signup-btn-success-home me-2">
                    Back to Home
                  </Link>
                  <Link to="/test" className="btn test-signup-btn-success-test">
                    Go to Test
                  </Link>
                </div>
              ) : (
                <>
                  <div className="modal-header border-0 px-0 pt-0">
                    <h2 className="h4 mb-1">Upcoming Entrance Exam</h2>
                    <div className="test-signup-schedule-text">
                    </div>
                  </div>
                  <form onSubmit={handleSubmit} className="modal-form mt-3">
                    <div className="form-group mb-3">
                      <label htmlFor="testType">Test type <span className="required">*</span></label>
                      <select
                        id="testType"
                        name="testType"
                        value={formData.testType}
                        onChange={handleChange}
                        className={`form-select ${errors.testType ? "is-invalid" : ""}`}
                      >
                        <option value="">Select test type</option>
                        <option value="online">Online</option>
                        <option value="offline">Offline</option>
                      </select>
                      {errors.testType && <div className="invalid-feedback">{errors.testType}</div>}
                    </div>
                    <div className="form-group mb-3">
                      <label htmlFor="fullName">Full Name <span className="required">*</span></label>
                      <input
                        type="text"
                        id="fullName"
                        name="fullName"
                        value={formData.fullName}
                        onChange={handleChange}
                        placeholder="Enter your full name"
                        className={`form-control ${errors.fullName ? "is-invalid" : ""}`}
                      />
                      {errors.fullName && <div className="invalid-feedback">{errors.fullName}</div>}
                    </div>
                    <div className="form-group mb-3">
                      <label htmlFor="email">Email <span className="required">*</span></label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="your.email@example.com"
                        className={`form-control ${errors.email ? "is-invalid" : ""}`}
                      />
                      {errors.email && <div className="invalid-feedback">{errors.email}</div>}
                    </div>
                    <div className="form-group mb-3">
                      <label htmlFor="phone">Phone Number <span className="required">*</span></label>
                      <input
                        type="tel"
                        id="phone"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        placeholder="10-digit mobile number"
                        maxLength="10"
                        className={`form-control ${errors.phone ? "is-invalid" : ""}`}
                      />
                      {errors.phone && <div className="invalid-feedback">{errors.phone}</div>}
                    </div>
                    <div className="form-group mb-3">
                      <label htmlFor="testDate">Preferred test date <span className="required">*</span></label>
                      {formData.testType === "online" && (
                        <p className="small mb-1 test-signup-time-label">Test Time: 11am-12pm. Duration: 1hr</p>
                      )}
                      <select
                        id="testDate"
                        name="testDate"
                        value={formData.testDate}
                        onChange={handleChange}
                        className={`form-select ${errors.testDate ? "is-invalid" : ""}`}
                      >
                        {dateOptions.map((opt) => (
                          <option key={opt.value || "empty"} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      {errors.testDate && <div className="invalid-feedback">{errors.testDate}</div>}
                    </div>
                    <div className="form-group mb-3">
                      <label htmlFor="message">Message (optional)</label>
                      <textarea
                        id="message"
                        name="message"
                        value={formData.message}
                        onChange={handleChange}
                        placeholder="Any question or note..."
                        rows="2"
                        className="form-control"
                      />
                    </div>
                    <div className="d-flex gap-3 justify-content-end mt-4 flex-wrap">
                      <Link to="/" className="btn test-signup-btn-cancel">
                        Cancel
                      </Link>
                      <button type="submit" className="btn test-signup-btn-submit">
                        Sign up
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
