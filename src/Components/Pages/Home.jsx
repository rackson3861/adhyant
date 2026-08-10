import React from 'react'
import { Link } from 'react-router-dom'
import Navbar from './Navbar'
import Slide from './Slide'
import Service from './Service'
import About from './About'
import Courses from './Courses'
import Team from './Team'
import Footer from './Footer'
import Spinner from './Spinner'
import Contact from './Contact'
import BotpressChatbot from '../Ebook/BotpressChatbot'

export default function Home() {
    return (
        <>
            <Spinner/>
            <Navbar/>
            <Slide/>
            {/* Sign up for Test (Online & Offline) - shareable link for students */}
            {/* No exam currently scheduled - re-enable when a new entrance exam date is announced.
            <div className="container py-4 test-signup-banner-wrap">
                <div className="row justify-content-center">
                    <div className="col-12">
                        <div className="test-signup-banner">
                            <div className="test-signup-banner-inner">
                                <span className="test-signup-banner-badge">Online & Offline</span>
                                <h5 className="test-signup-banner-title">Upcoming Entrance Exam</h5>
                                <p className="test-signup-banner-desc test-signup-banner-date">28th March</p>
                                <Link to="/test-form" className="test-signup-banner-btn">
                                    Sign up for test
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            */}
            <Service/>
            <About/>
            {/* <Courses/> */}
            <Team/>
            <Footer/>
            <a href="#" className="btn btn-primary back-to-top"><i className="bi bi-arrow-up"></i></a>
        </>
    )
}
