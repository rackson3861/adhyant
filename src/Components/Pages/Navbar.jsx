import React, { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import Spinner from "./Spinner";
import RegistrationModal from "./RegistrationModal";

export default function Navbar() {
  const { user, isAuthenticated, isLoading, logout, loginWithRedirect } =
    useAuth0();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleJoinNowClick = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  return (
    <>
      <nav className="navbar navbar-expand-lg bg-white navbar-light shadow sticky-top p-0">
        <Link
          to="/"
          className="navbar-brand d-flex align-items-center px-4 px-lg-5"
        >
          <h2 className="m-0 text-primary fw-bold">
            <i className="fa fa-book me-3"></i>ADHYANT
          </h2>
        </Link>
        <button
          type="button"
          className="navbar-toggler me-4"
          data-bs-toggle="collapse"
          data-bs-target="#navbarCollapse"
        >
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className="collapse navbar-collapse" id="navbarCollapse">
          <div className="navbar-nav ms-auto p-4 p-lg-0">
            <NavLink
              exact
              to="/"
              className="nav-item nav-link"
              activeClassName="active"
            >
              Home
            </NavLink>
            <NavLink
              to="/about"
              className="nav-item nav-link"
              activeClassName="active"
            >
              About
            </NavLink>
            <NavLink
              to="/courses"
              className="nav-item nav-link"
              activeClassName="active"
            >
              Courses
            </NavLink>
            <NavLink
              to="/team"
              className="nav-item nav-link"
              activeClassName="active"
            >
              Our Team
            </NavLink>
            <NavLink
              to="/contact"
              className="nav-item nav-link"
              activeClassName="active"
            >
              Contact
            </NavLink>
          </div>

          {isLoading && <Spinner />}

          {isAuthenticated && (
            <NavLink
              to="/profile"
              className="nav-item nav-link"
              activeClassName="active"
            >
              {user.name}
            </NavLink>
          )}
          {isAuthenticated ? (
            <button
              className="btn btn-primary py-4 px-lg-5 d-none d-lg-block"
              onClick={() =>
                logout({ logoutParams: { returnTo: window.location.origin } })
              }
            >
              Log out
            </button>
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
