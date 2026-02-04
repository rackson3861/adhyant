import React, { useState, useEffect } from "react";
import "../../assets/css/Courses.css";

export default function Cources() {
  const [spacing, setSpacing] = useState('0px');

  useEffect(() => {
    const updateSpacing = () => {
      const newSpacing = window.innerWidth < 768 ? '200px' : '0px';
      setSpacing(newSpacing);
      console.log('Screen width:', window.innerWidth, 'Spacing:', newSpacing);
    };
    
    updateSpacing();
    window.addEventListener('resize', updateSpacing);
    
    return () => window.removeEventListener('resize', updateSpacing);
  }, []);

  return (
    <>
      {/* *********** CATAGORY ************** */}

      <div 
        className="container-xxl category courses-section"
        style={{ 
          marginTop: spacing,
          paddingTop: '3rem',
          paddingBottom: '3rem'
        }}
      >
  <div className="container">
  <div className="text-center wow fadeInUp" data-wow-delay="0.1s">
  <h6 className="section-title bg-white text-center text-primary px-3">
    Explore Our Offerings
  </h6>
  <h1 className="mb-5">Courses Crafted for Aspirations That Soar</h1>
</div>


    <div className="row g-4 justify-content-center">
      {/* JEE */}
      <div className="col-lg-6 col-md-6 wow zoomIn" data-wow-delay="0.1s">
        <div className="position-relative d-block overflow-hidden">
          <img className="img-fluid" src="/img/IITPreparation.png" alt="JEE Courses" />
          <div 
            className="course-label"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              padding: '1rem 1.5rem',
              borderRadius: '0.5rem',
              minWidth: '200px'
            }}
          >
            <h5 className="m-0">JEE Preparation</h5>
            <small className="text-primary">4 Courses</small>
          </div>
        </div>
      </div>

      {/* NEET */}
      <div className="col-lg-6 col-md-6 wow zoomIn" data-wow-delay="0.3s">
        <div className="position-relative d-block overflow-hidden">
          <img className="img-fluid" src="/img/NEET_Preparation.png" alt="NEET Courses" />
          <div 
            className="course-label"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              padding: '1rem 1.5rem',
              borderRadius: '0.5rem',
              minWidth: '200px'
            }}
          >
            <h5 className="m-0">NEET Preparation</h5>
            <small className="text-primary">4 Courses</small>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
    </>
  );
}
