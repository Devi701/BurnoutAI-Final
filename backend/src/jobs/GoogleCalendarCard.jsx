import React from 'react';

const GoogleCalendarCard = ({ isConnected }) => {
  const handleConnect = () => {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Please log in first.');
      return;
    }
    
    // Use the environment variable for the API URL, fallback to localhost
    // This hits the backend route we created: /api/integrations/google/auth
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
    window.location.href = `${apiUrl}/api/integrations/google/auth?token=${token}`;
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-lg flex items-center justify-center">
            {/* Google Calendar Icon */}
            <svg className="w-8 h-8 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Google Calendar</h3>
            <p className="text-sm text-gray-500">Sync meetings to analyze workload & focus time</p>
          </div>
        </div>
        <button
          onClick={handleConnect}
          disabled={isConnected}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            isConnected
              ? 'bg-green-100 text-green-700 cursor-default border border-green-200'
              : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
          }`}
        >
          {isConnected ? 'Connected' : 'Connect'}
        </button>
      </div>
    </div>
  );
};

export default GoogleCalendarCard;