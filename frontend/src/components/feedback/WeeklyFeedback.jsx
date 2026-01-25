import React from 'react';
import PropTypes from 'prop-types';

export default function WeeklyFeedback({ summary }) {
  return (
    <div>
      <h4>Weekly summary</h4>
      <div className="small">{summary || 'No weekly summary available.'}</div>
    </div>
  );
}

WeeklyFeedback.propTypes = {
  summary: PropTypes.string
};