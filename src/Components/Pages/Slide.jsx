import React, { useEffect, useState } from "react";
import "../../assets/css/Slide.css";
import { Link } from "react-router-dom";
import RegistrationModal from "./RegistrationModal";

export default function Slide() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleAdmissionClick = (e) => {
    e.preventDefault();
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const el = document.getElementById("carouselExampleControlsNoTouching");
    const bootstrap = window.bootstrap;
    if (!el || !bootstrap || !bootstrap.Carousel) return;
    let instance = bootstrap.Carousel.getInstance
      ? bootstrap.Carousel.getInstance(el)
      : null;
    if (!instance) {
      instance = new bootstrap.Carousel(el, {
        interval: 3000,
        pause: false,
        ride: "carousel",
        touch: false,
        wrap: true,
      });
    }
    instance.cycle && instance.cycle();
    return () => {
      instance && instance.dispose && instance.dispose();
    };
  }, []);
  return (
    <>
      <div
        id="carouselExampleControlsNoTouching"
        className="carousel slide"
        data-bs-touch="false"
        data-bs-ride="carousel"
        data-bs-interval="15000"
        data-bs-pause="false"
      >
        <div className="carousel-inner">
          <div className="carousel-item active">
            <div className="owl-carousel-item position-relative">
              <img src="/img/imagescrollerfinal.svg" alt="" />
              <div
                className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center"
              >
                <div className="container">
                  <div className="row justify-content-start">
                    <div className="col-sm-10 col-lg-8 slide-text-up">
                    <h6 className="text-white text-uppercase mb-2 animated slideInDown">
                    Coaching with Purpose & Precision — Now in Bhiwadi
                    </h6>
                    <h1 className="display-4 text-white animated slideInDown">
                    Mentored By <span className="text-warning fw-bold">IITians,</span>

                    <br/>
                    Destined for <span className="text-warning fw-bold">Excellence</span>
                    </h1>
                    <p className="fs-5 text-white mb-4 pb-2">
                      IIT - JEE <span className="text-warning fw-bold">|</span> Medical <span className="text-warning fw-bold">|</span> Foundation <span className="text-warning fw-bold">|</span> Career Counselling
                    </p>

                    <button
                        onClick={handleAdmissionClick}
                        className="btn btn-yellow rounded-pill py-md-3 px-md-4 fw-bold animated slideInRight"
                      >
                        ADMISSIONS OPEN 2026 | LIMITED SEATS
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="carousel-item">
            <div className="owl-carousel-item position-relative">
              <img className="img-fluid" src="/img/imagescrollerfinal.svg" alt="" />
              <div
                className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center"
              >
                <div className="container">
                  <div className="row justify-content-start">
                    <div className="col-sm-10 col-lg-8 slide-text-up">
                    <h6 className="text-white text-uppercase mb-2 animated slideInDown">
                      Coaching with Purpose & Precision — Now in Bhiwadi
                    </h6>
                    <h1 className="display-4 text-white animated slideInDown">
                    Mentored By <span className="text-warning fw-bold">IITians,</span>

                    <br/>
                    Destined for <span className="text-warning fw-bold">Excellence</span>
                    </h1>
                    <p className="fs-5 text-white mb-4 pb-2">
                      IIT - JEE <span className="text-warning fw-bold">|</span> Medical <span className="text-warning fw-bold">|</span> Foundation <span className="text-warning fw-bold">|</span> Career Counselling

                    </p>
                    <ul className="list-unstyled text-white fs-5 mb-0">
                        <li className="mb-1">📘 <span className="text-warning fw-bold">10+ Years</span> of Teaching Excellence</li>
                        <li className="mb-1">🏆 <span className="text-warning fw-bold">State Toppers</span> - JEE & NEET</li>
                        <li className="mb-1">🎯 <span className="text-warning fw-bold">500+ Selections</span> – IIT • NEET • Top Govt Colleges</li>
                        <li className="mb-1">🌍 <span className="text-warning fw-bold">National Olympiad</span> Selections</li>
                      </ul>
                      <br/>

                      <button
                        onClick={handleAdmissionClick}
                        className="btn btn-yellow rounded-pill py-md-3 px-md-4 fw-bold animated slideInRight"
                      >
                        ADMISSIONS OPEN 2026 | LIMITED SEATS
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="carousel-item">
            <div className="owl-carousel-item position-relative">
              <img className="img-fluid" src="/img/students.png" alt="" />
              <div
                className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center"
              >
                <div className="container">
                  <div className="row justify-content-start">
                    <div className="col-sm-10 col-lg-8 slide-text-up">
                    <h6 className="text-white text-uppercase mb-2 animated slideInDown">
                      Coaching with Purpose & Precision — Now in Bhiwadi
                    </h6>
                    <h1 className="display-4 text-white animated slideInDown">
                    Mentored By <span className="text-warning fw-bold">IITians,</span>

                    <br/>
                    Destined for <span className="text-warning fw-bold">Excellence</span>
                    </h1>
                    <p className="fs-5 text-white mb-4 pb-2">
                      IIT - JEE <span className="text-warning fw-bold">|</span> Medical <span className="text-warning fw-bold">|</span> Foundation <span className="text-warning fw-bold">|</span> Career Counselling
                    </p>

                      <Link
                        to="/courses"
                        className="btn btn-yellow rounded-pill py-md-3 px-md-4 animated slideInRight"
                      >
                        ADMISSIONS OPEN 2026 | LIMITED SEATS
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="carousel-item">
            <div className="owl-carousel-item position-relative">
              <img className="img-fluid" src="/img/imageslide1.svg" alt="" />
              <div
                className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center"
              >
                <div className="container">
                  <div className="row justify-content-start">
                    <div className="col-sm-10 col-lg-8 slide-text-up">
                    <h6 className="text-white text-uppercase mb-2 animated slideInDown">
                      Coaching with Purpose & Precision — Now in Bhiwadi
                    </h6>
                    <h1 className="display-4 text-white animated slideInDown">
                    Mentored By <span className="text-warning fw-bold">IITians,</span>

                    <br/>
                    Destined for <span className="text-warning fw-bold">Excellence</span>
                    </h1>
                    <p className="fs-5 text-white mb-4 pb-2">
                      IIT - JEE <span className="text-warning fw-bold">|</span> Medical <span className="text-warning fw-bold">|</span> Foundation <span className="text-warning fw-bold">|</span> Career Counselling
                    </p>

                      <Link
                        to="/courses"
                        className="btn btn-yellow rounded-pill py-md-3 px-md-4 animated slideInRight"
                      >
                        ADMISSIONS OPEN 2026 | LIMITED SEATS
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="carousel-item">
            <div className="owl-carousel-item position-relative">
              <img className="img-fluid" src="/img/imageslide1.svg" alt="" />
              <div
                className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center"
              >
                <div className="container">
                  <div className="row justify-content-start">
                    <div className="col-sm-10 col-lg-8 slide-text-up">
                    <h6 className="text-white text-uppercase mb-2 animated slideInDown">
                      Coaching with Purpose & Precision — Now in Bhiwadi
                    </h6>
                    <h1 className="display-4 text-white animated slideInDown">
                    Mentored By <span className="text-warning fw-bold">IITians,</span>

                    <br/>
                    Destined for <span className="text-warning fw-bold">Excellence</span>
                    </h1>
                    <p className="fs-5 text-white mb-4 pb-2">
                      IIT - JEE <span className="text-warning fw-bold">|</span> Medical <span className="text-warning fw-bold">|</span> Foundation <span className="text-warning fw-bold">|</span> Career Counselling
                    </p>

                      <Link
                        to="/courses"
                        className="btn btn-yellow rounded-pill py-md-3 px-md-4 animated slideInRight"
                      >
                        ADMISSIONS OPEN 2026 | LIMITED SEATS
                      </Link>
                    </div>
                  </div>
                </div>
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
      
      <RegistrationModal isOpen={isModalOpen} onClose={handleCloseModal} />
    </>
  );
}
