import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';

const SettingsPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // Gracefully handle missing context for preview/test environments
  let user = { name: '', email: '', companyCode: '' };
  try {
    const ctx = useUser();
    if (ctx && ctx.user) user = ctx.user;
  } catch (e) {
    // Context not found or not wrapped
  }

  const [integrations, setIntegrations] = useState({
    slack: false,
    trello: false,
    jira: false,
    asana: false,
    google: false
  });

  const [formData, setFormData] = useState({
    name: user.name || '',
    email: user.email || '',
    companyCode: user.companyCode || ''
  });

  useEffect(() => {
    setFormData({
      name: user.name || '',
      email: user.email || '',
      companyCode: user.companyCode || ''
    });
  }, [user]);

  useEffect(() => {
    const successService = searchParams.get('integration_success');
    if (successService && Object.keys(integrations).includes(successService)) {
      setIntegrations(prev => ({ ...prev, [successService]: true }));
      // Clean URL
      navigate('/settings', { replace: true });
    }
  }, [searchParams, navigate]);

  const handleConnect = (service) => {
    // Use the backend route to initiate OAuth
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

  const handleDisconnect = (service) => {
    if (window.confirm(`Disconnect ${service}?`)) {
      setIntegrations(prev => ({ ...prev, [service]: false }));
    }
  };

  const handleLogout = () => {
    // In a real app, call logout api
    navigate('/login');
  };

  const handleDeleteAccount = () => {
    const confirm = window.prompt('Type "DELETE" to confirm account deletion.');
    if (confirm === 'DELETE') {
      navigate('/register');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-10">
        
        {/* Header */}
        <div className="relative text-center">
          <div className="mx-auto">
            <h1 className="text-6xl font-extrabold text-gray-900 tracking-tight">Settings</h1>
            <p className="text-2xl text-gray-500 mt-4">Manage your workspace and preferences</p>
          </div>
          <button 
            onClick={handleLogout}
            className="absolute right-0 top-1/2 -translate-y-1/2 text-xl text-gray-600 hover:text-gray-900 font-medium hidden sm:block"
          >
            Sign Out
          </button>
        </div>

        {/* Profile Card */}
        <div className="bg-white shadow-lg rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-8 py-8 border-b border-gray-100 bg-gray-50 text-center">
            <h2 className="text-3xl font-bold text-gray-900">Profile Details</h2>
            <p className="text-sm font-mono text-gray-400 mt-2">ID: {user.id || '---'}</p>
          </div>
          <div className="p-10 grid grid-cols-1 gap-y-8 gap-x-8 sm:grid-cols-6">
            <div className="sm:col-span-3">
              <label className="block text-xl font-medium text-gray-700 mb-2">Full Name</label>
              <input 
                type="text" 
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="block w-full rounded-xl border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-xl p-4 border"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xl font-medium text-gray-700 mb-2">Email</label>
              <input 
                type="email" 
                value={formData.email}
                disabled
                className="block w-full rounded-xl border-gray-300 bg-gray-100 shadow-sm text-xl p-4 border cursor-not-allowed"
              />
            </div>
            <div className="sm:col-span-6">
              <label className="block text-xl font-medium text-gray-700 mb-2">Company Code</label>
              <div className="flex rounded-md shadow-sm">
                <input 
                  type="text" 
                  value={formData.companyCode}
                  readOnly
                  className="block w-full flex-1 rounded-xl border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 text-xl p-4 border bg-gray-50"
                />
              </div>
            </div>
          </div>
          <div className="px-10 py-6 bg-gray-50 text-right">
            <button className="inline-flex justify-center rounded-xl border border-transparent bg-indigo-600 py-4 px-8 text-lg font-bold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
              Save Changes
            </button>
          </div>
        </div>

        {/* Integrations Card */}
        <div className="bg-white shadow-lg rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-8 py-8 border-b border-gray-100 bg-gray-50 text-center">
            <h2 className="text-3xl font-bold text-gray-900">Connected Apps</h2>
            <p className="text-xl text-gray-500 mt-2">Sync your activity to automate burnout tracking.</p>
          </div>
          <div className="divide-y divide-gray-100">
            {Object.keys(integrations).map((service) => (
              <div key={service} className="px-10 py-8 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center space-x-8">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-3xl shadow-sm
                    ${service === 'slack' ? 'bg-[#4A154B]' : 
                      service === 'trello' ? 'bg-[#0079BF]' : 
                      service === 'jira' ? 'bg-[#0052CC]' : 
                      service === 'google' ? 'bg-[#4285F4]' : 'bg-[#F06A6A]'}`}>
                    {service.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 capitalize">{service}</h3>
                    <p className="text-lg text-gray-500">
                      {integrations[service] ? 'Syncing active' : 'Not connected'}
                    </p>
                  </div>
                </div>

                {integrations[service] ? (
                  <div className="flex items-center space-x-4">
                    <span className="inline-flex items-center rounded-full bg-green-100 px-4 py-1.5 text-base font-medium text-green-800">
                      Connected
                    </span>
                    <button 
                      onClick={() => handleDisconnect(service)}
                      className="text-base text-red-600 hover:text-red-800 font-medium"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleConnect(service)}
                    className="inline-flex items-center rounded-xl border border-gray-300 bg-white px-6 py-3 text-lg font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  >
                    Connect
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-white shadow-lg rounded-2xl border border-red-100 overflow-hidden">
          <div className="px-8 py-8 border-b border-red-100 bg-red-50 text-center">
            <h2 className="text-3xl font-bold text-red-800">Danger Zone</h2>
          </div>
          <div className="p-10">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">Delete Account</h3>
                <p className="text-lg text-gray-500 mt-2">Permanently remove your data and access.</p>
              </div>
              <button 
                onClick={handleDeleteAccount}
                className="inline-flex justify-center rounded-xl border border-transparent bg-red-600 py-4 px-8 text-lg font-bold text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;