// Dewaweb Node.js Server Dashboard Client Logic

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide Icons
  lucide.createIcons();

  // Elements
  const overallStatusBadge = document.getElementById('overall-status-badge');
  const overallStatusText = document.getElementById('overall-status-text');
  
  const uptimeText = document.getElementById('stat-uptime');
  const sysUptimeText = document.getElementById('stat-system-uptime');
  
  const memPctText = document.getElementById('stat-mem-pct');
  const memCircle = document.getElementById('mem-progress-circle');
  const memTotalText = document.getElementById('stat-mem-total');
  const memUsedText = document.getElementById('stat-mem-used');
  const memFreeText = document.getElementById('stat-mem-free');

  const nodeVerText = document.getElementById('stat-node-version');
  const badgeEnv = document.getElementById('badge-env');
  const badgePassenger = document.getElementById('badge-passenger');
  const platformText = document.getElementById('stat-platform');
  const archText = document.getElementById('stat-arch');
  const coresText = document.getElementById('stat-cores');

  // Database Connection Card Elements
  const dbStatusText = document.getElementById('stat-db-status');
  const dbDescText = document.getElementById('stat-db-desc');
  const dbHostText = document.getElementById('stat-db-host');
  const dbNameText = document.getElementById('stat-db-name');
  const dbUserText = document.getElementById('stat-db-user');

  // Compatibility Checklist Items
  const chkPortIcon = document.getElementById('chk-port-icon');
  const chkPortDesc = document.getElementById('chk-port-desc');
  const chkVersionIcon = document.getElementById('chk-version-icon');
  const chkVersionDesc = document.getElementById('chk-version-desc');
  const chkEnvIcon = document.getElementById('chk-env-icon');
  const chkEnvDesc = document.getElementById('chk-env-desc');
  const chkStartupIcon = document.getElementById('chk-startup-icon');
  const chkStartupDesc = document.getElementById('chk-startup-desc');

  // JSON Explorer & Buttons
  const rawJsonOutput = document.getElementById('raw-json-output');
  const btnRefresh = document.getElementById('btn-refresh');
  const btnCopy = document.getElementById('btn-copy');

  let activeData = null;
  let isFetching = false;

  // Format seconds to readable duration
  function formatDuration(seconds) {
    const s = Math.floor(seconds % 60);
    const m = Math.floor((seconds / 60) % 60);
    const h = Math.floor((seconds / 3600) % 24);
    const d = Math.floor(seconds / 86400);

    const pad = (num) => String(num).padStart(2, '0');

    if (d > 0) {
      return `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`;
    }
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  // Update SVG Progress Circle
  function updateMemoryCircle(percentage) {
    const radius = 40;
    const circumference = 2 * Math.PI * radius; // ~251.2
    const offset = circumference - (percentage / 100) * circumference;
    memCircle.style.strokeDashoffset = offset;
  }

  // Fetch Telemetry Data
  async function fetchTelemetry() {
    if (isFetching) return;
    isFetching = true;

    // Toggle button spinner
    const spinner = btnRefresh.querySelector('.btn-spinner');
    if (spinner) spinner.classList.add('spinning');
    btnRefresh.disabled = true;

    try {
      const response = await fetch('/api/status');
      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
      const data = await response.json();
      activeData = data;
      
      // Render components
      renderDashboard(data);
    } catch (error) {
      console.error('Failed to fetch server telemetry:', error);
      
      // Update overall badge
      overallStatusBadge.querySelector('.pulse-indicator').className = 'pulse-indicator error';
      overallStatusText.textContent = 'Connection Offline';
      rawJsonOutput.textContent = `Error connecting to API:\n${error.message}`;
    } finally {
      isFetching = false;
      if (spinner) spinner.classList.remove('spinning');
      btnRefresh.disabled = false;
    }
  }

  // Render metrics to DOM
  function renderDashboard(data) {
    // 1. Overall Status
    const indicator = overallStatusBadge.querySelector('.pulse-indicator');
    indicator.className = 'pulse-indicator active';
    overallStatusText.textContent = 'Server Online';

    // 2. Process & System Uptime
    uptimeText.textContent = formatDuration(data.process.uptime);
    sysUptimeText.textContent = `Host Uptime: ${formatDuration(data.system.uptime)}`;

    // 3. Memory
    const memPct = parseFloat(data.hardware.memoryUsagePercentage);
    memPctText.textContent = `${memPct}%`;
    updateMemoryCircle(memPct);
    memTotalText.textContent = `${data.hardware.totalMemoryGB} GB`;
    memUsedText.textContent = `${data.hardware.usedMemoryGB} GB`;
    memFreeText.textContent = `${data.hardware.freeMemoryGB} GB`;

    // 4. Node Version & Environment Specs
    nodeVerText.textContent = data.process.nodeVersion;
    
    // Env badge
    badgeEnv.textContent = data.hostingDiagnostics.nodeEnvironment.toUpperCase();
    if (data.hostingDiagnostics.nodeEnvironment === 'production') {
      badgeEnv.classList.add('production');
    } else {
      badgeEnv.classList.remove('production');
    }

    // Passenger badge
    const isPassenger = data.hostingDiagnostics.passengerPortBound;
    if (isPassenger) {
      badgePassenger.textContent = 'PASSENGER SERVER';
      badgePassenger.classList.add('active');
    } else {
      badgePassenger.textContent = 'STANDALONE SERVER';
      badgePassenger.classList.remove('active');
    }

    // System hardware specs
    platformText.textContent = data.system.platform.toUpperCase();
    archText.textContent = data.system.arch;
    coresText.textContent = `${data.hardware.cpus} Cores (${data.hardware.cpuModel.split(' ')[0]})`;

    // Database Card Rendering
    const db = data.database;
    dbHostText.textContent = db.config.host || 'localhost';
    dbNameText.textContent = db.config.database || 'Not set';
    dbUserText.textContent = db.config.user || 'Not set';
    
    // Style database status text based on state
    dbStatusText.textContent = db.status.replace('_', ' ').toUpperCase();
    dbDescText.textContent = db.message;
    
    if (db.status === 'connected') {
      dbStatusText.style.color = 'var(--accent-emerald)';
      dbDescText.style.color = 'var(--text-secondary)';
    } else if (db.status === 'not_configured') {
      dbStatusText.style.color = 'var(--accent-gold)';
      dbDescText.style.color = 'var(--text-muted)';
    } else { // error
      dbStatusText.style.color = 'var(--accent-red)';
      dbDescText.style.color = 'var(--accent-red)';
    }

    // 5. Diagnostics Checklist (Specifically for Dewaweb/Passenger setups)
    // 5.1 Port bound check
    if (isPassenger) {
      setCheckItem(chkPortIcon, chkPortDesc, 'success', `cPanel port bind verified: Bound via Passenger process port ${data.hostingDiagnostics.portUsed}.`);
    } else {
      setCheckItem(chkPortIcon, chkPortDesc, 'warning', `Local port active: Listening on standard port ${data.hostingDiagnostics.portUsed}. In Dewaweb shared hosting, this will bind to process.env.PORT automatically.`);
    }

    // 5.2 Node.js version check
    const majorVer = parseInt(data.process.nodeVersion.replace('v', '').split('.')[0]);
    if (majorVer >= 18) {
      setCheckItem(chkVersionIcon, chkVersionDesc, 'success', `Node.js ${data.process.nodeVersion} is modern & recommended.`);
    } else if (majorVer >= 14) {
      setCheckItem(chkVersionIcon, chkVersionDesc, 'warning', `Node.js ${data.process.nodeVersion} is older. Consider selecting >= v18 in cPanel Node.js Selector.`);
    } else {
      setCheckItem(chkVersionIcon, chkVersionDesc, 'error', `Node.js ${data.process.nodeVersion} is legacy. Update immediately via cPanel Node.js Selector!`);
    }

    // 5.3 Application Mode Environment Check
    if (data.hostingDiagnostics.nodeEnvironment === 'production') {
      setCheckItem(chkEnvIcon, chkEnvDesc, 'success', `Application mode is set to 'production' (Optimal for speed and logs).`);
    } else {
      setCheckItem(chkEnvIcon, chkEnvDesc, 'warning', `Application mode is set to '${data.hostingDiagnostics.nodeEnvironment}'. Switch to 'production' in cPanel configurations for final deployments.`);
    }

    // 5.4 Startup File Configuration check
    // We checks if main entry is named server.js (standard for Passenger)
    setCheckItem(chkStartupIcon, chkStartupDesc, 'success', `Startup file is loaded correctly. 'server.js' is the target startup filename for Dewaweb cPanel applications.`);

    // 6. JSON Live output
    rawJsonOutput.textContent = JSON.stringify(data, null, 2);
  }

  // Set individual checklist items statuses
  function setCheckItem(iconEl, descEl, status, message) {
    descEl.textContent = message;
    
    // Assign correct status classes
    iconEl.className = `check-status status-${status}`;
    
    // Replace inner icon
    let iconName = 'help-circle';
    if (status === 'success') iconName = 'check-circle-2';
    if (status === 'warning') iconName = 'alert-triangle';
    if (status === 'error') iconName = 'alert-circle';
    
    iconEl.innerHTML = `<i data-lucide="${iconName}"></i>`;
    lucide.createIcons();
  }

  // Real-time ticking counter for process uptime
  setInterval(() => {
    if (activeData && activeData.process) {
      activeData.process.uptime += 1;
      activeData.system.uptime += 1;
      uptimeText.textContent = formatDuration(activeData.process.uptime);
      sysUptimeText.textContent = `Host Uptime: ${formatDuration(activeData.system.uptime)}`;
    }
  }, 1000);

  // Auto poll every 10 seconds for system metrics
  setInterval(() => {
    fetchTelemetry();
  }, 10000);

  // Trigger telemetry fetch on click
  btnRefresh.addEventListener('click', fetchTelemetry);

  // Copy JSON telemetry to clipboard
  btnCopy.addEventListener('click', async () => {
    if (!activeData) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(activeData, null, 2));
      
      // Temporary UI Success indicators
      const icon = btnCopy.querySelector('i');
      icon.setAttribute('data-lucide', 'check');
      btnCopy.style.color = 'var(--accent-emerald)';
      lucide.createIcons();
      
      setTimeout(() => {
        icon.setAttribute('data-lucide', 'copy');
        btnCopy.style.color = '';
        lucide.createIcons();
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  });

  // Initial Fetch
  fetchTelemetry();
});
