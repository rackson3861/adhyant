import React, { useState } from 'react'
import Navbar from './Navbar'
import { Link } from 'react-router-dom'
import "/src/assets/css/test.css"
import Footer from './Footer'

const MOTIVATIONAL_QUOTES = [
  "The only way to do great work is to love what you do. — Steve Jobs",
  "Success is not final, failure is not fatal: it is the courage to continue that counts. — Winston Churchill",
  "Believe you can and you're halfway there. — Theodore Roosevelt",
  "The future belongs to those who believe in the beauty of their dreams. — Eleanor Roosevelt",
  "Don't watch the clock; do what it does. Keep going. — Sam Levenson",
  "Your limitation—it's only your imagination.",
  "Step out of your comfort zone.\nGreat things never come from playing it safe.\nYour dream college is one bold step away.",
  "Dream it. Wish it. Do it.",
]

const EXAMS = [
  { label: 'Adhyant Entract Exam - IITJEE 2027', to: '/test/online', tag: 'IITJEE' },
  { label: 'Adhyant Entract Exam - IITJEE 2028', to: '/test/online', tag: 'IITJEE' },
  { label: 'Adhyant Entract Exam - IITJEE 2029', to: '/test/online', tag: 'IITJEE' },
  { label: 'Adhyant Entract Exam - IITJEE 2030', to: '/test/online', tag: 'IITJEE' },
  { label: 'Adhyant Entract Exam - NEET 2027', to: '/test/online', tag: 'NEET' },
  { label: 'Adhyant Entract Exam - NEET 2028', to: '/test/online', tag: 'NEET' },
  { label: 'Adhyant Entract Exam - NEET 2029', to: '/test/online', tag: 'NEET' },
  { label: 'Adhyant Entract Exam - NEET 2030', to: '/test/online', tag: 'NEET' },
]

export default function Test() {
  const [quoteIndex] = useState(() => Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length))
  const quote = MOTIVATIONAL_QUOTES[quoteIndex]
  const iitjeeExams = EXAMS.filter((e) => e.tag === 'IITJEE')
  const neetExams = EXAMS.filter((e) => e.tag === 'NEET')

  return (
    <>
      <Navbar />
      <section className="test-hero">
        <div className="test-hero-bg" />
        <div className="test-hero-overlay" />
        <div className="test-hero-content container text-center">
          <h1 className="test-hero-title">Adhyant Entrance Exams</h1>
          <p className="test-hero-subtitle">Choose your exam and prove your potential. One step closer to your dream college.</p>
          <blockquote className="test-quote">
            <span className="test-quote-icon">“</span>
            <p className="test-quote-text">{quote}</p>
          </blockquote>
        </div>
      </section>

      <section className="test-exams py-5">
        <div className="container">
          <div className="test-exams-layout">
            <div className="test-exams-side test-exams-side-left">
              <img src="https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=500" alt="IIT JEE" className="test-side-img" referrerPolicy="no-referrer" />
            </div>
            <div className="test-exams-center">
              <div className="test-exams-grid">
                <div className="test-exam-group">
                  <h2 className="test-group-title">
                    <span className="test-group-badge test-group-iitjee">IITJEE</span>
                  </h2>
                  <div className="test-exam-cards">
                    {iitjeeExams.map((exam) => (
                      <Link key={exam.label} to={exam.to} className="test-exam-card">
                        <span className="test-exam-year">{exam.label.replace('Adhyant Entract Exam - IITJEE ', '')}</span>
                        <span className="test-exam-label">IITJEE</span>
                      </Link>
                    ))}
                  </div>
                </div>
                <div className="test-exam-group">
                  <h2 className="test-group-title">
                    <span className="test-group-badge test-group-neet">NEET</span>
                  </h2>
                  <div className="test-exam-cards">
                    {neetExams.map((exam) => (
                      <Link key={exam.label} to={exam.to} className="test-exam-card">
                        <span className="test-exam-year">{exam.label.replace('Adhyant Entract Exam - NEET ', '')}</span>
                        <span className="test-exam-label">NEET</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="test-exams-side test-exams-side-right">
              <img src="https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=500" alt="NEET" className="test-side-img" referrerPolicy="no-referrer" />
            </div>
          </div>
        </div>
      </section>

      <section className="test-cta py-4">
        <div className="container text-center">
          <p className="test-cta-text mb-0">Prepare well. Stay focused. You’ve got this.</p>
        </div>
      </section>

      <Footer />
    </>
  )
}
