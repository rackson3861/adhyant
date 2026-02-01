import React from "react";
import { Link } from "react-router-dom";
import Coursestructure from "../Course/Coursestructure";

export default function Cources() {
  const obj1 = {
    time: "0.1s",
    img: "/img/course-1.jpg",
    readlink:
      "https://en.wikipedia.org/wiki/Outline_of_web_design_and_web_development",
    join: "/courses/fullstack",
    price: "$389.00",
    review: 245,
    title: "Web Design & Development Course for Beginners",
    teachername: "Basant",
    duration: "9.50 Hrs",
    totalstudent: "335",
  };

  const obj2 = {
    time: "0.3s",
    img: "/img/java.jpg",
    readlink: "https://en.wikipedia.org/wiki/Java_(programming_language)",
    join: "/courses/java",
    price: "$189.00",
    review: 85,
    title: "Basic & Core Java Programming Language",
    teachername: "Basant",
    duration: "4.50 Hrs",
    totalstudent: "65",
  };

  const obj3 = {
    time: "0.5s",
    img: "/img/course-3.jpg",
    readlink: "https://en.wikipedia.org/wiki/Data_structure",
    join: "/courses/dsa",
    price: "$219.00",
    review: 95,
    title: "Data Structure & Algorithms Using Java",
    teachername: "Basant",
    duration: "4.50 Hrs",
    totalstudent: "57",
  };

  return (
    <>
      {/* *********** CATAGORY ************** */}

      <div className="container-xxl py-5 category">
  <div className="container">
  <div className="text-center wow fadeInUp" data-wow-delay="0.1s">
  <h6 className="section-title bg-white text-center text-primary px-3">
    Explore Our Offerings
  </h6>
  <h1 className="mb-5">Courses Crafted for Aspirations That Soar</h1>
</div>


    <div className="row g-3">
      <div className="col-lg-7 col-md-6">
        <div className="row g-3">
          {/* JEE */}
          <div className="col-lg-12 col-md-12 wow zoomIn" data-wow-delay="0.1s">
            <Link className="position-relative d-block overflow-hidden" to="/courses/jee">
              <img className="img-fluid" src="/img/IITPreparation.png" alt="JEE Courses" />
              <div className="bg-white text-center position-absolute bottom-0 end-0 py-2 px-3" style={{ margin: "1px" }}>
                <h5 className="m-0">JEE Preparation</h5>
                <small className="text-primary">4 Courses</small>
              </div>
            </Link>
          </div>

          {/* Programming */}
          <div className="col-lg-6 col-md-12 wow zoomIn" data-wow-delay="0.3s">
            <Link className="position-relative d-block overflow-hidden" to="/courses/programming">
              <img className="img-fluid" src="/img/tech-career.png" alt="Programming Courses" />
              <div className="bg-white text-center position-absolute bottom-0 end-0 py-2 px-3" style={{ margin: "1px" }}>
                <h5 className="m-0">Programming & Logic Building</h5>
                <small className="text-primary">8 Courses</small>
              </div>
            </Link>
          </div>

          {/* Mentorship */}
          <div className="col-lg-6 col-md-12 wow zoomIn" data-wow-delay="0.5s">
            <Link className="position-relative d-block overflow-hidden" to="/courses/mentorship">
              <img className="img-fluid" src="/img/languages.jpg" alt="Mentorship" />
              <div className="bg-white text-center position-absolute bottom-0 end-0 py-2 px-3" style={{ margin: "1px" }}>
                <h5 className="m-0">Mentorship for Tech Careers</h5>
                <small className="text-primary">4 Tracks</small>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* NEET */}
      <div className="col-lg-5 col-md-6 wow zoomIn" data-wow-delay="0.7s" style={{ minHeight: "350px" }}>
        <Link className="position-relative d-block h-100 overflow-hidden" to="/courses/neet">
          <img className="img-fluid position-absolute w-100 h-100" src="/img/NEET_Preparation.png" alt="NEET Courses" style={{ objectFit: "cover" }} />
          <div className="bg-white text-center position-absolute bottom-0 end-0 py-2 px-3" style={{ margin: "1px" }}>
            <h5 className="m-0">NEET Preparation</h5>
            <small className="text-primary">4 Courses</small>
          </div>
        </Link>
      </div>
    </div>
  </div>
</div>


      {/* ************** COURSES ***************/}

      <div className="container-xxl py-5">
        <div className="container">
          <div className="text-center wow fadeInUp" data-wow-delay="0.1s">
            <h6 className="section-title bg-white text-center text-primary px-3">
              Courses
            </h6>
            <h1 className="mb-5">Popular Courses</h1>
          </div>
          <div className="row g-4 justify-content-center">
            <Coursestructure data={obj1} />
            <Coursestructure data={obj2} />
            <Coursestructure data={obj3} />
          </div>
        </div>
      </div>
    </>
  );
}
