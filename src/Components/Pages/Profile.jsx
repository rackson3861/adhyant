import React from "react";
import { Link } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./Footer";

export default function Profile() {
  return (
    <>
      <Navbar />
      <div className="container py-5 text-center">
        <p className="text-muted">Use <Link to="/admin">Admin</Link> to manage tests and generate test codes.</p>
        <Link to="/" className="btn btn-primary">Home</Link>
      </div>
      <Footer />
    </>
  );
}
