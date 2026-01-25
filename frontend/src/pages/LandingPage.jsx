import React from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';

const LandingPage = () => {
  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', color: '#1e293b', lineHeight: 1.5 }}>
      <Navbar />
      
      {/* Hero Section */}
      <section style={{ 
        padding: '6rem 2rem', 
        textAlign: 'center', 
        background: 'linear-gradient(180deg, #f0f9ff 0%, #ffffff 100%)',
        borderBottom: '1px solid #e2e8f0'
      }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <h1 style={{ 
            fontSize: 'clamp(2.5rem, 5vw, 4.5rem)', 
            fontWeight: '800', 
            marginBottom: '1.5rem', 
            lineHeight: 1.1,
            letterSpacing: '-0.02em'
          }}>
            Stop Burnout <br />
            <span style={{ 
              background: 'linear-gradient(to right, #2563eb, #9333ea)', 
              WebkitBackgroundClip: 'text', 
              WebkitTextFillColor: 'transparent' 
            }}>Before It Starts.</span>
          </h1>
          <p style={{ 
            fontSize: '1.25rem', 
            color: '#64748b', 
            marginBottom: '3rem', 
            maxWidth: '700px', 
            marginLeft: 'auto', 
            marginRight: 'auto' 
          }}>
            The intelligent platform that uses AI to predict workplace fatigue, prevent exhaustion, and help teams thrive without compromising privacy.
          </p>
          
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/signup" style={{ 
              backgroundColor: '#2563eb', 
              color: 'white',
              padding: '1rem 2.5rem', 
              borderRadius: '8px', 
              fontSize: '1.1rem', 
              fontWeight: '600', 
              textDecoration: 'none',
              boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2), 0 2px 4px -1px rgba(37, 99, 235, 0.1)',
              transition: 'transform 0.2s'
            }}>
              Get Started for Free
            </Link>
            <Link to="/login" style={{ 
              backgroundColor: 'white', 
              color: '#334155',
              border: '1px solid #cbd5e1', 
              padding: '1rem 2.5rem', 
              borderRadius: '8px', 
              fontSize: '1.1rem', 
              fontWeight: '600', 
              textDecoration: 'none' 
            }}>
              Log In
            </Link>
            <a href="https://form.typeform.com/to/T3EsMpRg" 
               target="_blank" 
               rel="noopener noreferrer"
               style={{ 
              backgroundColor: 'white', 
              color: '#334155', 
              border: '1px solid #cbd5e1', 
              padding: '1rem 2.5rem', 
              borderRadius: '8px', 
              fontSize: '1.1rem', 
              fontWeight: '600', 
              textDecoration: 'none' 
            }}>
              Pilot Enrolment
            </a>
            <Link to="/feedback" style={{ 
              backgroundColor: 'white', 
              color: '#334155', 
              border: '1px solid #cbd5e1', 
              padding: '1rem 2.5rem', 
              borderRadius: '8px', 
              fontSize: '1.1rem', 
              fontWeight: '600', 
              textDecoration: 'none' 
            }}>
              Feedback Suggestion
            </Link>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section style={{ padding: '6rem 2rem', background: 'white' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <h2 style={{ fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '1rem', color: '#0f172a' }}>Why BurnoutAI?</h2>
            <p style={{ fontSize: '1.2rem', color: '#64748b' }}>We combine behavioral science with privacy-first analytics.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
            {/* Feature 1 */}
            <div style={{ padding: '2rem', borderRadius: '16px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔮</div>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#1e293b' }}>Predictive Analytics</h3>
              <p style={{ color: '#64748b', lineHeight: 1.6 }}>
                Our algorithms analyze workload, sleep patterns, and stress indicators to forecast burnout risk weeks before it becomes a problem.
              </p>
            </div>

            {/* Feature 2 */}
            <div style={{ padding: '2rem', borderRadius: '16px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🛡️</div>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#1e293b' }}>Privacy by Design</h3>
              <p style={{ color: '#64748b', lineHeight: 1.6 }}>
                Employee data is aggregated and anonymized. Employers see team trends, but never individual scores. Psychological safety is our priority.
              </p>
            </div>

            {/* Feature 3 */}
            <div style={{ padding: '2rem', borderRadius: '16px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚡</div>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#1e293b' }}>Actionable Insights</h3>
              <p style={{ color: '#64748b', lineHeight: 1.6 }}>
                Don't just track problems—solve them. Get tailored recommendations for workload balancing, recovery days, and team habits.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Preview / Value Prop */}
      <section style={{ padding: '6rem 2rem', background: '#1e293b', color: 'white' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>
              For Employees & Employers
            </h2>
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1.25rem', color: '#60a5fa', marginBottom: '0.5rem' }}>👩‍💻 For Employees</h3>
              <p style={{ color: '#cbd5e1', lineHeight: 1.6 }}>
                A private safe space to track your energy, get personalized recovery tips, and visualize your work-life balance trends without fear of judgment.
              </p>
            </div>
            <div>
              <h3 style={{ fontSize: '1.25rem', color: '#a78bfa', marginBottom: '0.5rem' }}>🏢 For Employers</h3>
              <p style={{ color: '#cbd5e1', lineHeight: 1.6 }}>
                See the "weather report" of your organization. Identify teams at risk of attrition and simulate the impact of policy changes like "No-Meeting Fridays".
              </p>
            </div>
          </div>
          <div style={{ 
            background: 'rgba(255,255,255,0.1)', 
            borderRadius: '16px', 
            padding: '2rem', 
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}>
            {/* Mock UI */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
              <div style={{ fontWeight: 'bold' }}>Team Health Dashboard</div>
              <div style={{ color: '#4ade80' }}>● Stable</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'end', height: '150px', gap: '10px', marginBottom: '1rem' }}>
              <div style={{ flex: 1, background: '#ef4444', height: '40%', borderRadius: '4px 4px 0 0', opacity: 0.8 }}></div>
              <div style={{ flex: 1, background: '#f59e0b', height: '60%', borderRadius: '4px 4px 0 0', opacity: 0.8 }}></div>
              <div style={{ flex: 1, background: '#10b981', height: '80%', borderRadius: '4px 4px 0 0', opacity: 0.8 }}></div>
              <div style={{ flex: 1, background: '#10b981', height: '75%', borderRadius: '4px 4px 0 0', opacity: 0.8 }}></div>
              <div style={{ flex: 1, background: '#3b82f6', height: '90%', borderRadius: '4px 4px 0 0', opacity: 0.8 }}></div>
            </div>
            <div style={{ fontSize: '0.9rem', color: '#94a3b8', textAlign: 'center' }}>
              Real-time aggregated risk analysis
            </div>
          </div>
        </div>
      </section>

      {/* CTA Footer */}
      <section style={{ padding: '6rem 2rem', textAlign: 'center', background: 'linear-gradient(180deg, #ffffff 0%, #f0f9ff 100%)' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#0f172a' }}>
            Ready to build a healthier workplace?
          </h2>
          <p style={{ fontSize: '1.25rem', color: '#64748b', marginBottom: '3rem' }}>
            Join hundreds of teams using BurnoutAI to protect their most valuable asset: their people.
          </p>
          <Link to="/signup" style={{ 
            backgroundColor: '#2563eb', 
            color: 'white', 
            padding: '1rem 3rem', 
            borderRadius: '8px', 
            fontSize: '1.2rem', 
            fontWeight: '600', 
            textDecoration: 'none',
            boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.3)'
          }}>
            Start Your Free Pilot
          </Link>
          <p style={{ marginTop: '1.5rem', fontSize: '0.9rem', color: '#94a3b8' }}>
            No credit card required. Cancel anytime.
          </p>
        </div>
      </section>

      {/* Simple Footer */}
      <footer style={{ padding: '2rem', borderTop: '1px solid #e2e8f0', textAlign: 'center', color: '#64748b', fontSize: '0.9rem' }}>
        <p>&copy; {new Date().getFullYear()} BurnoutAI. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default LandingPage;
