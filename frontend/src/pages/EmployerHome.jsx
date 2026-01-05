import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
import { Bar, Line, Pie, Doughnut, Radar } from 'react-chartjs-2';
import Navbar from '../components/layout/Navbar';
import { useUser } from '../context/UserContext';
import { fetchWeeklyReport, fetchEmployees, fetchTeams, createTeam, assignEmployeeToTeam, deleteTeam, fetchTeamMetrics, simulateTeamImpact } from '../services/api';
import { analytics } from '../services/analytics';

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

export default function EmployerHome() {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'teams', 'insights', 'simulator'
  const [report, setReport] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [teams, setTeams] = useState([]);
  const [teamMetrics, setTeamMetrics] = useState([]);
  const [employeesError, setEmployeesError] = useState('');
  const [loading, setLoading] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [simulationData, setSimulationData] = useState(null);
  const [selectedSimTeams, setSelectedSimTeams] = useState([]);
  const [sliderValues, setSliderValues] = useState({}); // { actionId: value (0-100) }
  const [simLoading, setSimLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [simError, setSimError] = useState('');
  const [chartType, setChartType] = useState('bar');
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [teamReport, setTeamReport] = useState(null);
  const [teamLoading, setTeamLoading] = useState(false);

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
        fetchEmployees(user.companyCode),
        fetchTeams(user.companyCode),
        fetchTeamMetrics(user.companyCode).catch(() => []) // Fail gracefully if endpoint not ready
      ]).then(([reportResult, employeesResult, teamsResult, metricsResult]) => {
        if (!isMounted) return;

        // Handle Report
        if (reportResult.status === 'fulfilled') {
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

        setLoading(false);
      });
    } else if (user) {
        setLoading(false);
    }
    
    return () => { isMounted = false; };
  }, [user]);

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
    const employeeId = parseInt(e.dataTransfer.getData('employeeId'), 10);
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
    navigator.clipboard.writeText(user.companyCode);
    alert('Company code copied to clipboard!');
  };

  // --- Simulator Logic ---
  // Fetch simulation curves when teams are selected
  useEffect(() => {
    if (activeTab === 'simulator' && selectedSimTeams.length > 0) {
      setSimLoading(true);
      setSimError('');
      simulateTeamImpact({
        teamIds: selectedSimTeams,
        companyCode: user.companyCode
      }).then(data => {
        if (!data || !data.actions) {
          setSimulationData(null);
          setSimLoading(false);
          return;
        }
        setSimulationData(data);
        // Initialize sliders to 0
        const initialSliders = {};
        data.actions.forEach(a => initialSliders[a.id] = 0);
        setSliderValues(initialSliders);
        setSimLoading(false);
      }).catch(err => {
        console.error(err);
        setSimError(err.message || 'Failed to load simulation data');
        setSimulationData(null);
        setSimLoading(false);
      });
    } else {
      setSimulationData(null);
      setSimError('');
    }
  }, [activeTab, selectedSimTeams, user.companyCode]);

  const handleSaveSimulation = () => {
    setSaved(true);
    // In a real implementation, this would call an API to persist the scenario
  };

  const toggleSimTeam = (teamId) => {
    setSelectedSimTeams(prev => prev.includes(teamId) ? prev.filter(id => id !== teamId) : [...prev, teamId]);
  };

  const handleSliderChange = (actionId, val) => {
    setSliderValues(prev => ({ ...prev, [actionId]: parseInt(val, 10) }));
    setSaved(false);
  };

  // Calculate Aggregate Results based on current sliders
  const calculateAggregate = () => {
    if (!simulationData || !simulationData.baseline) return { risk: 0, hours: 0, reduction: 0 };
    
    const baselineRisk = simulationData.baseline.risk;
    let totalRiskReduction = 0;
    let totalExtraHours = 0;

    simulationData.actions.forEach(action => {
      const val = sliderValues[action.id] || 0;
      
      const maxRiskDrop = baselineRisk - action.curve[4].avgRisk; // Risk at 100
      const currentRiskDrop = maxRiskDrop * (val / 100); // Linear approx for aggregation
      
      const maxHours = action.curve[4].totalExtraHours;
      const currentHours = maxHours * (val / 100);

      totalRiskReduction += currentRiskDrop;
      totalExtraHours += currentHours;
    });

    const projectedRisk = Math.max(0, baselineRisk - totalRiskReduction);
    const reductionPercent = baselineRisk > 0 ? ((baselineRisk - projectedRisk) / baselineRisk) * 100 : 0;

    return {
      risk: projectedRisk.toFixed(1),
      reduction: reductionPercent.toFixed(1),
      hours: Math.round(totalExtraHours)
    };
  };

  const aggResults = calculateAggregate();

  // --- Chart Data Preparation ---
  const getComparisonChartData = () => {
    // Filter out teams with < 5 members for privacy
    const validTeams = Array.isArray(teamMetrics) ? teamMetrics.filter(t => t.memberCount >= 5) : [];
    
    return {
      labels: validTeams.map(t => t.name),
      datasets: [
        { 
          label: 'Avg Stress', 
          data: validTeams.map(t => t.avgStress), 
          backgroundColor: '#ef4444', 
          borderColor: '#ef4444',
          borderWidth: 2,
          borderRadius: 4,
          tension: 0.4
        },
        { 
          label: 'Avg Workload', 
          data: validTeams.map(t => t.avgWorkload), 
          backgroundColor: '#8b5cf6', 
          borderColor: '#8b5cf6',
          borderWidth: 2,
          borderRadius: 4,
          tension: 0.4
        }
      ]
    };
  };

  const getDriverChartData = (source = report) => {
    if (!source || !source.drivers || !source.drivers.distribution) return null;
    const dist = source.drivers.distribution;
    return {
      labels: ['Stress', 'Sleep Quality', 'Workload', 'Caffeine'],
      datasets: [
        {
          data: [dist.stress, dist.sleep, dist.workload, dist.coffee],
          backgroundColor: [
            'rgba(239, 68, 68, 0.8)',  // Red for Stress
            'rgba(59, 130, 246, 0.8)', // Blue for Sleep
            'rgba(168, 85, 247, 0.8)', // Purple for Workload
            'rgba(120, 53, 15, 0.8)',  // Brown for Coffee
          ],
          borderColor: [
            'rgba(239, 68, 68, 1)',
            'rgba(59, 130, 246, 1)',
            'rgba(168, 85, 247, 1)',
            'rgba(120, 53, 15, 1)',
          ],
          borderWidth: 1,
        },
      ],
    };
  };

  const getRiskDistChartData = (source = report) => {
    if (!source || !source.riskDistribution) return null;
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
    if (!source || !source.datasets) return null;

    const calcAvg = (arr) => {
      const valid = arr.filter(v => v !== null);
      if (valid.length === 0) return 0;
      return (valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1);
    };

    const datasets = [
      {
        label: comparison ? 'This Team' : 'Company Average',
        data: [
          calcAvg(source.datasets.stress),
          calcAvg(source.datasets.sleep),
          calcAvg(source.datasets.workload),
          calcAvg(source.datasets.coffee)
        ],
        backgroundColor: 'rgba(37, 99, 235, 0.2)',
        borderColor: '#2563eb',
        pointBackgroundColor: '#2563eb',
      },
      {
        label: 'Ideal Baseline',
        data: [3, 8, 5, 1],
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        borderColor: '#10b981',
        pointBackgroundColor: '#10b981',
      }
    ];

    if (comparison) {
      datasets.push({
        label: 'Company Average',
        data: [
          calcAvg(comparison.datasets.stress),
          calcAvg(comparison.datasets.sleep),
          calcAvg(comparison.datasets.workload),
          calcAvg(comparison.datasets.coffee)
        ],
        backgroundColor: 'rgba(100, 116, 139, 0.1)',
        borderColor: '#94a3b8',
        pointBackgroundColor: '#94a3b8',
        borderDash: [5, 5]
      });
    }

    return {
      labels: ['Stress', 'Sleep', 'Workload', 'Coffee'],
      datasets: datasets
    };
  };

  const getTeamTrendChartData = (data) => {
    if (!data || !data.datasets) return null;
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

  const handleTeamClick = async (team) => {
    if (team.memberCount < 5) return;
    setSelectedTeam(team);
    setTeamLoading(true);
    try {
      // Pass teamId as query param to existing report endpoint
      const data = await fetchWeeklyReport(`${user.companyCode}?teamId=${team.teamId}`);
      setTeamReport(data);
    } catch (e) {
      console.error(e);
    } finally {
      setTeamLoading(false);
    }
  };

  return (
    <>
      <Navbar />
      <div className="container">
        <h1>Employer Dashboard</h1>
        
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

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid #e2e8f0' }}>
          {['overview', 'teams', 'insights', 'simulator'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '1rem',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab ? '3px solid #2563eb' : '3px solid transparent',
                fontWeight: activeTab === tab ? 'bold' : 'normal',
                color: activeTab === tab ? '#2563eb' : '#64748b',
                cursor: 'pointer',
                textTransform: 'capitalize'
              }}
            >
              {tab === 'teams' ? 'Team Management' : tab === 'insights' ? 'Team Insights' : tab === 'simulator' ? 'Action Simulator' : 'Overview'}
            </button>
          ))}
        </div>
        
        {loading && <div className="card"><p>Loading insights...</p></div>}
        
        {/* TAB 1: OVERVIEW (Existing Dashboard) */}
        {!loading && activeTab === 'overview' && report && (
          <div className="fade-in">
            {report.privacyLocked ? (
              <div className="card" style={{marginBottom: '2rem', borderLeft: '5px solid #0ea5e9', backgroundColor: '#f0f9ff'}}>
                <h4 style={{color: '#0284c7', marginTop: 0}}>Insights Locked for Privacy</h4>
                <p>Aggregated team insights are only generated when <strong>5 or more employees</strong> have joined your organization. This ensures individual data remains anonymous.</p>
                <p className="small" style={{marginBottom: 0}}>Current active employees: <strong>{report.employeeCount}</strong> / 5 required</p>
              </div>
            ) : (
              <>
                <div className="grid" style={{gridTemplateColumns: '1fr 1fr', marginBottom: '1rem'}}>
                  <div className="card">
                    <h4 style={{color: '#64748b'}}>Active Employees</h4>
                    <div className="result-score" style={{fontSize: '2.5rem'}}>{report.employeeCount || 0}</div>
                  </div>
                  <div className="card">
                    <h4 style={{color: '#64748b'}}>Total Check-ins</h4>
                    <div className="result-score" style={{fontSize: '2.5rem'}}>{report.totalCheckins || 0}</div>
                  </div>
                  <div className="card">
                    <h4 style={{color: '#64748b'}}>Plan Adherence</h4>
                    <div className="result-score" style={{fontSize: '2.5rem', color: '#8b5cf6'}}>{report.teamAdherence || 0}%</div>
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

                <div style={{marginTop: '2rem'}}>
                  <Link to="/reports/weekly" className="quiz-button" style={{textAlign: 'center', textDecoration: 'none', display: 'inline-block', width: 'auto', padding: '12px 24px'}}>
                    View Detailed Analytics & Graphs
                  </Link>
                </div>
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

        {/* TAB 2: TEAM MANAGEMENT (Drag & Drop) */}
        {!loading && activeTab === 'teams' && (
          <div className="fade-in">
            <div className="card" style={{ marginBottom: '2rem' }}>
              <h3>Create New Team</h3>
              <form onSubmit={handleCreateTeam} style={{ display: 'flex', gap: '1rem' }}>
                <input 
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

        {/* TAB 3: INSIGHTS (Comparison) */}
        {!loading && activeTab === 'insights' && (
          <div className="fade-in">
            {/* New Fancy Graphs Row */}
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
              {/* Driver Distribution */}
              <div className="card">
                <h3>Burnout Drivers</h3>
                <p className="small">Relative impact of factors contributing to team burnout.</p>
                <div style={{ height: '250px', display: 'flex', justifyContent: 'center' }}>
                  {getDriverChartData() ? (
                    <Pie data={getDriverChartData()} options={{ plugins: { legend: { position: 'right' } } }} />
                  ) : (
                    <p style={{ color: '#94a3b8', alignSelf: 'center' }}>No driver data available</p>
                  )}
                </div>
              </div>

              {/* Risk Distribution */}
              <div className="card">
                <h3>Risk Distribution</h3>
                <p className="small">Proportion of employees in each risk category.</p>
                <div style={{ height: '250px', display: 'flex', justifyContent: 'center' }}>
                  {getRiskDistChartData() ? (
                    <Doughnut data={getRiskDistChartData()} options={{ plugins: { legend: { position: 'right' } }, cutout: '60%' }} />
                  ) : (
                    <p style={{ color: '#94a3b8', alignSelf: 'center' }}>No risk data available</p>
                  )}
                </div>
              </div>
            </div>

            {/* Radar Chart */}
            <div className="card" style={{ marginBottom: '2rem' }}>
              <h3>Team Health Radar</h3>
              <p className="small">Comparing current team averages against ideal wellness metrics.</p>
              <div style={{ height: '350px', display: 'flex', justifyContent: 'center' }}>
                {getRadarChartData() ? (
                  <Radar 
                    data={getRadarChartData()} 
                    options={{
                      scales: { r: { suggestedMin: 0, suggestedMax: 10 } },
                      plugins: { legend: { position: 'bottom' } }
                    }} 
                  />
                ) : <p>No data available</p>}
              </div>
            </div>

            <div className="card" style={{ marginBottom: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Team Comparison</h3>
                <button 
                  onClick={() => setChartType(prev => prev === 'bar' ? 'line' : 'bar')}
                  className="quiz-button"
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', width: 'auto', backgroundColor: '#64748b' }}
                >
                  View as {chartType === 'bar' ? 'Line' : 'Bar'} Graph
                </button>
              </div>
              <p className="small">Comparing aggregated metrics across teams with 5+ members.</p>
              
              {Array.isArray(teamMetrics) && teamMetrics.filter(t => t.memberCount >= 5).length > 0 ? (
                <div style={{ height: '400px' }}>
                  {chartType === 'bar' ? (
                    <Bar 
                      data={getComparisonChartData()} 
                      options={cleanChartOptions} 
                    />
                  ) : (
                    <Line data={getComparisonChartData()} options={cleanChartOptions} />
                  )}
                </div>
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', background: '#f8fafc', color: '#64748b' }}>
                  <p>Not enough data to display comparisons. Ensure teams have at least 5 members and active check-ins.</p>
                </div>
              )}
            </div>

            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
              {Array.isArray(teamMetrics) && teamMetrics.map(team => (
                <div 
                  key={team.teamId} 
                  className="card" 
                  style={{ opacity: team.memberCount < 5 ? 0.7 : 1, cursor: team.memberCount >= 5 ? 'pointer' : 'default', transition: 'transform 0.2s' }}
                  onClick={() => handleTeamClick(team)}
                  onMouseEnter={(e) => { if(team.memberCount >= 5) e.currentTarget.style.transform = 'translateY(-5px)'; }}
                  onMouseLeave={(e) => { if(team.memberCount >= 5) e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4>{team.name}</h4>
                    {team.memberCount >= 5 && <span style={{ fontSize: '0.8rem', color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: '12px' }}>View Details &rarr;</span>}
                  </div>
                  {team.memberCount < 5 ? (
                    <div style={{ color: '#ef4444', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>🔒</span> Privacy Locked
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span>Avg Stress</span>
                        <span style={{ fontWeight: 'bold', color: team.avgStress > 7 ? '#ef4444' : '#10b981' }}>{team.avgStress}/10</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span>Avg Workload</span>
                        <span style={{ fontWeight: 'bold' }}>{team.avgWorkload}/10</span>
                      </div>
                      <div style={{ marginTop: '1rem', padding: '0.5rem', background: '#ecfdf5', borderRadius: '4px', fontSize: '0.9rem', color: '#065f46' }}>
                        Predicted Improvement: <strong>{team.predictedImprovement}%</strong> if action plans followed.
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: SIMULATOR */}
        {!loading && activeTab === 'simulator' && (
          <div className="fade-in">
            <div className="grid" style={{ gridTemplateColumns: '1fr 3fr', gap: '2rem', alignItems: 'start' }}>
              {/* Controls */}
              <div className="card" style={{ height: 'fit-content' }}>
                <h3>1. Select Teams</h3>
                <p className="small">Choose teams to include in the simulation.</p>
                
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '0.5rem' }}>
                    {teams.map(team => (
                      <div key={team.id} style={{ marginBottom: '0.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                          <input 
                            type="checkbox" 
                            checked={selectedSimTeams.includes(team.id)} 
                            onChange={() => toggleSimTeam(team.id)}
                          />
                          {team.name}
                        </label>
                      </div>
                    ))}
                    {teams.length === 0 && <p className="small">No teams available.</p>}
                  </div>
                </div>
              </div>

              {/* Results */}
              <div>
                {selectedSimTeams.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc' }}>
                    <p>Select at least one team to start the simulation.</p>
                  </div>
                ) : simLoading ? (
                  <div style={{ padding: '2rem', textAlign: 'center' }}>Loading simulation models...</div>
                ) : simError ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#ef4444', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
                    <p><strong>Error:</strong> {simError}</p>
                  </div>
                ) : !simulationData ? (
                  <div style={{ padding: '2rem', textAlign: 'center' }}>No data available.</div>
                ) : (
                  <>
                    {/* Summary Card */}
                    <div className="card" style={{ marginBottom: '2rem', background: 'linear-gradient(to right, #1e293b, #334155)', color: 'white' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <h2 style={{ margin: 0, color: 'white' }}>Projected Outcome</h2>
                          <p style={{ color: '#94a3b8', margin: 0 }}>Combined impact of all active interventions</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#4ade80' }}>-{aggResults.reduction}%</div>
                          <div style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Burnout Risk</div>
                        </div>
                        <div style={{ textAlign: 'right', borderLeft: '1px solid #475569', paddingLeft: '1.5rem' }}>
                          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: aggResults.hours > 0 ? '#f87171' : '#60a5fa' }}>
                            {aggResults.hours > 0 ? '+' : ''}{aggResults.hours}
                          </div>
                          <div style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Capacity Gap (Hrs)</div>
                        </div>
                      </div>
                    </div>

                    <h3>2. Adjust Interventions</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                      {simulationData.actions.map(action => (
                        <div key={action.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                            <h4 style={{ margin: 0 }}>{action.title}</h4>
                            <span style={{ fontSize: '0.8rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                              Max: {action.max} {action.unit}
                            </span>
                          </div>
                          <p className="small" style={{ color: '#64748b', minHeight: '40px' }}>{action.desc}</p>
                          
                          {/* Mini Graph */}
                          <div style={{ height: '100px', marginBottom: '1rem' }}>
                            <Line 
                              data={{
                                labels: action.curve.map(p => p.step),
                                datasets: [{
                                  data: action.curve.map(p => p.avgRisk),
                                  borderColor: '#3b82f6',
                                  borderWidth: 2,
                                  pointRadius: 0,
                                  tension: 0.4
                                }]
                              }}
                              options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                                scales: { x: { display: false }, y: { display: false } }
                              }}
                            />
                          </div>

                          {/* Slider */}
                          <div style={{ marginTop: 'auto' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '0.9rem', fontWeight: 'bold' }}>
                              <span>Intensity</span>
                              <span>{Math.round((sliderValues[action.id] / 100) * action.max)} {action.unit}</span>
                            </div>
                            <input 
                              type="range" 
                              min="0" 
                              max="100" 
                              value={sliderValues[action.id] || 0} 
                              onChange={(e) => handleSliderChange(action.id, e.target.value)}
                              style={{ width: '100%', cursor: 'pointer' }}
                            />
                            
                            {/* Optimal Point Marker */}
                            <div style={{ position: 'relative', height: '20px', marginTop: '5px' }}>
                              <div 
                                style={{ 
                                  position: 'absolute', 
                                  left: `${action.optimal}%`, 
                                  transform: 'translateX(-50%)', 
                                  fontSize: '0.75rem', 
                                  color: '#10b981',
                                  display: 'flex', flexDirection: 'column', alignItems: 'center'
                                }}
                              >
                                ▲ <span style={{ whiteSpace: 'nowrap' }}>Recommended</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
                      {saved ? (
                        <span style={{ color: '#10b981', fontWeight: 'bold', padding: '10px 20px' }}>✓ Scenario Saved</span>
                      ) : (
                        <button onClick={handleSaveSimulation} className="quiz-button" style={{ backgroundColor: '#64748b', width: 'auto', padding: '10px 20px' }}>Save Scenario</button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
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
    </>
  );
}
