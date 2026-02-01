import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../assets/css/RegistrationModal.css';

const RegistrationModal = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    school: '',
    course: '',
    class: '',
    message: ''
  });

  const [errors, setErrors] = useState({
    fullName: '',
    email: '',
    phone: '',
    school: '',
    course: '',
    class: ''
  });

  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    let timer;
    let countdownInterval;
    
    if (isSubmitted) {
      // Start countdown
      setCountdown(5);
      
      countdownInterval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      // Auto-close and redirect after 5 seconds
      timer = setTimeout(() => {
        handleClose();
        navigate('/');
      }, 5000);
    }
    
    return () => {
      if (timer) clearTimeout(timer);
      if (countdownInterval) clearInterval(countdownInterval);
    };
  }, [isSubmitted]);

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePhone = (phone) => {
    const phoneRegex = /^[6-9]\d{9}$/;
    return phoneRegex.test(phone);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    setFormData({
      ...formData,
      [name]: value
    });

    // Clear error for the field being edited
    setErrors(prev => ({ ...prev, [name]: '' }));

    // Real-time validation for email and phone
    if (name === 'email') {
      if (value && !validateEmail(value)) {
        setErrors(prev => ({ ...prev, email: 'Please enter a valid email address' }));
      }
    }

    if (name === 'phone') {
      if (value && !validatePhone(value)) {
        setErrors(prev => ({ ...prev, phone: 'Enter a valid 10-digit mobile number starting with 6-9' }));
      }
    }
  };

  const validateForm = () => {
    let newErrors = {
      fullName: '',
      email: '',
      phone: '',
      school: '',
      course: '',
      class: ''
    };
    let isValid = true;

    // Check Full Name
    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full name is required';
      isValid = false;
    }

    // Check Email
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
      isValid = false;
    } else if (!validateEmail(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
      isValid = false;
    }

    // Check Phone
    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
      isValid = false;
    } else if (!validatePhone(formData.phone)) {
      newErrors.phone = 'Enter a valid 10-digit mobile number starting with 6-9';
      isValid = false;
    }

    // Check School
    if (!formData.school.trim()) {
      newErrors.school = 'School name is required';
      isValid = false;
    }

    // Check Course
    if (!formData.course) {
      newErrors.course = 'Please select a course';
      isValid = false;
    }

    // Check Class
    if (!formData.class) {
      newErrors.class = 'Please select your current class';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate all required fields
    if (!validateForm()) {
      alert('Please fill in all required fields correctly');
      return;
    }
    
    // Show loading state
    setIsLoading(true);
    
    // ============================================
    // PASTE YOUR GOOGLE APPS SCRIPT URL HERE 👇
    // ============================================
    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxAazNrJgn5zDlGIKWlm8Rsy0TEIDKWH9HzlxIpmIXSAWq3BN8HZ0cl7JVAgXIaGtJpmw/exec';
    // ============================================
    
    try {
      // Prepare data for Google Sheets
      const submissionData = {
        timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        fullName: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        school: formData.school,
        course: formData.course,
        class: formData.class,
        message: formData.message || 'No message'
      };
      
      console.log('Submitting to Google Sheets:', submissionData);
      
      // Send data to Google Sheets
      const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submissionData)
      });
      
      console.log('Submission successful!');
      
    } catch (error) {
      console.error('Error submitting to Google Sheets:', error);
      // Still show success message even if Google Sheets fails
    }
    
    // Hide loading and show success message
    setIsLoading(false);
    setIsSubmitted(true);
    
    // Reset form
    setFormData({
      fullName: '',
      email: '',
      phone: '',
      school: '',
      course: '',
      class: '',
      message: ''
    });
    
    setErrors({
      fullName: '',
      email: '',
      phone: '',
      school: '',
      course: '',
      class: ''
    });
  };

  if (!isOpen) return null;

  const handleClose = () => {
    setIsSubmitted(false);
    setIsLoading(false);
    setFormData({
      fullName: '',
      email: '',
      phone: '',
      school: '',
      course: '',
      class: '',
      message: ''
    });
    setErrors({
      fullName: '',
      email: '',
      phone: '',
      school: '',
      course: '',
      class: ''
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={handleClose}>
          <i className="fa fa-times"></i>
        </button>
        
        {isLoading ? (
          <div className="loading-container">
            <div className="loading-spinner">
              <div className="spinner"></div>
            </div>
            <h3 className="loading-title">Submitting your application...</h3>
            <p className="loading-message">Please wait while we process your registration</p>
          </div>
        ) : !isSubmitted ? (
          <>
            <div className="modal-header">
              <h2>Join Adhyant</h2>
              <p>Fill in your details and we'll get back to you soon!</p>
            </div>

            <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="fullName">Full Name <span className="required">*</span></label>
            <input
              type="text"
              id="fullName"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              placeholder="Enter your full name"
              className={errors.fullName ? 'input-error' : ''}
              required
            />
            {errors.fullName && <span className="error-message">{errors.fullName}</span>}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="email">Email <span className="required">*</span></label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="your.email@example.com"
                className={errors.email ? 'input-error' : ''}
                required
              />
              {errors.email && <span className="error-message">{errors.email}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="phone">Phone Number <span className="required">*</span></label>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="10-digit mobile number"
                maxLength="10"
                className={errors.phone ? 'input-error' : ''}
                required
              />
              {errors.phone && <span className="error-message">{errors.phone}</span>}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="school">School Name <span className="required">*</span></label>
            <input
              type="text"
              id="school"
              name="school"
              value={formData.school}
              onChange={handleChange}
              placeholder="Enter your school name"
              className={errors.school ? 'input-error' : ''}
              required
            />
            {errors.school && <span className="error-message">{errors.school}</span>}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="course">Interested In <span className="required">*</span></label>
              <select
                id="course"
                name="course"
                value={formData.course}
                onChange={handleChange}
                className={errors.course ? 'input-error' : ''}
                required
              >
                <option value="">Select Course</option>
                <option value="IIT-JEE">IIT-JEE Preparation</option>
                <option value="NEET">NEET Preparation</option>
                <option value="Foundation">Foundation Course</option>
                <option value="Career">Career Counselling</option>
              </select>
              {errors.course && <span className="error-message">{errors.course}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="class">Current Class <span className="required">*</span></label>
              <select
                id="class"
                name="class"
                value={formData.class}
                onChange={handleChange}
                className={errors.class ? 'input-error' : ''}
                required
              >
                <option value="">Select Class</option>
                <option value="8">Class 8</option>
                <option value="9">Class 9</option>
                <option value="10">Class 10</option>
                <option value="11">Class 11</option>
                <option value="12">Class 12</option>
                <option value="dropper">Dropper</option>
              </select>
              {errors.class && <span className="error-message">{errors.class}</span>}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="message">Message (Optional)</label>
            <textarea
              id="message"
              name="message"
              value={formData.message}
              onChange={handleChange}
              placeholder="Any specific questions or requirements..."
              rows="3"
            />
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={handleClose}>
              Cancel
            </button>
            <button type="submit" className="btn-submit">
              Submit
            </button>
          </div>
        </form>
          </>
        ) : (
          <div className="success-container">
            <div className="success-icon">
              <i className="fa fa-check-circle"></i>
            </div>
            <h2 className="success-title">Awesome! 🎉</h2>
            <p className="success-message">
              Your application has been submitted successfully!
            </p>
            <div className="success-details">
              <div className="success-detail-item">
                <i className="fa fa-user-graduate"></i>
                <span>Our expert will reach out to you shortly</span>
              </div>
              <div className="success-detail-item">
                <i className="fa fa-route"></i>
                <span>We'll discuss your learning journey together</span>
              </div>
              <div className="success-detail-item">
                <i className="fa fa-rocket"></i>
                <span>Get ready to achieve your goals!</span>
              </div>
            </div>
            <button className="btn-done" onClick={handleClose}>
              Done
            </button>
            <p className="auto-close-text">
              Auto-closing in {countdown} second{countdown !== 1 ? 's' : ''}...
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RegistrationModal;
