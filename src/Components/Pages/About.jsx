import React from "react";

export default function About() {
  return (
    <>
      <div className="container-xxl py-5">
        <div className="container">
          <div className="row g-5">
            <div
              className="col-lg-6 wow fadeInUp"
              data-wow-delay="0.1s"
              style={{ minHeight: "400px" }}
            >
              <div className="h-100 d-flex align-items-center">
                <img
                  className="img-fluid w-100 border p-2"
                  src="/img/Aboutus.svg"
                  alt="about jpg"
                  style={{ objectFit: "cover", maxHeight: "100%" }}
                />
              </div>
            </div>
            <div className="col-lg-6 wow fadeInUp" data-wow-delay="0.3s">
  <h6 className="section-title bg-white text-start text-primary pe-3">
    About Us
  </h6>
  <h1 className="mb-4">Welcome to ADHYANT for you</h1>
  <p className="mb-4">
    Welcome to <strong>Adhyant</strong>, where learning goes beyond marks and ranks. We believe true education is about building strong fundamentals, clear concepts, and the confidence to succeed in competitive exams and future careers.
  </p>
  <p>
  At Adhyant, we guide students preparing for <b>IIT-JEE, NEET (Medical),</b> and <b>Foundation programs,</b> while also providing <b>career counselling</b> to help them make informed academic choices. Our teaching approach focuses on conceptual clarity, problem-solving skills, and consistent practice.
  </p>
  <p className="mb-4">
  Our programs are led by <b>experienced faculty and mentors</b> who understand student challenges and exam patterns deeply. With structured learning paths, personalized attention, and continuous guidance, we help students progress with confidence and purpose.
  </p>
  <div className="row gy-2 gx-4 mb-4">
    <div className="col-sm-6">
      <p className="mb-0">
        <i className="fa fa-arrow-right text-primary me-2" />
        IIT-JEE Coaching
      </p>
    </div>
    <div className="col-sm-6">
      <p className="mb-0">
        <i className="fa fa-arrow-right text-primary me-2" />
        NEET (Medical) Coaching
      </p>
    </div>
    <div className="col-sm-6">
      <p className="mb-0">
        <i className="fa fa-arrow-right text-primary me-2" />
        Foundation Courses
      </p>
    </div>
    <div className="col-sm-6">
      <p className="mb-0">
        <i className="fa fa-arrow-right text-primary me-2" />
        Career Counselling & Guidance
      </p>
    </div>
    <div className="col-sm-6">
      <p className="mb-0">
        <i className="fa fa-arrow-right text-primary me-2" />
        Personalized Mentorship
      </p>
    </div>
    <div className="col-sm-6">
      <p className="mb-0">
        <i className="fa fa-arrow-right text-primary me-2" />
        Result-Oriented Learning Approach
      </p>
    </div>
  </div>
  {/* <a className="btn btn-primary py-3 px-5 mt-2" href="#">Read More</a> */}
</div>

          </div>
        </div>
      </div>
    </>
  );
}
