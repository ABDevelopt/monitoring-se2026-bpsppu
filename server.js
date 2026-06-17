require('dotenv').config();
const express = require('express');
const path = require('path');
const os = require('os');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const xlsx = require('xlsx');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'secretse2026';

app.use(express.json());
app.use(cookieParser());

// Database Connection Pool
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '3306'),
  connectionLimit: 10
};

const pool = mysql.createPool(dbConfig);

// Test DB connection on startup
async function testDbConnection() {
  try {
    const conn = await pool.getConnection();
    console.log(`✅ Database connected: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
    conn.release();
    return true;
  } catch (err) {
    console.error(`❌ Database connection FAILED: ${err.code} - ${err.message}`);
    console.error(`   Host: ${dbConfig.host}:${dbConfig.port}`);
    console.error(`   Database: ${dbConfig.database}`);
    console.error(`   User: ${dbConfig.user}`);
    console.error(`   💡 Pastikan MySQL berjalan dan konfigurasi .env sudah benar.`);
    return false;
  }
}

// ==========================================================================
// Middleware Functions
// ==========================================================================

// Authenticate JWT Token from Cookies
const authenticateToken = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized: Sesi login tidak ditemukan.' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.clearCookie('token');
    return res.status(403).json({ status: 'error', message: 'Forbidden: Sesi tidak valid atau kedaluwarsa.' });
  }
};

// Check User Role Privileges
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ status: 'error', message: 'Forbidden: Hak akses tidak mencukupi.' });
    }
    next();
  };
};

// Serve static assets from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================================================
// Authentication Endpoints
// ==========================================================================

// User Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ status: 'error', message: 'Username dan password wajib diisi.' });
  }

  try {
    const [users] = await pool.query('SELECT * FROM user WHERE username = ? LIMIT 1', [username]);
    const user = users[0];

    if (!user || !user.is_active) {
      return res.status(401).json({ status: 'error', message: 'Akun tidak ditemukan atau tidak aktif.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ status: 'error', message: 'Kata sandi salah.' });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, nama_lengkap: user.nama_lengkap, kecamatan_id: user.kecamatan_id },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Set Cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 8 * 60 * 60 * 1000 // 8 hours
    });

    res.json({
      status: 'success',
      user: {
        id: user.id,
        username: user.username,
        nama_lengkap: user.nama_lengkap,
        role: user.role,
        kecamatan_id: user.kecamatan_id
      }
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// User Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ status: 'success', message: 'Logout berhasil.' });
});

// Get Current User Profile
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ status: 'success', user: req.user });
});

// ==========================================================================
// Dashboard Telemetry & Stats Endpoints
// ==========================================================================

// Fetch Dashboard KPI stats, progress tables
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const { role, kecamatan_id } = req.user;

    // Build filter based on PML role limits
    let kecFilterSql = '';
    let pmlKecId = null;
    if (role === 'pml' && kecamatan_id) {
      kecFilterSql = `AND k.id = ${kecamatan_id}`;
      pmlKecId = kecamatan_id;
    }

    // 1. KPI Counts
    // Total SLS and Sub-SLS
    const [slsCounts] = await pool.query(`
      SELECT 
        COUNT(DISTINCT s.id) AS total_sls,
        COUNT(DISTINCT ss.id) AS total_sub_sls,
        SUM(ss.total_muatan) AS total_muatan
      FROM sub_sls ss
      JOIN sls s ON ss.sls_id = s.id
      JOIN desa d ON s.desa_id = d.id
      JOIN kecamatan k ON d.kecamatan_id = k.id
      WHERE 1=1 ${kecFilterSql}
    `);

    // Completed Sub-SLS (approved = target or status = selesai_100%)
    // Let's check from the latest report of each sub-sls
    const [completedCounts] = await pool.query(`
      SELECT COUNT(DISTINCT ss.id) AS completed_sub_sls
      FROM sub_sls ss
      JOIN sls s ON ss.sls_id = s.id
      JOIN desa d ON s.desa_id = d.id
      JOIN kecamatan k ON d.kecamatan_id = k.id
      JOIN (
        SELECT lh1.* FROM laporan_harian lh1
        JOIN (
          SELECT sub_sls_id, MAX(tanggal) AS max_date 
          FROM laporan_harian GROUP BY sub_sls_id
        ) lh2 ON lh1.sub_sls_id = lh2.sub_sls_id AND lh1.tanggal = lh2.max_date
      ) lr ON ss.id = lr.sub_sls_id
      WHERE lr.status = 'selesai_100%' ${kecFilterSql}
    `);

    // Active issues (Tidak selesai / Ada kendala)
    const [issueCounts] = await pool.query(`
      SELECT COUNT(DISTINCT ss.id) AS active_issues
      FROM sub_sls ss
      JOIN sls s ON ss.sls_id = s.id
      JOIN desa d ON s.desa_id = d.id
      JOIN kecamatan k ON d.kecamatan_id = k.id
      JOIN (
        SELECT lh1.* FROM laporan_harian lh1
        JOIN (
          SELECT sub_sls_id, MAX(tanggal) AS max_date 
          FROM laporan_harian GROUP BY sub_sls_id
        ) lh2 ON lh1.sub_sls_id = lh2.sub_sls_id AND lh1.tanggal = lh2.max_date
      ) lr ON ss.id = lr.sub_sls_id
      WHERE lr.status = 'tidak_selesai_kendala' ${kecFilterSql}
    `);

    // Approved sum for progress percentage
    const [approvedSum] = await pool.query(`
      SELECT SUM(lr.jml_approved) AS approved_total
      FROM sub_sls ss
      JOIN sls s ON ss.sls_id = s.id
      JOIN desa d ON s.desa_id = d.id
      JOIN kecamatan k ON d.kecamatan_id = k.id
      JOIN (
        SELECT lh1.* FROM laporan_harian lh1
        JOIN (
          SELECT sub_sls_id, MAX(tanggal) AS max_date 
          FROM laporan_harian GROUP BY sub_sls_id
        ) lh2 ON lh1.sub_sls_id = lh2.sub_sls_id AND lh1.tanggal = lh2.max_date
      ) lr ON ss.id = lr.sub_sls_id
      WHERE 1=1 ${kecFilterSql}
    `);

    // Overall Progress Calculation
    const totalMuatanGlobal = slsCounts[0]?.total_muatan || 0;
    const totalApprovedGlobal = approvedSum[0]?.approved_total || 0;
    let progressGlobalPct = 0;
    if (totalMuatanGlobal > 0) {
      progressGlobalPct = ((totalApprovedGlobal / totalMuatanGlobal) * 100).toFixed(1);
    }

    // 2. Table: Progress by Kecamatan
    const [progressKecamatan] = await pool.query(`
      SELECT 
        k.id AS kecamatan_id,
        k.nama_kec,
        tp.target_persen AS target_periode,
        SUM(ss.total_muatan) AS total_muatan,
        COALESCE(SUM(lr.jml_approved), 0) AS total_approved,
        COALESCE(SUM(lr.jml_submit), 0) AS total_submit,
        COALESCE(SUM(lr.jml_pending), 0) AS total_pending,
        COALESCE(SUM(lr.jml_reject), 0) AS total_reject,
        COALESCE(SUM(lr.jml_open), 0) AS total_open
      FROM kecamatan k
      LEFT JOIN target_periode tp ON tp.kecamatan_id = k.id
      LEFT JOIN desa d ON d.kecamatan_id = k.id
      LEFT JOIN sls s ON s.desa_id = d.id
      LEFT JOIN sub_sls ss ON ss.sls_id = s.id
      LEFT JOIN (
        SELECT lh1.* FROM laporan_harian lh1
        JOIN (
          SELECT sub_sls_id, MAX(tanggal) AS max_date 
          FROM laporan_harian GROUP BY sub_sls_id
        ) lh2 ON lh1.sub_sls_id = lh2.sub_sls_id AND lh1.tanggal = lh2.max_date
      ) lr ON ss.id = lr.sub_sls_id
      WHERE 1=1 ${kecFilterSql}
      GROUP BY k.id, k.nama_kec, tp.target_persen
    `);

    // 3. Table: Progress by SLS (Limited to top 15 or filtered by Kecamatan)
    const [progressSls] = await pool.query(`
      SELECT 
        s.id AS sls_id,
        s.nama_sls,
        d.nama_desa,
        k.nama_kec,
        SUM(ss.total_muatan) AS total_muatan,
        COALESCE(SUM(lr.jml_approved), 0) AS total_approved,
        COALESCE(SUM(lr.jml_submit), 0) AS total_submit,
        COALESCE(SUM(lr.jml_pending), 0) AS total_pending
      FROM sls s
      JOIN desa d ON s.desa_id = d.id
      JOIN kecamatan k ON d.kecamatan_id = k.id
      LEFT JOIN sub_sls ss ON ss.sls_id = s.id
      LEFT JOIN (
        SELECT lh1.* FROM laporan_harian lh1
        JOIN (
          SELECT sub_sls_id, MAX(tanggal) AS max_date 
          FROM laporan_harian GROUP BY sub_sls_id
        ) lh2 ON lh1.sub_sls_id = lh2.sub_sls_id AND lh1.tanggal = lh2.max_date
      ) lr ON ss.id = lr.sub_sls_id
      WHERE 1=1 ${kecFilterSql}
      GROUP BY s.id, s.nama_sls, d.nama_desa, k.nama_kec
      ORDER BY total_muatan DESC
      LIMIT 30
    `);

    // 4. Table: Progress by PML
    const [progressPml] = await pool.query(`
      SELECT 
        ss.nama_pml,
        ss.nama_korlap,
        SUM(ss.total_muatan) AS total_muatan,
        COALESCE(SUM(lr.jml_approved), 0) AS total_approved,
        COUNT(DISTINCT ss.id) AS total_sub_sls,
        SUM(CASE WHEN lr.status = 'selesai_100%' THEN 1 ELSE 0 END) AS completed_sub_sls
      FROM sub_sls ss
      JOIN sls s ON ss.sls_id = s.id
      JOIN desa d ON s.desa_id = d.id
      JOIN kecamatan k ON d.kecamatan_id = k.id
      LEFT JOIN (
        SELECT lh1.* FROM laporan_harian lh1
        JOIN (
          SELECT sub_sls_id, MAX(tanggal) AS max_date 
          FROM laporan_harian GROUP BY sub_sls_id
        ) lh2 ON lh1.sub_sls_id = lh2.sub_sls_id AND lh1.tanggal = lh2.max_date
      ) lr ON ss.id = lr.sub_sls_id
      WHERE 1=1 ${kecFilterSql} AND ss.nama_pml IS NOT NULL
      GROUP BY ss.nama_pml, ss.nama_korlap
    `);

    // Check environment status
    const isPassengerActive = !!process.env.PORT;
    const dbStatus = 'connected';

    res.json({
      status: 'success',
      kpis: {
        total_sls: slsCounts[0]?.total_sls || 0,
        total_sub_sls: slsCounts[0]?.total_sub_sls || 0,
        completed_sub_sls: completedCounts[0]?.completed_sub_sls || 0,
        active_issues: issueCounts[0]?.active_issues || 0,
        total_muatan: totalMuatanGlobal,
        total_approved: totalApprovedGlobal,
        progress_percentage: progressGlobalPct
      },
      tables: {
        kecamatan: progressKecamatan,
        sls: progressSls,
        pml: progressPml
      },
      hostingDiagnostics: {
        passengerPortBound: isPassengerActive,
        dbStatus: dbStatus
      }
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ==========================================================================
// Early Warning System (EWS) Endpoints
// ==========================================================================

// Fetch EWS warnings & constraints logs
app.get('/api/dashboard/ews', authenticateToken, async (req, res) => {
  try {
    const { role, kecamatan_id } = req.user;
    let kecFilterSql = '';
    if (role === 'pml' && kecamatan_id) {
      kecFilterSql = `AND k.id = ${kecamatan_id}`;
    }

    // Fetch all sub-sls and their latest report to calculate warnings
    const [subSlsRows] = await pool.query(`
      SELECT 
        ss.id AS sub_sls_id,
        ss.id_sub_sls,
        ss.nama_sub_sls,
        ss.nama_pcl,
        ss.nama_pml,
        ss.nama_korlap,
        ss.total_muatan,
        k.nama_kec,
        d.nama_desa,
        s.nama_sls,
        lr.id AS laporan_id,
        lr.tanggal AS last_report_date,
        lr.jml_approved,
        lr.jml_submit,
        lr.jml_pending,
        lr.jml_reject,
        lr.jml_open,
        lr.status AS last_report_status,
        lr.keterangan AS last_report_keterangan,
        tp.tanggal_selesai AS target_deadline,
        tp.target_persen
      FROM sub_sls ss
      JOIN sls s ON ss.sls_id = s.id
      JOIN desa d ON s.desa_id = d.id
      JOIN kecamatan k ON d.kecamatan_id = k.id
      LEFT JOIN target_periode tp ON tp.kecamatan_id = k.id
      LEFT JOIN (
        SELECT lh1.* FROM laporan_harian lh1
        JOIN (
          SELECT sub_sls_id, MAX(tanggal) AS max_date 
          FROM laporan_harian GROUP BY sub_sls_id
        ) lh2 ON lh1.sub_sls_id = lh2.sub_sls_id AND lh1.tanggal = lh2.max_date
      ) lr ON ss.id = lr.sub_sls_id
      WHERE 1=1 ${kecFilterSql}
    `);

    const warnings = [];
    const today = new Date();

    subSlsRows.forEach(row => {
      // Calculate progress percentage
      let progress = 0;
      const approved = row.jml_approved || 0;
      const total = row.total_muatan || 0;

      if (total === 0) {
        if (!row.laporan_id) {
          progress = 0;
        } else if (row.last_report_status === 'selesai_sebagian') {
          progress = 50;
        } else if (row.last_report_status === 'selesai_100%') {
          progress = 100;
        }
      } else {
        progress = parseFloat(((approved / total) * 100).toFixed(1));
      }

      // Check Warning 1: KRITIS
      // Not 100% completed AND (No report ever OR last report was >= 3 days ago)
      let daysSinceLastReport = 999;
      if (row.last_report_date) {
        const lastDate = new Date(row.last_report_date);
        daysSinceLastReport = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      }

      const isKritis = (progress < 100) && (daysSinceLastReport >= 3);

      // Check Warning 2: PERHATIAN
      // Last report status is 'tidak_selesai_kendala'
      const isPerhatian = row.last_report_status === 'tidak_selesai_kendala';

      // Check Warning 3: RISIKO
      // Time left <= 2 days towards target deadline AND progress < 80%
      let daysToDeadline = 999;
      if (row.target_deadline) {
        const deadlineDate = new Date(row.target_deadline);
        daysToDeadline = Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      }

      const isRisiko = (row.target_deadline && daysToDeadline <= 2 && daysToDeadline >= 0 && progress < 80);

      // Add to warning array if active
      if (isKritis || isPerhatian || isRisiko) {
        let level = 'Risiko';
        let detail = '';

        if (isKritis) {
          level = 'Kritis';
          detail = `Belum selesai 100% dan tidak ada laporan baru selama ${daysSinceLastReport === 999 ? '>= 3' : daysSinceLastReport} hari berturut-turut.`;
        } else if (isPerhatian) {
          level = 'Perhatian';
          detail = `Laporan terakhir mencatat kendala: "${row.last_report_keterangan || 'Tanpa keterangan'}"`;
        } else if (isRisiko) {
          level = 'Risiko';
          detail = `Sisa ${daysToDeadline} hari menuju batas akhir (${row.target_deadline.toISOString().split('T')[0]}), namun progres masih ${progress}%.`;
        }

        warnings.push({
          sub_sls_id: row.sub_sls_id,
          id_sub_sls: row.id_sub_sls,
          nama_sub_sls: row.nama_sub_sls,
          nama_kec: row.nama_kec,
          nama_desa: row.nama_desa,
          nama_sls: row.nama_sls,
          nama_pcl: row.nama_pcl || 'Belum ditunjuk',
          nama_pml: row.nama_pml || 'Belum ditunjuk',
          nama_korlap: row.nama_korlap || 'Belum ditunjuk',
          progress: progress,
          total_muatan: total,
          approved: approved,
          level: level,
          detail: detail,
          last_report_date: row.last_report_date ? row.last_report_date.toISOString().split('T')[0] : 'Belum pernah lapor'
        });
      }
    });

    res.json({
      status: 'success',
      warnings: warnings
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ==========================================================================
// Laporan Harian (Daily Reports) Endpoints
// ==========================================================================

// Get list of daily reports
app.get('/api/laporan', authenticateToken, async (req, res) => {
  try {
    const { role, kecamatan_id, id: userId } = req.user;
    let filterSql = '';
    
    // PML only sees reports in their assigned Kecamatan
    if (role === 'pml' && kecamatan_id) {
      filterSql = `AND k.id = ${kecamatan_id}`;
    }
    // PCL only sees their own assigned reports
    else if (role === 'pcl') {
      filterSql = `AND ss.id IN (SELECT sub_sls_id FROM tugas_pcl WHERE pcl_id = ${userId})`;
    }

    const [reports] = await pool.query(`
      SELECT 
        lh.id,
        lh.tanggal,
        lh.jml_open,
        lh.jml_submit,
        lh.jml_reject,
        lh.jml_pending,
        lh.jml_approved,
        lh.status,
        lh.keterangan,
        lh.sub_sls_id,
        ss.id_sub_sls,
        ss.nama_sub_sls,
        ss.total_muatan,
        u.nama_lengkap AS pembuat_laporan,
        k.nama_kec,
        d.nama_desa,
        s.nama_sls
      FROM laporan_harian lh
      JOIN sub_sls ss ON lh.sub_sls_id = ss.id
      JOIN sls s ON ss.sls_id = s.id
      JOIN desa d ON s.desa_id = d.id
      JOIN kecamatan k ON d.kecamatan_id = k.id
      JOIN user u ON lh.user_id = u.id
      WHERE 1=1 ${filterSql}
      ORDER BY lh.tanggal DESC, lh.id DESC
      LIMIT 100
    `);

    res.json({ status: 'success', reports });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Create a new daily report
app.post('/api/laporan', authenticateToken, authorizeRoles('admin', 'korlap', 'pml'), async (req, res) => {
  const { tanggal, sub_sls_id, jml_open, jml_submit, jml_reject, jml_pending, jml_approved, status, keterangan } = req.body;
  const { role, kecamatan_id, id: userId } = req.user;

  if (!tanggal || !sub_sls_id || status === undefined) {
    return res.status(400).json({ status: 'error', message: 'Parameter tanggal, sub_sls_id, dan status wajib diisi.' });
  }

  try {
    // Verify PML access restriction
    if (role === 'pml' && kecamatan_id) {
      const [subSlsCheck] = await pool.query(`
        SELECT k.id AS kecamatan_id 
        FROM sub_sls ss
        JOIN sls s ON ss.sls_id = s.id
        JOIN desa d ON s.desa_id = d.id
        JOIN kecamatan k ON d.kecamatan_id = k.id
        WHERE ss.id = ? LIMIT 1
      `, [sub_sls_id]);
      
      if (!subSlsCheck[0] || subSlsCheck[0].kecamatan_id !== kecamatan_id) {
        return res.status(403).json({ status: 'error', message: 'Forbidden: Anda hanya bisa mengisi laporan untuk kecamatan Anda.' });
      }
    }

    // Insert or update on duplicate (Unique: [tanggal, sub_sls_id])
    await pool.query(`
      INSERT INTO laporan_harian 
        (tanggal, sub_sls_id, jml_open, jml_submit, jml_reject, jml_pending, jml_approved, status, keterangan, user_id) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        jml_open = VALUES(jml_open),
        jml_submit = VALUES(jml_submit),
        jml_reject = VALUES(jml_reject),
        jml_pending = VALUES(jml_pending),
        jml_approved = VALUES(jml_approved),
        status = VALUES(status),
        keterangan = VALUES(keterangan),
        user_id = VALUES(user_id)
    `, [
      tanggal, 
      sub_sls_id, 
      jml_open || 0, 
      jml_submit || 0, 
      jml_reject || 0, 
      jml_pending || 0, 
      jml_approved || 0, 
      status, 
      keterangan || null, 
      userId
    ]);

    res.json({ status: 'success', message: 'Laporan harian berhasil disimpan.' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Delete a daily report
app.delete('/api/laporan/:id', authenticateToken, authorizeRoles('admin', 'korlap', 'pml'), async (req, res) => {
  const { id } = req.params;
  const { role, kecamatan_id } = req.user;

  try {
    // Verify PML access restriction before deletion
    if (role === 'pml' && kecamatan_id) {
      const [reportCheck] = await pool.query(`
        SELECT k.id AS kecamatan_id 
        FROM laporan_harian lh
        JOIN sub_sls ss ON lh.sub_sls_id = ss.id
        JOIN sls s ON ss.sls_id = s.id
        JOIN desa d ON s.desa_id = d.id
        JOIN kecamatan k ON d.kecamatan_id = k.id
        WHERE lh.id = ? LIMIT 1
      `, [id]);

      if (!reportCheck[0] || reportCheck[0].kecamatan_id !== kecamatan_id) {
        return res.status(403).json({ status: 'error', message: 'Forbidden: Anda tidak berwenang menghapus laporan wilayah ini.' });
      }
    }

    await pool.query('DELETE FROM laporan_harian WHERE id = ?', [id]);
    res.json({ status: 'success', message: 'Laporan berhasil dihapus.' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ==========================================================================
// User Management Endpoints
// ==========================================================================

// Get list of all users
app.get('/api/users', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const [users] = await pool.query(`
      SELECT u.id, u.nama_lengkap, u.username, u.role, u.is_active, u.kecamatan_id, k.nama_kec 
      FROM user u 
      LEFT JOIN kecamatan k ON u.kecamatan_id = k.id
      ORDER BY u.role, u.id
    `);
    res.json({ status: 'success', users });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Create new user
app.post('/api/users', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const { nama_lengkap, username, password, role, is_active, kecamatan_id } = req.body;
  if (!nama_lengkap || !username || !password || !role) {
    return res.status(400).json({ status: 'error', message: 'Semua kolom bertanda bintang (*) wajib diisi.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(`
      INSERT INTO user (nama_lengkap, username, password, role, is_active, kecamatan_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [nama_lengkap, username, hashedPassword, role, is_active !== false, kecamatan_id || null]);
    
    res.json({ status: 'success', message: 'User berhasil ditambahkan.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ status: 'error', message: 'Username sudah digunakan oleh akun lain.' });
    }
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Update user settings
app.put('/api/users/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const { id } = req.params;
  const { nama_lengkap, username, password, role, is_active, kecamatan_id } = req.body;

  if (!nama_lengkap || !username || !role) {
    return res.status(400).json({ status: 'error', message: 'Kolom Nama, Username, dan Peran wajib diisi.' });
  }

  try {
    let query = `
      UPDATE user 
      SET nama_lengkap = ?, username = ?, role = ?, is_active = ?, kecamatan_id = ?
    `;
    const params = [nama_lengkap, username, role, is_active !== false, kecamatan_id || null];

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      query += `, password = ? `;
      params.push(hashedPassword);
    }

    query += ` WHERE id = ?`;
    params.push(id);

    await pool.query(query, params);
    res.json({ status: 'success', message: 'Profil user berhasil diperbarui.' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Delete user account
app.delete('/api/users/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const { id } = req.params;
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ status: 'error', message: 'Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif.' });
  }

  try {
    await pool.query('DELETE FROM user WHERE id = ?', [id]);
    res.json({ status: 'success', message: 'Akun user berhasil dihapus.' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ==========================================================================
// Master Data & Wilayah Endpoints
// ==========================================================================

// Get list of Kecamatan
app.get('/api/wilayah/kecamatan', authenticateToken, async (req, res) => {
  try {
    const { role, kecamatan_id } = req.user;
    let query = 'SELECT * FROM kecamatan ORDER BY kode_kec';
    let params = [];
    
    if (role === 'pml' && kecamatan_id) {
      query = 'SELECT * FROM kecamatan WHERE id = ?';
      params.push(kecamatan_id);
    }
    
    const [rows] = await pool.query(query, params);
    res.json({ status: 'success', kecamatan: rows });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Get Sub-SLS details, including assignments
app.get('/api/wilayah/sub-sls', authenticateToken, async (req, res) => {
  try {
    const { role, kecamatan_id, id: userId } = req.user;
    let filterSql = '';
    
    if (role === 'pml' && kecamatan_id) {
      filterSql = `AND k.id = ${kecamatan_id}`;
    } else if (role === 'pcl') {
      filterSql = `AND ss.id IN (SELECT sub_sls_id FROM tugas_pcl WHERE pcl_id = ${userId})`;
    }

    const [rows] = await pool.query(`
      SELECT 
        ss.id,
        ss.kode_sub_sls,
        ss.id_sub_sls,
        ss.id_sub_sls_alt,
        ss.nama_sub_sls,
        ss.nama_korlap,
        ss.nama_pml,
        ss.nama_pcl,
        ss.total_muatan,
        s.nama_sls,
        d.nama_desa,
        k.nama_kec
      FROM sub_sls ss
      JOIN sls s ON ss.sls_id = s.id
      JOIN desa d ON s.desa_id = d.id
      JOIN kecamatan k ON d.kecamatan_id = k.id
      WHERE 1=1 ${filterSql}
      ORDER BY k.kode_kec, d.kode_desa, s.kode_sls, ss.id_sub_sls
    `);
    res.json({ status: 'success', subSls: rows });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Get PCL users list for dropdown alokasi
app.get('/api/wilayah/pcls', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const [pcls] = await pool.query("SELECT id, nama_lengkap FROM user WHERE role = 'pcl' AND is_active = true ORDER BY nama_lengkap");
    res.json({ status: 'success', pcls });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Update Sub-SLS officer allocation
app.put('/api/wilayah/sub-sls/:id/alokasi', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const { id } = req.params;
  const { nama_korlap, nama_pml, pcl_id } = req.body;

  try {
    // Fetch target PCL name
    let pclName = null;
    if (pcl_id) {
      const [pclUser] = await pool.query('SELECT nama_lengkap FROM user WHERE id = ? LIMIT 1', [pcl_id]);
      pclName = pclUser[0]?.nama_lengkap || null;
    }

    // Begin transaction
    await pool.query('START TRANSACTION');

    // 1. Update text fields in sub_sls
    await pool.query(`
      UPDATE sub_sls 
      SET nama_korlap = ?, nama_pml = ?, nama_pcl = ?
      WHERE id = ?
    `, [nama_korlap || null, nama_pml || null, pclName, id]);

    // 2. Manage penugasan tugas_pcl relation
    // Clear old link
    await pool.query('DELETE FROM tugas_pcl WHERE sub_sls_id = ?', [id]);
    
    // Add new link if PCL selected
    if (pcl_id) {
      await pool.query('INSERT INTO tugas_pcl (pcl_id, sub_sls_id) VALUES (?, ?)', [pcl_id, id]);
    }

    await pool.query('COMMIT');
    res.json({ status: 'success', message: 'Alokasi petugas berhasil disimpan.' });
  } catch (err) {
    await pool.query('ROLLBACK');
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Set target period for Kecamatan
app.post('/api/wilayah/target-periode', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const { kecamatan_id, target_persen, tanggal_mulai, tanggal_selesai } = req.body;
  if (!kecamatan_id || !target_persen || !tanggal_mulai || !tanggal_selesai) {
    return res.status(400).json({ status: 'error', message: 'Semua kolom wajib diisi.' });
  }

  try {
    const [existing] = await pool.query('SELECT id FROM target_periode WHERE kecamatan_id = ? LIMIT 1', [kecamatan_id]);
    if (existing[0]) {
      await pool.query(`
        UPDATE target_periode 
        SET target_persen = ?, tanggal_mulai = ?, tanggal_selesai = ?
        WHERE kecamatan_id = ?
      `, [target_persen, tanggal_mulai, tanggal_selesai, kecamatan_id]);
    } else {
      await pool.query(`
        INSERT INTO target_periode (target_persen, tanggal_mulai, tanggal_selesai, kecamatan_id)
        VALUES (?, ?, ?, ?)
      `, [target_persen, tanggal_mulai, tanggal_selesai, kecamatan_id]);
    }
    res.json({ status: 'success', message: 'Target periode berhasil ditetapkan.' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ==========================================================================
// Excel Export Endpoint
// ==========================================================================

// Excel export endpoint generating workbook sheets
app.get('/api/export/excel', authenticateToken, async (req, res) => {
  try {
    const { role, kecamatan_id } = req.user;
    let filterSql = '';
    if (role === 'pml' && kecamatan_id) {
      filterSql = `AND k.id = ${kecamatan_id}`;
    }

    // 1. Fetch Summary Data per Sub-SLS
    const [subSlsRows] = await pool.query(`
      SELECT 
        k.nama_kec AS 'Kecamatan',
        d.nama_desa AS 'Desa/Kelurahan',
        s.nama_sls AS 'SLS (RT)',
        ss.id_sub_sls AS 'ID Sub-SLS',
        ss.id_sub_sls_alt AS 'ID Sub-SLS Alternatif',
        ss.nama_sub_sls AS 'Nama Sub-SLS',
        ss.nama_korlap AS 'Koordinator Lapangan',
        ss.nama_pml AS 'Pengawas (PML)',
        ss.nama_pcl AS 'Pencacah (PCL)',
        ss.total_muatan AS 'Target Muatan Usaha',
        COALESCE(lr.jml_open, 0) AS 'Open',
        COALESCE(lr.jml_submit, 0) AS 'Submit',
        COALESCE(lr.jml_reject, 0) AS 'Reject',
        COALESCE(lr.jml_pending, 0) AS 'Pending',
        COALESCE(lr.jml_approved, 0) AS 'Approved',
        COALESCE(lr.status, 'Belum Lapor') AS 'Status Laporan',
        COALESCE(lr.keterangan, '-') AS 'Keterangan/Kendala',
        COALESCE(lr.tanggal, '-') AS 'Tanggal Update Terakhir'
      FROM sub_sls ss
      JOIN sls s ON ss.sls_id = s.id
      JOIN desa d ON s.desa_id = d.id
      JOIN kecamatan k ON d.kecamatan_id = k.id
      LEFT JOIN (
        SELECT lh1.* FROM laporan_harian lh1
        JOIN (
          SELECT sub_sls_id, MAX(tanggal) AS max_date 
          FROM laporan_harian GROUP BY sub_sls_id
        ) lh2 ON lh1.sub_sls_id = lh2.sub_sls_id AND lh1.tanggal = lh2.max_date
      ) lr ON ss.id = lr.sub_sls_id
      WHERE 1=1 ${filterSql}
      ORDER BY k.kode_kec, d.kode_desa, s.kode_sls, ss.id_sub_sls
    `);

    // Parse and add calculated progress columns to summary rows
    const summaryData = subSlsRows.map(row => {
      let progress = 0;
      const approved = row['Approved'] || 0;
      const target = row['Target Muatan Usaha'] || 0;
      const status = row['Status Laporan'];

      if (target === 0) {
        if (status === 'Belum Lapor') {
          progress = 0;
        } else if (status === 'selesai_sebagian') {
          progress = 50;
        } else if (status === 'selesai_100%') {
          progress = 100;
        }
      } else {
        progress = parseFloat(((approved / target) * 100).toFixed(1));
      }

      return {
        ...row,
        'Progres Kerja (%)': progress
      };
    });

    // 2. Fetch Active Issues (Logs Kendala)
    const [issueRows] = await pool.query(`
      SELECT 
        k.nama_kec AS 'Kecamatan',
        d.nama_desa AS 'Desa/Kelurahan',
        s.nama_sls AS 'SLS (RT)',
        ss.id_sub_sls AS 'ID Sub-SLS',
        ss.nama_pcl AS 'Pencacah (PCL)',
        ss.nama_pml AS 'Pengawas (PML)',
        lh.tanggal AS 'Tanggal Temuan',
        lh.keterangan AS 'Keterangan Kendala/Masalah'
      FROM laporan_harian lh
      JOIN sub_sls ss ON lh.sub_sls_id = ss.id
      JOIN sls s ON ss.sls_id = s.id
      JOIN desa d ON s.desa_id = d.id
      JOIN kecamatan k ON d.kecamatan_id = k.id
      WHERE lh.status = 'tidak_selesai_kendala' ${filterSql}
      ORDER BY lh.tanggal DESC
    `);

    // Create workbook
    const wb = xlsx.utils.book_new();

    // Sheet 1: Summary Progress
    const wsSummary = xlsx.utils.json_to_sheet(summaryData);
    xlsx.utils.book_append_sheet(wb, wsSummary, 'Summary Progres Lapangan');

    // Sheet 2: Active Issues
    const wsIssues = xlsx.utils.json_to_sheet(issueRows);
    xlsx.utils.book_append_sheet(wb, wsIssues, 'Log Kendala Lapangan');

    // Write to Buffer
    const excelBuffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Send download header
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Laporan_Monitoring_SE2026.xlsx');
    res.end(excelBuffer);

  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Start Server listening
app.listen(PORT, async () => {
  console.log(`==================================================`);
  console.log(`🚀 Sensus Ekonomi 2026 monitoring server running on port ${PORT}`);
  console.log(`📂 Web assets serving from: ${path.join(__dirname, 'public')}`);
  console.log(`==================================================`);
  // Test DB connection after server starts
  await testDbConnection();
});
