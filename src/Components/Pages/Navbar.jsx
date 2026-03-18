import React, { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import RegistrationModal from "./RegistrationModal";
import { useAdmin } from "../../context/AdminContext";

export default function Navbar() {
  const { isAdmin, logoutAdmin } = useAdmin();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleJoinNowClick = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  return (
    <>
      <nav className="navbar navbar-expand-lg navbar-dark shadow sticky-top p-0 adhyant-navbar">
        <Link
          to="/"
          className="navbar-brand d-flex align-items-center px-4 px-lg-5"
        >
          <h2 className="m-0 fw-bold text-white">
            <i className="fa fa-book me-3 text-white"></i>ADHYANT
          </h2>
        </Link>
        <button
          type="button"
          className="navbar-toggler me-4 text-white"
          data-bs-toggle="collapse"
          data-bs-target="#navbarCollapse"
        >
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className="collapse navbar-collapse" id="navbarCollapse">
          <div className="navbar-nav ms-auto p-4 p-lg-0">
            <NavLink to="/" className="nav-item nav-link" activeClassName="active">Home</NavLink>
            <NavLink to="/about" className="nav-item nav-link" activeClassName="active">About</NavLink>
            <NavLink to="/courses" className="nav-item nav-link" activeClassName="active">Courses</NavLink>
            <NavLink to="/team" className="nav-item nav-link" activeClassName="active">Our Team</NavLink>
            <NavLink to="/contact" className="nav-item nav-link" activeClassName="active">Contact</NavLink>
            <NavLink to="/test" className="nav-item nav-link nav-link-highlight" activeClassName="active">Take Test</NavLink>
            <NavLink to="/test-form" className="nav-item nav-link nav-link-highlight" activeClassName="active">Upcoming Entrance Exam</NavLink>
            {isAdmin && (
              <NavLink to="/admin" className="nav-item nav-link" activeClassName="active">Admin</NavLink>
            )}
            <a
              onClick={handleJoinNowClick}
              className="nav-item nav-link d-lg-none"
              style={{ cursor: "pointer", fontWeight: "700", color: "var(--primary)" }}
            >
              Join Now <i className="fa fa-arrow-right ms-2"></i>
            </a>
          </div>

          {isAdmin ? (
            <>
              <Link to="/admin" className="btn btn-outline-light py-2 px-3 me-2 d-none d-lg-inline-block">Admin</Link>
              <button
                type="button"
                className="btn btn-outline-light py-2 px-3 d-none d-lg-inline-block"
                onClick={() => { logoutAdmin(); window.location.href = "/"; }}
              >
                Logout
              </button>
            </>
          ) : (
            <button
              className="btn btn-primary py-4 px-lg-5 d-none d-lg-block"
              style={{ backgroundColor: "var(--primary)", borderColor: "var(--primary)" }}
              onClick={handleJoinNowClick}
            >
              Join Now<i className="fa fa-arrow-right ms-3"></i>
            </button>
          )}
        </div>
      </nav>

      <RegistrationModal isOpen={isModalOpen} onClose={handleCloseModal} />
    </>
  );
}
