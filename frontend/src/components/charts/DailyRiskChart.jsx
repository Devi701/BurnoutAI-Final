import React from 'react';

export default function DailyRiskChart({ value=0 }) {
  return (
    <div>
      <div style={{height:12, background:'#e6edf3', borderRadius:8, overflow:'hidden'}}>
        <div style={{width:`${Math.min(100, value)}%`, height:'100%', background:'#fb7185'}}/>
      </div>
      <div className="small">Daily risk: {Number(value).toFixed(1)}</div>
    </div>
  );
}