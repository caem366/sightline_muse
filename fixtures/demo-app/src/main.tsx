import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const route = window.location.pathname;
const title = route === '/settings' ? 'Settings' : route === '/reports' ? 'Reports' : 'Dashboard';

function App() {
  const [saved, setSaved] = React.useState(false);
  return <div className="shell">
    <aside className="sidebar"><div className="brand">NORTHSTAR <span>●</span></div><p className="sidebar-label">WORKSPACE</p><nav>
      <a href="/" aria-current={route === '/' ? 'page' : undefined}>▦ <span>Dashboard</span></a>
      <a href="/reports" aria-current={route === '/reports' ? 'page' : undefined}>◫ <span>Reports</span></a>
      <a href="/settings" aria-current={route === '/settings' ? 'page' : undefined}>⚙ <span>Settings</span></a>
    </nav><div className="sidebar-footer">Acme Studio<br/><small>Pro workspace</small></div></aside>
    <main><header><span>Workspace / {title}</span><div className="avatar">CM</div></header>
      <div className="content"><p className="eyebrow">OVERVIEW / OCTOBER 2026</p><h1>{title}</h1>
      {route === '/settings' ? <>
        <p className="subhead">Manage your workspace preferences and account.</p>
        <section className="panel settings-panel"><div><h2>Workspace profile</h2><p>Keep the details your team sees up to date.</p></div>
          <div className="settings-fields" data-sightline="settings-form"><label>Workspace name<input defaultValue="Acme Studio"/></label><label>Contact email<input defaultValue="team@acme.studio"/></label></div>
          <button onClick={() => setSaved(true)}>{saved ? 'Saved' : 'Save changes'}</button>
        </section>
      </> : route === '/reports' ? <>
        <p className="subhead">Performance across every active project.</p>
        <section className="panel"><h2>Monthly performance</h2><div className="report-bars" data-sightline="report-bars">{[38, 64, 52, 83, 67, 96, 78].map((n,i) => <div key={i} style={{height:`${n}%`}}/>)}</div></section>
      </> : <>
        <p className="subhead">A clear view of the work moving forward.</p>
        <div className="dashboard-grid" data-sightline="dashboard-grid">
          <section className="metric"><span>Total revenue</span><strong>$48,290</strong><small>↗ 12.8% from last month</small></section>
          <section className="metric"><span>Active projects</span><strong>24</strong><small>↗ 4 new this month</small></section>
          <section className="metric"><span>Team members</span><strong>18</strong><small>Across 3 departments</small></section>
        </div>
        <section className="panel activity" data-sightline="activity"><div className="section-heading"><h2>Recent activity</h2><button onClick={() => setSaved(!saved)}>{saved ? 'Showing all' : 'View all'}</button></div>
          {['Website redesign', 'Q4 campaign', 'Product launch'].map((x,i)=><div className="activity-row" key={x}><span className="activity-icon">{['◈','✳','◆'][i]}</span><div><b>{x}</b><small>Updated {i+1} days ago</small></div><span className="status">In progress</span></div>)}
        </section>
      </>}
      </div>
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App/>);
