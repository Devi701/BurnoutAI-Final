import React from 'react';
import PropTypes from 'prop-types';

export default function WeeklyRiskChart({ values = [] }) {
  return (
    <div>
      <div style={{display:'flex', gap:6}}>
        {values.slice(-7).map((v,i)=>(<div key={`val-${i}`} style={{width:12, height:Math.max(8,v*6), background:'#60a5fa', borderRadius:3}} />))}
      </div>
      <div className="small">Last 7 days</div>
    </div>
  );
}

WeeklyRiskChart.propTypes = {
  values: PropTypes.arrayOf(PropTypes.number)
};