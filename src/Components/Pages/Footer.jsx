import React from "react";

export default function Footer() {
  return (
    <>
      <div
        className="container-fluid bg-dark text-light footer pt-5 mt-5 wow fadeIn"
        data-wow-delay="0.1s"
      >
        <div className="container py-5">
          <div className="row g-5">
          <div className="col-lg-3 col-md-6">
              <h4 className="text-white mb-3">About Us</h4>
              <p>
              Adhyant is a coaching institute helping students excel in <b>IIT-JEE, NEET, and foundational learning</b>.
              <ul className="about-points">
                <li>Concept-Focused Teaching</li>
                <li>Expert Mentorship</li>
                <li>Career Guidance</li>
              </ul>
              </p>

              {/* <div
                className="position-relative mx-auto"
                style={{ maxWidth: "400px" }}
              >
                <input
                  className="form-control border-0 w-100 py-3 ps-4 pe-5"
                  type="text"
                  placeholder="Your email"
                />
                <button
                  type="button"
                  className="btn btn-primary py-2 position-absolute top-0 end-0 mt-2 me-2"
                >
                  SignUp
                </button>
              </div> */}
            </div>
            <div className="col-lg-3 col-md-6">
              <h4 className="text-white mb-3">Quick Link</h4>
              <a className="btn btn-link" href>
                About Us
              </a>
              <a className="btn btn-link" href>
                Contact Us
              </a>
              <a className="btn btn-link" href>
                Privacy Policy
              </a>
              <a className="btn btn-link" href>
                Terms &amp; Condition
              </a>
              <a className="btn btn-link" href>
                FAQs &amp; Help
              </a>
            </div>
            <div className="col-lg-3 col-md-6">
              <h4 className="text-white mb-3">Contact</h4>
              <p className="mb-2">
                <i className="fa fa-map-marker-alt me-3" />
                Bhiwadi, Rajasthan, India
              </p>
              <p className="mb-2">
                <i className="fa fa-phone-alt me-3" />
                +91 8233366371
              </p>
              <p className="mb-2">
                <i className="fa fa-envelope me-3" />
                adhyantforyou@gmail.com
              </p>
              <div className="d-flex pt-2">
                <a
                  className="btn btn-outline-light btn-social"
                  href="https://www.youtube.com/@AdhyantForYou"
                  target="_blank"
                >
                  <i className="fab fa-youtube" />
                </a>
                <a
    className="btn btn-outline-light btn-social"
    href="https://www.instagram.com/adhyantforyou/" // Replace with your Instagram URL
    target="_blank"
  >
    <i className="fab fa-instagram" />
    </a>
                <a
                  className="btn btn-outline-light btn-social"
                  href="https://www.facebook.com/adhyantforyou/"
                  target="_blank"
                >
                  <i className="fab fa-facebook-f" />
                </a>
                <a
                  className="btn btn-outline-light btn-social"
                  href="https://www.linkedin.com/company/adhyantforyou/"
                  target="_blank"
                >
                  <i className="fab fa-linkedin-in" />
                </a>

                <a
    className="btn btn-outline-light btn-social"
    href="https://x.com/AdhyantForYou" // Replace with your Twitter URL
    target="_blank"
  >
    <i className="fab fa-twitter" />
  </a>

              </div>
            </div>
            <div className="col-lg-3 col-md-6">
              <h4 className="text-white mb-3">Gallery</h4>
              <div className="row g-2 pt-2">
                <div className="col-4">
                  <img
                    className="img-fluid bg-light p-1"
                    src="/img/course-1.jpg"
                    alt=""
                  />
                </div>
                <div className="col-4">
                  <img
                    className="img-fluid bg-light p-1"
                    src="/img/course-2.jpg"
                    alt=""
                  />
                </div>
                <div className="col-4">
                  <img
                    className="img-fluid bg-light p-1"
                    src="/img/course-3.jpg"
                    alt=""
                  />
                </div>
                <div className="col-4">
                  <img
                    className="img-fluid bg-light p-1"
                    src="/img/course-2.jpg"
                    alt=""
                  />
                </div>
                <div className="col-4">
                  <img
                    className="img-fluid bg-light p-1"
                    src="/img/course-3.jpg"
                    alt=""
                  />
                </div>
                <div className="col-4">
                  <img
                    className="img-fluid bg-light p-1"
                    src="/img/course-1.jpg"
                    alt=""
                  />
                </div>
              </div>
            </div>

          </div>
        </div>
        <div className="container">
          <div className="copyright">
            <div className="row">
              <div className="col-md-6 text-center text-md-start mb-3 mb-md-0">
                ©{" "}
                <a className="border-bottom" href>
                  ADHYANT
                </a>
                , All Right Reserved. Designed By{" "}
                <a
                  className="border-bottom"
                  href="https://www.linkedin.com/in/basant-kumar-bharati"
                  target="_blank"
                >
                  ADHYANT FOR YOU Team
                </a>
                <br />
                <br />
              </div>
              {/* <div className="col-md-6 text-center text-md-end">
                <div className="footer-menu">
                  <a href>Home</a>
                  <a href>Cookies</a>
                  <a href>Help</a>
                  <a href>FQAs</a>
                </div>
              </div> */}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
