import React from 'react';

export default function WeeklyFeedback({ summary }) {
  return (
    <div>
      <h4>Weekly summary</h4>
      <div className="small">{summary || 'No weekly summary available.'}</div>
    </div>
  );
}