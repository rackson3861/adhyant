import React, { useEffect, useState } from "react";
import "../../assets/css/Slide.css";
import { Link } from "react-router-dom";
import RegistrationModal from "./RegistrationModal";

export default function Slide() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const el = document.getElementById("carouselExampleControlsNoTouching");
    const bootstrap = window.bootstrap;
    if (!el || !bootstrap || !bootstrap.Carousel) return;
    
    // Dispose existing instance if any
    let instance = bootstrap.Carousel.getInstance(el);
    if (instance) {
      instance.dispose();
    }
    
    // Create new instance with autoplay
    instance = new bootstrap.Carousel(el, {
      interval: 3500,
      pause: false,
      ride: 'carousel',
      touch: true,
      wrap: true
    });
    
    // Force start cycling
    setTimeout(() => {
      if (instance && instance.cycle) {
        instance.cycle();
      }
    }, 100);
    
    return () => {
      if (instance && instance.dispose) {
        instance.dispose();
      }
    };
  }, []);
  return (
    <>
      <div
        id="carouselExampleControlsNoTouching"
        className="carousel slide carousel-fade"
        data-bs-ride="carousel"
        data-bs-interval="3500"
        data-bs-pause="false"
      >
        <div className="carousel-inner">
          <div className="carousel-item active">
            <div className="owl-carousel-item position-relative">
              <picture>
                <source media="(max-width: 768px)" srcSet="/img/imagescroller12_width.jpg" />
                <img className="img-fluid" src="/img/imagescroller12.jpg" alt="Adhyant Coaching" loading="eager" fetchpriority="high" />
              </picture>
              <div
                className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center"
              >
                <div className="container">
                  <div className="row justify-content-start">
                    <div className="col-sm-10 col-lg-8 slide-text-up">
                    <h6 className="text-white text-uppercase mb-2 animated slideInDown">
                      Coaching with Purpose & Precision
                    </h6>
                    <h1 className="display-4 text-white animated slideInDown">
                    Mentored By <span className="text-warning fw-bold">IITians,</span>

                    <br/>
                    Destined for <span className="text-warning fw-bold">Excellence</span>
                    </h1>
                    <p className="fs-5 text-white mb-3">
                      IIT - JEE <span className="text-warning fw-bold">|</span> Medical <span className="text-warning fw-bold">|</span> Foundation <span className="text-warning fw-bold">|</span> Career Counselling
                    </p>
                      <div className="hero-cta-group">
                        <div className="d-flex flex-wrap align-items-center gap-2 mb-4 text-white">
                          <span className="label-dashed">ADMISSION OPEN 2026</span>
                          <span className="label-dashed">LIMITED SEATS</span>
                        </div>
                        <button
                          onClick={() => setIsModalOpen(true)}
                          className="btn btn-yellow rounded-pill py-md-3 px-md-4 fw-bold animated slideInRight flashing-button"
                        >
                          Join Now<i className="fa fa-arrow-right ms-3"></i>
                        </button>
                        <p className="flashing-text text-warning fw-bold mt-3 mb-0">
                          Batch Starting in April 2026
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>



          <div className="carousel-item">
            <div className="owl-carousel-item position-relative">
              <picture>
                <source media="(max-width: 768px)" srcSet="/img/imagescroller12_width.jpg" />
                <img className="img-fluid" src="/img/imagescroller12.jpg" alt="Adhyant IIT Coaching" loading="lazy" />
              </picture>
              <div
                className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center"
              >
                <div className="container">
                  <div className="row justify-content-start">
                    <div className="col-sm-10 col-lg-8 slide-text-up">
                    <h6 className="text-white text-uppercase mb-2 animated slideInDown">
                      Coaching with Purpose & Precision
                    </h6>


                    <h1 className="display-4 text-white animated slideInDown">
                      <span className="hero-kpi">10+ </span>
                      <span className="hero-kpi-sub text-warning"> Years</span>
                      <span className="hero-kpi-sub">of Teaching Excellence</span>
                      <br/>
                      <span className="hero-kpi">500+</span>
                      <span className="hero-kpi-sub text-warning"> Selections</span>
                      <span className="hero-kpi-sub">  - IIT, AIIMS, Top Govt Colleges</span>
                    </h1>
                    <p className="fs-5 text-white mb-4 pb-2">
                      IIT - JEE <span className="text-warning fw-bold">|</span> Medical <span className="text-warning fw-bold">|</span> Foundation <span className="text-warning fw-bold">|</span> Career Counselling
                    </p>

                    <div className="hero-cta-group">
                        <div className="d-flex flex-wrap align-items-center gap-2 mb-4 text-white">
                          <span className="label-dashed">ADMISSION OPEN 2026</span>
                          <span className="label-dashed">LIMITED SEATS</span>
                        </div>
                        <button
                          onClick={() => setIsModalOpen(true)}
                          className="btn btn-yellow rounded-pill py-2 px-3 py-md-3 px-md-4 fw-bold animated slideInRight flashing-button"
                        >
                          Join Now<i className="fa fa-arrow-right ms-2"></i>
                        </button>
                        <p className="flashing-text text-warning fw-bold mt-2 mb-0">
                          Batch Starting in April 2026
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="carousel-item">
            <div className="owl-carousel-item position-relative">
              <picture>
                <source media="(max-width: 768px)" srcSet="/img/IITians_width.jpg" />
                <img className="img-fluid" src="/img/IITians.jpg" alt="IITians at Adhyant" loading="lazy" />
              </picture>
              <div
                className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center"
              >
              </div>
            </div>
          </div>
          <div className="carousel-item">
            <div className="owl-carousel-item position-relative">
              <picture>
                <source media="(max-width: 768px)" srcSet="/img/NEET_width.jpg" />
                <img className="img-fluid" src="/img/NEET.jpg" alt="NEET Preparation at Adhyant" loading="lazy" />
              </picture>
              <div
                className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center"
              >
              </div>
            </div>
          </div>
        </div>

        <button
          className="carousel-control-prev"
          type="button"
          data-bs-target="#carouselExampleControlsNoTouching"
          data-bs-slide="prev"
        >
          <span
            className="carousel-control-prev-icon"
            aria-hidden="true"
          ></span>
          <span className="visually-hidden">Previous</span>
        </button>
        <button
          className="carousel-control-next"
          type="button"
          data-bs-target="#carouselExampleControlsNoTouching"
          data-bs-slide="next"
        >
          <span
            className="carousel-control-next-icon"
            aria-hidden="true"
          ></span>
          <span className="visually-hidden">Next</span>
        </button>
      </div>
      
      <RegistrationModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </>
  );
}
