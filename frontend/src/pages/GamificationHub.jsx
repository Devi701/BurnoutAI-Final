import React, { useEffect, useState } from 'react';
import Navbar from '../components/layout/Navbar';
import { useUser } from '../context/UserContext';
import { fetchGamificationProfile, fetchLeaderboard, updateGamificationSettings, fetchChallenges, joinChallenge } from '../services/api';
import ShareReferral from '../components/ShareReferral';

export default function GamificationHub() {
  const { user } = useUser();
  const [profile, setProfile] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [challenges, setChallenges] = useState([]);

  useEffect(() => {
    if (user) {
      Promise.all([
        fetchGamificationProfile(user.id),
        fetchLeaderboard(),
        fetchChallenges(user.id)
      ]).then(([prof, leaders, challs]) => {
        setProfile(prof);
        setLeaderboard(leaders);
        setChallenges(challs);
        setLoading(false);
      });
    }
  }, [user]);

  const showNotification = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const toggleLeaderboard = async () => {
    if (!profile) return;
    const newValue = !profile.stats.optInLeaderboard;
    
    // Optimistic update
    setProfile(prev => ({ ...prev, stats: { ...prev.stats, optInLeaderboard: newValue } }));
    
    try {
      await updateGamificationSettings({ userId: user.id, optInLeaderboard: newValue });
      if (newValue) fetchLeaderboard().then(setLeaderboard); // Refresh list if joining
    } catch (err) { console.error(err); }
  };

  const handleJoinChallenge = async (challengeId) => {
    try {
      await joinChallenge({ userId: user.id, challengeId });
      showNotification('Challenge joined! Good luck.');
      // Refresh challenges
      const updated = await fetchChallenges(user.id);
      setChallenges(updated);
    } catch (err) { console.error(err); }
  };

  if (loading) return <div className="container"><Navbar /><p style={{marginTop:'2rem'}}>Loading Game Data...</p></div>;

  return (
    <>
      <Navbar streak={profile?.stats?.streak} />
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '2rem',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#1e293b',
          color: 'white',
          padding: '0.75rem 1.5rem',
          borderRadius: '9999px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          zIndex: 50,
          fontSize: '0.9rem',
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <span>✅</span> {toast}
        </div>
      )}
      <div className="container" style={{ marginTop: '2rem', paddingBottom: '3rem' }}>
        
        {/* Hero Section: Level & XP */}
        <div className="card" style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', color: 'white', textAlign: 'center', padding: '3rem 1rem' }}>
          <div style={{ fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.9 }}>Current Level</div>
          <div style={{ fontSize: '4rem', fontWeight: '800', lineHeight: 1 }}>{profile?.stats?.level || 1}</div>
          <div style={{ marginTop: '1rem', fontSize: '1.2rem' }}>{profile?.stats?.score || 0} Score Earned</div>
          
          {/* Progress Bar */}
          <div style={{ maxWidth: '400px', margin: '1.5rem auto 0', background: 'rgba(255,255,255,0.2)', borderRadius: '20px', height: '10px', overflow: 'hidden' }}>
            <div style={{ width: '60%', height: '100%', background: '#fbbf24' }}></div>
          </div>
          <p style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '0.5rem' }}>Keep checking in to reach Level { (profile?.stats?.level || 1) + 1 }!</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', marginTop: '2rem' }}>
          
          {/* Referral / Viral Section */}
          <ShareReferral referralCode={profile?.stats?.referralCode} />

          {/* Badges Section */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>🏆 Achievements</h3>
            {profile?.badges?.length === 0 ? (
              <p style={{ color: '#64748b', fontStyle: 'italic' }}>No badges yet. Complete your first check-in!</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '1rem' }}>
                {profile.badges.map(badge => (
                  <div key={badge.id} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '2.5rem', background: '#fffbeb', borderRadius: '50%', width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', border: '2px solid #fcd34d' }}>
                      {badge.icon}
                    </div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginTop: '0.5rem', color: '#334155' }}>{badge.name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Leaderboard Section */}
        <div className="card" style={{ marginTop: '2rem', borderLeft: '5px solid #8b5cf6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ margin: 0 }}>🔥 Wellness Leaderboard</h3>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.9rem', color: '#64748b' }}>
                Celebrating healthy habits, not hours worked.
              </p>
            </div>
            
            {/* Opt-in Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', color: '#475569' }}>
                {profile?.stats?.optInLeaderboard ? 'Visible' : 'Hidden'}
              </span>
              <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '40px', height: '20px' }}>
                <input 
                  type="checkbox" 
                  checked={!!profile?.stats?.optInLeaderboard} 
                  onChange={toggleLeaderboard}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: profile?.stats?.optInLeaderboard ? '#10b981' : '#ccc', transition: '.4s', borderRadius: '20px' }}></span>
                <span style={{ position: 'absolute', content: '""', height: '16px', width: '16px', left: '2px', bottom: '2px', backgroundColor: 'white', transition: '.4s', borderRadius: '50%', transform: profile?.stats?.optInLeaderboard ? 'translateX(20px)' : 'translateX(0)' }}></span>
              </label>
            </div>
          </div>
          
          {!profile?.stats?.optInLeaderboard ? (
            <div style={{ textAlign: 'center', padding: '2rem', background: '#f8fafc', borderRadius: '8px', color: '#64748b' }}>
              <p>🔒 <strong>Privacy First:</strong> You are currently hidden from the leaderboard.</p>
              <p style={{ fontSize: '0.9rem' }}>Opt-in above to share your wellness progress and inspire your team.</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '2px solid #f1f5f9' }}>
                  <th style={{ padding: '1rem' }}>Rank</th>
                  <th style={{ padding: '1rem' }}>User</th>
                  <th style={{ padding: '1rem' }}>Level</th>
                  <th style={{ padding: '1rem', textAlign: 'right' }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((leader, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #f1f5f9', background: index === 0 ? '#fffbeb' : 'transparent' }}>
                    <td style={{ padding: '1rem', fontWeight: 'bold', color: index < 3 ? '#d97706' : '#64748b' }}>#{index + 1}</td>
                    <td style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                      <div style={{ width: '32px', height: '32px', background: '#e2e8f0', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#475569' }}>{leader.avatar}</div>
                      {leader.name}
                      {index === 0 && <span>👑</span>}
                    </td>
                    <td style={{ padding: '1rem' }}><span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 'bold' }}>Lvl {leader.level}</span></td>
                    <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: '#334155' }}>{(leader.score || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Active Challenges Section */}
        <div className="card" style={{ marginTop: '2rem' }}>
          <h3 style={{ marginTop: 0 }}>🚀 Active Challenges</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginTop: '1rem' }}>
            {challenges.map(c => (
              <div key={c.id} className="hover-lift" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.5rem', background: c.completed ? '#f0fdf4' : 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <h4 style={{ margin: 0, color: '#334155' }}>{c.title}</h4>
                  <span style={{ fontSize: '0.8rem', background: '#fef3c7', color: '#d97706', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>+{c.scoreReward} Score</span>
                </div>
                <p style={{ fontSize: '0.9rem', color: '#64748b', margin: '0.5rem 0 1rem' }}>{c.description}</p>
                
                {c.joined ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px', color: '#475569' }}>
                      <span>Progress</span>
                      <span>{c.progress} / {c.target}</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, (c.progress / c.target) * 100)}%`, height: '100%', background: c.completed ? '#10b981' : '#3b82f6', transition: 'width 0.5s' }}></div>
                    </div>
                    {c.completed && <div style={{ marginTop: '0.5rem', color: '#166534', fontSize: '0.85rem', fontWeight: 'bold' }}>Completed! 🎉</div>}
                  </div>
                ) : (
                  <button onClick={() => handleJoinChallenge(c.id)} className="quiz-button" style={{ width: '100%', padding: '0.5rem', fontSize: '0.9rem' }}>Join Challenge</button>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </>
  );
}
