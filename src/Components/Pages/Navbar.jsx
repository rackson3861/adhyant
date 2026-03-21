import React, { useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import RegistrationModal from "./RegistrationModal";
import { useAdmin } from "../../context/AdminContext";

export default function Navbar() {
  const { isAdmin } = useAdmin();
  const location = useLocation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const onAdminPage = location.pathname === "/admin";

  /** React Router v6: use className callback instead of removed activeClassName. */
  const navClass = (base) => ({ isActive }) => `${base}${isActive ? " active" : ""}`;

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
            <NavLink to="/" className={navClass("nav-item nav-link")}>Home</NavLink>
            <NavLink to="/about" className={navClass("nav-item nav-link")}>About</NavLink>
            <NavLink to="/courses" className={navClass("nav-item nav-link")}>Courses</NavLink>
            <NavLink to="/team" className={navClass("nav-item nav-link")}>Our Team</NavLink>
            <NavLink to="/contact" className={navClass("nav-item nav-link")}>Contact</NavLink>
            <NavLink to="/test" className={navClass("nav-item nav-link nav-link-highlight")}>Take Test</NavLink>
            <NavLink to="/test-form" className={navClass("nav-item nav-link nav-link-highlight")}>Upcoming Entrance Exam</NavLink>
            {isAdmin && !onAdminPage && (
              <NavLink to="/admin" className={navClass("nav-item nav-link")}>Admin</NavLink>
            )}
            <a
              onClick={handleJoinNowClick}
              className="nav-item nav-link d-lg-none"
              style={{ cursor: "pointer", fontWeight: "700", color: "var(--primary)" }}
            >
              Join Now <i className="fa fa-arrow-right ms-2"></i>
            </a>
          </div>

          {isAdmin && !onAdminPage ? (
            <Link to="/admin" className="btn btn-outline-light py-2 px-3 d-none d-lg-inline-block">Admin</Link>
          ) : !isAdmin ? (
            <button
              className="btn btn-primary py-4 px-lg-5 d-none d-lg-block"
              style={{ backgroundColor: "var(--primary)", borderColor: "var(--primary)" }}
              onClick={handleJoinNowClick}
            >
              Join Now<i className="fa fa-arrow-right ms-3"></i>
            </button>
          ) : null}
        </div>
      </nav>

      <RegistrationModal isOpen={isModalOpen} onClose={handleCloseModal} />
    </>
  );
}
