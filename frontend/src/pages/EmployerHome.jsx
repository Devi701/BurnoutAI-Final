import React, { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  ArcElement,
  RadialLinearScale
} from 'chart.js';
import { Bar, Line, Pie, Radar } from 'react-chartjs-2';
import Navbar from '../components/layout/Navbar';
import { useUser } from '../context/UserContext';
import { fetchWeeklyReport, fetchComprehensiveTeamReport, fetchEmployees, fetchTeams, createTeam, assignEmployeeToTeam, deleteTeam, fetchTeamMetrics, fetchSurveys, createSurvey, activateSurvey, fetchSurveyResults, simulateEmployerAction } from '../services/api';
import { analytics } from '../services/analytics';
import PilotEnrollmentPopup from '../components/PilotEnrollmentPopup';


ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  ArcElement,
  RadialLinearScale
);

const SIM_ACTION_TYPES = [
  { id: 'workload', label: 'Reduce Workload', desc: 'Rebalance tasks and reduce ticket load.' },
  { id: 'recovery', label: 'Recovery Support', desc: 'Time off, wellness budget, and recovery practices.' },
  { id: 'meeting_reduction', label: 'Cut Meetings', desc: 'Reduce meeting hours and meeting frequency.' },
  { id: 'focus_blocks', label: 'Focus Blocks', desc: 'Protected blocks to reduce fragmentation.' },
  { id: 'async_hours', label: 'Async Hours', desc: 'Cut after-hours communication load.' },
  { id: 'staffing', label: 'Add Staffing', desc: 'Backfill or hire to reduce pressure.' },
  { id: 'process_automation', label: 'Process Automation', desc: 'Automate low-value workflows.' }
];

const generateLandscapeData = (report) => {
  const gridResolution = 20;
  const grid = new Array(gridResolution).fill().map(() => new Array(gridResolution).fill(0));
  
  if (!report?.riskDistribution) return grid;

  const { low, moderate, high, critical } = report?.riskDistribution || {};
  
  // Helper to add random points in a zone with Gaussian-like distribution
  const addPoints = (count, xMin, xMax, yMin, yMax) => {
    for (let i = 0; i < count; i++) {
      // Simple random distribution within bounds
      const x = Math.floor(xMin + Math.random() * (xMax - xMin));
      const y = Math.floor(yMin + Math.random() * (yMax - yMin));
      
      if (grid[y]?.[x] !== undefined) {
        grid[y][x]++;
      }
    }
  };

  // Mapping Logic:
  // X-axis: Stress (0 = Low, 19 = High)
  // Y-axis: Recovery (0 = Low, 19 = High)
  
  // Low Risk (Green): Low Stress (0-8), High Recovery (12-19)
  addPoints(low, 0, 9, 12, 20);
  
  // Moderate Risk (Yellow): Mid Stress (5-14), Mid Recovery (6-14)
  addPoints(moderate, 5, 15, 6, 15);
  
  // High Risk (Orange): High Stress (12-19), Low/Mid Recovery (3-10)
  addPoints(high, 12, 20, 3, 11);
  
  // Critical Risk (Red): Very High Stress (15-19), Very Low Recovery (0-5)
  addPoints(critical, 15, 20, 0, 6);

  return grid;
};

const DensityLandscape = ({ report }) => {
  const gridData = useMemo(() => generateLandscapeData(report), [report]);
  const maxDensity = Math.max(...gridData.flat(), 1);
  const gridSize = gridData.length;
  const [hoveredCell, setHoveredCell] = useState(null);

  if (!report) return <div className="card" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading landscape data...</div>;

  return (
    <div className="card" style={{ marginBottom: '2rem', overflow: 'hidden', position: 'relative', background: '#0f172a', color: 'white', minHeight: '600px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: '1.5rem' }}>
        <div>
          <h3 style={{ margin: 0, color: 'white', fontSize: '1.5rem' }}>Workforce Density Landscape</h3>
          <p style={{ margin: '0.5rem 0 0', color: '#94a3b8' }}>
            3D Terrain view. Height = Employee Density.<br/>
            <span style={{color: '#f87171'}}>Red</span> = High Burnout Risk. <span style={{color: '#4ade80'}}>Green</span> = High Recovery.
          </p>
        </div>
        <div style={{ textAlign: 'right', fontSize: '0.9rem', color: '#cbd5e1' }}>
          <div>Total Employees: <strong>{report?.employeeCount ?? 0}</strong></div>
        </div>
      </div>

      <div style={{ 
        flex: 1, 
        position: 'relative', 
        perspective: '1200px', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        padding: '2rem'
      }}>
        {/* 3D Plane */}
        <div style={{ 
          width: '500px', 
          height: '500px', 
          position: 'relative', 
          transform: 'rotateX(55deg) rotateZ(45deg)', 
          transformStyle: 'preserve-3d',
          backgroundColor: 'rgba(255,255,255,0.03)',
          borderRadius: '12px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
        }}>
          {/* Grid Cells / Towers */}
          {gridData.map((row, y) => (
            row.map((count, x) => {
              if (count === 0) return null;

              // X = Stress (0-19), Y = Recovery (0-19)
              const stressPct = (x / (gridSize - 1));
              const recoveryPct = (y / (gridSize - 1));
              
              // Risk Calculation: High Stress + Low Recovery = High Risk
              // Risk = (Stress + (1-Recovery)) / 2
              const riskFactor = (stressPct + (1 - recoveryPct)) / 2;
              
              // Hue: 0 (Red/High Risk) to 120 (Green/Low Risk)
              const hue = (1 - riskFactor) * 120;
              
              // 3D Dimensions
              const barHeight = (count / maxDensity) * 180; 
              const widthPct = 100 / gridSize;
              const left = x * widthPct;
              const top = y * widthPct;

              // Colors for faces
              const colorTop = `hsla(${hue}, 85%, 55%, 0.95)`;
              const colorFront = `hsla(${hue}, 85%, 35%, 0.9)`;
              const colorSide = `hsla(${hue}, 85%, 20%, 0.9)`;
              
              const isHovered = hoveredCell && hoveredCell.x === x && hoveredCell.y === y;

              return (
                <div key={`${x}-${y}`} role="button" tabIndex="0" onKeyDown={() => {}}
                  onMouseEnter={() => setHoveredCell({ x, y, count, risk: Math.round(riskFactor * 100), stress: Math.round(stressPct * 100), recovery: Math.round(recoveryPct * 100) })}
                  onMouseLeave={() => setHoveredCell(null)}
                  style={{
                    position: 'absolute',
                    left: `${left}%`,
                    top: `${top}%`,
                    width: `${widthPct}%`,
                    height: `${widthPct}%`,
                    transformStyle: 'preserve-3d',
                    zIndex: x + y, // Isometric depth sorting
                  }}
                >
                  {/* Top Face */}
                  <div style={{
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    background: isHovered ? '#fff' : colorTop,
                    transform: `translateZ(${barHeight}px)`,
                    boxShadow: `0 0 ${count * 5}px ${colorTop}`,
                    border: '1px solid rgba(255,255,255,0.1)'
                  }} />
                  
                  {/* Front Face (South) */}
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    width: '100%',
                    height: `${barHeight}px`,
                    background: colorFront,
                    transformOrigin: 'bottom',
                    transform: 'rotateX(-90deg)',
                    border: '1px solid rgba(0,0,0,0.1)'
                  }} />
                  
                  {/* Side Face (East) */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: `${barHeight}px`,
                    height: '100%',
                    background: colorSide,
                    transformOrigin: 'right',
                    transform: 'rotateY(90deg)',
                    border: '1px solid rgba(0,0,0,0.1)'
                  }} />
                </div>
              );
            })
          ))}
          
          {/* Empty State Message */}
          {gridData.flat().every(c => c === 0) && (
            <div style={{ 
              position: 'absolute', 
              top: '50%', 
              left: '50%', 
              transform: 'translate(-50%, -50%) rotateX(-55deg) rotateZ(-45deg)', // Counter-rotate to face user
              textAlign: 'center', 
              color: 'rgba(255,255,255,0.5)',
              pointerEvents: 'none'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏔️</div>
              <div>{report.employeeCount > 0 ? 'No employee data mapped yet.' : 'No employees found.'}</div>
              <div style={{ fontSize: '0.8rem' }}>{report.employeeCount > 0 ? 'Waiting for check-ins...' : 'Add employees in Team Management.'}</div>
            </div>
          )}
        </div>

        {/* Axis Labels (Overlay) */}
        <div style={{ position: 'absolute', bottom: '20px', right: '20px', textAlign: 'right', pointerEvents: 'none' }}>
          <div style={{ color: '#94a3b8', fontSize: '0.9rem', fontWeight: 'bold' }}>STRESS &rarr;</div>
        </div>
        <div style={{ position: 'absolute', top: '20px', left: '20px', pointerEvents: 'none' }}>
          <div style={{ color: '#94a3b8', fontSize: '0.9rem', fontWeight: 'bold' }}>&uarr; RECOVERY</div>
        </div>
        
        {/* Custom Tooltip Overlay */}
        {hoveredCell && (
          <div style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid #334155',
            padding: '1rem',
            borderRadius: '8px',
            zIndex: 1000,
            pointerEvents: 'none',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            minWidth: '150px'
          }}>
            <div style={{ color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem' }}>Cluster Details</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white', marginBottom: '0.5rem' }}>{hoveredCell.count} <span style={{fontSize: '0.9rem', fontWeight: 'normal'}}>Employees</span></div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '4px' }}>
              <span style={{ color: '#cbd5e1' }}>Burnout Risk:</span>
              <span style={{ fontWeight: 'bold', color: hoveredCell.risk > 50 ? '#f87171' : '#4ade80' }}>{hoveredCell.risk}%</span>
            </div>
            <div style={{ width: '100%', height: '4px', background: '#334155', borderRadius: '2px', marginBottom: '0.5rem' }}>
              <div style={{ width: `${hoveredCell.risk}%`, height: '100%', background: hoveredCell.risk > 50 ? '#f87171' : '#4ade80', borderRadius: '2px' }}></div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8' }}>
              <span>Stress: {hoveredCell.stress}%</span>
              <span>Recovery: {hoveredCell.recovery}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

DensityLandscape.propTypes = {
  report: PropTypes.object
};

export default function EmployerHome() {
  const { user } = useUser();
  const [searchParams] = useSearchParams();
  const [activeSection, setActiveSection] = useState('overview'); // 'overview', 'detailed', 'teams', 'surveys', 'simulator', 'integrations', 'settings'
  const [detailedView, setDetailedView] = useState('integrations'); // 'integrations', 'daily'
  const [report, setReport] = useState(null);
  const [comprehensiveReport, setComprehensiveReport] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [teams, setTeams] = useState([]);
  const [teamMetrics, setTeamMetrics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [teamReport, setTeamReport] = useState(null);
  const [teamLoading, setTeamLoading] = useState(false);
  

  // Simulator State
  const [simPlan, setSimPlan] = useState({
    name: 'New Action Plan',
    actions: [{ type: 'workload', intensity: 40, adherence: 80 }],
    durationWeeks: 12,
    avgHourlyRate: 50,
    projectDeadline: ''
  });
  const [simResults, setSimResults] = useState(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simWeek, setSimWeek] = useState(0);
  const [simSelectedTeams, setSimSelectedTeams] = useState([]);
  const [simError, setSimError] = useState('');

  // Survey State
  const [surveys, setSurveys] = useState([]);
  const [isCreatingSurvey, setIsCreatingSurvey] = useState(false);
  const [viewingSurvey, setViewingSurvey] = useState(null);
  const [surveyResults, setSurveyResults] = useState(null);
  const [surveyLoading, setSurveyLoading] = useState(false);

  const [savedSimulations, setSavedSimulations] = useState([]);

  // Integrations Manager (lightweight, shared with Settings)
  const [integrations, setIntegrations] = useState({
    slack: false,
    trello: false,
    jira: false,
    asana: false,
    google: false
  });

  useEffect(() => {
    const saved = localStorage.getItem('employer_saved_simulations');
    if (saved) {
      try {
        setSavedSimulations(JSON.parse(saved));
      } catch (e) { console.error("Failed to load saved simulations", e); }
    }
  }, []);

  useEffect(() => {
    const successService = searchParams.get('integration_success');
    if (successService && Object.keys(integrations).includes(successService) && !integrations[successService]) {
      setIntegrations(prev => ({ ...prev, [successService]: true }));
    }
  }, [searchParams, integrations]);

  const handleSaveSimulation = () => {
    if (!simResults) return;
    const newSave = { id: Date.now(), date: new Date().toISOString(), plan: simPlan, results: simResults };
    const updated = [newSave, ...savedSimulations];
    setSavedSimulations(updated);
    localStorage.setItem('employer_saved_simulations', JSON.stringify(updated));
    alert('Simulation saved to Action Impact insights!');
  };

  const handleConnectIntegration = (service) => {
    let API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
    if (typeof globalThis.window !== 'undefined' && globalThis.window.location.hostname.includes('razoncomfort.com')) {
      API_BASE_URL = 'https://burnoutai-final.onrender.com';
    }
    if (!API_BASE_URL.startsWith('http')) {
      API_BASE_URL = `https://${API_BASE_URL}`;
    }
    const token = localStorage.getItem('token');

    if (service === 'google') {
      window.location.href = `${API_BASE_URL}/api/integrations/google/auth?token=${token}`;
      return;
    }
    if (service === 'slack') {
      window.location.href = `${API_BASE_URL}/api/integrations/slack/auth?token=${token}`;
      return;
    }
    if (service === 'trello') {
      window.location.href = `${API_BASE_URL}/api/integrations/trello/auth?token=${token}`;
      return;
    }
    window.location.href = `${API_BASE_URL}/api/integrations/connect/${service}?token=${token}&redirect=/settings?integration_success=${service}`;
  };

  const handleDisconnectIntegration = (service) => {
    if (window.confirm(`Disconnect ${service}?`)) {
      setIntegrations(prev => ({ ...prev, [service]: false }));
    }
  };

  const toggleSimAction = (typeId) => {
    setSimPlan(prev => {
      const exists = prev.actions.find(a => a.type === typeId);
      if (exists) {
        return { ...prev, actions: prev.actions.filter(a => a.type !== typeId) };
      } else {
        return { ...prev, actions: [...prev.actions, { type: typeId, intensity: 50, adherence: 80 }] };
      }
    });
  };

  const updateSimAction = (typeId, field, value) => {
    setSimPlan(prev => ({
      ...prev,
      actions: prev.actions.map(a => a.type === typeId ? { ...a, [field]: Number(value) } : a)
    }));
  };

  const runEmployerSimulation = async () => {
    if (!user?.companyCode) return;
    if (!simPlan.actions.length) {
      setSimError('Select at least one action to run a simulation.');
      return;
    }
    setSimLoading(true);
    setSimError('');
    setSimResults(null);
    try {
      const payload = {
        companyCode: user.companyCode,
        teamIds: simSelectedTeams.length ? simSelectedTeams.map(t => Number(t)) : [],
        plan: simPlan
      };
      const data = await simulateEmployerAction(payload);
      if (data.privacyLocked) {
        setSimError('At least 5 employees are required to run simulations.');
      } else {
        setSimResults(data);
      }
    } catch (err) {
      setSimError(err.message || 'Simulation failed.');
    } finally {
      setSimLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      analytics.identify(user);
    }

    let isMounted = true;
    
    if (user && user.companyCode) {
      setLoading(true);
      
      // Fetch Report and Employees in parallel
      Promise.allSettled([
        fetchWeeklyReport(user.companyCode),
        fetchComprehensiveTeamReport(user.companyCode),
        fetchEmployees(user.companyCode),
        fetchTeams(user.companyCode),
        fetchTeamMetrics(user.companyCode).catch(() => []), // Fail gracefully if endpoint not ready
        fetchSurveys(user.companyCode).catch(() => [])
      ]).then(([reportResult, comprehensiveResult, employeesResult, teamsResult, metricsResult, surveysResult]) => {
        if (!isMounted) return;

        // Handle Report
        if (reportResult.status === 'fulfilled' && reportResult.value) {
          setReport(reportResult.value);
          
          // Track Dashboard View
          analytics.capture('employer_dashboard_viewed', {
            employee_count_bucket: reportResult.value.employeeCount < 5 ? '0-4' : '5+',
            privacy_locked: reportResult.value.privacyLocked
          });

          if (reportResult.value.privacyLocked) {
            analytics.capture('individual_data_attempt_blocked', { attempted_action: 'view_aggregated_report' });
          }
        }

        // Handle Comprehensive Report
        if (comprehensiveResult.status === 'fulfilled' && comprehensiveResult.value) {
          setComprehensiveReport(comprehensiveResult.value);
        }

        // Handle Employees
        if (employeesResult.status === 'fulfilled' && Array.isArray(employeesResult.value)) {
          setEmployees(employeesResult.value);
        } else if (employeesResult.status === 'rejected') {
          setEmployeesError(employeesResult.reason.message);
        }

        // Handle Teams
        if (teamsResult.status === 'fulfilled') {
          setTeams(teamsResult.value || []);
        }

        // Handle Metrics
        if (metricsResult.status === 'fulfilled') {
          setTeamMetrics(metricsResult.value || []);
        }

        // Handle Surveys
        if (surveysResult.status === 'fulfilled') {
          setSurveys(surveysResult.value || []);
        }

        setLoading(false);
      });
    } else if (user) {
        setLoading(false);
    }
    
    return () => { isMounted = false; };
  }, [user]);

  // Manual Refresh Function
  const handleRefresh = () => {
    if (!user?.companyCode) return;
    setLoading(true);
    Promise.allSettled([
      fetchWeeklyReport(user.companyCode),
      fetchComprehensiveTeamReport(user.companyCode),
      fetchEmployees(user.companyCode),
      fetchTeams(user.companyCode),
      fetchTeamMetrics(user.companyCode).catch(() => []),
      fetchSurveys(user.companyCode).catch(() => [])
    ]).then(([reportResult, comprehensiveResult, employeesResult, teamsResult, metricsResult, surveysResult]) => {
      if (reportResult.status === 'fulfilled') setReport(reportResult.value);
      if (comprehensiveResult.status === 'fulfilled') setComprehensiveReport(comprehensiveResult.value);
      if (employeesResult.status === 'fulfilled') setEmployees(employeesResult.value);
      if (teamsResult.status === 'fulfilled') setTeams(teamsResult.value || []);
      if (metricsResult.status === 'fulfilled') setTeamMetrics(metricsResult.value || []);
      if (surveysResult.status === 'fulfilled') setSurveys(surveysResult.value || []);
      setLoading(false);
    });
  };

  const refreshMetrics = () => {
    if (user?.companyCode) {
      fetchTeamMetrics(user.companyCode)
        .then(data => setTeamMetrics(data || []))
        .catch(console.error);
    }
  };

  // --- Team Management Logic ---
  const handleCreateTeam = async (e) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    try {
      const team = await createTeam({ name: newTeamName, companyCode: user.companyCode });
      setTeams([...teams, team]);
      setNewTeamName('');
      refreshMetrics();
    } catch (err) { alert(err.message); }
  };

  const handleDeleteTeam = async (teamId) => {
    if (!window.confirm('Delete this team? Employees will become unassigned.')) return;
    try {
      await deleteTeam(teamId);
      setTeams(teams.filter(t => t.id !== teamId));
      setTeamMetrics(prev => prev.filter(t => t.teamId !== teamId));
      // Reset local employee state to unassigned for this team
      setEmployees(prev => prev.map(e => e.teamId === teamId ? { ...e, teamId: null } : e));
      // Verify persistence with backend
      fetchEmployees(user.companyCode).then(setEmployees);
    } catch (err) { alert(err.message); }
  };

  const onDragStart = (e, employeeId) => {
    e.dataTransfer.setData('employeeId', employeeId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDrop = async (e, teamId) => {
    e.preventDefault();
    if (teamId === undefined) return;
    const employeeId = Number.parseInt(e.dataTransfer.getData('employeeId'), 10);
    if (!employeeId) return;

    // Optimistic Update
    setEmployees(prev => prev.map(emp => 
      emp.id === employeeId ? { ...emp, teamId: teamId } : emp
    ));

    try {
      await assignEmployeeToTeam({ userId: employeeId, teamId: teamId });
      refreshMetrics();
      // Verify persistence by re-fetching from server immediately
      const updatedEmployees = await fetchEmployees(user.companyCode);
      setEmployees(updatedEmployees);
    } catch (err) {
      console.error("Failed to assign team", err);
      // Revert on failure
      fetchEmployees(user.companyCode).then(setEmployees);
    }
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const copyCode = () => {
    globalThis.navigator.clipboard.writeText(user.companyCode);
    alert('Company code copied to clipboard!');
  };

  const handleViewSurveyResults = async (survey) => {
    setViewingSurvey(survey);
    setSurveyLoading(true);
    try {
      const results = await fetchSurveyResults(survey.id);
      setSurveyResults(results);
    } catch (err) {
      console.error("Failed to fetch survey results", err);
      setSurveyResults(null);
    } finally {
      setSurveyLoading(false);
    }
  };

  const getDriverChartData = (source = report) => {
    if (!source?.drivers?.distribution) return null;
    const dist = source.drivers.distribution;
    return {
      labels: ['Stress Factors', 'Energy Drain'],
      datasets: [
        {
          data: [dist.stress, dist.energy],
          backgroundColor: [
            'rgba(239, 68, 68, 0.8)',  // Red for Stress
            'rgba(16, 185, 129, 0.8)', // Green for Energy
          ],
          borderColor: [
            'rgba(239, 68, 68, 1)',
            'rgba(16, 185, 129, 1)',
          ],
          borderWidth: 1,
        },
      ],
    };
  };

  const getRiskDistChartData = (source = report) => {
    if (!source?.riskDistribution) return null;
    const dist = source.riskDistribution;
    return {
      labels: ['Low', 'Moderate', 'High', 'Critical'],
      datasets: [
        {
          data: [dist.low, dist.moderate, dist.high, dist.critical],
          backgroundColor: ['#10b981', '#f59e0b', '#f97316', '#ef4444'],
          borderWidth: 0,
        },
      ],
    };
  };

  const getRadarChartData = (source = report, comparison = null) => {
    if (!source?.datasets) return null;

    const calcAvg = (arr) => {
      if (!Array.isArray(arr)) return 0;
      const valid = arr.filter(v => v !== null);
      if (valid.length === 0) return 0;
      return (valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1);
    };

    // Normalize to 0-10 scale
    const norm = (val, max) => (val / max) * 10;

    const datasets = [
      {
        label: comparison ? 'This Team' : 'Company Average',
        data: source ? [
          norm(calcAvg(source.datasets.stress), 100),
          norm(calcAvg(source.datasets.energy), 100),
          norm(calcAvg(source.datasets.engagement), 100),
          norm(calcAvg(source.datasets.sleepQuality), 5)
        ] : [],
        backgroundColor: 'rgba(37, 99, 235, 0.2)',
        borderColor: '#2563eb',
        pointBackgroundColor: '#2563eb',
      },
      {
        label: 'Ideal Baseline',
        data: [2, 8, 8, 8], // Low stress, High energy/engagement/sleep
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        borderColor: '#10b981',
        pointBackgroundColor: '#10b981',
      }
    ];

    if (comparison) {
      datasets.push({
        label: 'Company Average',
        data: [
          norm(calcAvg(comparison.datasets.stress), 100),
          norm(calcAvg(comparison.datasets.energy), 100),
          norm(calcAvg(comparison.datasets.engagement), 100),
          norm(calcAvg(comparison.datasets.sleepQuality), 5)
        ],
        backgroundColor: 'rgba(100, 116, 139, 0.1)',
        borderColor: '#94a3b8',
        pointBackgroundColor: '#94a3b8',
        borderDash: [5, 5]
      });
    }

    return {
      labels: ['Stress', 'Energy', 'Engagement', 'Sleep Quality'],
      datasets: datasets
    };
  };

  const getTeamTrendChartData = (data) => {
    if (!data?.datasets) return null;
    return {
      labels: data.labels,
      datasets: [
        {
          label: 'Stress',
          data: data.datasets.stress,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.4,
          fill: true
        },
        {
          label: 'Workload',
          data: data.datasets.workload,
          borderColor: '#8b5cf6',
          backgroundColor: 'transparent',
          tension: 0.4,
          borderDash: [5, 5]
        }
      ]
    };
  };

  const getEnergyTrendData = (source = report) => {
    if (!source || !source.datasets) return null;
    return {
      labels: source.labels,
      datasets: [
        {
          label: 'Energy Level',
          data: source.datasets.energy,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          tension: 0.4,
          fill: true
        },
        {
          label: 'Stress Level',
          data: source.datasets.stress,
          borderColor: '#ef4444',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          tension: 0.4
        }
      ]
    };
  };

  const getStackedRiskData = (source = report) => {
    if (!source?.riskDistribution) return null;
    const dist = source.riskDistribution;
    const total = dist.low + dist.moderate + dist.high + dist.critical;
    
    // Normalize to percentages
    const p = (val) => total > 0 ? (val / total) * 100 : 0;

    return {
      labels: ['Risk Composition'],
      datasets: [
        { label: 'Low', data: [p(dist.low)], backgroundColor: '#10b981' },
        { label: 'Moderate', data: [p(dist.moderate)], backgroundColor: '#f59e0b' },
        { label: 'High', data: [p(dist.high)], backgroundColor: '#f97316' },
        { label: 'Critical', data: [p(dist.critical)], backgroundColor: '#ef4444' }
      ]
    };
  };

  const cleanChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
      title: { display: false }
    },
    scales: {
      x: {
        grid: { display: false, drawBorder: false },
        ticks: { font: { size: 11 } }
      },
      y: {
        beginAtZero: true,
        grid: { display: false, drawBorder: false },
        ticks: { display: false } // Hide y-axis labels for cleaner look
      }
    }
  };

  const renderMetricTrend = (data, metricKey, color, label) => {
    if (!data?.datasets?.[metricKey]) return null;
    const chartData = {
      labels: data.labels,
      datasets: [{
        label: label,
        data: data.datasets[metricKey],
        borderColor: color,
        backgroundColor: color + '20',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.4,
        fill: true
      }]
    };
    return <Line data={chartData} options={{...cleanChartOptions, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } }}} />;
  };

  return (
    <>
      <Navbar />
      <div className="container">
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <h1>Employer Dashboard</h1>
          <button 
            onClick={handleRefresh} 
            className="quiz-button" 
            style={{width: 'auto', padding: '8px 16px', fontSize: '0.9rem', backgroundColor: '#fff', color: '#2563eb', border: '1px solid #2563eb'}}>
            🔄 Refresh Data
          </button>
        </div>
        
        {user && (
          <div className="card" style={{marginBottom: '2rem', borderLeft: '5px solid #2563eb'}}>
            <h3>Your Company Code</h3>
            <div style={{fontSize: '3rem', fontWeight: '800', color: '#2563eb', margin: '1rem 0', display: 'flex', alignItems: 'center', gap: '1rem'}}>
              {user.companyCode}
              <button onClick={copyCode} style={{fontSize: '1rem', padding: '5px 10px', cursor: 'pointer', background: '#e0e7ff', border: 'none', borderRadius: '4px', color: '#3730a3'}}>Copy</button>
            </div>
            <p className="small">Share this code with your employees. They will need it to join your organization.</p>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '1.5rem', alignItems: 'start' }}>
          <aside className="card" style={{ position: 'sticky', top: '96px' }}>
            <h4 style={{ marginTop: 0, color: '#0f172a' }}>Employer Console</h4>
            {[
              { id: 'overview', label: 'Company Overview' },
              { id: 'detailed', label: 'Detailed Insights' },
              { id: 'teams', label: 'Team Management' },
              { id: 'surveys', label: 'Pulse Surveys' },
              { id: 'simulator', label: 'Action Simulator' },
              { id: 'integrations', label: 'Integrations Manager' },
              { id: 'settings', label: 'Settings' }
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.75rem 0.9rem',
                  marginBottom: '0.5rem',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  background: activeSection === item.id ? '#e0e7ff' : '#fff',
                  color: activeSection === item.id ? '#1d4ed8' : '#475569',
                  fontWeight: activeSection === item.id ? '600' : '500'
                }}
              >
                {item.label}
              </button>
            ))}
          </aside>

          <div>
            {loading && <div className="card"><p>Loading insights...</p></div>}

            {activeSection === 'detailed' && (
              <div className="card" style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ marginTop: 0 }}>Detailed Insights</h3>
                <p className="small">Switch between integration insights and daily check-in analytics.</p>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                  {[
                    { id: 'integrations', label: 'Integration Insights' },
                    { id: 'daily', label: 'Daily Check-ins' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setDetailedView(tab.id)}
                      style={{
                        padding: '0.6rem 1rem',
                        borderRadius: '999px',
                        border: detailedView === tab.id ? '2px solid #2563eb' : '1px solid #cbd5e1',
                        background: detailedView === tab.id ? '#eff6ff' : '#fff',
                        color: detailedView === tab.id ? '#1d4ed8' : '#64748b',
                        fontWeight: detailedView === tab.id ? '600' : '500'
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
        
        {/* Company Overview (Key Metrics Grid) */}
        {!loading && activeSection === 'overview' && report && (
          <div className="fade-in">
            {report.privacyLocked ? (
              <div className="card" style={{marginBottom: '2rem', borderLeft: '5px solid #0ea5e9', backgroundColor: '#f0f9ff'}}>
                <h4 style={{color: '#0284c7', marginTop: 0}}>Insights Locked for Privacy</h4>
                <p>Aggregated team insights are only generated when <strong>5 or more employees</strong> have joined your organization. This ensures individual data remains anonymous.</p>
                <p className="small" style={{marginBottom: 0}}>Current active employees: <strong>{report.employeeCount}</strong> / 5 required</p>
              </div>
            ) : (
              <>
                <div className="grid" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginBottom: '1rem'}}>
                  <div className="card">
                    <h4 style={{color: '#64748b'}}>Team Burnout</h4>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                      {(() => {
                        const daily = comprehensiveReport?.daily_data || [];
                        const last7 = daily.slice(-7);
                        const prev7 = daily.slice(-14, -7);
                        const avg = (arr) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
                        const lastAvg = avg(last7.map(d => d.burnout_risk || 0));
                        const prevAvg = prev7.length ? avg(prev7.map(d => d.burnout_risk || 0)) : lastAvg;
                        const delta = lastAvg - prevAvg;
                        const arrow = delta > 1 ? '▲' : delta < -1 ? '▼' : '→';
                        return `${lastAvg.toFixed(1)} ${arrow}`;
                      })()}
                    </div>
                    <div className="small">Distribution: {report.riskDistribution ? `${report.riskDistribution.low}/${report.riskDistribution.moderate}/${report.riskDistribution.high}/${report.riskDistribution.critical}` : 'N/A'}</div>
                  </div>
                  <div className="card">
                    <h4 style={{color: '#64748b'}}>Deadline Risk</h4>
                    {comprehensiveReport?.stats?.deadline_risk ? (
                      <>
                        <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                          {Math.min(100, Math.round((comprehensiveReport.stats.deadline_risk.weeksToComplete / 12) * 100))}%
                        </div>
                        <div className="small">Backlog: {comprehensiveReport.stats.deadline_risk.backlogPoints || 0} pts</div>
                      </>
                    ) : (
                      <div className="small">Connect Jira for delivery risk</div>
                    )}
                  </div>
                  <div className="card">
                    <h4 style={{color: '#64748b'}}>Meeting Overload</h4>
                    {comprehensiveReport?.daily_data ? (
                      <>
                        {(() => {
                          const avgMeeting = comprehensiveReport.daily_data.reduce((a,b)=>a+(b.meeting_hours||0),0) / (comprehensiveReport.daily_data.length || 1);
                          const pct = Math.min(100, Math.round((avgMeeting / 6) * 100));
                          return (
                            <>
                              <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{pct}%</div>
                              <div className="small">Avg {avgMeeting.toFixed(1)} hrs/day</div>
                            </>
                          );
                        })()}
                      </>
                    ) : (
                      <div className="small">Connect Calendar for meeting load</div>
                    )}
                  </div>
                  <div className="card">
                    <h4 style={{color: '#64748b'}}>After Hours</h4>
                    {comprehensiveReport?.daily_data ? (
                      <>
                        {(() => {
                          const days = comprehensiveReport.daily_data.length || 1;
                          const heavyDays = comprehensiveReport.daily_data.filter(d => d.is_after_hours_heavy).length;
                          const pct = Math.round((heavyDays / days) * 100);
                          const avgSlack = comprehensiveReport.daily_data.reduce((a,b)=>a+(b.slack_messages||0),0) / days;
                          return (
                            <>
                              <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{pct}%</div>
                              <div className="small">Avg {avgSlack.toFixed(0)} msgs/day</div>
                            </>
                          );
                        })()}
                      </>
                    ) : (
                      <div className="small">Connect Slack for after-hours</div>
                    )}
                  </div>
                  <div className="card">
                    <h4 style={{color: '#64748b'}}>Velocity Gap</h4>
                    {comprehensiveReport?.stats?.deadline_risk ? (
                      <>
                        {(() => {
                          const targetWeeks = 8;
                          const required = comprehensiveReport.stats.deadline_risk.backlogPoints / targetWeeks;
                          const actual = comprehensiveReport.stats.deadline_risk.velocity || 0;
                          const gap = required > 0 ? Math.max(0, Math.round(((required - actual) / required) * 100)) : 0;
                          return (
                            <>
                              <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{gap}%</div>
                              <div className="small">Req {required.toFixed(1)} vs Act {actual.toFixed(1)} pts/wk</div>
                            </>
                          );
                        })()}
                      </>
                    ) : (
                      <div className="small">Connect Jira for velocity</div>
                    )}
                  </div>
                  <div className="card">
                    <h4 style={{color: '#64748b'}}>Adoption Rate</h4>
                    {(() => {
                      const total = employees.length || report.employeeCount || 0;
                      const active = report.employeeCount || 0;
                      const pct = total ? Math.round((active / total) * 100) : 0;
                      return (
                        <>
                          <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{pct}%</div>
                          <div className="small">{active} of {total} employees</div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {report.teamStatus && (
                  <div className="card" style={{ marginBottom: '1rem', borderLeft: `5px solid ${report.teamStatus.color}`, backgroundColor: report.teamStatus.color + '10' }}>
                      <h4 style={{color: report.teamStatus.color, marginTop: 0}}>Team Trend</h4>
                      <p style={{marginBottom: 0, fontWeight: 'bold', color: report.teamStatus.color}}>
                        {report.teamStatus.label}
                      </p>
                  </div>
                )}

                {report.insight && (
                  <div className="card" style={{ borderLeft: '5px solid #16a34a' }}>
                      <h4 style={{color: '#16a34a'}}>💡 Actionable Insight</h4>
                      <h5 style={{marginTop: '0.5rem', fontSize: '1.1rem'}}>{report.insight.title}</h5>
                      <p>{report.insight.suggestion}</p>
                  </div>
                )}

                {report.drivers && report.drivers.teamTopFactor && (
                  <div className="card" style={{ borderLeft: '5px solid #f59e0b', marginTop: '1rem', backgroundColor: '#fffbeb' }}>
                      <h4 style={{color: '#d97706', marginTop: 0}}>🔥 Primary Team Signal</h4>
                      <div style={{fontSize: '2rem', fontWeight: 'bold', margin: '0.5rem 0', color: '#92400e'}}>
                        {report.drivers.teamTopFactor.factor}
                      </div>
                      <p style={{marginBottom: 0, color: '#92400e'}}>
                        Based on aggregated check-ins, this factor appears to be the most significant contributor to team stress levels currently.
                      </p>
                  </div>
                )}
              </>
            )}

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
        )}

        {/* Daily Check-in Insights */}
        {!loading && activeSection === 'detailed' && detailedView === 'daily' && report && (
          <div className="fade-in">
            {report.privacyLocked ? (
              <div className="card" style={{marginBottom: '2rem', borderLeft: '5px solid #0ea5e9', backgroundColor: '#f0f9ff'}}>
                <h4 style={{color: '#0284c7', marginTop: 0}}>Insights Locked for Privacy</h4>
                <p>Aggregated team insights are only generated when <strong>5 or more employees</strong> have joined your organization. This ensures individual data remains anonymous.</p>
                <p className="small" style={{marginBottom: 0}}>Current active employees: <strong>{report.employeeCount}</strong> / 5 required</p>
              </div>
            ) : (
              <>
                {/* 1. Landscape (Huge) */}
                <DensityLandscape report={report} />

                {/* 2. Metric Trends (4 Small Cards) */}
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                  {[
                    { key: 'stress', label: 'Stress', color: '#ef4444' },
                    { key: 'energy', label: 'Energy', color: '#10b981' },
                    { key: 'engagement', label: 'Engagement', color: '#3b82f6' },
                    { key: 'sleepQuality', label: 'Sleep Quality', color: '#8b5cf6' }
                  ].map(m => {
                    const lastVal = report?.datasets?.[m.key]?.slice(-1)[0] || 0;
                    return (
                      <div key={m.key} className="card">
                        <div style={{ color: '#64748b', fontSize: '0.85rem', textTransform: 'uppercase', fontWeight: 'bold' }}>{m.label}</div>
                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: m.color, margin: '0.5rem 0' }}>{lastVal}</div>
                        <div style={{ height: '60px' }}>
                          {renderMetricTrend(report, m.key, m.color, m.label)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 2.5 Energy vs Stress Trend */}
                <div className="card" style={{ marginBottom: '2rem' }}>
                  <h3>Team Vitality Trends</h3>
                  <p className="small">Comparing Energy levels against Stress over time.</p>
                  <div style={{ height: '300px' }}>
                    {getEnergyTrendData(report) ? (
                      <Line 
                        data={getEnergyTrendData(report)} 
                        options={cleanChartOptions} 
                      />
                    ) : (
                      <p style={{ textAlign: 'center', paddingTop: '2rem', color: '#94a3b8' }}>No trend data available</p>
                    )}
                  </div>
                </div>

                {/* 3. Detailed Graphs Row */}
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
                  <div className="card">
                    <h3>Burnout Drivers</h3>
                    <div style={{ height: '250px', display: 'flex', justifyContent: 'center' }}>
                      {getDriverChartData(report) ? (
                        <Pie data={getDriverChartData(report)} options={{ plugins: { legend: { position: 'right' } } }} />
                      ) : (
                        <p style={{ color: '#94a3b8', alignSelf: 'center' }}>No driver data available</p>
                      )}
                    </div>
                  </div>
                  <div className="card">
                    <h3>Risk Distribution</h3>
                    <div style={{ height: '250px', display: 'flex', justifyContent: 'center' }}>
                      {getRiskDistChartData(report) ? (
                        <Bar 
                          data={getStackedRiskData(report)} 
                          options={{ ...cleanChartOptions, indexAxis: 'y', scales: { x: { stacked: true, max: 100 }, y: { stacked: true, display: false } } }} 
                        />
                      ) : (
                        <p style={{ color: '#94a3b8', alignSelf: 'center' }}>No risk data available</p>
                      )}
                    </div>
                  </div>
                  <div className="card">
                    <h3>Health Radar</h3>
                    <div style={{ height: '250px', display: 'flex', justifyContent: 'center' }}>
                      {getRadarChartData(report) ? (
                        <Radar 
                          data={getRadarChartData(report)} 
                          options={{ scales: { r: { suggestedMin: 0, suggestedMax: 10 } }, plugins: { legend: { position: 'bottom' } } }} 
                        />
                      ) : (
                        <p style={{ color: '#94a3b8', alignSelf: 'center' }}>No radar data available</p>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 2: TEAM MANAGEMENT (Drag & Drop) */}
        {!loading && activeSection === 'teams' && (
          <div className="fade-in">
            <div className="card" style={{ marginBottom: '2rem' }}>
              <h3>Create New Team</h3>
              <form onSubmit={handleCreateTeam} style={{ display: 'flex', gap: '1rem' }}>
                <input 
                  name="newTeamName"
                  value={newTeamName} 
                  onChange={e => setNewTeamName(e.target.value)} 
                  placeholder="e.g. Engineering, Sales" 
                  style={{ padding: '8px', flex: 1, border: '1px solid #cbd5e1', borderRadius: '4px' }}
                />
                <button type="submit" className="quiz-button" style={{ width: 'auto', padding: '0 1.5rem' }}>Create</button>
              </form>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', color: '#64748b' }}>Suggestions:</span>
                {['Sales', 'Design', 'Customer Support', 'Developers', 'Finance'].map(name => (
                  <button 
                    key={name}
                    type="button"
                    onClick={() => setNewTeamName(name)}
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '16px',
                      padding: '4px 12px',
                      fontSize: '0.85rem',
                      color: '#334155',
                      cursor: 'pointer'
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
              {/* Unassigned Column */}
              <div 
                className="card" 
                onDragOver={onDragOver} 
                onDrop={(e) => onDrop(e, null)}
                style={{ backgroundColor: '#f8fafc', minHeight: '400px' }}
              >
                <h4 style={{ color: '#64748b' }}>Unassigned Employees</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {employees.filter(e => !e.teamId).map(emp => (
                    <div 
                      key={emp.id} 
                      draggable 
                      onDragStart={(e) => onDragStart(e, emp.id)}
                      style={{ padding: '10px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'grab' }}
                    >
                      {emp.name} <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>({emp.email})</span>
                    </div>
                  ))}
                  {employees.filter(e => !e.teamId).length === 0 && <p className="small">No unassigned employees.</p>}
                </div>
              </div>

              {/* Teams Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
                {teams.map(team => {
                  const teamMembers = employees.filter(e => e.teamId === team.id);
                  return (
                    <div 
                      key={team.id} 
                      className="card"
                      onDragOver={onDragOver} 
                      onDrop={(e) => onDrop(e, team.id)}
                      style={{ minHeight: '200px', borderTop: '4px solid #2563eb' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <h4 style={{ margin: 0 }}>{team.name}</h4>
                        <button onClick={() => handleDeleteTeam(team.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>&times;</button>
                      </div>
                      <p className="small" style={{ color: teamMembers.length < 5 ? '#ef4444' : '#10b981' }}>
                        {teamMembers.length} Members {teamMembers.length < 5 && '(Min 5 for insights)'}
                      </p>
                      
                      <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {teamMembers.map(emp => (
                          <div 
                            key={emp.id} 
                            draggable 
                            onDragStart={(e) => onDragStart(e, emp.id)}
                            style={{ padding: '8px', background: '#eff6ff', borderRadius: '4px', fontSize: '0.9rem', cursor: 'grab' }}
                          >
                            {emp.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Integration Insights */}
        {!loading && activeSection === 'detailed' && detailedView === 'integrations' && (
          <div className="fade-in">
            {!comprehensiveReport || comprehensiveReport?.error ? (
              <div className="card" style={{ color: '#94a3b8' }}>
                Connect integrations to unlock calendar, Jira, and Slack insights.
              </div>
            ) : comprehensiveReport.privacyLocked ? (
              <div className="card" style={{marginBottom: '2rem', borderLeft: '5px solid #0ea5e9', backgroundColor: '#f0f9ff'}}>
                <h4 style={{color: '#0284c7', marginTop: 0}}>Insights Locked for Privacy</h4>
                <p>Aggregated team insights are only generated when <strong>5 or more employees</strong> have joined your organization.</p>
                <p className="small" style={{marginBottom: 0}}>Current active employees: <strong>{comprehensiveReport.employeeCount || report?.employeeCount || 0}</strong> / 5 required</p>
              </div>
            ) : (
              <>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                  {comprehensiveReport.graphs?.energy_by_hour && (
                    <div className="card">
                      <h3>Energy by Hour</h3>
                      <div style={{ height: '250px' }}>
                        <Line
                          data={{
                            labels: comprehensiveReport.graphs.energy_by_hour.labels,
                            datasets: [{
                              label: 'Median Energy',
                              data: comprehensiveReport.graphs.energy_by_hour.datasets[0].data.map(d => d.median || 0),
                              borderColor: '#10b981',
                              backgroundColor: 'rgba(16, 185, 129, 0.1)',
                              tension: 0.3,
                              fill: true
                            }]
                          }}
                          options={cleanChartOptions}
                        />
                      </div>
                    </div>
                  )}
                  {comprehensiveReport.graphs?.burnout_risk_trend && (
                    <div className="card">
                      <h3>Burnout Risk Trend</h3>
                      <div style={{ height: '250px' }}>
                        <Line data={comprehensiveReport.graphs.burnout_risk_trend} options={cleanChartOptions} />
                      </div>
                    </div>
                  )}
                  {comprehensiveReport.graphs?.stress_trend && (
                    <div className="card">
                      <h3>Stress Trend</h3>
                      <div style={{ height: '250px' }}>
                        <Line data={comprehensiveReport.graphs.stress_trend} options={cleanChartOptions} />
                      </div>
                    </div>
                  )}
                  {comprehensiveReport.graphs?.stress_vs_meetings && (
                    <div className="card">
                      <h3>Stress vs Meetings</h3>
                      <div style={{ height: '250px' }}>
                        <Bar data={comprehensiveReport.graphs.stress_vs_meetings} options={cleanChartOptions} />
                      </div>
                    </div>
                  )}
                  {comprehensiveReport.graphs?.focus_time_breakdown && (
                    <div className="card">
                      <h3>Focus Time Breakdown</h3>
                      <div style={{ height: '250px' }}>
                        <Bar data={comprehensiveReport.graphs.focus_time_breakdown} options={{ ...cleanChartOptions, scales: { x: { stacked: true }, y: { stacked: true } } }} />
                      </div>
                    </div>
                  )}
                  {comprehensiveReport.graphs?.calendar_chaos && (
                    <div className="card">
                      <h3>Calendar Chaos</h3>
                      <div style={{ height: '250px' }}>
                        <Line data={comprehensiveReport.graphs.calendar_chaos} options={cleanChartOptions} />
                      </div>
                    </div>
                  )}
                  {comprehensiveReport.graphs?.context_switching && (
                    <div className="card">
                      <h3>Context Switching</h3>
                      <div style={{ height: '250px' }}>
                        <Line data={comprehensiveReport.graphs.context_switching} options={cleanChartOptions} />
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                  {comprehensiveReport.graphs?.meeting_density && (
                    <div className="card">
                      <h3>Meeting Density Heatmap</h3>
                      <div style={{ display: 'grid', gap: '6px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', fontSize: '0.75rem', color: '#64748b', textAlign: 'center' }}>
                          {comprehensiveReport.graphs.meeting_density.labels.map((d) => (
                            <div key={d}>{d}</div>
                          ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: '10px', gap: '4px' }}>
                          {Array.from({ length: 24 }).flatMap((_, hour) => (
                            comprehensiveReport.graphs.meeting_density.data.map((dayRow) => dayRow?.[hour] || 0)
                          )).map((value, idx) => (
                            <div key={idx} style={{ background: `rgba(14, 116, 144, ${0.1 + Math.min(1, value / 5) * 0.8})`, borderRadius: '4px' }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {comprehensiveReport.graphs?.after_hours_activity && (
                    <div className="card">
                      <h3>After Hours Activity</h3>
                      <div style={{ height: '250px' }}>
                        <Bar data={comprehensiveReport.graphs.after_hours_activity} options={cleanChartOptions} />
                      </div>
                    </div>
                  )}
                  {comprehensiveReport.graphs?.wip_growth && (
                    <div className="card">
                      <h3>Work In Progress</h3>
                      <div style={{ height: '250px' }}>
                        <Line data={comprehensiveReport.graphs.wip_growth} options={cleanChartOptions} />
                      </div>
                    </div>
                  )}
                  {comprehensiveReport.graphs?.workload_by_assignee && (
                    <div className="card">
                      <h3>Workload by Assignee</h3>
                      <div style={{ height: '250px' }}>
                        <Bar data={comprehensiveReport.graphs.workload_by_assignee} options={cleanChartOptions} />
                      </div>
                    </div>
                  )}
                </div>

                {comprehensiveReport.stats?.deadline_risk && (
                  <div className="card">
                    <h3>Deadline Risk</h3>
                    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                      <div>
                        <div className="small">Velocity</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{comprehensiveReport.stats.deadline_risk.velocity.toFixed(1)} pts/wk</div>
                      </div>
                      <div>
                        <div className="small">Backlog</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{comprehensiveReport.stats.deadline_risk.backlogPoints.toFixed(0)} pts</div>
                      </div>
                      <div>
                        <div className="small">Weeks to Complete</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{comprehensiveReport.stats.deadline_risk.weeksToComplete.toFixed(1)}</div>
                      </div>
                      <div>
                        <div className="small">Projected Date</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{comprehensiveReport.stats.deadline_risk.projectedDate}</div>
                      </div>
                    </div>
                  </div>
                )}

                {comprehensiveReport.correlations?.matrix?.length > 0 && (
                  <div className="card">
                    <h3>Signal Correlations</h3>
                    <div style={{ display: 'grid', gap: '6px', overflowX: 'auto' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: `140px repeat(${comprehensiveReport.correlations.labels.length}, minmax(70px, 1fr))`, gap: '6px', fontSize: '0.75rem', color: '#64748b' }}>
                        <div />
                        {comprehensiveReport.correlations.labels.map(label => <div key={label}>{label}</div>)}
                      </div>
                      {comprehensiveReport.correlations.matrix.map(row => (
                        <div key={row.metric} style={{ display: 'grid', gridTemplateColumns: `140px repeat(${comprehensiveReport.correlations.labels.length}, minmax(70px, 1fr))`, gap: '6px' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{row.metric}</div>
                          {row.values.map((val, idx) => (
                            <div key={`${row.metric}-${idx}`} style={{ textAlign: 'center', padding: '6px 0', borderRadius: '6px', background: `rgba(239, 68, 68, ${Math.min(Math.abs(val), 1) * 0.5})` }}>
                              {val}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* TAB 5: PULSE SURVEYS */}
        {!loading && activeSection === 'surveys' && (
          <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0 }}>Pulse Surveys</h2>
              <button className="quiz-button" onClick={() => setIsCreatingSurvey(true)}>+ Create New Survey</button>
            </div>
            <p className="small" style={{ marginBottom: '2rem' }}>
              Create short, custom surveys to gather specific feedback. When activated, a survey will replace the standard daily check-in for all employees.
            </p>

            {surveys.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                <p>No surveys created yet. Click "Create New Survey" to start.</p>
              </div>
            ) : (
              <div className="card">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '2px solid #f1f5f9' }}>
                      <th style={{ padding: '0.5rem 1rem' }}>Name</th>
                      <th style={{ padding: '0.5rem 1rem' }}>State</th>
                      <th style={{ padding: '0.5rem 1rem' }}>Questions</th>
                      <th style={{ padding: '0.5rem 1rem' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {surveys.map(s => (
                      <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '1rem', fontWeight: 'bold' }}>{s.name}</td>
                        <td style={{ padding: '1rem' }}>
                          {s.isActive ? (
                            <span style={{ color: '#16a34a', background: '#f0fdf4', padding: '4px 8px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold' }}>● Active</span>
                          ) : (
                            <span style={{ color: '#64748b', background: '#f1f5f9', padding: '4px 8px', borderRadius: '12px', fontSize: '0.8rem' }}>Inactive</span>
                          )}
                        </td>
                        <td style={{ padding: '1rem' }}>{s.questions.length}</td>
                        <td style={{ padding: '1rem', display: 'flex', gap: '0.5rem' }}>
                          <button 
                            onClick={async () => {
                              try {
                                await activateSurvey(s.id, !s.isActive);
                                handleRefresh(); // Refresh all data
                              } catch (err) { alert(err.message); }
                            }}
                            style={{ fontSize: '0.8rem', padding: '4px 10px', background: s.isActive ? '#64748b' : '#2563eb' }}
                          >
                            {s.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button onClick={() => handleViewSurveyResults(s)} style={{ fontSize: '0.8rem', padding: '4px 10px', background: 'white', color: '#334155', border: '1px solid #cbd5e1' }}>Results</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: ACTION SIMULATOR */}
        {!loading && activeSection === 'simulator' && (
          <div className="fade-in">
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ marginTop: 0 }}>Action Simulator</h2>
              <p className="small">Model how policy changes affect burnout risk, meeting waste, and overall focus time.</p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
                <div>
                  <label className="small">Plan Name</label>
                  <input value={simPlan.name} onChange={(e) => setSimPlan(prev => ({ ...prev, name: e.target.value }))} />
                </div>
                <div>
                  <label className="small">Duration (weeks)</label>
                  <input type="number" min="4" max="52" value={simPlan.durationWeeks} onChange={(e) => setSimPlan(prev => ({ ...prev, durationWeeks: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="small">Avg Hourly Rate ($)</label>
                  <input type="number" min="10" max="500" value={simPlan.avgHourlyRate} onChange={(e) => setSimPlan(prev => ({ ...prev, avgHourlyRate: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="small">Project Deadline</label>
                  <input type="date" value={simPlan.projectDeadline} onChange={(e) => setSimPlan(prev => ({ ...prev, projectDeadline: e.target.value }))} />
                </div>
              </div>

              {teams.length > 0 && (
                <div style={{ marginTop: '1.5rem' }}>
                  <label className="small">Scope (Optional: select teams)</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                    {teams.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSimSelectedTeams(prev => prev.includes(String(t.id)) ? prev.filter(id => id !== String(t.id)) : [...prev, String(t.id)])}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '16px',
                          border: simSelectedTeams.includes(String(t.id)) ? '2px solid #2563eb' : '1px solid #cbd5e1',
                          background: simSelectedTeams.includes(String(t.id)) ? '#eff6ff' : 'white',
                          color: simSelectedTeams.includes(String(t.id)) ? '#2563eb' : '#64748b',
                          cursor: 'pointer'
                        }}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
              {SIM_ACTION_TYPES.map(action => {
                const selected = simPlan.actions.find(a => a.type === action.id);
                return (
                  <div key={action.id} className="card" style={{ borderLeft: selected ? '4px solid #2563eb' : '4px solid transparent' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div>
                        <h4 style={{ marginTop: 0 }}>{action.label}</h4>
                        <p className="small">{action.desc}</p>
                      </div>
                      <input type="checkbox" checked={!!selected} onChange={() => toggleSimAction(action.id)} />
                    </div>
                    {selected && (
                      <div style={{ marginTop: '1rem' }}>
                        <label className="small">Intensity: <strong>{selected.intensity}%</strong></label>
                        <input type="range" min="10" max="100" step="5" value={selected.intensity} onChange={(e) => updateSimAction(action.id, 'intensity', e.target.value)} />
                        <label className="small" style={{ marginTop: '0.5rem', display: 'block' }}>Adherence: <strong>{selected.adherence}%</strong></label>
                        <input type="range" min="40" max="100" step="5" value={selected.adherence} onChange={(e) => updateSimAction(action.id, 'adherence', e.target.value)} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="small">Selected actions: {simPlan.actions.length}</div>
                {simError && <div style={{ color: '#ef4444', marginTop: '0.5rem' }}>{simError}</div>}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={runEmployerSimulation} className="quiz-button" style={{ width: 'auto' }} disabled={simLoading}>
                  {simLoading ? 'Simulating...' : 'Run Simulation'}
                </button>
                {simResults && (
                  <button onClick={handleSaveSimulation} className="quiz-button-secondary" style={{ width: 'auto' }}>
                    Save Results
                  </button>
                )}
              </div>
            </div>

            {simResults && (
              <div className="card" style={{ marginTop: '1.5rem' }}>
                <h3 style={{ marginTop: 0 }}>Projected Impact</h3>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                  <div className="card">
                    <div className="small">Burnout Risk Reduction</div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>{simResults.metrics.deltaPercent}%</div>
                  </div>
                  <div className="card">
                    <div className="small">Weekly Hours Saved</div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{simResults.metrics.weeklyHoursSaved} hrs</div>
                  </div>
                  <div className="card">
                    <div className="small">Estimated Savings</div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>${Number(simResults.metrics.estimatedSavings || 0).toLocaleString()}</div>
                  </div>
                  <div className="card">
                    <div className="small">Time to Impact</div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{simResults.metrics.timeToImpact ?? '—'} days</div>
                  </div>
                  <div className="card">
                    <div className="small">Trend</div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{simResults.metrics.trend}</div>
                  </div>
                </div>

                <div style={{ height: '320px' }}>
                  <Line
                    data={{
                      labels: simResults.timeline.map((t) => `Day ${t.day}`),
                      datasets: [
                        {
                          label: 'Projected Burnout Risk',
                          data: simResults.timeline.map((t) => t.risk),
                          borderColor: '#ef4444',
                          backgroundColor: 'rgba(239, 68, 68, 0.1)',
                          fill: true,
                          tension: 0.3,
                          pointRadius: 0
                        }
                      ]
                    }}
                    options={cleanChartOptions}
                  />
                </div>

                {simResults.baseline && simResults.projected && (
                  <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
                    <div className="card">
                      <div className="small">Meeting Hours</div>
                      <div><strong>{simResults.baseline.meetingHours?.toFixed?.(1)}h</strong> → <strong>{simResults.projected.meetingHours?.toFixed?.(1)}h</strong></div>
                    </div>
                    <div className="card">
                      <div className="small">Fragmented Time</div>
                      <div><strong>{simResults.baseline.fragmentedHours?.toFixed?.(1)}h</strong> → <strong>{simResults.projected.fragmentedHours?.toFixed?.(1)}h</strong></div>
                    </div>
                    <div className="card">
                      <div className="small">Focus Hours</div>
                      <div><strong>{simResults.baseline.focusHours?.toFixed?.(1)}h</strong> → <strong>{simResults.projected.focusHours?.toFixed?.(1)}h</strong></div>
                    </div>
                    <div className="card">
                      <div className="small">Slack Load</div>
                      <div><strong>{simResults.baseline.slackMessages?.toFixed?.(0)}</strong> → <strong>{simResults.projected.slackMessages?.toFixed?.(0)}</strong></div>
                    </div>
                    <div className="card">
                      <div className="small">Active Tickets</div>
                      <div><strong>{simResults.baseline.activeTickets?.toFixed?.(0)}</strong> → <strong>{simResults.projected.activeTickets?.toFixed?.(0)}</strong></div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!loading && activeSection === 'integrations' && (
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Integrations Manager</h2>
            <p className="small">Connect your tools to enrich team-level insights.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
              {Object.keys(integrations).map((service) => (
                <div key={service} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontWeight: 'bold',
                      background: service === 'slack' ? '#4A154B' :
                        service === 'trello' ? '#0079BF' :
                        service === 'jira' ? '#0052CC' :
                        service === 'google' ? '#4285F4' : '#F06A6A'
                    }}>
                      {service.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{service}</div>
                      <div className="small">{integrations[service] ? 'Syncing active' : 'Not connected'}</div>
                    </div>
                  </div>
                  {integrations[service] ? (
                    <button onClick={() => handleDisconnectIntegration(service)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                      Disconnect
                    </button>
                  ) : (
                    <button onClick={() => handleConnectIntegration(service)} className="quiz-button" style={{ width: 'auto', padding: '6px 14px' }}>
                      Connect
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && activeSection === 'settings' && (
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Settings</h2>
            <p className="small">Manage account preferences, security, and profile details.</p>
            <Link to="/settings" className="quiz-button-secondary" style={{ display: 'inline-block', width: 'auto', marginTop: '0.75rem' }}>
              Open Settings
            </Link>
          </div>
        )}

        {/* Privacy Assurance Footer (Always Visible) */}
        <div className="card" style={{backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', marginTop: '2rem'}}>
          <h4 style={{marginTop: 0, color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
            <span>🔒</span> Privacy Assurance
          </h4>
          <p className="small" style={{marginBottom: 0, color: '#475569'}}>
            This dashboard displays aggregated data only. Individual employee check-ins and burnout scores are never revealed to you to protect their privacy and psychological safety.
          </p>
        </div>
          </div>
        </div>
      </div>

      {/* Team Details Modal */}
      {selectedTeam && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(4px)' }}>
          <div className="card fade-in" style={{ width: '90%', maxWidth: '1000px', maxHeight: '90vh', overflowY: 'auto', position: 'relative', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
             <button onClick={() => setSelectedTeam(null)} style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>&times;</button>
             
             <h2 style={{ marginBottom: '0.5rem' }}>{selectedTeam.name} Insights</h2>
             <p className="small" style={{ marginBottom: '2rem' }}>Detailed analytics for {selectedTeam.memberCount} active members.</p>
             
             {teamLoading ? (
               <div style={{ padding: '4rem', textAlign: 'center', color: '#64748b' }}>Loading team data...</div>
             ) : (
               teamReport ? (
                 <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                    {/* 1. Trend Line */}
                    <div className="card" style={{ gridColumn: '1 / -1' }}>
                      <h3>Weekly Trends</h3>
                      <div style={{ height: '300px' }}>
                        <Line data={getTeamTrendChartData(teamReport)} options={cleanChartOptions} />
                      </div>
                    </div>

                    {/* 2. Radar Comparison */}
                    <div className="card">
                      <h3>Team vs Company</h3>
                      <p className="small">Comparing {selectedTeam.name} against company average.</p>
                      <div style={{ height: '300px', display: 'flex', justifyContent: 'center' }}>
                        <Radar 
                          data={getRadarChartData(teamReport, report)} 
                          options={{
                            scales: { r: { suggestedMin: 0, suggestedMax: 10 } },
                            plugins: { legend: { position: 'bottom' } }
                          }} 
                        />
                      </div>
                    </div>

                    {/* 3. Drivers */}
                    <div className="card">
                      <h3>Primary Drivers</h3>
                      <p className="small">Factors contributing most to this team's stress.</p>
                      <div style={{ height: '250px', display: 'flex', justifyContent: 'center' }}>
                        <Pie data={getDriverChartData(teamReport)} options={{ plugins: { legend: { position: 'right' } } }} />
                      </div>
                    </div>
                 </div>
               ) : (
                 <p>No data available for this team.</p>
               )
             )}
          </div>
        </div>
      )}

      {/* Pilot Enrollment Popup (Appears after 90s) */}
      <PilotEnrollmentPopup />

      {/* MODALS */}
      {isCreatingSurvey && (
        <SurveyCreator 
          user={user} 
          teams={teams}
          onSave={() => { setIsCreatingSurvey(false); handleRefresh(); }} 
          onClose={() => setIsCreatingSurvey(false)} 
        />
      )}

      {viewingSurvey && (
        <SurveyResultsViewer 
          survey={viewingSurvey} 
          results={surveyResults} 
          loading={surveyLoading} 
          onClose={() => { setViewingSurvey(null); setSurveyResults(null); }} 
        />
      )}
    </>
  );
}

const SurveyCreator = ({ user, teams = [], onSave, onClose }) => {
  const [name, setName] = useState('');
  const [targetType, setTargetType] = useState('all');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [questions, setQuestions] = useState([{ id: 'q1', text: '', type: 'scale' }]);

  const templates = [
    {
      name: 'Weekly Workload Check',
      questions: [
        'My workload was manageable this week.',
        'I had enough time to complete my tasks.',
        'I felt supported by my team when I needed help.',
      ],
    },
    {
      name: 'Team Morale Pulse',
      questions: [
        'I feel motivated at work.',
        'I am proud of the work I do.',
        'I feel connected to my colleagues.',
      ],
    },
  ];

  const applyTemplate = (template) => {
    setName(template.name);
    setQuestions(template.questions.map((q, i) => ({ id: `q${Date.now() + i}`, text: q, type: 'scale' })));
  };

  const handleAddQuestion = () => {
    setQuestions([...questions, { id: `q${Date.now()}`, text: '', type: 'scale' }]);
  };

  const handleQuestionChange = (id, text) => {
    setQuestions(questions.map(q => q.id === id ? { ...q, text } : q));
  };

  const handleRemoveQuestion = (id) => {
    if (questions.length > 1) {
      setQuestions(questions.filter(q => q.id !== id));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validQuestions = questions.filter(q => q.text.trim());
    if (!name.trim() || validQuestions.length === 0) return;
    
    if (targetType === 'team' && !selectedTeam) {
      alert('Please select a team.');
      return;
    }
    
    try {
      await createSurvey({ 
        companyCode: user.companyCode, 
        name, 
        questions: validQuestions,
        targetTeamId: targetType === 'team' ? selectedTeam : null
      });
      onSave();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(4px)' }}>
      <div className="card" style={{ width: '90%', maxWidth: '600px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid #f1f5f9' }}>
          <h2 style={{ margin: 0 }}>Create Pulse Survey</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
        </div>

        <form id="survey-creator-form" onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 0.5rem' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <h4 style={{ marginTop: 0, marginBottom: '0.75rem', color: '#475569' }}>Start with a template (optional)</h4>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {templates.map(t => (
                <button type="button" key={t.name} onClick={() => applyTemplate(t)} style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', padding: '6px 12px', borderRadius: '16px', fontSize: '0.85rem' }}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem', color: '#334155' }}>Target Audience</label>
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input 
                  type="radio" 
                  name="targetType" 
                  value="all" 
                  checked={targetType === 'all'} 
                  onChange={() => setTargetType('all')} 
                />
                Full Company
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input 
                  type="radio" 
                  name="targetType" 
                  value="team" 
                  checked={targetType === 'team'} 
                  onChange={() => setTargetType('team')} 
                />
                Specific Team
              </label>
            </div>
            
            {targetType === 'team' && (
              <div style={{ marginTop: '0.8rem' }}>
                <select 
                  value={selectedTeam} 
                  onChange={e => setSelectedTeam(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #cbd5e1', background: 'white' }}
                  required
                >
                  <option value="">-- Select Team --</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="survey-name" style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>Survey Name</label>
            <input id="survey-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Q3 Team Satisfaction" required style={{ width: '100%', padding: '8px' }} />
          </div>
          
          <div style={{ marginBottom: '1rem' }}>
            <label id="questions-label" style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>Questions</label>
            {questions.map((q, index) => (
              <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem', padding: '12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                <span style={{ fontWeight: 'bold', color: '#94a3b8', width: '24px' }}>{index + 1}.</span>
                <input 
                  value={q.text}
                  onChange={e => handleQuestionChange(q.id, e.target.value)}
                  placeholder="Type your question here..."
                  style={{ flex: 1, padding: '4px', border: 'none', outline: 'none', fontSize: '1rem', background: 'transparent' }}
                  aria-labelledby="questions-label"
                  autoFocus={index === questions.length - 1 && !q.text && index > 0}
                />
                {questions.length > 1 && (
                  <button type="button" onClick={() => handleRemoveQuestion(q.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.2rem', padding: '0 0.5rem' }} title="Remove">&times;</button>
                )}
              </div>
            ))}
            <button type="button" onClick={handleAddQuestion} style={{ fontSize: '0.9rem', background: '#eff6ff', border: '1px dashed #2563eb', color: '#2563eb', cursor: 'pointer', padding: '8px 16px', borderRadius: '4px', width: '100%' }}>+ Add Question</button>
          </div>
        </form>

        <div style={{ display: 'flex', justifyContent: 'end', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
          <button type="button" onClick={onClose} style={{ background: '#64748b' }}>Cancel</button>
          <button type="submit" form="survey-creator-form" className="quiz-button">Save Survey</button>
        </div>
      </div>
    </div>
  );
};

SurveyCreator.propTypes = {
  user: PropTypes.object.isRequired,
  teams: PropTypes.array,
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired
};

const SurveyResultsViewer = ({ survey, results, loading, onClose }) => {
  const getChartDataForQuestion = (qId) => {
    const questionResults = results.answers.filter(a => a.questionId === qId);
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    questionResults.forEach(r => {
      if (counts[r.answer] !== undefined) counts[r.answer]++;
    });
    return {
      labels: ['1', '2', '3', '4', '5'],
      datasets: [{
        label: 'Responses',
        data: Object.values(counts),
        backgroundColor: '#3b82f6'
      }]
    };
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div className="card" style={{ width: '90%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}>
        <button onClick={onClose} style={{ float: 'right', background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
        <h2 style={{ marginTop: 0 }}>{survey.name} Results</h2>
        <p className="small">{results?.responseCount || 0} responses</p>
        {loading && <p>Loading results...</p>}
        {results && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginTop: '1rem' }}>
            {survey.questions.map(q => (
              <div key={q.id}>
                <h4 style={{ marginBottom: '0.5rem' }}>{q.text}</h4>
                <div style={{ height: '200px' }}><Bar data={getChartDataForQuestion(q.id)} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

SurveyResultsViewer.propTypes = {
  survey: PropTypes.object.isRequired,
  results: PropTypes.object,
  loading: PropTypes.bool,
  onClose: PropTypes.func.isRequired
};
