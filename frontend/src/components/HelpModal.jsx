import { useState } from 'react'

const TABS = ['Overview', 'Folders', 'Promote', 'Scheduling']

const s = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#161b27',
    border: '1px solid #1e293b',
    borderRadius: 12,
    width: '680px',
    maxWidth: '95vw',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid #1e293b',
    flexShrink: 0,
  },
  headerTitle: {
    display: 'flex', alignItems: 'center', gap: 10,
    fontSize: 16, fontWeight: 700, color: '#f1f5f9',
  },
  closeBtn: {
    background: 'transparent', border: 'none',
    color: '#64748b', fontSize: 16, cursor: 'pointer',
    padding: '2px 6px', borderRadius: 4,
  },
  tabBar: {
    display: 'flex', gap: 0,
    borderBottom: '1px solid #1e293b',
    padding: '0 20px',
    flexShrink: 0,
  },
  tab: {
    background: 'none', border: 'none',
    padding: '10px 14px',
    color: '#64748b', fontSize: 13, fontWeight: 500,
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
  },
  tabActive: { color: '#e2e8f0', borderBottomColor: '#2563eb' },
  body: {
    flex: 1, overflowY: 'auto',
    padding: '20px 24px',
    color: '#94a3b8', fontSize: 13, lineHeight: 1.7,
  },
  intro: { color: '#cbd5e1', marginBottom: 20, lineHeight: 1.7 },
  section: { marginTop: 20 },
  sectionTitle: {
    fontSize: 11, fontWeight: 700, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '0.08em',
    marginBottom: 10,
  },
  ul: { paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 },
  ol: { paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 },
  strong: { color: '#e2e8f0' },
  code: {
    fontFamily: 'monospace', fontSize: 12,
    background: '#0f1117', border: '1px solid #1e293b',
    borderRadius: 4, padding: '1px 5px', color: '#93c5fd',
  },
  infoBox: {
    marginTop: 20,
    background: '#0d2137', border: '1px solid #1d4ed844',
    borderRadius: 7, padding: '10px 14px',
    fontSize: 12, color: '#93c5fd', lineHeight: 1.6,
  },
  flowRow: { display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' },
  flowCard: {
    flex: 1, minWidth: 120,
    background: '#0f1117', border: '1px solid #1e293b',
    borderRadius: 8, padding: '12px 14px',
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  flowIcon: { fontSize: 20 },
  flowLabel: { fontSize: 13, fontWeight: 600, color: '#e2e8f0' },
  flowDesc: { fontSize: 11, color: '#64748b', lineHeight: 1.5 },
  pipeline: { display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 },
  pipelineRow: { display: 'flex', alignItems: 'center' },
  arrow: { color: '#334155', fontSize: 16, margin: '0 6px' },
  envBadge: {
    borderRadius: 6, padding: '4px 14px',
    fontSize: 12, fontWeight: 700, border: '1px solid',
  },
  envDev:  { background: '#0d2137', borderColor: '#1d4ed8', color: '#93c5fd' },
  envQa:   { background: '#1a1a0d', borderColor: '#a16207', color: '#fde68a' },
  envProd: { background: '#0d2116', borderColor: '#15803d', color: '#86efac' },
  folderCard: {
    background: '#0f1117', border: '1px solid #1e293b',
    borderRadius: 8, padding: '12px 16px',
    marginBottom: 10,
  },
  folderHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 },
  folderIcon: { fontSize: 16 },
  folderName: { fontSize: 13, fontWeight: 700, fontFamily: 'monospace' },
  schedBadge: {
    fontSize: 10, fontWeight: 600,
    background: '#0f0f1a', border: '1px solid #6366f1',
    color: '#a5b4fc', borderRadius: 10, padding: '1px 7px',
  },
  folderDesc: { color: '#94a3b8', fontSize: 12, margin: '0 0 6px 0', lineHeight: 1.6 },
  folderExample: { fontSize: 11, color: '#475569', fontFamily: 'monospace' },
  steps: { display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 },
  step: { display: 'flex', gap: 14, alignItems: 'flex-start' },
  stepNum: {
    width: 24, height: 24, borderRadius: '50%',
    background: '#1e3a5f', border: '1px solid #2563eb',
    color: '#93c5fd', fontSize: 12, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginTop: 1,
  },
  stepTitle: { fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 2 },
  stepBody: { fontSize: 12, color: '#94a3b8', lineHeight: 1.6 },
  cronTable: {
    display: 'flex', flexDirection: 'column', gap: 6,
    background: '#0f1117', border: '1px solid #1e293b',
    borderRadius: 7, padding: '10px 14px',
  },
  cronRow: { display: 'flex', alignItems: 'center', gap: 16 },
  cronCode: {
    fontFamily: 'monospace', fontSize: 12,
    color: '#a5b4fc', width: 130, flexShrink: 0,
  },
  cronLabel: { fontSize: 12, color: '#94a3b8' },
}

const CONTENT = {
  Overview: (
    <div>
      <p style={s.intro}>
        The SQL Deployment Portal lets your team write, review, and promote SQL files
        through Dev → QA → Prod with a built-in approval gate and optional scheduling.
      </p>
      <div style={s.flowRow}>
        {[
          { icon: '✏️', label: 'Write', desc: 'Create or edit SQL files in the Editor tab' },
          { icon: '📂', label: 'Browse', desc: 'View and manage your team\'s SQL files' },
          { icon: '🔁', label: 'Promote', desc: 'Submit files for peer review and deploy' },
          { icon: '📋', label: 'History', desc: 'See all past deployments and their status' },
        ].map(item => (
          <div key={item.label} style={s.flowCard}>
            <span style={s.flowIcon}>{item.icon}</span>
            <span style={s.flowLabel}>{item.label}</span>
            <span style={s.flowDesc}>{item.desc}</span>
          </div>
        ))}
      </div>
      <div style={s.section}>
        <div style={s.sectionTitle}>Pipeline</div>
        <div style={s.pipeline}>
          {['Dev', 'QA', 'Prod'].map((env, i) => (
            <div key={env} style={s.pipelineRow}>
              {i > 0 && <span style={s.arrow}>→</span>}
              <div style={{ ...s.envBadge, ...(env === 'Dev' ? s.envDev : env === 'QA' ? s.envQa : s.envProd) }}>
                {env}
              </div>
            </div>
          ))}
        </div>
        <ul style={s.ul}>
          <li><strong style={s.strong}>Dev</strong> — where all SQL is written and saved. Every save creates a git commit on the <code style={s.code}>develop</code> branch.</li>
          <li><strong style={s.strong}>QA</strong> — files promoted here go through peer approval (or a GitHub PR merge in GitHub mode).</li>
          <li><strong style={s.strong}>Prod</strong> — requires a second approval before Airflow executes the SQL against production Snowflake.</li>
        </ul>
      </div>
    </div>
  ),

  Folders: (
    <div>
      <p style={s.intro}>
        Your team folder is organised into subfolders. The folder you save into
        determines how the file is treated during promotion and scheduling.
      </p>
      {[
        {
          folder: 'views/',
          icon: '👁',
          color: '#60a5fa',
          desc: 'CREATE OR REPLACE VIEW statements. One-time deployments only — scheduling is not available.',
          example: 'v_daily_revenue.sql, v_active_users.sql',
        },
        {
          folder: 'procedures/',
          icon: '⚙️',
          color: '#a78bfa',
          desc: 'Stored procedures and callable routines. Supports scheduling — run on a cron after deployment.',
          example: 'sp_refresh_daily.sql, sp_clean_staging.sql',
        },
        {
          folder: 'sql_scripts/',
          icon: '📜',
          color: '#34d399',
          desc: 'Ad-hoc or recurring SQL scripts. Supports scheduling.',
          example: 'seed_dev_data.sql, backfill_orders.sql',
        },
        {
          folder: 'schema_table_ddls/',
          icon: '🏗',
          color: '#fbbf24',
          desc: 'CREATE TABLE, ALTER TABLE DDL statements. Organised into bronze / silver / gold sub-tiers.',
          example: 'bronze/stg_events.sql, gold/orders.sql',
        },
        {
          folder: 'alter_ddls/',
          icon: '🔧',
          color: '#f87171',
          desc: 'Schema migration scripts — adding columns, changing types, etc.',
          example: '001_initial_schema.sql, 002_add_user_segments.sql',
        },
      ].map(item => (
        <div key={item.folder} style={s.folderCard}>
          <div style={s.folderHeader}>
            <span style={s.folderIcon}>{item.icon}</span>
            <code style={{ ...s.folderName, color: item.color }}>{item.folder}</code>
            {(item.folder === 'procedures/' || item.folder === 'sql_scripts/') && (
              <span style={s.schedBadge}>⏱ Schedulable</span>
            )}
          </div>
          <p style={s.folderDesc}>{item.desc}</p>
          <div style={s.folderExample}>e.g. {item.example}</div>
        </div>
      ))}
    </div>
  ),

  Promote: (
    <div>
      <p style={s.intro}>
        The Promote tab walks files from Dev through to Prod with a mandatory peer-review step.
      </p>
      <div style={s.steps}>
        {[
          {
            num: '1',
            title: 'Select files',
            body: 'Check one or more files from your team folder. Use All / None buttons to select quickly.',
          },
          {
            num: '2',
            title: 'Choose target environment',
            body: 'QA for a test deployment, Prod for production. You can only go Dev→QA or QA→Prod.',
          },
          {
            num: '3',
            title: 'Add notes (optional)',
            body: 'Describe what this deployment does — shown to the reviewer and in the audit trail.',
          },
          {
            num: '4',
            title: 'Submit',
            body: 'Creates a promotion request. In GitHub mode this opens a real Pull Request on GitHub.',
          },
          {
            num: '5',
            title: 'Teammate approves',
            body: 'Any team member (except the submitter) can click Approve. In GitHub mode, merging the PR approves it automatically.',
          },
          {
            num: '6',
            title: 'Deploy',
            body: 'Once approved, the submitter clicks Deploy. Airflow executes each SQL file against the target Snowflake environment in sequence.',
          },
        ].map(step => (
          <div key={step.num} style={s.step}>
            <div style={s.stepNum}>{step.num}</div>
            <div>
              <div style={s.stepTitle}>{step.title}</div>
              <div style={s.stepBody}>{step.body}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={s.infoBox}>
        <strong style={s.strong}>GitHub mode:</strong> Approvals happen by merging the PR on GitHub.
        The portal polls every 15 seconds and automatically marks the request as approved when the PR is merged.
      </div>
    </div>
  ),

  Scheduling: (
    <div>
      <p style={s.intro}>
        Files in <code style={s.code}>procedures/</code> and <code style={s.code}>sql_scripts/</code> can
        be scheduled to run automatically in Airflow after deployment.
      </p>
      <div style={s.section}>
        <div style={s.sectionTitle}>How to schedule</div>
        <ol style={s.ol}>
          <li>In the Promote tab, select a <code style={s.code}>procedures/</code> or <code style={s.code}>sql_scripts/</code> file.</li>
          <li>Check <strong style={s.strong}>"Run on a schedule"</strong> — this option only appears for schedulable folders.</li>
          <li>Pick <strong style={s.strong}>Hourly, Daily, Weekly</strong> or enter a <strong style={s.strong}>Custom cron</strong> expression.</li>
          <li>Submit, get approved, and deploy as normal.</li>
        </ol>
      </div>
      <div style={s.section}>
        <div style={s.sectionTitle}>What happens on deploy</div>
        <ul style={s.ul}>
          <li>The portal generates a <code style={s.code}>dag_factory.yaml</code> file in your team's <code style={s.code}>schedules/</code> folder.</li>
          <li>This YAML is committed to git automatically.</li>
          <li>Your MWAA environment syncs from git and picks up the new DAG within minutes.</li>
          <li>Airflow runs the SQL on your chosen schedule using the Snowflake connection for that environment.</li>
        </ul>
      </div>
      <div style={s.section}>
        <div style={s.sectionTitle}>Cron examples</div>
        <div style={s.cronTable}>
          {[
            ['0 * * * *',   'Every hour'],
            ['0 6 * * *',   'Daily at 06:00 UTC'],
            ['0 6 * * 1',   'Every Monday at 06:00 UTC'],
            ['0 6 * * 1-5', 'Weekdays at 06:00 UTC'],
            ['0 0 1 * *',   'First day of every month'],
          ].map(([cron, label]) => (
            <div key={cron} style={s.cronRow}>
              <code style={s.cronCode}>{cron}</code>
              <span style={s.cronLabel}>{label}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={s.infoBox}>
        <strong style={s.strong}>Snowflake connection IDs</strong> follow the convention
        <code style={{ ...s.code, marginLeft: 6 }}>snowflake__{'<team_id>'}__{'<env>'}</code>.
        Set these up once in your MWAA Airflow connections panel.
      </div>
    </div>
  ),
}

export default function HelpModal({ onClose }) {
  const [activeTab, setActiveTab] = useState('Overview')

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={s.header}>
          <div style={s.headerTitle}>
            <span style={{ fontSize: 18 }}>📖</span>
            Documentation
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Tab bar */}
        <div style={s.tabBar}>
          {TABS.map(t => (
            <button
              key={t}
              style={{ ...s.tab, ...(activeTab === t ? s.tabActive : {}) }}
              onClick={() => setActiveTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={s.body}>
          {CONTENT[activeTab]}
        </div>

      </div>
    </div>
  )
}
