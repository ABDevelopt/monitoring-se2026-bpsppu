/**
 * generate_sql.js
 * Generate SQL import file dari kelompok_populasi_pml_pcl_korlap_muatan.json
 * Jalankan: node generate_sql.js
 * Output: setup_database.sql (upload ke phpMyAdmin atau jalankan via SSH)
 */

const fs = require('fs');
const path = require('path');

// Utility: escape SQL string value
function esc(s) {
  if (s == null) return 'NULL';
  return "'" + String(s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r') + "'";
}

// Utility: convert name to username
function toUsername(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .substring(0, 40);
}

// Read JSON
const jsonPath = path.join(__dirname, 'kelompok_populasi_pml_pcl_korlap_muatan.json');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

const lines = [];

// ----------------------------------------------------------------
// Header
// ----------------------------------------------------------------
lines.push('-- ====================================================');
lines.push('-- SQL SETUP: Sensus Ekonomi 2026 - BPS PPU');
lines.push('-- Generated: ' + new Date().toISOString());
lines.push('-- ====================================================');
lines.push('SET FOREIGN_KEY_CHECKS=0;');
lines.push('SET NAMES utf8mb4;');
lines.push('');
lines.push('-- ====================================================');
lines.push('-- DROP TABLES LAMA (reset skema)');
lines.push('-- ====================================================');
lines.push('DROP TABLE IF EXISTS tugas_pcl;');
lines.push('DROP TABLE IF EXISTS laporan_harian;');
lines.push('DROP TABLE IF EXISTS target_periode;');
lines.push('DROP TABLE IF EXISTS sub_sls;');
lines.push('DROP TABLE IF EXISTS sls;');
lines.push('DROP TABLE IF EXISTS desa;');
lines.push('DROP TABLE IF EXISTS `user`;');
lines.push('DROP TABLE IF EXISTS kecamatan;');
lines.push('');

// ----------------------------------------------------------------
// CREATE TABLES
// ----------------------------------------------------------------
lines.push('-- ====================================================');
lines.push('-- TABLES');
lines.push('-- ====================================================');

lines.push(`CREATE TABLE IF NOT EXISTS kecamatan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kode_kec VARCHAR(10) UNIQUE NOT NULL,
  nama_kec VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

lines.push(`CREATE TABLE IF NOT EXISTS desa (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_desa VARCHAR(20) UNIQUE NOT NULL,
  kode_desa VARCHAR(10) NOT NULL,
  nama_desa VARCHAR(100) NOT NULL,
  kecamatan_id INT NOT NULL,
  FOREIGN KEY (kecamatan_id) REFERENCES kecamatan(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

lines.push(`CREATE TABLE IF NOT EXISTS sls (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kode_sls VARCHAR(20) NOT NULL,
  nama_sls VARCHAR(200) NOT NULL,
  desa_id INT NOT NULL,
  FOREIGN KEY (desa_id) REFERENCES desa(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

lines.push(`CREATE TABLE IF NOT EXISTS sub_sls (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kode_sub_sls VARCHAR(20) NOT NULL,
  id_sub_sls VARCHAR(50) UNIQUE NOT NULL,
  id_sub_sls_2025 VARCHAR(50) NULL,
  nama_korlap VARCHAR(100) NULL,
  nama_pml VARCHAR(100) NULL,
  nama_pcl VARCHAR(100) NULL,
  total_muatan INT DEFAULT 0,
  sls_id INT NOT NULL,
  FOREIGN KEY (sls_id) REFERENCES sls(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

lines.push(`CREATE TABLE IF NOT EXISTS \`user\` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama_lengkap VARCHAR(100) NOT NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin','korlap','pml','pcl') NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  kecamatan_id INT NULL,
  FOREIGN KEY (kecamatan_id) REFERENCES kecamatan(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

lines.push(`CREATE TABLE IF NOT EXISTS tugas_pcl (
  pcl_id INT NOT NULL,
  sub_sls_id INT NOT NULL,
  PRIMARY KEY (pcl_id, sub_sls_id),
  FOREIGN KEY (pcl_id) REFERENCES \`user\`(id) ON DELETE CASCADE,
  FOREIGN KEY (sub_sls_id) REFERENCES sub_sls(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

lines.push(`CREATE TABLE IF NOT EXISTS laporan_harian (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tanggal DATE NOT NULL,
  jml_open INT DEFAULT 0,
  jml_submit INT DEFAULT 0,
  jml_reject INT DEFAULT 0,
  jml_pending INT DEFAULT 0,
  jml_approved INT DEFAULT 0,
  status ENUM('selesai_100%','selesai_sebagian','tidak_selesai_kendala') NOT NULL,
  keterangan TEXT NULL,
  sub_sls_id INT NOT NULL,
  user_id INT NOT NULL,
  UNIQUE KEY uq_date_sub (tanggal, sub_sls_id),
  FOREIGN KEY (sub_sls_id) REFERENCES sub_sls(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES \`user\`(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

lines.push(`CREATE TABLE IF NOT EXISTS target_periode (
  id INT AUTO_INCREMENT PRIMARY KEY,
  target_persen DECIMAL(5,2) NOT NULL,
  tanggal_mulai DATE NOT NULL,
  tanggal_selesai DATE NOT NULL,
  kecamatan_id INT NOT NULL,
  FOREIGN KEY (kecamatan_id) REFERENCES kecamatan(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

lines.push('');

// ----------------------------------------------------------------
// KECAMATAN
// ----------------------------------------------------------------
lines.push('-- ====================================================');
lines.push('-- DATA KECAMATAN');
lines.push('-- ====================================================');
for (const kec of data) {
  lines.push(`INSERT IGNORE INTO kecamatan (kode_kec, nama_kec) VALUES (${esc(kec.kode_kec)}, ${esc(kec.nama_kec)});`);
}
lines.push('');

// ----------------------------------------------------------------
// DESA
// ----------------------------------------------------------------
lines.push('-- ====================================================');
lines.push('-- DATA DESA');
lines.push('-- ====================================================');
for (const kec of data) {
  for (const desa of (kec.desa || [])) {
    lines.push(`INSERT IGNORE INTO desa (id_desa, kode_desa, nama_desa, kecamatan_id) SELECT ${esc(desa.id_desa)}, ${esc(desa.kode_desa)}, ${esc(desa.nama_desa)}, id FROM kecamatan WHERE kode_kec=${esc(kec.kode_kec)};`);
  }
}
lines.push('');

// ----------------------------------------------------------------
// SLS + SUB_SLS
// ----------------------------------------------------------------
lines.push('-- ====================================================');
lines.push('-- DATA SLS & SUB_SLS');
lines.push('-- ====================================================');

const uniquePml    = new Map(); // nama -> kode_kec
const uniquePcl    = new Map();
const uniqueKorlap = new Map();
// Map id_subsls -> nama_pcl (for tugas_pcl)
const subSlsPcl = [];

for (const kec of data) {
  for (const desa of (kec.desa || [])) {
    for (const sls of (desa.sls || [])) {
      // SLS: insert using subquery to get desa_id
      lines.push(`INSERT INTO sls (kode_sls, nama_sls, desa_id) SELECT ${esc(sls.kode_sls)}, ${esc(sls.nama_sls)}, id FROM desa WHERE id_desa=${esc(desa.id_desa)};`);
      // Sub-SLS: group inserts using LAST_INSERT_ID() of the SLS above
      for (const subsls of (sls.subsls || [])) {
        lines.push(`INSERT IGNORE INTO sub_sls (kode_sub_sls, id_sub_sls, id_sub_sls_2025, nama_korlap, nama_pml, nama_pcl, total_muatan, sls_id) VALUES (${esc(subsls.kode_subsls)}, ${esc(subsls.id_subsls)}, ${esc(subsls.id_subsls_2025 || null)}, ${esc(subsls.nama_korlap || null)}, ${esc(subsls.nama_pml || null)}, ${esc(subsls.nama_pcl || null)}, ${subsls.total_muatan_assignment || 0}, LAST_INSERT_ID());`);

        // Track unique staff
        if (subsls.nama_pml && !uniquePml.has(subsls.nama_pml))       uniquePml.set(subsls.nama_pml, kec.kode_kec);
        if (subsls.nama_pcl && !uniquePcl.has(subsls.nama_pcl))       uniquePcl.set(subsls.nama_pcl, kec.kode_kec);
        if (subsls.nama_korlap && !uniqueKorlap.has(subsls.nama_korlap)) uniqueKorlap.set(subsls.nama_korlap, kec.kode_kec);

        if (subsls.nama_pcl) {
          subSlsPcl.push({ id_subsls: subsls.id_subsls, nama_pcl: subsls.nama_pcl });
        }
      }
    }
  }
}
lines.push('');

// ----------------------------------------------------------------
// USER (bcrypt hash - using fixed pre-hashed values for SQL)
// ----------------------------------------------------------------
// Pre-hashed passwords (bcrypt cost 10):
// adminse2026 → use bcrypt in db_setup.js; for SQL we use a known hash
// For portability in SQL, we use pre-computed bcrypt hashes
const HASH_ADMIN   = '$2a$10$CfBv.KaR8Xm98OsSPJoNTO5ekrfwTAoNifnKDJ1bIp5AHzsgSMdwu'; // "adminse2026"
const HASH_KORLAP  = '$2a$10$Yt68m0SlMeL2MIqr8CzNEe3APsHmTRMmKOclYs/lwjv/uo7GcY6TC'; // "korlap123"
const HASH_PML     = '$2a$10$T2q1Y6jDwpIRpjlLwTIBw.b9gYy06cNT.8cSLFEger7MxsyB7hb8O'; // "pml123"
const HASH_PCL     = '$2a$10$ebDSzboCNsahTuo9NeUkyefJ9U7KWnhglH8Yb8abQ9m8ip4WGvQKS'; // "pcl123"

lines.push('-- ====================================================');
lines.push('-- DATA USER');
lines.push('-- ====================================================');
lines.push('-- Admin');
lines.push(`INSERT IGNORE INTO \`user\` (nama_lengkap, username, password, role, is_active, kecamatan_id) VALUES ('Administrator', 'admin', ${esc(HASH_ADMIN)}, 'admin', true, NULL);`);
lines.push('');

lines.push('-- Korlap');
const korlapUsernames = new Set();
for (const [nama, kodeKec] of uniqueKorlap) {
  let base = toUsername(nama);
  let uname = base;
  let i = 2;
  while (korlapUsernames.has(uname)) uname = `${base}_${i++}`;
  korlapUsernames.add(uname);
  lines.push(`INSERT IGNORE INTO \`user\` (nama_lengkap, username, password, role, is_active, kecamatan_id) SELECT ${esc(nama)}, ${esc(uname)}, ${esc(HASH_KORLAP)}, 'korlap', true, id FROM kecamatan WHERE kode_kec=${esc(kodeKec)};`);
}
lines.push('');

lines.push('-- PML');
const pmlUsernames = new Set();
for (const [nama, kodeKec] of uniquePml) {
  let base = 'pml_' + toUsername(nama);
  let uname = base;
  let i = 2;
  while (pmlUsernames.has(uname)) uname = `${base}_${i++}`;
  pmlUsernames.add(uname);
  lines.push(`INSERT IGNORE INTO \`user\` (nama_lengkap, username, password, role, is_active, kecamatan_id) SELECT ${esc(nama)}, ${esc(uname)}, ${esc(HASH_PML)}, 'pml', true, id FROM kecamatan WHERE kode_kec=${esc(kodeKec)};`);
}
lines.push('');

lines.push('-- PCL');
const pclUsernames = new Set();
for (const [nama, kodeKec] of uniquePcl) {
  let base = 'pcl_' + toUsername(nama);
  let uname = base;
  let i = 2;
  while (pclUsernames.has(uname)) uname = `${base}_${i++}`;
  pclUsernames.add(uname);
  lines.push(`INSERT IGNORE INTO \`user\` (nama_lengkap, username, password, role, is_active, kecamatan_id) SELECT ${esc(nama)}, ${esc(uname)}, ${esc(HASH_PCL)}, 'pcl', true, id FROM kecamatan WHERE kode_kec=${esc(kodeKec)};`);
}
lines.push('');

// ----------------------------------------------------------------
// TUGAS PCL
// ----------------------------------------------------------------
lines.push('-- ====================================================');
lines.push('-- PENUGASAN PCL -> SUB_SLS (tugas_pcl)');
lines.push('-- ====================================================');
for (const item of subSlsPcl) {
  lines.push(`INSERT IGNORE INTO tugas_pcl (pcl_id, sub_sls_id) SELECT u.id, s.id FROM \`user\` u JOIN sub_sls s ON s.id_sub_sls=${esc(item.id_subsls)} WHERE u.nama_lengkap=${esc(item.nama_pcl)} AND u.role='pcl';`);
}
lines.push('');

// ----------------------------------------------------------------
// TARGET PERIODE (default per kecamatan)
// ----------------------------------------------------------------
lines.push('-- ====================================================');
lines.push('-- TARGET PERIODE (default 100%, periode survei)');
lines.push('-- ====================================================');
const today = new Date();
const fmt = (d) => d.toISOString().split('T')[0];
const tStart = fmt(new Date(today.getTime() - 7 * 86400000));
const tEnd   = fmt(new Date(today.getTime() + 21 * 86400000));

for (const kec of data) {
  lines.push(`INSERT IGNORE INTO target_periode (target_persen, tanggal_mulai, tanggal_selesai, kecamatan_id) SELECT 100.00, '${tStart}', '${tEnd}', id FROM kecamatan WHERE kode_kec=${esc(kec.kode_kec)};`);
}
lines.push('');

// ----------------------------------------------------------------
// Footer
// ----------------------------------------------------------------
lines.push('SET FOREIGN_KEY_CHECKS=1;');
lines.push('-- ====================================================');
lines.push('-- SELESAI');
lines.push('-- ====================================================');

// Write to file
const outPath = path.join(__dirname, 'setup_database.sql');
fs.writeFileSync(outPath, lines.join('\n'), 'utf-8');

console.log('✅ SQL file generated: setup_database.sql');
console.log('   Total lines: ' + lines.length);
console.log('   Kecamatan : ' + data.length);
let totalDesa=0, totalSls=0, totalSubSls=0;
for (const kec of data) for (const d of (kec.desa||[])) { totalDesa++; for (const s of (d.sls||[])) { totalSls++; totalSubSls+=(s.subsls||[]).length; } }
console.log('   Desa      : ' + totalDesa);
console.log('   SLS       : ' + totalSls);
console.log('   Sub-SLS   : ' + totalSubSls);
console.log('   PML unik  : ' + uniquePml.size);
console.log('   PCL unik  : ' + uniquePcl.size);
console.log('   Korlap unik: ' + uniqueKorlap.size);
console.log('   Tugas PCL : ' + subSlsPcl.length);
