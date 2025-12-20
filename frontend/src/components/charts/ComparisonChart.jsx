import React from 'react';

export default function ComparisonChart({ a=0, b=0 }) {
  const max = Math.max(a,b,1);
  return (
    <div>
      <div style={{display:'flex',gap:8,alignItems:'flex-end', height:80}}>
        <div style={{width:60, background:'#e6eefc', height:`${(a/max)*100}%`, display:'flex', alignItems:'end', justifyContent:'center'}}>{a.toFixed(1)}</div>
        <div style={{width:60, background:'#fdece6', height:`${(b/max)*100}%`, display:'flex', alignItems:'end', justifyContent:'center'}}>{b.toFixed(1)}</div>
      </div>
      <div className="small">You vs Cohort</div>
    </div>
  );
}