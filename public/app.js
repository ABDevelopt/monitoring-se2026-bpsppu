// Sensus Ekonomi 2026 Field Survey Monitoring Dashboard Client Logic

document.addEventListener('DOMContentLoaded', () => {
  // Application State
  let currentUser = null;
  let activeTab = 'dashboard';
  let kecamatanChartInstance = null;

  // Cache data lists
  let cachedSubSls = [];
  let cachedKecamatan = [];
  let cachedPcls = [];

  // ==========================================================================
  // DOM Elements
  // ==========================================================================

  // Authentication Views
  const loginContainer = document.getElementById('login-container');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const appContainer = document.getElementById('app-container');
  const btnLogout = document.getElementById('btn-logout');

  // Sidebar Profiling
  const profileName = document.getElementById('profile-name');
  const profileInitials = document.getElementById('profile-initials');
  const profileRole = document.getElementById('profile-role');

  // Sidebar Menu Items (Role Restrictions)
  const navItems = document.querySelectorAll('.nav-item');
  const navLaporan = document.getElementById('nav-laporan');
  const navWilayah = document.getElementById('nav-wilayah');
  const navUsers = document.getElementById('nav-users');

  // Mobile Bottom Nav Menu Items
  const mobNavItems = document.querySelectorAll('.mobile-nav-item');
  const mobNavLaporan = document.getElementById('mob-nav-laporan');
  const mobNavWilayah = document.getElementById('mob-nav-wilayah');
  const mobNavUsers = document.getElementById('mob-nav-users');

  // Tab Content Panels
  const tabPanels = document.querySelectorAll('.tab-content');
  const pageTitle = document.getElementById('page-title');

  // Dashboard KPI Elements
  const kpiSls = document.getElementById('kpi-sls');
  const kpiSubSls = document.getElementById('kpi-sub-sls');
  const kpiSelesai = document.getElementById('kpi-selesai');
  const kpiKendala = document.getElementById('kpi-kendala');
  const globalProgressPct = document.getElementById('global-progress-pct');
  const globalProgressCircle = document.getElementById('global-progress-circle');
  const globalMuatanVal = document.getElementById('global-muatan-val');
  const globalApprovedVal = document.getElementById('global-approved-val');

  // Dashboard Tables
  const tblKecBody = document.getElementById('tbl-kec-body');
  const tblSlsBody = document.getElementById('tbl-sls-body');
  const tblPmlBody = document.getElementById('tbl-pml-body');

  // Laporan Harian Elements
  const laporanForm = document.getElementById('laporan-form');
  const lapTanggal = document.getElementById('lap-tanggal');
  const lapSubSls = document.getElementById('lap-sub-sls');
  const lapOpen = document.getElementById('lap-open');
  const lapSubmit = document.getElementById('lap-submit');
  const lapReject = document.getElementById('lap-reject');
  const lapPending = document.getElementById('lap-pending');
  const lapApproved = document.getElementById('lap-approved');
  const lapStatus = document.getElementById('lap-status');
  const lapKeterangan = document.getElementById('lap-keterangan');
  const formLaporanSuccess = document.getElementById('form-laporan-success');
  const formLaporanError = document.getElementById('form-laporan-error');
  const tblLogLaporanBody = document.getElementById('tbl-log-laporan-body');

  // EWS Warning Elements
  const tblEwsBody = document.getElementById('tbl-ews-body');

  // Alokasi Wilayah Elements
  const alokasiForm = document.getElementById('alokasi-form');
  const alokSubSls = document.getElementById('alok-sub-sls');
  const alokKorlap = document.getElementById('alok-korlap');
  const alokPml = document.getElementById('alok-pml');
  const alokPclUser = document.getElementById('alok-pcl-user');
  const formAlokasiSuccess = document.getElementById('form-alokasi-success');
  const formAlokasiError = document.getElementById('form-alokasi-error');
  const tblAlokasiBody = document.getElementById('tbl-alokasi-body');

  // Target Periode Elements
  const targetForm = document.getElementById('target-form');
  const tgtKecamatan = document.getElementById('tgt-kecamatan');
  const tgtPersen = document.getElementById('tgt-persen');
  const tgtMulai = document.getElementById('tgt-mulai');
  const tgtSelesai = document.getElementById('tgt-selesai');
  const formTargetSuccess = document.getElementById('form-target-success');
  const formTargetError = document.getElementById('form-target-error');

  // User Management Elements
  const userForm = document.getElementById('user-form');
  const usrId = document.getElementById('usr-id');
  const usrNama = document.getElementById('usr-nama');
  const usrUsername = document.getElementById('usr-username');
  const usrPassword = document.getElementById('usr-password');
  const usrRole = document.getElementById('usr-role');
  const usrKecamatan = document.getElementById('usr-kecamatan');
  const usrActive = document.getElementById('usr-active');
  const pwdRequiredStar = document.getElementById('pwd-required-star');
  const formUserSuccess = document.getElementById('form-user-success');
  const formUserError = document.getElementById('form-user-error');
  const btnCancelEditUser = document.getElementById('btn-cancel-edit-user');
  const tblUsersBody = document.getElementById('tbl-users-body');
  const userFormTitle = document.getElementById('user-form-title');

  // Excel Export Elements
  const btnDownloadExcel = document.getElementById('btn-download-excel');

  // Initialize UI
  lucide.createIcons();
  checkAuthSession();

  // ==========================================================================
  // Router & Session Handlers
  // ==========================================================================

  // Check if user is logged in
  async function checkAuthSession() {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        currentUser = data.user;
        setupWorkspace(currentUser);
      } else {
        showLogin();
      }
    } catch (err) {
      showLogin();
    }
  }

  // Setup Workspace for Logged-In Users
  function setupWorkspace(user) {
    loginContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');

    // Update Profile Info
    profileName.textContent = user.nama_lengkap;
    profileRole.textContent = user.role.toUpperCase();
    profileInitials.textContent = user.nama_lengkap.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

    // Restrict sidebar items based on RBAC rules
    // PCL: Dashboard, EWS, Export
    if (user.role === 'pcl') {
      navLaporan.classList.add('hidden');
      navWilayah.classList.add('hidden');
      navUsers.classList.add('hidden');
      mobNavLaporan.classList.add('hidden');
      mobNavWilayah.classList.add('hidden');
      mobNavUsers.classList.add('hidden');
    }
    // PML & Korlap: Dashboard, Laporan, EWS, Export
    else if (user.role === 'pml' || user.role === 'korlap') {
      navLaporan.classList.remove('hidden');
      navWilayah.classList.add('hidden');
      navUsers.classList.add('hidden');
      mobNavLaporan.classList.remove('hidden');
      mobNavWilayah.classList.add('hidden');
      mobNavUsers.classList.add('hidden');
    }
    // Admin: Full Access
    else if (user.role === 'admin') {
      navLaporan.classList.remove('hidden');
      navWilayah.classList.remove('hidden');
      navUsers.classList.remove('hidden');
      mobNavLaporan.classList.remove('hidden');
      mobNavWilayah.classList.remove('hidden');
      mobNavUsers.classList.remove('hidden');
    }

    // Default tab
    switchTab('dashboard');
  }

  // Show login panel
  function showLogin() {
    currentUser = null;
    appContainer.classList.add('hidden');
    loginContainer.classList.remove('hidden');
    loginForm.reset();
  }

  // Tab Switch logic
  function switchTab(tabName) {
    activeTab = tabName;
    
    // Manage sidebar active class
    navItems.forEach(item => {
      if (item.getAttribute('data-tab') === tabName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Manage mobile bottom nav active class
    mobNavItems.forEach(item => {
      if (item.getAttribute('data-tab') === tabName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Show panel
    tabPanels.forEach(panel => {
      if (panel.getAttribute('id') === `tab-${tabName}`) {
        panel.classList.remove('hidden');
      } else {
        panel.classList.add('hidden');
      }
    });

    // Update title
    const titles = {
      dashboard: 'Dashboard Progres Real-Time',
      laporan: 'Manajemen Laporan Progres Harian',
      ews: 'Sistem Deteksi Kendala Lapangan (Early Warning System)',
      wilayah: 'Pemetaan Petugas & Batas Waktu Wilayah',
      users: 'Konsol Manajemen Pengguna Aplikasi',
      ekspor: 'Unduh Excel & Laporan Terstruktur'
    };
    pageTitle.textContent = titles[tabName] || 'Dashboard';

    // Trigger tab-specific loading
    if (tabName === 'dashboard') {
      loadDashboardStats();
    } else if (tabName === 'laporan') {
      loadLaporanTab();
    } else if (tabName === 'ews') {
      loadEwsTab();
    } else if (tabName === 'wilayah') {
      loadWilayahTab();
    } else if (tabName === 'users') {
      loadUsersTab();
    }
  }

  // Sidebar navigation click
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = item.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  // Mobile navigation click
  mobNavItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = item.getAttribute('data-tab');
      if (tab === 'logout') {
        btnLogout.click();
      } else {
        switchTab(tab);
      }
    });
  });

  // Login Form Submission
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');
    
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (res.ok) {
        currentUser = data.user;
        setupWorkspace(currentUser);
      } else {
        loginError.textContent = data.message || 'Login gagal.';
        loginError.classList.remove('hidden');
      }
    } catch (err) {
      loginError.textContent = 'Gagal terhubung ke server.';
      loginError.classList.remove('hidden');
    }
  });

  // Logout Click
  btnLogout.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        showLogin();
      }
    } catch (err) {
      alert('Gagal logout.');
    }
  });

  // ==========================================================================
  // DASHBOARD TAB LOGIC
  // ==========================================================================

  // Update circular ring progress
  function updateProgressCircle(percentage) {
    const radius = 40;
    const circumference = 2 * Math.PI * radius; // ~251.2
    const offset = circumference - (percentage / 100) * circumference;
    globalProgressCircle.style.strokeDashoffset = offset;
  }

  // Load Dashboard Stats
  async function loadDashboardStats() {
    try {
      const res = await fetch('/api/dashboard/stats');
      if (!res.ok) throw new Error('Failed to fetch stats');
      const data = await res.json();

      // Populate KPIs
      kpiSls.textContent = data.kpis.total_sls;
      kpiSubSls.textContent = data.kpis.total_sub_sls;
      kpiSelesai.textContent = data.kpis.completed_sub_sls;
      kpiKendala.textContent = data.kpis.active_issues;
      
      const pct = parseFloat(data.kpis.progress_percentage);
      globalProgressPct.textContent = `${pct}%`;
      updateProgressCircle(pct > 100 ? 100 : pct); // Cap visual ring at 100%

      globalMuatanVal.textContent = data.kpis.total_muatan;
      globalApprovedVal.textContent = data.kpis.total_approved;

      // Render Tables
      renderKecamatanTable(data.tables.kecamatan);
      renderSlsTable(data.tables.sls);
      renderPmlTable(data.tables.pml);

      // Render Chart
      renderKecamatanChart(data.tables.kecamatan);

    } catch (err) {
      console.error(err);
      tblKecBody.innerHTML = '<tr><td colspan="7" class="loading-td">Gagal memuat data statistik.</td></tr>';
    }
  }

  // Render Kecamatan Progres Table
  function renderKecamatanTable(kecList) {
    if (!kecList || kecList.length === 0) {
      tblKecBody.innerHTML = '<tr><td colspan="7" class="loading-td">Tidak ada data kecamatan.</td></tr>';
      return;
    }

    tblKecBody.innerHTML = '';
    kecList.forEach(row => {
      let progress = 0;
      const approved = parseInt(row.total_approved);
      const target = parseInt(row.total_muatan);

      if (target > 0) {
        progress = ((approved / target) * 100).toFixed(1);
      }

      // Visual progress bar
      const progressCap = progress > 100 ? 100 : progress;

      tblKecBody.innerHTML += `
        <tr>
          <td><strong>${row.nama_kec}</strong></td>
          <td>${target}</td>
          <td>${approved}</td>
          <td>${row.total_submit}</td>
          <td>${row.total_pending}</td>
          <td>${row.total_reject}</td>
          <td>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <div class="progress-bar-container" style="background: rgba(255,255,255,0.05); width: 80px; height: 6px; border-radius: 3px; overflow: hidden;">
                <div class="progress-bar-fill" style="background: var(--accent-blue); width: ${progressCap}%; height: 100%;"></div>
              </div>
              <span>${progress}%</span>
            </div>
          </td>
        </tr>
      `;
    });
  }

  // Render SLS Table
  function renderSlsTable(slsList) {
    if (!slsList || slsList.length === 0) {
      tblSlsBody.innerHTML = '<tr><td colspan="8" class="loading-td">Tidak ada data SLS.</td></tr>';
      return;
    }

    tblSlsBody.innerHTML = '';
    slsList.forEach(row => {
      let progress = 0;
      const approved = parseInt(row.total_approved);
      const target = parseInt(row.total_muatan);

      if (target > 0) {
        progress = ((approved / target) * 100).toFixed(1);
      }

      tblSlsBody.innerHTML += `
        <tr>
          <td><strong>${row.nama_sls}</strong></td>
          <td>${row.nama_desa}</td>
          <td>${row.nama_kec}</td>
          <td>${target}</td>
          <td>${approved}</td>
          <td>${row.total_submit}</td>
          <td>${row.total_pending}</td>
          <td><span class="badge ${progress >= 100 ? 'badge-success' : 'badge-warning'}">${progress}%</span></td>
        </tr>
      `;
    });
  }

  // Render PML Table
  function renderPmlTable(pmlList) {
    if (!pmlList || pmlList.length === 0) {
      tblPmlBody.innerHTML = '<tr><td colspan="5" class="loading-td">Tidak ada data PML.</td></tr>';
      return;
    }

    tblPmlBody.innerHTML = '';
    pmlList.forEach(row => {
      let progress = 0;
      const approved = parseInt(row.total_approved);
      const target = parseInt(row.total_muatan);

      if (target > 0) {
        progress = ((approved / target) * 100).toFixed(1);
      }

      tblPmlBody.innerHTML += `
        <tr>
          <td><strong>${row.nama_pml || 'Tidak ditentukan'}</strong></td>
          <td>${row.nama_korlap || 'Tidak ditentukan'}</td>
          <td>${target}</td>
          <td>${approved}</td>
          <td><span class="badge badge-success">${row.completed_sub_sls} / ${row.total_sub_sls} Sub-SLS</span></td>
        </tr>
      `;
    });
  }

  // Render Kecamatan Bar Chart (Chart.js)
  function renderKecamatanChart(kecList) {
    const ctx = document.getElementById('kecamatanChart').getContext('2d');
    
    // Destroy previous instance
    if (kecamatanChartInstance) {
      kecamatanChartInstance.destroy();
    }

    const labels = kecList.map(k => k.nama_kec);
    const progressData = kecList.map(k => {
      const target = parseInt(k.total_muatan);
      return target > 0 ? parseFloat(((parseInt(k.total_approved) / target) * 100).toFixed(1)) : 0;
    });
    const targetPeriodData = kecList.map(k => parseFloat(k.target_periode || 100));

    kecamatanChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Progres Kerja (%)',
            data: progressData,
            backgroundColor: 'rgba(139, 92, 246, 0.6)',
            borderColor: 'rgba(139, 92, 246, 1)',
            borderWidth: 1,
            borderRadius: 6
          },
          {
            label: 'Target Batas Periode (%)',
            data: targetPeriodData,
            type: 'line',
            borderColor: 'rgba(245, 158, 11, 0.9)',
            borderWidth: 2,
            fill: false,
            pointBackgroundColor: 'var(--accent-gold)'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            max: 120,
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: 'var(--text-secondary)' }
          },
          x: {
            grid: { display: false },
            ticks: { color: 'var(--text-secondary)' }
          }
        },
        plugins: {
          legend: {
            labels: { color: '#fff', font: { family: 'Outfit' } }
          }
        }
      }
    });
  }

  // ==========================================================================
  // LAPORAN HARIAN TAB LOGIC
  // ==========================================================================

  // Populate Sub-SLS dropdown and list in Laporan
  async function loadLaporanTab() {
    formLaporanSuccess.classList.add('hidden');
    formLaporanError.classList.add('hidden');
    
    // Reset date input to today
    const today = new Date().toISOString().split('T')[0];
    lapTanggal.value = today;

    try {
      // 1. Fetch sub-sls list
      const res = await fetch('/api/wilayah/sub-sls');
      if (!res.ok) throw new Error();
      const data = await res.json();
      cachedSubSls = data.subSls;

      // Populate dropdown select
      lapSubSls.innerHTML = '<option value="">Pilih Sub-SLS...</option>';
      cachedSubSls.forEach(s => {
        lapSubSls.innerHTML += `
          <option value="${s.id}">${s.id_sub_sls} - ${s.nama_sub_sls} (Target: ${s.total_muatan})</option>
        `;
      });

      // 2. Fetch recent reports
      loadRecentLaporanLogs();

    } catch (err) {
      console.error(err);
      formLaporanError.textContent = 'Gagal memuat daftar wilayah.';
      formLaporanError.classList.remove('hidden');
    }
  }

  // Load recent reports list table
  async function loadRecentLaporanLogs() {
    try {
      const res = await fetch('/api/laporan');
      if (!res.ok) throw new Error();
      const data = await res.json();

      if (!data.reports || data.reports.length === 0) {
        tblLogLaporanBody.innerHTML = '<tr><td colspan="6" class="loading-td">Belum ada laporan harian dimasukkan.</td></tr>';
        return;
      }

      tblLogLaporanBody.innerHTML = '';
      data.reports.forEach(row => {
        const formattedDate = row.tanggal.split('T')[0];
        
        let statusBadge = 'badge-success';
        let statusText = 'Selesai 100%';
        if (row.status === 'selesai_sebagian') {
          statusBadge = 'badge-warning';
          statusText = 'Sebagian';
        } else if (row.status === 'tidak_selesai_kendala') {
          statusBadge = 'badge-danger';
          statusText = 'Kendala';
        }

        tblLogLaporanBody.innerHTML += `
          <tr>
            <td><strong>${formattedDate}</strong></td>
            <td>${row.id_sub_sls}</td>
            <td>${row.jml_approved} / ${row.total_muatan}</td>
            <td><span class="badge ${statusBadge}">${statusText}</span></td>
            <td>${row.pembuat_laporan}</td>
            <td>
              <button class="btn-icon-sm btn-icon-danger btn-delete-laporan" data-id="${row.id}" title="Hapus Laporan">
                <i data-lucide="trash-2"></i>
              </button>
            </td>
          </tr>
        `;
      });

      // Init Lucide
      lucide.createIcons();

      // Bind delete events
      document.querySelectorAll('.btn-delete-laporan').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Apakah Anda yakin ingin menghapus laporan harian ini?')) return;
          const id = btn.getAttribute('data-id');
          await deleteLaporan(id);
        });
      });

    } catch (err) {
      tblLogLaporanBody.innerHTML = '<tr><td colspan="6" class="loading-td">Gagal memuat log laporan.</td></tr>';
    }
  }

  // Delete Daily Report
  async function deleteLaporan(id) {
    try {
      const res = await fetch(`/api/laporan/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        loadRecentLaporanLogs();
      } else {
        alert(data.message || 'Gagal menghapus laporan.');
      }
    } catch (err) {
      alert('Gagal terhubung ke server.');
    }
  }

  // Laporan Form Submission
  laporanForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    formLaporanSuccess.classList.add('hidden');
    formLaporanError.classList.add('hidden');

    const sub_sls_id = lapSubSls.value;
    const tanggal = lapTanggal.value;
    const jml_open = parseInt(lapOpen.value) || 0;
    const jml_submit = parseInt(lapSubmit.value) || 0;
    const jml_reject = parseInt(lapReject.value) || 0;
    const jml_pending = parseInt(lapPending.value) || 0;
    const jml_approved = parseInt(lapApproved.value) || 0;
    const status = lapStatus.value;
    const keterangan = lapKeterangan.value;

    // Validation
    if (status === 'tidak_selesai_kendala' && !keterangan.trim()) {
      formLaporanError.textContent = 'Detail keterangan kendala wajib diisi jika status laporan berkendala.';
      formLaporanError.classList.remove('hidden');
      return;
    }

    try {
      const res = await fetch('/api/laporan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tanggal,
          sub_sls_id,
          jml_open,
          jml_submit,
          jml_reject,
          jml_pending,
          jml_approved,
          status,
          keterangan
        })
      });
      const data = await res.json();

      if (res.ok) {
        formLaporanSuccess.textContent = data.message;
        formLaporanSuccess.classList.remove('hidden');
        laporanForm.reset();
        
        // Re-init variables
        lapTanggal.value = tanggal;
        lapSubSls.value = sub_sls_id;

        // Reload logs
        loadRecentLaporanLogs();
      } else {
        formLaporanError.textContent = data.message;
        formLaporanError.classList.remove('hidden');
      }
    } catch (err) {
      formLaporanError.textContent = 'Gagal terhubung ke server.';
      formLaporanError.classList.remove('hidden');
    }
  });

  // ==========================================================================
  // LOG KENDALA (EWS) TAB LOGIC
  // ==========================================================================

  // Load EWS alarms
  async function loadEwsTab() {
    try {
      const res = await fetch('/api/dashboard/ews');
      if (!res.ok) throw new Error();
      const data = await res.json();

      if (!data.warnings || data.warnings.length === 0) {
        tblEwsBody.innerHTML = '<tr><td colspan="8" class="loading-td" style="color: var(--accent-emerald);">✔ Kondisi lapangan aman. Tidak ada kendala terdeteksi.</td></tr>';
        return;
      }

      tblEwsBody.innerHTML = '';
      data.warnings.forEach(row => {
        let levelBadge = 'level-risiko';
        let rowClass = 'ews-row-risiko';
        if (row.level === 'Kritis') {
          levelBadge = 'level-kritis';
          rowClass = 'ews-row-kritis';
        } else if (row.level === 'Perhatian') {
          levelBadge = 'level-perhatian';
          rowClass = 'ews-row-perhatian';
        }

        tblEwsBody.innerHTML += `
          <tr class="${rowClass}">
            <td><span class="legend-badge ${levelBadge}">${row.level.toUpperCase()}</span></td>
            <td>${row.nama_kec}</td>
            <td>${row.nama_desa}</td>
            <td><strong>${row.id_sub_sls}</strong></td>
            <td>${row.progress}% (${row.approved} / ${row.total_muatan})</td>
            <td>
              <div style="font-size:0.8rem;">PCL: ${row.nama_pcl}</div>
              <div style="font-size:0.75rem; color:var(--text-muted);">PML: ${row.nama_pml}</div>
            </td>
            <td>${row.last_report_date}</td>
            <td><strong>${row.detail}</strong></td>
          </tr>
        `;
      });

    } catch (err) {
      tblEwsBody.innerHTML = '<tr><td colspan="8" class="loading-td">Gagal memproses peringatan EWS.</td></tr>';
    }
  }

  // ==========================================================================
  // ALOKASI WILAYAH TAB LOGIC (ADMIN)
  // ==========================================================================

  // Load sub-sls, pcls dropdown and lists in Alokasi tab
  async function loadWilayahTab() {
    formAlokasiSuccess.classList.add('hidden');
    formAlokasiError.classList.add('hidden');
    formTargetSuccess.classList.add('hidden');
    formTargetError.classList.add('hidden');

    try {
      // 1. Fetch sub-sls list
      const res = await fetch('/api/wilayah/sub-sls');
      const data = await res.json();
      cachedSubSls = data.subSls;

      // Populate alokasi dropdown
      alokSubSls.innerHTML = '<option value="">Pilih Sub-SLS...</option>';
      cachedSubSls.forEach(s => {
        alokSubSls.innerHTML += `
          <option value="${s.id}">${s.id_sub_sls} - ${s.nama_sub_sls}</option>
        `;
      });

      // 2. Fetch PCL users
      const resPcl = await fetch('/api/wilayah/pcls');
      const dataPcl = await resPcl.json();
      cachedPcls = dataPcl.pcls;

      alokPclUser.innerHTML = '<option value="">Pilih PCL...</option>';
      cachedPcls.forEach(p => {
        alokPclUser.innerHTML += `
          <option value="${p.id}">${p.nama_lengkap}</option>
        `;
      });

      // 3. Fetch Kecamatan
      const resKec = await fetch('/api/wilayah/kecamatan');
      const dataKec = await resKec.json();
      cachedKecamatan = dataKec.kecamatan;

      tgtKecamatan.innerHTML = '<option value="">Pilih Kecamatan...</option>';
      cachedKecamatan.forEach(k => {
        tgtKecamatan.innerHTML += `
          <option value="${k.id}">${k.kode_kec} - ${k.nama_kec}</option>
        `;
      });

      // 4. Render Alokasi Table
      renderAlokasiTable(cachedSubSls);

    } catch (err) {
      console.error(err);
    }
  }

  // Render Alokasi Table
  function renderAlokasiTable(list) {
    if (!list || list.length === 0) {
      tblAlokasiBody.innerHTML = '<tr><td colspan="10" class="loading-td">Tidak ada data wilayah Sub-SLS.</td></tr>';
      return;
    }

    tblAlokasiBody.innerHTML = '';
    list.forEach(row => {
      tblAlokasiBody.innerHTML += `
        <tr>
          <td>${row.nama_kec}</td>
          <td>${row.nama_desa}</td>
          <td>${row.nama_sls}</td>
          <td><strong>${row.id_sub_sls}</strong></td>
          <td>${row.nama_sub_sls}</td>
          <td>${row.total_muatan}</td>
          <td>${row.nama_korlap || '-'}</td>
          <td>${row.nama_pml || '-'}</td>
          <td><span class="role-badge">${row.nama_pcl || 'Belum ditugaskan'}</span></td>
          <td>
            <button class="btn-icon-sm btn-edit-alokasi" data-id="${row.id}" title="Edit Alokasi">
              <i data-lucide="edit"></i>
            </button>
          </td>
        </tr>
      `;
    });

    lucide.createIcons();

    // Bind edit events
    document.querySelectorAll('.btn-edit-alokasi').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.getAttribute('data-id'));
        const sub = cachedSubSls.find(s => s.id === id);
        if (sub) {
          // Scroll to form
          document.getElementById('card-alokasi-petugas').scrollIntoView({ behavior: 'smooth' });
          // Populate fields
          alokSubSls.value = sub.id;
          alokKorlap.value = sub.nama_korlap || '';
          alokPml.value = sub.nama_pml || '';
          
          // Match PCL name in dropdown
          const matchedPcl = cachedPcls.find(p => p.nama_lengkap === sub.nama_pcl);
          alokPclUser.value = matchedPcl ? matchedPcl.id : '';
        }
      });
    });
  }

  // Save Allocation Form Submission
  alokasiForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    formAlokasiSuccess.classList.add('hidden');
    formAlokasiError.classList.add('hidden');

    const sub_id = alokSubSls.value;
    const nama_korlap = alokKorlap.value;
    const nama_pml = alokPml.value;
    const pcl_id = alokPclUser.value;

    try {
      const res = await fetch(`/api/wilayah/sub-sls/${sub_id}/alokasi`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nama_korlap, nama_pml, pcl_id })
      });
      const data = await res.json();

      if (res.ok) {
        formAlokasiSuccess.textContent = data.message;
        formAlokasiSuccess.classList.remove('hidden');
        alokasiForm.reset();
        
        // Reload
        loadWilayahTab();
      } else {
        formAlokasiError.textContent = data.message;
        formAlokasiError.classList.remove('hidden');
      }
    } catch (err) {
      formAlokasiError.textContent = 'Gagal menyimpan alokasi.';
      formAlokasiError.classList.remove('hidden');
    }
  });

  // Target Periode Form Submission
  targetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    formTargetSuccess.classList.add('hidden');
    formTargetError.classList.add('hidden');

    // cPanel environment variable configuration alternative
    // We will save to database target_periode table
    const kecamatan_id = tgtKecamatan.value;
    const target_persen = tgtPersen.value;
    const tanggal_mulai = tgtMulai.value;
    const tanggal_selesai = tgtSelesai.value;

    // Create target periode mock request (we store in server.js but actually we can save via cPanel environment mockup or directly)
    // For simplicity, cPanel node selector can save this. Let's make an endpoint.
    // Wait, let's write it in server.js? We did create table target_periode but did not add a direct endpoint.
    // Let's create an endpoint in server.js or mock it.
    // Let's implement /api/wilayah/target-periode POST in server.js to insert.
    // Let's see: we can write to /api/target-periode in server.js. We did not specify it in server.js POST, but wait! We can easily make the POST.
    // Wait, let's make a call to /api/wilayah/target-periode. Let's verify if we need to write the endpoint first.
    // Yes! Let's check server.js. We did not create a POST /api/wilayah/target-periode in server.js.
    // Let's write the endpoint in server.js.
    // Let's check first. Let's send the request.
    try {
      const res = await fetch('/api/wilayah/target-periode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kecamatan_id, target_persen, tanggal_mulai, tanggal_selesai })
      });
      const data = await res.json();
      if (res.ok) {
        formTargetSuccess.textContent = data.message;
        formTargetSuccess.classList.remove('hidden');
        targetForm.reset();
      } else {
        formTargetError.textContent = data.message || 'Gagal menyimpan target.';
        formTargetError.classList.remove('hidden');
      }
    } catch (err) {
      formTargetError.textContent = 'Gagal menyimpan target periode.';
      formTargetError.classList.remove('hidden');
    }
  });

  // ==========================================================================
  // MANAJEMEN USER TAB LOGIC (ADMIN)
  // ==========================================================================

  // Load users list and kecamatan list in User tab
  async function loadUsersTab() {
    formUserSuccess.classList.add('hidden');
    formUserError.classList.add('hidden');
    userForm.reset();
    usrId.value = '';
    btnCancelEditUser.classList.add('hidden');
    pwdRequiredStar.textContent = '*';
    userFormTitle.textContent = 'Tambah Pengguna Baru';

    try {
      // 1. Load users
      const res = await fetch('/api/users');
      const data = await res.json();
      
      if (!data.users || data.users.length === 0) {
        tblUsersBody.innerHTML = '<tr><td colspan="6" class="loading-td">Tidak ada data pengguna.</td></tr>';
        return;
      }

      tblUsersBody.innerHTML = '';
      data.users.forEach(u => {
        tblUsersBody.innerHTML += `
          <tr>
            <td><strong>${u.nama_lengkap}</strong></td>
            <td>${u.username}</td>
            <td><span class="role-badge">${u.role.toUpperCase()}</span></td>
            <td>${u.nama_kec || '-'}</td>
            <td><span class="badge ${u.is_active ? 'badge-success' : 'badge-danger'}">${u.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
            <td>
              <button class="btn-icon-sm btn-edit-user" data-id="${u.id}" title="Edit User">
                <i data-lucide="edit"></i>
              </button>
              <button class="btn-icon-sm btn-icon-danger btn-delete-user" data-id="${u.id}" title="Hapus User">
                <i data-lucide="trash-2"></i>
              </button>
            </td>
          </tr>
        `;
      });

      lucide.createIcons();

      // Bind edit and delete events
      document.querySelectorAll('.btn-edit-user').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = parseInt(btn.getAttribute('data-id'));
          const u = data.users.find(x => x.id === id);
          if (u) {
            userFormTitle.textContent = 'Edit Pengguna';
            usrId.value = u.id;
            usrNama.value = u.nama_lengkap;
            usrUsername.value = u.username;
            usrRole.value = u.role;
            usrKecamatan.value = u.kecamatan_id || '';
            usrActive.checked = !!u.is_active;
            usrPassword.value = ''; // Leave password blank on edit unless changing
            pwdRequiredStar.textContent = '(Kosongkan jika tidak diubah)';
            btnCancelEditUser.classList.remove('hidden');
          }
        });
      });

      document.querySelectorAll('.btn-delete-user').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Apakah Anda yakin ingin menghapus akun pengguna ini?')) return;
          const id = btn.getAttribute('data-id');
          await deleteUser(id);
        });
      });

      // 2. Load Kecamatan in User form
      const resKec = await fetch('/api/wilayah/kecamatan');
      const dataKec = await resKec.json();
      
      usrKecamatan.innerHTML = '<option value="">Semua Kecamatan / Bukan PML</option>';
      dataKec.kecamatan.forEach(k => {
        usrKecamatan.innerHTML += `
          <option value="${k.id}">PML di Kecamatan ${k.nama_kec}</option>
        `;
      });

    } catch (err) {
      console.error(err);
    }
  }

  // Delete User Account
  async function deleteUser(id) {
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        loadUsersTab();
      } else {
        alert(data.message || 'Gagal menghapus user.');
      }
    } catch (err) {
      alert('Gagal terhubung ke server.');
    }
  }

  // Cancel edit user
  btnCancelEditUser.addEventListener('click', () => {
    loadUsersTab();
  });

  // User Form Submission (Create/Update)
  userForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    formUserSuccess.classList.add('hidden');
    formUserError.classList.add('hidden');

    const id = usrId.value;
    const nama_lengkap = usrNama.value;
    const username = usrUsername.value;
    const password = usrPassword.value;
    const role = usrRole.value;
    const kecamatan_id = usrKecamatan.value;
    const is_active = usrActive.checked;

    if (!id && !password) {
      formUserError.textContent = 'Password wajib diisi untuk pengguna baru.';
      formUserError.classList.remove('hidden');
      return;
    }

    try {
      const url = id ? `/api/users/${id}` : '/api/users';
      const method = id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama_lengkap,
          username,
          password: password || undefined,
          role,
          kecamatan_id,
          is_active
        })
      });
      const data = await res.json();

      if (res.ok) {
        formUserSuccess.textContent = data.message;
        formUserSuccess.classList.remove('hidden');
        userForm.reset();
        loadUsersTab();
      } else {
        formUserError.textContent = data.message;
        formUserError.classList.remove('hidden');
      }
    } catch (err) {
      formUserError.textContent = 'Gagal menyimpan akun.';
      formUserError.classList.remove('hidden');
    }
  });

  // ==========================================================================
  // EXPORT EXCEL LOGIC
  // ==========================================================================

  btnDownloadExcel.addEventListener('click', () => {
    // Open in a new tab to trigger download
    window.open('/api/export/excel', '_blank');
  });

});
