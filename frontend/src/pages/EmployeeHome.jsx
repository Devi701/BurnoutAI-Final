import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import { useUser } from '../context/UserContext';
import { fetchPersonalHistory, fetchActionPlans, trackActionPlan, fetchPlanTracking, fetchSurveyStatus } from '../services/api';
import { analytics } from '../services/analytics';
import PilotSurveyModal from '../components/PilotSurveyModal';
import JoinCompany from '../components/JoinCompany';

export default function EmployeeHome() {
  const { user } = useUser();
  const [history, setHistory] = useState(null);
  const [latestPlan, setLatestPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Flow Guide State
  const [activeFlowStep, setActiveFlowStep] = useState(1);

  const handleFlowAdvance = (step) => {
    if (activeFlowStep === step) {
      let next = step + 1;
      // Logic handled in useEffect, but for immediate click feedback:
      // If moving from 3 (Results) and we have a plan, go to 5 (Tracking). Else 4.
      if (step === 3 && latestPlan) next = 5;
      if (next === 5 && !latestPlan) next = 6; 
      sessionStorage.setItem('burnout_flow_step', next); // Persist progress
      setActiveFlowStep(next);
    }
  };
  
  // Tracking State
  const [trackingHistory, setTrackingHistory] = useState([]);
  const [todayTracking, setTodayTracking] = useState({});
  const [activeReasonInput, setActiveReasonInput] = useState(null);
  const [reasonText, setReasonText] = useState('');
  
  // Survey State
  const [showSurvey, setShowSurvey] = useState(false);
  const [activeDaysCount, setActiveDaysCount] = useState(0);
  const analyticsSent = useRef(false);

  const loadUserData = async () => {
    try {
      const [data, plans] = await Promise.all([
        fetchPersonalHistory(user.id),
        fetchActionPlans(user.id).catch(() => [])
      ]);

      setHistory(data);
      
      // Flow Guide: Auto-advance based on completion status
      let calculatedStep = 1;
      if (data?.hasBaseline) {
        calculatedStep = 2; // Baseline established -> Go to Daily Check-in
        
        // If already checked in today, go to View Results
        const lastDate = data.dates && data.dates.length > 0 
          ? new Date(data.dates[data.dates.length - 1]).toLocaleDateString() 
          : null;
        const today = new Date().toLocaleDateString();
        if (lastDate === today) calculatedStep = 3;
      }

      // Recover session progress (e.g. if they clicked View Results and came back)
      const storedStep = Number.parseInt(sessionStorage.getItem('burnout_flow_step') || '0');
      let finalStep = Math.max(calculatedStep, storedStep);

      // Smart Skips based on Data
      // 1. If at Step 4 (Simulator) but Plan exists -> Skip to 5 (Tracking)
      if (finalStep === 4 && plans && plans.length > 0) finalStep = 5;
      
      setActiveFlowStep(finalStep);

      if (plans && plans.length > 0) {
        const plan = plans[plans.length - 1];
        setLatestPlan(plan);
        
        // Fetch tracking for this plan
        try {
          const tracks = await fetchPlanTracking(plan.id);
          setTrackingHistory(tracks);
          
          // Check if we have tracking for today
          const todayStr = new Date().toISOString().split('T')[0];
          const todayRecord = tracks.find(t => t.date === todayStr);
          if (todayRecord) {
            setTodayTracking(typeof todayRecord.data === 'string' ? JSON.parse(todayRecord.data) : todayRecord.data);
            
            // If we have tracking data and we are at step 5, move to 6
            if (finalStep === 5) {
               setActiveFlowStep(6);
            }
          }
        } catch (e) {
          console.error("Failed to load tracking", e);
        }
      }

      // Check Survey Eligibility
      try {
        const surveyStatus = await fetchSurveyStatus(user.id);
        console.log('[Analytics] Survey Status Check:', surveyStatus);
        // TEMPORARY: Lower threshold to 1 day for testing
        if (!surveyStatus.completed && surveyStatus.activeDays >= 1) {
          setActiveDaysCount(surveyStatus.activeDays);
          setShowSurvey(true);
          analytics.capture('pilot_survey_viewed', { days_active: surveyStatus.activeDays });
        }
      } catch (e) { console.error("Survey check failed", e); }

      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initialize/Identify user for analytics
    if (user) {
      analytics.identify(user);
    }

    if (user) {
      loadUserData();
    }
  }, [user]);

  // Track Burnout Score View & Primary Signal
  useEffect(() => {
    if (history && history.datasets && !analyticsSent.current) {
      const riskScores = history.datasets.risk || [];
      const currentScore = riskScores.length > 0 ? riskScores[riskScores.length - 1] : 0;
      const weeklyAvg = calculateAvg([...riskScores].reverse().slice(0, 7)) ?? 0;
      const riskBand = getSeverity(currentScore === 0 ? 'N/A' : currentScore).label;

      analytics.capture('burnout_score_viewed', {
        current_score: currentScore,
        weekly_avg: weeklyAvg || 0,
        risk_band: riskBand
      });

      if (history.topBurnoutFactor && history.topBurnoutFactor.topFactor !== 'N/A') {
        analytics.capture('primary_signal_identified', {
          signal_name: history.topBurnoutFactor.topFactor,
          contribution_percent: history.topBurnoutFactor.contributionPercent
        });
      }
      
      analyticsSent.current = true;
    }
  }, [history]);

  // Calculations
  const hasBaseline = history?.hasBaseline || false;
  const riskScores = history?.datasets?.risk || [];
  const latestRisk = riskScores.length > 0 ? Math.round(riskScores[riskScores.length - 1]) : 'N/A';
  
  // Weekly Average (Rolling last 7)
  const reversedScores = [...riskScores].reverse();
  const thisWeekScores = reversedScores.slice(0, 7);
  const calculateAvg = (arr) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
  const thisWeekAvg = calculateAvg(thisWeekScores);
  
  // Check-in Logic (1 per day)
  const todayStr = new Date().toLocaleDateString();
  const lastCheckinDate = history?.dates?.length > 0 
    ? new Date(history.dates[history.dates.length - 1]).toLocaleDateString() 
    : null;
  const hasCheckedInToday = todayStr === lastCheckinDate;
  const isTestUser = user?.email?.toLowerCase() === 'testuser@gmail.com';

  // Severity Logic
  const getSeverity = (score) => {
    if (score === 'N/A') return { label: 'Unknown', color: '#64748b' };
    if (score < 30) return { label: 'Low', color: '#10b981' };
    if (score < 60) return { label: 'Moderate', color: '#f59e0b' };
    return { label: 'High', color: '#ef4444' };
  };

  const severity = getSeverity(latestRisk);

  const handleTrackAction = async (actionType, status, reason = null) => {
    if (!latestPlan) return;
    
    const entry = { completed: status };
    if (reason) entry.reason = reason;

    const newTracking = { ...todayTracking, [actionType]: entry };
    setTodayTracking(newTracking);
    if (status === false) setActiveReasonInput(null); // Close input if saving a 'No'

    const todayStr = new Date().toISOString().split('T')[0];
    
    try {
      await trackActionPlan({
        userId: user.id,
        planId: latestPlan.id,
        date: todayStr,
        data: newTracking
      });
      
      // Update local history for adherence calc
      const otherDays = trackingHistory.filter(t => t.date !== todayStr);
      const updatedHistory = [...otherDays, { date: todayStr, data: newTracking }];
      setTrackingHistory(updatedHistory);

      // Calculate new completion percent for analytics
      // (Simplified: just tracking that an update occurred)
      analytics.capture('action_plan_progress_updated', {
        action_type: actionType,
        status: status
      });
    } catch (e) {
      console.error("Tracking failed", e);
    }
  };

  // Calculate Adherence Score
  // (Total Yes / Total Questions Answered) * 100
  let totalChecks = 0;
  let totalYes = 0;
  trackingHistory.forEach(t => {
    const data = typeof t.data === 'string' ? JSON.parse(t.data) : t.data;
    const values = Object.values(data);
    totalChecks += values.length;
    // Handle both legacy boolean and new object structure
    totalYes += values.filter(v => v === true || (typeof v === 'object' && v.completed)).length;
  });
  const adherenceScore = totalChecks > 0 ? Math.round((totalYes / totalChecks) * 100) : 0;

  const getQuestionText = (type, value) => {
    switch(type) {
      case 'vacation_days': return `Did you take a vacation day?`;
      case 'sleep_hours': return `Did you get ${value} hours of sleep?`;
      case 'workload_reduction': return `Did you reduce workload by ${value}%?`;
      case 'boundary_hour': return `Did you stop working at ${value}:00?`;
      case 'movement_sessions': return `Did you do a movement session?`;
      default: return `Did you complete: ${type}?`;
    }
  };

  const getWeeklyProgress = (actionType, target) => {
    if (actionType !== 'movement_sessions') return null;

    const now = new Date();
    const day = now.getDay() || 7; // 1 (Mon) to 7 (Sun)
    const startOfWeek = new Date(now);
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(now.getDate() - day + 1); // Set to Monday
    
    const startStr = startOfWeek.toISOString().split('T')[0];

    let count = 0;
    trackingHistory.forEach(t => {
      if (t?.date >= startStr) {
        const data = typeof t.data === 'string' ? JSON.parse(t.data) : t.data;
        const entry = data[actionType];
        if (entry === true || (entry && entry.completed)) {
          count++;
        }
      }
    });
    
    return `(Progress: ${count}/${target} this week)`;
  };

  const getAdherenceFeedback = (actionType) => {
    const now = new Date();
    const day = now.getDay() || 7; // 1 (Mon) to 7 (Sun)
    const startOfWeek = new Date(now);
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(now.getDate() - day + 1);
    const startStr = startOfWeek.toISOString().split('T')[0];

    let completed = 0;
    let tracked = 0;

    trackingHistory.forEach(t => {
      if (t?.date >= startStr) {
        const data = typeof t.data === 'string' ? JSON.parse(t.data) : t.data;
        if (data?.[actionType] !== undefined) {
          tracked++;
          const entry = data[actionType];
          if (entry === true || (entry && entry.completed)) {
            completed++;
          }
        }
      }
    });

    // Threshold: At least 3 tracked days, and >= 60% completion
    if (tracked >= 3 && (completed / tracked) >= 0.6) {
      const verbs = {
        vacation_days: 'took time off',
        sleep_hours: 'hit your sleep target',
        workload_reduction: 'reduced workload',
        boundary_hour: 'kept your boundary',
        movement_sessions: 'moved',
        social_minutes: 'connected socially'
      };
      const verb = verbs[actionType] || 'did this';
      return `You ${verb} on ${completed} out of ${tracked} days - great habit-building!`;
    }
    return null;
  };

  return (
    <>
      <Navbar streak={history?.streak} />
      <div className="container">
        <h1>Welcome, {user?.name || 'Employee'}</h1>
        
        {loading && <p>Loading your wellness data...</p>}

        {!loading && (
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            
            {/* MAIN COLUMN */}
            <div style={{ flex: 2, minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            
              {/* 0. Baseline Assessment Section (Conditional) - Shows at top if needed */}
              {!hasBaseline && (
                <div className={`card ${activeFlowStep === 1 ? 'flow-step' : ''}`} role="button" tabIndex="0" onKeyDown={(e) => e.key === 'Enter' && handleFlowAdvance(1)} onClick={() => handleFlowAdvance(1)} style={{ borderLeft: '5px solid #2563eb', backgroundColor: '#eff6ff' }}>
                  <h3>Initialize Your Baseline</h3>
                  <p>To get accurate predictions, please complete a one-time baseline assessment.</p>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                    <Link to="/full-test" className="quiz-button" style={{ textDecoration: 'none', flex: 1, textAlign: 'center' }}>
                      Full Assessment (Recommended, ~5 min)
                    </Link>
                    <Link to="/small-test" style={{ textDecoration: 'none', flex: 1 }}>
                      <button style={{ width: '100%', padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '4px', color: '#334155', fontWeight: 'bold', cursor: 'pointer' }}>
                        Quick Assessment (~1 min)
                      </button>
                    </Link>
                  </div>
                </div>
              )}

              {/* 1. Burnout Risk Indicator (Primary) */}
              <div className={`card ${activeFlowStep === 1 ? 'flow-step' : ''}`} role="button" tabIndex="0" onKeyDown={(e) => e.key === 'Enter' && handleFlowAdvance(1)} onClick={() => handleFlowAdvance(1)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3>Burnout Risk Indicator</h3>
                  {hasBaseline && <span style={{ color: '#10b981', fontWeight: 'bold', fontSize: '0.9rem' }}>Baseline established ✓</span>}
                </div>
                
                <div style={{ display: 'flex', gap: '3rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                  {/* Today's Score */}
                  <div>
                    <div className="small" style={{ color: '#64748b', marginBottom: '0.5rem' }}>Today's Score</div>
                    <div style={{ fontSize: '3.5rem', fontWeight: '800', color: severity.color, lineHeight: 1 }}>
                      {latestRisk}
                    </div>
                    <div style={{ color: severity.color, fontWeight: 'bold', marginTop: '0.5rem' }}>
                      {severity.label} Risk
                    </div>
                  </div>

                  {/* Weekly Average */}
                  <div style={{ borderLeft: '1px solid #e2e8f0', paddingLeft: '3rem' }}>
                    <div className="small" style={{ color: '#64748b', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      Weekly Average&nbsp;
                      <span title="The weekly score smooths daily variation by averaging your last 7 check-ins." style={{ cursor: 'help', fontSize: '0.8rem', background: '#e2e8f0', borderRadius: '50%', width: '16px', height: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>?</span>
                    </div>
                    <div style={{ fontSize: '3.5rem', fontWeight: '800', color: '#334155', lineHeight: 1 }}>
                      {thisWeekAvg !== null ? thisWeekAvg : 'N/A'}
                    </div>
                    <div className="small" style={{ color: '#64748b', marginTop: '0.5rem' }}>
                      Last 7 Check-ins
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Daily Check-in CTA */}
              <div className={`card hover-lift ${activeFlowStep === 2 ? 'flow-step' : ''}`} role="button" tabIndex="0" onKeyDown={(e) => e.key === 'Enter' && handleFlowAdvance(2)} onClick={() => handleFlowAdvance(2)} style={{ padding: '2rem', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Daily Check-in</h3>
                <p style={{ color: '#64748b', marginBottom: '1.5rem', fontSize: '1.1rem' }}>Log your stress, sleep, and workload to keep your risk score accurate.</p>
                
                {hasCheckedInToday && !isTestUser ? (
                  <button disabled style={{ width: '100%', padding: '1rem', background: '#e2e8f0', border: 'none', borderRadius: '4px', color: '#64748b', fontWeight: 'bold', cursor: 'not-allowed' }}>
                    Check-in Complete for Today
                  </button>
                ) : (
                  <Link to="/checkin" style={{ textDecoration: 'none' }}>
                    <button className="quiz-button btn-animate" style={{ width: '100%', padding: '1.2rem', fontSize: '1.2rem', fontWeight: 'bold' }}>
                      Start Daily Check-in
                    </button>
                  </Link>
                )}
              </div>

              {/* 3. Action Plan Section (Plan Progress + Daily Action Tracker) */}
              {latestPlan && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1.5rem' }}>
                  {/* Stats Card */}
                  <div className={`card hover-lift ${activeFlowStep === 5 ? 'flow-step' : ''}`} role="button" tabIndex="0" onKeyDown={(e) => e.key === 'Enter' && handleFlowAdvance(5)} onClick={() => handleFlowAdvance(5)} style={{ borderLeft: '5px solid #8b5cf6', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <h3 style={{ marginTop: 0, color: '#5b21b6', fontSize: '1.1rem' }}>Plan Progress</h3>
                    
                    <div style={{ marginBottom: '1rem' }}>
                      <div className="small" style={{ color: '#64748b' }}>Adherence Score</div>
                      <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: adherenceScore > 70 ? '#10b981' : '#f59e0b' }}>
                        {adherenceScore}%
                      </div>
                    </div>

                    <div>
                      <div className="small" style={{ color: '#64748b' }}>Projected Score (3 Months)</div>
                      <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: latestPlan.projectedScore < latestPlan.baselineScore ? '#10b981' : '#64748b' }}>
                        {latestPlan.projectedScore}
                      </div>
                      <div className="small" style={{ color: '#94a3b8' }}>
                        (Baseline: {latestPlan.baselineScore})
                      </div>
                    </div>
                  </div>

                  {/* Daily Tracker Card */}
                  <div className="card hover-lift">
                    <h3 style={{ marginTop: 0, fontSize: '1.1rem' }}>Daily Action Tracker</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginTop: '1rem' }}>
                      {latestPlan.actions.map((action) => (
                        <div key={action.type} style={{ paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: '0.9rem', color: '#334155' }}>{getQuestionText(action.type, action.value)}</span>
                              {action.type === 'movement_sessions' && (
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{getWeeklyProgress(action.type, action.value)}</span>
                              )}
                              {getAdherenceFeedback(action.type) && (
                                <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 'bold', display: 'block', marginTop: '2px' }}>{getAdherenceFeedback(action.type)}</span>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button 
                                onClick={() => { setActiveReasonInput(null); handleTrackAction(action.type, true); }} 
                                style={{ padding: '4px 12px', borderRadius: '4px', border: '1px solid #10b981', background: (todayTracking[action.type] === true || todayTracking[action.type]?.completed === true) ? '#10b981' : 'white', color: (todayTracking[action.type] === true || todayTracking[action.type]?.completed === true) ? 'white' : '#10b981', cursor: 'pointer', transition: 'all 0.2s' }}
                              >
                                Yes
                              </button>
                              <button 
                                onClick={() => { setActiveReasonInput(action.type); setReasonText(''); }} 
                                style={{ padding: '4px 12px', borderRadius: '4px', border: '1px solid #ef4444', background: (todayTracking[action.type] === false || todayTracking[action.type]?.completed === false) ? '#ef4444' : 'white', color: (todayTracking[action.type] === false || todayTracking[action.type]?.completed === false) ? 'white' : '#ef4444', cursor: 'pointer', transition: 'all 0.2s' }}
                              >
                                No
                              </button>
                            </div>
                          </div>
                          
                          {/* Reason Input */}
                          {activeReasonInput === action.type && (
                            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                              <input 
                                type="text" 
                                name="reasonText"
                                placeholder="Why not? (e.g. Too tired, No time)" 
                                value={reasonText}
                                onChange={(e) => setReasonText(e.target.value)}
                                style={{ flex: 1, padding: '4px 8px', fontSize: '0.85rem', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                              />
                              <button onClick={() => handleTrackAction(action.type, false, reasonText)} style={{ fontSize: '0.8rem', padding: '4px 8px', cursor: 'pointer', backgroundColor: '#64748b', color: 'white', border: 'none', borderRadius: '4px' }}>Save Log</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* SIDE COLUMN */}
            <div style={{ flex: 1, minWidth: '250px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* 1. Actions to reduce burnout risk (Simulator CTA) */}
              <div className={`card hover-lift ${activeFlowStep === 4 ? 'flow-step' : ''}`} role="button" tabIndex="0" onKeyDown={(e) => e.key === 'Enter' && handleFlowAdvance(4)} onClick={() => handleFlowAdvance(4)} style={{ borderLeft: '5px solid #8b5cf6', backgroundColor: '#f5f3ff', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                <h3 style={{ marginTop: 0, color: '#5b21b6' }}>Actions to reduce burnout risk</h3>
                <p style={{ color: '#4c1d95' }}>
                  Simulate how changes in sleep, workload, and boundaries can lower your risk score.
                </p>
                <Link to="/impact" style={{ textDecoration: 'none' }}>
                  <button className="quiz-button btn-animate" style={{ backgroundColor: '#7c3aed', marginTop: '0.5rem' }}>
                    Open Simulator
                  </button>
                </Link>
              </div>

              {/* Gamification Hub Link */}
              <Link to="/gamification" style={{ textDecoration: 'none' }} role="button" tabIndex="0" onKeyDown={(e) => e.key === 'Enter' && handleFlowAdvance(6)}>
                <div className={`card hover-lift ${activeFlowStep === 6 ? 'flow-step' : ''}`} onClick={() => handleFlowAdvance(6)} style={{ 
                  borderLeft: '5px solid #f59e0b', 
                  backgroundColor: '#fffbeb', 
                  textAlign: 'center',
                  cursor: 'pointer'
                }}>
                  <h3 style={{ marginTop: 0, color: '#d97706' }}>🏆 Rewards & Leaderboard</h3>
                  <p style={{ color: '#92400e', fontSize: '0.9rem', margin: 0 }}>
                    Track your XP, badges, and compete with your team.
                  </p>
                </div>
              </Link>

              {/* 2. View your results */}
              <Link to="/history" style={{ textDecoration: 'none', flex: 1, display: 'flex' }} role="button" tabIndex="0" onKeyDown={(e) => e.key === 'Enter' && handleFlowAdvance(3)}>
                <div className={`card hover-lift ${activeFlowStep === 3 ? 'flow-step' : ''}`} onClick={() => handleFlowAdvance(3)} style={{ textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '150px', backgroundColor: '#fff', border: '1px solid #e2e8f0', width: '100%' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>📊</div>
                  <h3 style={{fontSize: '1.2rem', margin: '0.5rem 0'}}>View your results</h3>
                  <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>See your trends over time</p>
                </div>
              </Link>

              {/* Join/Leave Company Card */}
              <JoinCompany />

              <div style={{ fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center', padding: '0 1rem' }}>
                <p>🔒 <strong>Privacy Reassurance:</strong> Your employer cannot see your individual scores. All team insights are anonymised.</p>
              </div>

              <div style={{ marginTop: '1rem', textAlign: 'center' }}> 
                <Link to="/settings" style={{ color: '#94a3b8', fontSize: '0.9rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2-.35l-.18-.18a2 2 0 0 0-2.83 0l-.44.44a2 2 0 0 0 0 2.83l.18.18a2 2 0 0 1 .35 2l-.25.43a2 2 0 0 1-1.73 1H2a2 2 0 0 0-2 2v.44a2 2 0 0 0 2 2h.18a2 2 0 0 1 1.73 1l.25.43a2 2 0 0 1-.35 2l-.18.18a2 2 0 0 0 0 2.83l.44.44a2 2 0 0 0 2.83 0l.18-.18a2 2 0 0 1 2 .35l.43.25a2 2 0 0 1 1 1.73V22a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 .35l.18.18a2 2 0 0 0 2.83 0l.44-.44a2 2 0 0 0 0-2.83l-.18-.18a2 2 0 0 1-.35-2l.25-.43a2 2 0 0 1 1.73-1H22a2 2 0 0 0 2-2v-.44a2 2 0 0 0-2-2h-.18a2 2 0 0 1-1.73-1l-.25-.43a2 2 0 0 1 .35-2l.18-.18a2 2 0 0 0 0-2.83l-.44-.44a2 2 0 0 0-2.83 0l-.18.18a2 2 0 0 1-2-.35l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                  Settings
                </Link> 
              </div> 
            </div>

          </div>
        )}

        {showSurvey && (
          <PilotSurveyModal 
            userId={user.id} 
            companyCode={user.companyCode} 
            activeDays={activeDaysCount} 
            onClose={() => setShowSurvey(false)} 
          />
        )}
      </div>
    </>
  );
}
