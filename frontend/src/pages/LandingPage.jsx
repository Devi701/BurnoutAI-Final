import React from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';

export default function LandingPage() {
  return (
    <div className="page">
      <Navbar />

      <header className="hero">
        <div className="hero-inner">
          <h1 className="hero-title">
            Stop burnout
            <br />
            <span className="hero-title-accent">before it starts</span>.
          </h1>

          <p className="hero-subtitle">
            A privacy-first way to spot fatigue early, make smarter changes, and keep teams steady.
          </p>

          <div className="hero-actions">
            <Link className="btn btn-primary" to="/signup">
              Get started
            </Link>
            <Link className="btn btn-secondary" to="/login">
              Log in
            </Link>
            <a className="btn btn-secondary" href="https://form.typeform.com/to/T3EsMpRg" target="_blank" rel="noopener noreferrer">
              Pilot enrolment
            </a>
            <Link className="btn btn-secondary" to="/feedback">
              Send feedback
            </Link>
          </div>

          <div className="hero-footnote">No credit card required.</div>
        </div>
      </header>

      <section className="section">
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 22 }}>
            <h2 style={{ margin: 0, fontSize: '2.35rem' }}>Why BurnoutAI</h2>
            <p style={{ margin: '10px auto 0', maxWidth: 720, color: 'var(--muted)', fontSize: '1.15rem' }}>
              Behavioral science, aggregated signals, and practical next steps.
            </p>
          </div>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-kicker">Signals</div>
              <h3 className="feature-title">Early warning, not surveillance</h3>
              <p className="feature-body">
                We look for patterns that correlate with fatigue and overload. Employers see trends, not individuals.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-kicker">Privacy</div>
              <h3 className="feature-title">Designed for psychological safety</h3>
              <p className="feature-body">
                Data stays aggregated. Teams get insights without creating another “tool people fear.”
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-kicker">Action</div>
              <h3 className="feature-title">Recommendations you can actually ship</h3>
              <p className="feature-body">
                Simple levers: meeting pressure, workload spikes, recovery time, and follow-through. No theatrics.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-dark">
        <div className="container split">
          <div>
            <h2 style={{ marginTop: 0, fontSize: '2.35rem' }}>For employees and employers</h2>

            <div style={{ marginBottom: 18 }}>
              <div className="feature-kicker" style={{ color: 'rgba(231, 238, 252, 0.65)' }}>
                Employees
              </div>
              <p style={{ margin: '8px 0 0', color: 'rgba(231, 238, 252, 0.80)', lineHeight: 1.65 }}>
                Track your energy and get small, personal nudges that don’t feel like a lecture.
              </p>
            </div>

            <div>
              <div className="feature-kicker" style={{ color: 'rgba(231, 238, 252, 0.65)' }}>
                Employers
              </div>
              <p style={{ margin: '8px 0 0', color: 'rgba(231, 238, 252, 0.80)', lineHeight: 1.65 }}>
                See the “weather report” for teams and test policy changes before they backfire.
              </p>
            </div>
          </div>

          <div className="mock" aria-label="Dashboard preview">
            <div className="mock-top">
              <div style={{ fontWeight: 750 }}>Team health</div>
              <div className="mock-status">Stable</div>
            </div>
            <div className="bars" aria-hidden="true">
              <div className="bar b1" />
              <div className="bar b2" />
              <div className="bar b3" />
              <div className="bar b4" />
              <div className="bar b5" />
            </div>
            <div style={{ fontSize: '0.95rem', color: 'rgba(231, 238, 252, 0.62)', textAlign: 'center' }}>
              Aggregated signals, weekly trends, and small interventions.
            </div>
          </div>
        </div>
      </section>

      <section className="section section-muted">
        <div className="container" style={{ textAlign: 'center', maxWidth: 920 }}>
          <h2 style={{ margin: 0, fontSize: '2.35rem' }}>Ready to make work feel lighter?</h2>
          <p style={{ margin: '12px auto 0', color: 'var(--muted)', fontSize: '1.15rem', maxWidth: 720 }}>
            Start a pilot, invite a team, and iterate. You can keep it simple and still get value.
          </p>
          <div style={{ marginTop: 22 }}>
            <Link className="btn btn-primary" to="/signup">
              Start a pilot
            </Link>
          </div>
          <div className="hero-footnote">You can cancel anytime.</div>
        </div>
      </section>

      <footer className="section-tight" style={{ textAlign: 'center', color: 'rgba(15, 23, 42, 0.56)' }}>
        <div className="container">
          <p style={{ margin: 0 }}>&copy; {new Date().getFullYear()} BurnoutAI.</p>
        </div>
      </footer>
    </div>
  );
}

