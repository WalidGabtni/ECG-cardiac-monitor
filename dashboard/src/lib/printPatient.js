/**
 * Opens a print-ready patient record in a new tab.
 * User can Ctrl+P → Save as PDF (no extra npm packages needed).
 */
export function printPatient(patient, doctor) {
  const p = patient

  function row(label, value) {
    if (!value) return ''
    return `
      <div class="row">
        <span class="label">${label}</span>
        <span class="value">${value}</span>
      </div>`
  }

  function section(title, content) {
    if (!content.trim()) return ''
    return `
      <div class="section">
        <div class="section-title">${title}</div>
        ${content}
      </div>`
  }

  const bmiVal = p.weight && p.height
    ? (p.weight / Math.pow(p.height / 100, 2)).toFixed(1)
    : null

  const bmiLabel = bmiVal
    ? (bmiVal < 18.5 ? 'Underweight' : bmiVal < 25 ? 'Normal' : bmiVal < 30 ? 'Overweight' : 'Obese')
    : null

  const statusColor = {
    admitted:   '#16a34a',
    outpatient: '#ca8a04',
    discharged: '#6b7280',
  }[p.status] ?? '#6b7280'

  const statusBg = {
    admitted:   '#f0fdf4',
    outpatient: '#fefce8',
    discharged: '#f9fafb',
  }[p.status] ?? '#f9fafb'

  const allergiesHtml = p.allergies?.length
    ? p.allergies.map(a => `<span class="tag-red">${a}</span>`).join('')
    : '<span class="muted">No known allergies</span>'

  const medicationsHtml = p.medications?.length
    ? p.medications.map(m => `
        <div class="med">
          <div>
            <div class="med-name">${m.name}</div>
            <div class="med-freq">${m.frequency ?? ''}</div>
          </div>
          <div class="med-dose">${m.dose ?? ''}</div>
        </div>`).join('')
    : '<span class="muted">No medications recorded</span>'

  const historyHtml = p.medicalHistory?.length
    ? p.medicalHistory.map(h => `<div class="list-item">• ${h}</div>`).join('')
    : '<span class="muted">No history recorded</span>'

  const diagnosesHtml = [
    p.primaryDiagnosis ? `<div class="row"><span class="label">Primary</span><span class="value diag-primary">${p.primaryDiagnosis}</span></div>` : '',
    ...(p.secondaryDiagnoses ?? []).map(d =>
      `<div class="row"><span class="label">Secondary</span><span class="value">${d}</span></div>`
    ),
  ].join('')

  const anomaliesHtml = p.recentAnomalies?.length
    ? p.recentAnomalies.map(a => `
        <div class="anomaly">
          <span>${a.type}</span>
          <span class="anomaly-conf">${a.confidence}% conf · ${a.timestamp ?? ''}</span>
        </div>`).join('')
    : '<span class="muted">No anomalies recorded</span>'

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Patient Record — ${p.name}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 12px;
      color: #1a1a1a;
      background: white;
      padding: 36px 48px;
      line-height: 1.5;
    }

    /* ── Header ── */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 28px;
      padding-bottom: 20px;
      border-bottom: 2px solid #e5e7eb;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 700;
      color: #0d9488;
    }
    .logo-dot {
      width: 10px; height: 10px;
      border-radius: 50%;
      background: #0d9488;
    }
    .meta { text-align: right; font-size: 11px; color: #9ca3af; }
    .meta strong { color: #374151; }

    .patient-name {
      font-size: 22px;
      font-weight: 800;
      color: #111;
      margin-bottom: 3px;
    }
    .patient-sub {
      font-size: 13px;
      color: #6b7280;
      margin-bottom: 10px;
    }
    .status-badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 99px;
      font-size: 11px;
      font-weight: 600;
      background: ${statusBg};
      color: ${statusColor};
      border: 1px solid ${statusColor}44;
    }

    /* ── Sections ── */
    .section { margin-bottom: 22px; }
    .section-title {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #9ca3af;
      border-bottom: 1px solid #f3f4f6;
      padding-bottom: 5px;
      margin-bottom: 10px;
    }

    /* ── Rows ── */
    .row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
      padding: 4px 0;
      border-bottom: 1px solid #f9fafb;
    }
    .row:last-child { border-bottom: none; }
    .label { color: #9ca3af; flex-shrink: 0; min-width: 120px; }
    .value { font-weight: 500; text-align: right; }
    .diag-primary { color: #0d9488; font-weight: 600; }

    /* ── Tags ── */
    .tag-red {
      display: inline-block;
      margin: 2px 3px 2px 0;
      padding: 2px 8px;
      border-radius: 6px;
      background: #fef2f2;
      color: #b91c1c;
      font-size: 11px;
      font-weight: 500;
      border: 1px solid #fecaca;
    }

    /* ── Medications ── */
    .med {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
      border-bottom: 1px solid #f3f4f6;
    }
    .med:last-child { border-bottom: none; }
    .med-name { font-weight: 600; }
    .med-freq { font-size: 11px; color: #9ca3af; }
    .med-dose { font-family: 'Courier New', monospace; font-weight: 700; color: #0d9488; font-size: 12px; }

    /* ── History ── */
    .list-item { padding: 3px 0; color: #374151; }

    /* ── Anomalies ── */
    .anomaly {
      display: flex;
      justify-content: space-between;
      padding: 6px 10px;
      border-radius: 6px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      margin-bottom: 5px;
      font-size: 11px;
    }
    .anomaly-conf { color: #b91c1c; font-family: monospace; }

    /* ── Misc ── */
    .muted { color: #d1d5db; font-style: italic; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 0 32px; }

    /* ── Print ── */
    @media print {
      body { padding: 16px 24px; }
      .no-print { display: none; }
    }

    /* ── Print button (screen only) ── */
    .print-btn {
      display: block;
      margin: 0 0 24px auto;
      padding: 8px 20px;
      background: #0d9488;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .print-btn:hover { background: #0f766e; }
    @media print { .print-btn { display: none; } }
  </style>
</head>
<body>

  <button class="print-btn no-print" onclick="window.print()">⬇ Save as PDF / Print</button>

  <div class="header">
    <div>
      <div class="logo"><span class="logo-dot"></span> ECG Monitor</div>
      <div style="margin-top:4px;font-size:11px;color:#9ca3af;">Patient Medical Record</div>
    </div>
    <div class="meta">
      <div><strong>Generated:</strong> ${new Date().toLocaleString()}</div>
      ${doctor ? `<div><strong>Attending:</strong> ${doctor.name}</div>` : ''}
      ${p.ward ? `<div><strong>Location:</strong> ${p.ward} · ${p.room} · Bed ${p.bed}</div>` : ''}
    </div>
  </div>

  <div style="margin-bottom:24px;">
    <div class="patient-name">${p.name}</div>
    <div class="patient-sub">${[p.gender, p.age ? p.age + ' yrs' : null, p.bloodType].filter(Boolean).join(' · ')}</div>
    <span class="status-badge">${p.status ?? 'unknown'}</span>
  </div>

  ${section('Personal Information', `
    <div class="two-col">
      <div>
        ${row('Date of birth', p.dob)}
        ${row('Gender', p.gender)}
        ${row('Blood type', p.bloodType)}
      </div>
      <div>
        ${row('Height', p.height ? p.height + ' cm' : null)}
        ${row('Weight', p.weight ? p.weight + ' kg' : null)}
        ${row('BMI', bmiVal ? bmiVal + ' (' + bmiLabel + ')' : null)}
      </div>
    </div>
  `)}

  ${section('Contact', `
    ${row('Phone', p.phone)}
    ${row('Email', p.email)}
    ${row('Address', p.address)}
    ${row('Emergency contact', p.emergencyContact?.name ? p.emergencyContact.name + (p.emergencyContact.relation ? ' (' + p.emergencyContact.relation + ')' : '') : null)}
    ${row('Emergency phone', p.emergencyContact?.phone)}
  `)}

  ${section('Admission', `
    ${row('Status', p.status)}
    ${row('Admission date', p.admissionDate)}
    ${row('Discharge date', p.dischargeDate)}
    ${row('Ward / Room / Bed', p.ward ? p.ward + ' · ' + p.room + ' · Bed ' + p.bed : null)}
    ${row('Attending doctor', doctor?.name)}
  `)}

  ${section('Diagnoses', diagnosesHtml)}

  ${section('Allergies', `<div style="margin-top:4px;">${allergiesHtml}</div>`)}

  ${section('Current Medications', medicationsHtml)}

  ${section('Medical History', historyHtml)}

  ${p.insurance?.provider ? section('Insurance', `
    ${row('Provider', p.insurance.provider)}
    ${row('Policy number', p.insurance.policyNumber)}
    ${row('Expiry', p.insurance.expiry)}
  `) : ''}

  ${p.recentAnomalies?.length ? section('Recent ECG Anomalies', anomaliesHtml) : ''}

  ${p.deviceId ? section('ECG Device', `
    ${row('Device ID', p.deviceId)}
    ${row('Connection status', p.connectionStatus)}
    ${row('Last reading', p.lastReading)}
  `) : ''}

  ${p.notes ? section('Clinical Notes', `<div style="color:#374151;line-height:1.7;margin-top:4px;">${p.notes}</div>`) : ''}

  <div style="margin-top:40px;padding-top:12px;border-top:1px solid #f3f4f6;font-size:10px;color:#d1d5db;text-align:center;">
    Confidential — For medical use only · ECG Monitor Dashboard · ${new Date().toLocaleDateString()}
  </div>

</body>
</html>`

  const win = window.open('', '_blank')
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site and try again.')
    return
  }
  win.document.write(html)
  win.document.close()
}
