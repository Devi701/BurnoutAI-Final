import sys
import json
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import base64
from io import BytesIO
from datetime import datetime, timedelta
import dateutil.parser
import warnings

def encode_plot_to_base64():
    """Helper to save current matplotlib plot to base64 string."""
    buf = BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight')
    buf.seek(0)
    img_str = base64.b64encode(buf.read()).decode('utf-8')
    plt.close()
    return img_str

def set_plot_style():
    sns.set_theme(style="whitegrid")
    plt.rcParams.update({'figure.max_open_warning': 0})

def generate_graphs(df):
    graphs = {}
    sns.set(style="whitegrid")

    # 1. Stress vs. Meeting Load (Dual Axis Line Chart)
    if 'stress' in df.columns and 'meeting_hours' in df.columns:
        fig, ax1 = plt.subplots(figsize=(10, 6))
        
        color_stress = 'tab:red'
        ax1.set_xlabel('Date')
        ax1.set_ylabel('Avg Stress (0-10)', color=color_stress)
        ax1.plot(df.index, df['stress'], color=color_stress, marker='o', linewidth=2, label='Stress')
        ax1.tick_params(axis='y', labelcolor=color_stress)
        ax1.grid(False)

        ax2 = ax1.twinx()
        color_meet = 'tab:blue'
        ax2.set_ylabel('Meeting Hours', color=color_meet)
        ax2.bar(df.index, df['meeting_hours'], color=color_meet, alpha=0.3, label='Meetings')
        ax2.tick_params(axis='y', labelcolor=color_meet)
        ax2.grid(False)

        plt.title('Impact of Meeting Load on Daily Stress')
        graphs['stress_vs_meetings'] = encode_plot_to_base64()

    # 2. Correlation Heatmap
    if not df.empty:
        plt.figure(figsize=(8, 6))
        corr_matrix = df.corr()
        sns.heatmap(corr_matrix, annot=True, cmap='coolwarm', vmin=-1, vmax=1)
        plt.title('Correlation Matrix: Wellness vs Workload')
        graphs['correlation_heatmap'] = encode_plot_to_base64()

    # 3. Workload vs Energy (Scatter Plot)
    if 'energy' in df.columns and 'meeting_hours' in df.columns:
        plt.figure(figsize=(8, 6))
        sns.regplot(x='meeting_hours', y='energy', data=df, scatter_kws={'alpha':0.5}, line_kws={'color':'green'})
        plt.title('Impact of Workload on Energy Levels')
        plt.xlabel('Meeting Hours')
        plt.ylabel('Energy Level')
        graphs['workload_vs_energy'] = encode_plot_to_base64()

    return graphs

def generate_focus_context_graphs(events_df, daily_focus_df):
    graphs = {}
    set_plot_style()

    # 1. Context Switching Heatmap (Hour of Day vs Day of Week)
    if not events_df.empty:
        # Extract hour and day name
        events_df['hour'] = events_df.index.hour
        events_df['day_name'] = events_df.index.day_name()
        
        # Order of days
        days_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        
        # Pivot table: Count events per hour/day
        heatmap_data = events_df.pivot_table(index='hour', columns='day_name', values='type', aggfunc='count', fill_value=0)
        
        # Reindex to ensure all days/hours exist
        heatmap_data = heatmap_data.reindex(columns=days_order, fill_value=0)
        heatmap_data = heatmap_data.reindex(index=range(24), fill_value=0)

        plt.figure(figsize=(10, 8))
        sns.heatmap(heatmap_data, cmap="YlOrRd", annot=True, fmt='g', linewidths=.5)
        plt.title('Context Switching Heatmap (Activity Intensity)')
        plt.ylabel('Hour of Day')
        plt.xlabel('Day of Week')
        graphs['context_switching_heatmap'] = encode_plot_to_base64()

        # 2. Popular Time for Context Switching (Bar Chart)
        plt.figure(figsize=(10, 5))
        hourly_counts = events_df.groupby('hour').size()
        sns.barplot(x=hourly_counts.index, y=hourly_counts.values, palette="viridis")
        plt.title('Popular Times for Context Switching')
        plt.xlabel('Hour of Day')
        plt.ylabel('Number of Switches/Interruptions')
        plt.xticks(range(0, 24))
        graphs['popular_switch_times'] = encode_plot_to_base64()

    # 3. Focus Time Lost (Stacked Bar Chart)
    if not daily_focus_df.empty:
        plt.figure(figsize=(10, 6))
        
        # Normalize for plotting
        plot_df = daily_focus_df[['meeting_hours', 'fragmented_hours', 'focus_hours']].copy()
        plot_df.index = plot_df.index.astype(str) # Date to string for x-axis
        
        plot_df.plot(kind='bar', stacked=True, color=['#ff9999', '#ffcc99', '#99ff99'], figsize=(10, 6))
        
        plt.title('Daily Time Breakdown: Meetings vs. Lost Time vs. Focus')
        plt.xlabel('Date')
        plt.ylabel('Hours')
        plt.legend(['Meetings', 'Fragmented (Lost)', 'Deep Focus'])
        plt.xticks(rotation=45)
        graphs['focus_time_breakdown'] = encode_plot_to_base64()

    return graphs

def generate_wellness_graphs(checkin_df):
    graphs = {}
    set_plot_style()

    if not checkin_df.empty and 'createdAt' in checkin_df.columns:
        # Ensure createdAt is datetime
        if not pd.api.types.is_datetime64_any_dtype(checkin_df['createdAt']):
             checkin_df['createdAt'] = pd.to_datetime(checkin_df['createdAt'])

        # 1. Energy Levels Throughout the Day (Boxplot)
        # Helps identify if users are crashing in the afternoon
        checkin_df['hour'] = checkin_df['createdAt'].dt.hour
        
        plt.figure(figsize=(10, 6))
        sns.boxplot(x='hour', y='energy', data=checkin_df, palette="Blues")
        plt.title('Energy Levels by Time of Day')
        plt.xlabel('Hour of Day')
        plt.ylabel('Energy Level')
        graphs['energy_by_hour'] = encode_plot_to_base64()

        # 2. Weekly Recovery Pattern (Bar Chart)
        # Shows how stress/energy fluctuates during the week (e.g., Monday blues vs Friday recovery)
        checkin_df['day_name'] = checkin_df['createdAt'].dt.day_name()
        days_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        
        weekly_stats = checkin_df.groupby('day_name')[['stress', 'energy', 'sleepQuality']].mean()
        weekly_stats = weekly_stats.reindex(days_order)
        
        fig, ax = plt.subplots(figsize=(10, 6))
        weekly_stats.plot(kind='bar', ax=ax, color=['#ff9999', '#66b3ff', '#99ff99'])
        plt.title('Weekly Wellness & Recovery Pattern')
        plt.ylabel('Average Score')
        plt.xlabel('Day of Week')
        plt.xticks(rotation=45)
        plt.legend(['Stress', 'Energy', 'Sleep Quality'])
        graphs['weekly_wellness_pattern'] = encode_plot_to_base64()

    return graphs

def generate_project_management_graphs(jira_df, trello_df):
    graphs = {}
    set_plot_style()

    # 1. Task Completion Rate (Story Points / Count over time)
    completed_daily = pd.Series(dtype=float)
    
    if not jira_df.empty and 'resolutionDate' in jira_df.columns:
        completed_jira = jira_df[jira_df['resolutionDate'].notna()].copy()
        completed_jira['date'] = completed_jira['resolutionDate'].dt.date
        if 'storyPoints' in completed_jira.columns:
            completed_jira['effort'] = completed_jira['storyPoints'].fillna(1)
        else:
            completed_jira['effort'] = 1
        
        jira_daily = completed_jira.groupby('date')['effort'].sum()
        completed_daily = completed_daily.add(jira_daily, fill_value=0)

    if not trello_df.empty and 'closed' in trello_df.columns:
        completed_trello = trello_df[trello_df['closed'] == True].copy()
        if 'dateLastActivity' in completed_trello.columns:
            completed_trello['date'] = completed_trello['dateLastActivity'].dt.date
            trello_daily = completed_trello.groupby('date').size()
            completed_daily = completed_daily.add(trello_daily, fill_value=0)
            
    if not completed_daily.empty:
        plt.figure(figsize=(10, 6))
        completed_daily.sort_index().plot(kind='bar', color='#4caf50')
        plt.title('Task Completion Rate (Effort/Count)')
        plt.xlabel('Date')
        plt.ylabel('Completed Points/Tasks')
        plt.xticks(rotation=45)
        graphs['task_completion_rate'] = encode_plot_to_base64()

    # 2. Cycle Time Distribution (Jira)
    if not jira_df.empty and 'createdDate' in jira_df.columns and 'resolutionDate' in jira_df.columns:
        completed_jira = jira_df[jira_df['resolutionDate'].notna()].copy()
        completed_jira['cycle_time'] = (completed_jira['resolutionDate'] - completed_jira['createdDate']).dt.days
        completed_jira = completed_jira[completed_jira['cycle_time'] >= 0]
        
        if not completed_jira.empty:
            plt.figure(figsize=(8, 6))
            sns.histplot(completed_jira['cycle_time'], kde=True, color='purple')
            plt.title('Cycle Time Distribution (Days)')
            plt.xlabel('Days to Complete')
            graphs['cycle_time_dist'] = encode_plot_to_base64()

    # 3. Work In Progress (WIP) & Backlog Growth
    all_dates = []
    if not jira_df.empty and 'createdDate' in jira_df.columns:
        all_dates.extend(jira_df['createdDate'].dropna().dt.date.tolist())
        if 'resolutionDate' in jira_df.columns:
            all_dates.extend(jira_df['resolutionDate'].dropna().dt.date.tolist())
    
    if all_dates:
        min_date = min(all_dates)
        max_date = max(all_dates)
        if (max_date - min_date).days > 90: # Limit range
            min_date = max_date - timedelta(days=90)
            
        date_range = pd.date_range(start=min_date, end=max_date)
        
        # WIP
        wip_data = []
        for d in date_range:
            day = d.date()
            active_count = 0
            if not jira_df.empty and 'createdDate' in jira_df.columns:
                mask = (jira_df['createdDate'].dt.date <= day) & \
                       ((jira_df['resolutionDate'].isna()) | (jira_df['resolutionDate'].dt.date > day))
                active_count = mask.sum()
            wip_data.append({'date': day, 'active_tickets': active_count})
            
        wip_df = pd.DataFrame(wip_data).set_index('date')
        
        plt.figure(figsize=(10, 6))
        plt.plot(wip_df.index, wip_df['active_tickets'], marker='o', color='#ff9800')
        plt.title('Work In Progress (Active Tickets)')
        plt.xlabel('Date')
        plt.ylabel('Count')
        plt.grid(True)
        graphs['wip_over_time'] = encode_plot_to_base64()

        # Backlog Growth
        if not jira_df.empty and 'createdDate' in jira_df.columns:
            created_counts = jira_df.groupby(jira_df['createdDate'].dt.date).size()
            resolved_counts = jira_df.groupby(jira_df['resolutionDate'].dt.date).size()
            timeline = pd.DataFrame({'created': created_counts, 'resolved': resolved_counts}).fillna(0)
            timeline = timeline.reindex(date_range.date, fill_value=0)
            timeline['cum_created'] = timeline['created'].cumsum()
            timeline['cum_resolved'] = timeline['resolved'].cumsum()
            
            plt.figure(figsize=(10, 6))
            plt.fill_between(timeline.index.astype(str), timeline['cum_created'], timeline['cum_resolved'], color='lightgray', alpha=0.5, label='Backlog')
            plt.plot(timeline.index.astype(str), timeline['cum_created'], label='Total Created', color='blue')
            plt.plot(timeline.index.astype(str), timeline['cum_resolved'], label='Total Resolved', color='green')
            plt.title('Backlog Growth')
            plt.xticks(rotation=45)
            plt.legend()
            graphs['backlog_growth'] = encode_plot_to_base64()

    return graphs

def calculate_focus_metrics(calendar_events):
    """
    Calculates Focus Time, Meeting Time, and Fragmented Time (Lost Time).
    Fragmented Time = Gaps between meetings that are < 30 minutes.
    """
    if not calendar_events:
        return pd.DataFrame()

    # Convert to DataFrame
    df = pd.DataFrame(calendar_events)
    df['start'] = df['startTime'].apply(dateutil.parser.parse)
    df['end'] = df['endTime'].apply(dateutil.parser.parse)
    df['date'] = df['start'].dt.date
    
    results = []

    for date, group in df.groupby('date'):
        # Sort by start time
        group = group.sort_values('start')
        
        # Merge overlapping meetings
        merged = []
        for _, row in group.iterrows():
            if not merged:
                merged.append((row['start'], row['end']))
            else:
                last_start, last_end = merged[-1]
                if row['start'] <= last_end:
                    # Overlap, extend end time
                    merged[-1] = (last_start, max(last_end, row['end']))
                else:
                    merged.append((row['start'], row['end']))
        
        meeting_hours = sum([(end - start).total_seconds() / 3600 for start, end in merged])
        
        # Calculate gaps (Fragmented Time)
        fragmented_hours = 0
        # Assume work day 9am-5pm (8h) for context, or bounded by first/last meeting
        # Here we only count gaps *between* meetings as fragmented.
        for i in range(len(merged) - 1):
            gap = (merged[i+1][0] - merged[i][1]).total_seconds() / 60 # minutes
            if 0 < gap < 30: # Less than 30 mins is considered lost/fragmented
                fragmented_hours += gap / 60
        
        # Focus Time = (Work Day 8h) - Meeting Hours - Fragmented Hours
        # We clamp at 0 in case meetings exceed 8h
        focus_hours = max(0, 8.0 - meeting_hours - fragmented_hours)
        
        results.append({
            'date': date,
            'meeting_hours': meeting_hours,
            'fragmented_hours': fragmented_hours,
            'focus_hours': focus_hours
        })
        
    return pd.DataFrame(results).set_index('date')

def analyze(data):
    # --- 1. Process Event Stream (For Context Switching) ---
    events = []
    
    # Calendar Events (Start and End are context switches)
    for e in data.get('calendar', []):
        events.append({'time': dateutil.parser.parse(e['startTime']), 'type': 'meeting_start'})
        events.append({'time': dateutil.parser.parse(e['endTime']), 'type': 'meeting_end'})
    
    # Prepare Jira DataFrame
    jira_data = data.get('jira', [])
    jira_df = pd.DataFrame(jira_data)
    if not jira_df.empty:
        if 'createdDate' in jira_df.columns: jira_df['createdDate'] = pd.to_datetime(jira_df['createdDate'])
        if 'updatedAt' in jira_df.columns: jira_df['updatedAt'] = pd.to_datetime(jira_df['updatedAt'])
        if 'resolutionDate' in jira_df.columns: jira_df['resolutionDate'] = pd.to_datetime(jira_df['resolutionDate'])

    # Jira Activity (Updates are context switches)
    if not jira_df.empty:
        for _, row in jira_df.iterrows():
            ts = row.get('updatedAt') if pd.notnull(row.get('updatedAt')) else row.get('createdDate')
            if pd.notnull(ts):
                events.append({'time': ts, 'type': 'jira_update'})

    # Prepare Trello DataFrame
    trello_data = data.get('trello', [])
    trello_df = pd.DataFrame(trello_data)
    if not trello_df.empty:
        if 'dateLastActivity' in trello_df.columns: trello_df['dateLastActivity'] = pd.to_datetime(trello_df['dateLastActivity'])
        if 'due' in trello_df.columns: trello_df['due'] = pd.to_datetime(trello_df['due'])

    # Trello Activity
    if not trello_df.empty:
        for _, row in trello_df.iterrows():
            if pd.notnull(row.get('dateLastActivity')):
                events.append({'time': row['dateLastActivity'], 'type': 'trello_update'})

    events_df = pd.DataFrame(events)
    if not events_df.empty:
        events_df['time'] = pd.to_datetime(events_df['time'])
        events_df.set_index('time', inplace=True)
        events_df.sort_index(inplace=True)

    # --- 2. Process Focus Time Metrics ---
    daily_focus_df = calculate_focus_metrics(data.get('calendar', []))

    # --- 3. Process Calendar Data (Legacy for correlation) ---
    calendar_events = data.get('calendar', [])
    cal_df = pd.DataFrame(calendar_events)
    daily_meetings = pd.Series(dtype=float)
    
    if not cal_df.empty:
        # Parse dates
        cal_df['startTime'] = cal_df['startTime'].apply(dateutil.parser.parse)
        cal_df['endTime'] = cal_df['endTime'].apply(dateutil.parser.parse)
        
        # Calculate duration in hours
        cal_df['duration_hours'] = (cal_df['endTime'] - cal_df['startTime']).dt.total_seconds() / 3600
        
        # Group by Date
        cal_df['date'] = cal_df['startTime'].dt.date
        daily_meetings = cal_df.groupby('date')['duration_hours'].sum()

    # --- 4. Process Check-in Data ---
    checkins = data.get('checkins', [])
    checkin_df = pd.DataFrame(checkins)
    daily_wellness = pd.DataFrame()

    if not checkin_df.empty:
        checkin_df['createdAt'] = checkin_df['createdAt'].apply(dateutil.parser.parse)
        checkin_df['date'] = checkin_df['createdAt'].dt.date
        
        # Aggregate daily averages
        daily_wellness = checkin_df.groupby('date')[['stress', 'energy', 'sleepQuality']].mean()

    # --- 5. Merge Dataframes for Correlation ---
    # Combine all metrics into a single daily dataframe
    df = pd.DataFrame({'meeting_hours': daily_meetings})
    df = df.join(daily_wellness, how='outer').fillna(0)
    df.sort_index(inplace=True)

    # --- 6. Generate Insights & Graphs ---
    graphs = generate_graphs(df)
    focus_graphs = generate_focus_context_graphs(events_df, daily_focus_df)
    graphs.update(focus_graphs)
    
    # NEW: Wellness & Recovery Graphs
    wellness_graphs = generate_wellness_graphs(checkin_df)
    graphs.update(wellness_graphs)
    
    # NEW: Project Management Graphs (Jira/Trello)
    pm_graphs = generate_project_management_graphs(jira_df, trello_df)
    graphs.update(pm_graphs)

    # Calculate Summary Stats
    stats = {
        'avg_stress': df['stress'].mean() if 'stress' in df else 0,
        'avg_energy': df['energy'].mean() if 'energy' in df else 0,
        'data_points': len(df)
    }
    
    if not daily_focus_df.empty:
        stats['avg_focus_hours'] = daily_focus_df['focus_hours'].mean()
        stats['avg_fragmented_hours'] = daily_focus_df['fragmented_hours'].mean()

    # Calculate Correlation (if enough data)
    if len(df) > 2 and 'stress' in df:
        stats['meeting_stress_correlation'] = df['meeting_hours'].corr(df['stress'])
    else:
        stats['meeting_stress_correlation'] = 0

    return {
        'stats': stats,
        'graphs': graphs,
        'daily_data': json.loads(df.reset_index().to_json(orient='records', date_format='iso'))
    }

if __name__ == "__main__":
    try:
        input_data = sys.stdin.read()
        if not input_data:
            print(json.dumps({"error": "No input data provided"}))
            sys.exit(1)
            
        data = json.loads(input_data)
        result = analyze(data)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
