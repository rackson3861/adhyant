import React, { useState } from "react";
import RegistrationModal from "./RegistrationModal";
import "../../assets/css/Slide.css";

export default function Contact() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className="container-xxl py-5">
        <div className="container">
          <div className="text-center wow fadeInUp" data-wow-delay="0.1s">
            <h6 className="section-title bg-white text-center text-primary px-3">
              Contact Us
            </h6>
            <h1 className="mb-5">Contact For Any Query</h1>
          </div>
          <div className="row g-4">
            <div
              className="col-lg-4 col-md-6 wow fadeInUp"
              data-wow-delay="0.1s"
            >
              <h5>Get In Touch</h5>
              <p className="mb-4">
              Have a question or need more information? Call us or click the Contact Us button, and our team will get back to you soon.
              </p>
              <div className="d-flex align-items-center mb-3">
                <div
                  className="d-flex align-items-center justify-content-center flex-shrink-0 bg-primary"
                  style={{ width: "50px", height: "50px" }}
                >
                  <i className="fa fa-map-marker-alt text-white" />
                </div>
                <div className="ms-3">
                  <h5 className="text-primary">Office</h5>
                  <p className="mb-0">Adhyant, Front of Konark Oasis Society, Near Genesis Mall, Alwar ByPass Road, Bhiwadi, Rajasthan, 301019</p>
                </div>
              </div>
              <div className="d-flex align-items-center mb-3">
                <div
                  className="d-flex align-items-center justify-content-center flex-shrink-0 bg-primary"
                  style={{ width: "50px", height: "50px" }}
                >
                  <i className="fa fa-phone-alt text-white" />
                </div>
                <div className="ms-3">
                  <h5 className="text-primary">Mobile</h5>
                  <p className="mb-0">+91 8233366371, +91 9085287242</p>
                </div>
              </div>
              <div className="d-flex align-items-center">
                <div
                  className="d-flex align-items-center justify-content-center flex-shrink-0 bg-primary"
                  style={{ width: "50px", height: "50px" }}
                >
                  <i className="fa fa-envelope-open text-white" />
                </div>
                <div className="ms-3">
                  <h5 className="text-primary">Email</h5>
                  <p className="mb-0">adhyantforyou@gmail.com</p>
                </div>
              </div>
            </div>
            <div
              className="col-lg-4 col-md-6 wow fadeInUp"
              data-wow-delay="0.3s"
            >
              <iframe
                className="position-relative rounded w-100 h-100"
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3516.575139514676!2d76.81342057628375!3d28.189833675909384!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x390d49be3de8c3a5%3A0x9dc3a5ad6388fc44!2sAdhyant!5e0!3m2!1sen!2sin!4v1769912607672!5m2!1sen!2sin"
                frameBorder={0}
                style={{ minHeight: "300px", border: 0 }}
                allowFullScreen
                aria-hidden="false"
                tabIndex={0}
              />
            </div>
            <div
              className="col-lg-4 col-md-12 wow fadeInUp d-flex align-items-center justify-content-center"
              data-wow-delay="0.5s"
              style={{ minHeight: "300px" }}
            >
              <div className="text-center">
                <h5 className="mb-4">Ready to Start Your Journey?</h5>
                <p className="mb-4">Click below to get in touch with us and take the first step towards excellence!</p>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="btn btn-primary rounded-pill py-3 px-5 fw-bold flashing-button-blue"
                  style={{ fontSize: "1.2rem" }}
                >
                  Contact Us<i className="fa fa-arrow-right ms-3"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <RegistrationModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </>
  );
}
