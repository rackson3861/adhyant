import React from 'react'

export default function Service() {
  return (
    <>
     <div className="container-xxl py-5">
  <div className="container">
    <div className="row g-4">
      {/* JEE Preparation */}
      <div className="col-lg-3 col-sm-6 wow fadeInUp" data-wow-delay="0.1s">
        <div className="service-item text-center pt-3">
          <div className="p-4" style={{ cursor: 'default' }}>
            <i className="fa fa-3x fa-lightbulb text-primary mb-4" />
            <h5 className="mb-3">IIT-JEE Preparation</h5>
            <p>Crack JEE with structured guidance, problem-solving depth, and mentorship from IITians who've done it.</p>
          </div>
        </div>
      </div>

      {/* NEET Preparation */}
      <div className="col-lg-3 col-sm-6 wow fadeInUp" data-wow-delay="0.3s">
        <div className="service-item text-center pt-3">
          <div className="p-4" style={{ cursor: 'default' }}>
            <i className="fa fa-3x fa-heartbeat text-primary mb-4" />
            <h5 className="mb-3">NEET Preparation</h5>
            <p>
  Build strong fundamentals and clinical reasoning with expert mentorship for future medical professionals.
</p>
          </div>
        </div>
      </div>

      {/* Foundation */}
      <div className="col-lg-3 col-sm-6 wow fadeInUp" data-wow-delay="0.5s">
        <div className="service-item text-center pt-3">
          <div className="p-4" style={{ cursor: 'default' }}>
            <i className="fa fa-3x fa-seedling text-primary mb-4" />
            <h5 className="mb-3">Foundation</h5>
            <p>Build strong academic foundations early with conceptual clarity, logical thinking, and confidence for success.
            </p>
          </div>
        </div>
      </div>

      {/* Career Counselling */}
      <div className="col-lg-3 col-sm-6 wow fadeInUp" data-wow-delay="0.7s">
        <div className="service-item text-center pt-3">
          <div className="p-4" style={{ cursor: 'default' }}>
            <i className="fa fa-3x fa-rocket text-primary mb-4" />
            <h5 className="mb-3">Career Counselling</h5>
            <p>Discover the right career path with expert guidance, personalized mentoring, and long-term clarity and confidence.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

    </>
  )
}
