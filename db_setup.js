require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '3306'),
  multipleStatements: true
};

// ============================================================
// Helpers
// ============================================================
function toUsername(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .substring(0, 40);
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ============================================================
// Main Setup
// ============================================================
async function setupDatabase() {
  console.log('\n📡 Menghubungkan ke MySQL server...');
  console.log(`   Host: ${dbConfig.host}:${dbConfig.port}`);
  console.log(`   Database: ${dbConfig.database}`);
  console.log(`   User: ${dbConfig.user}\n`);

  if (!dbConfig.user || !dbConfig.database) {
    console.error('❌ Kredensial database tidak ditemukan di .env!');
    process.exit(1);
  }

  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    console.log('✅ Koneksi berhasil.\n');
  } catch (err) {
    console.error('❌ Koneksi gagal:', err.message);
    process.exit(1);
  }

  try {
    // ========================================================
    // STEP 1: Buat Tabel
    // ========================================================
    console.log('══════════════════════════════════════════════════');
    console.log(' STEP 1: Membuat tabel-tabel database');
    console.log('══════════════════════════════════════════════════');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS kecamatan (
        id INT AUTO_INCREMENT PRIMARY KEY,
        kode_kec VARCHAR(10) UNIQUE NOT NULL,
        nama_kec VARCHAR(100) NOT NULL
      ) ENGINE=InnoDB;
    `);
    console.log('  ✅ Tabel `kecamatan`');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS desa (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_desa VARCHAR(20) UNIQUE NOT NULL,
        kode_desa VARCHAR(10) NOT NULL,
        nama_desa VARCHAR(100) NOT NULL,
        kecamatan_id INT NOT NULL,
        FOREIGN KEY (kecamatan_id) REFERENCES kecamatan(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    console.log('  ✅ Tabel `desa`');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS sls (
        id INT AUTO_INCREMENT PRIMARY KEY,
        kode_sls VARCHAR(20) NOT NULL,
        nama_sls VARCHAR(200) NOT NULL,
        desa_id INT NOT NULL,
        FOREIGN KEY (desa_id) REFERENCES desa(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    console.log('  ✅ Tabel `sls`');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS sub_sls (
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
      ) ENGINE=InnoDB;
    `);
    console.log('  ✅ Tabel `sub_sls`');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS user (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nama_lengkap VARCHAR(100) NOT NULL,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin', 'korlap', 'pml', 'pcl') NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        kecamatan_id INT NULL,
        FOREIGN KEY (kecamatan_id) REFERENCES kecamatan(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);
    console.log('  ✅ Tabel `user`');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS tugas_pcl (
        pcl_id INT NOT NULL,
        sub_sls_id INT NOT NULL,
        PRIMARY KEY (pcl_id, sub_sls_id),
        FOREIGN KEY (pcl_id) REFERENCES user(id) ON DELETE CASCADE,
        FOREIGN KEY (sub_sls_id) REFERENCES sub_sls(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    console.log('  ✅ Tabel `tugas_pcl`');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS laporan_harian (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tanggal DATE NOT NULL,
        jml_open INT DEFAULT 0,
        jml_submit INT DEFAULT 0,
        jml_reject INT DEFAULT 0,
        jml_pending INT DEFAULT 0,
        jml_approved INT DEFAULT 0,
        status ENUM('selesai_100%', 'selesai_sebagian', 'tidak_selesai_kendala') NOT NULL,
        keterangan TEXT NULL,
        sub_sls_id INT NOT NULL,
        user_id INT NOT NULL,
        UNIQUE KEY uq_date_sub (tanggal, sub_sls_id),
        FOREIGN KEY (sub_sls_id) REFERENCES sub_sls(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    console.log('  ✅ Tabel `laporan_harian`');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS target_periode (
        id INT AUTO_INCREMENT PRIMARY KEY,
        target_persen DECIMAL(5,2) NOT NULL,
        tanggal_mulai DATE NOT NULL,
        tanggal_selesai DATE NOT NULL,
        kecamatan_id INT NOT NULL,
        FOREIGN KEY (kecamatan_id) REFERENCES kecamatan(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    console.log('  ✅ Tabel `target_periode`\n');

    // ========================================================
    // STEP 2: Baca & Parse JSON
    // ========================================================
    console.log('══════════════════════════════════════════════════');
    console.log(' STEP 2: Membaca data dari JSON');
    console.log('══════════════════════════════════════════════════');

    const jsonPath = path.join(__dirname, 'kelompok_populasi_pml_pcl_korlap_muatan.json');
    const rawData = fs.readFileSync(jsonPath, 'utf-8');
    const kecamatanList = JSON.parse(rawData);
    console.log(`  📄 Ditemukan ${kecamatanList.length} kecamatan dalam JSON\n`);

    // ========================================================
    // STEP 3: Cek apakah data sudah ada
    // ========================================================
    const [existKec] = await conn.query('SELECT COUNT(*) AS cnt FROM kecamatan');
    const [existSubSls] = await conn.query('SELECT COUNT(*) AS cnt FROM sub_sls');

    if (existKec[0].cnt > 0 && existSubSls[0].cnt > 0) {
      console.log('ℹ️  Data wilayah sudah ada di database. Skip insert wilayah.');
      console.log('   (Hapus tabel atau jalankan dengan flag --force untuk reset)\n');
    } else {
      // ========================================================
      // STEP 3A: Insert Kecamatan, Desa, SLS, Sub-SLS
      // ========================================================
      console.log('══════════════════════════════════════════════════');
      console.log(' STEP 3: Insert data wilayah dari JSON');
      console.log('══════════════════════════════════════════════════');

      // Collect all unique names for user generation
      const uniquePml = new Map();    // nama -> { kec_kode, kec_nama }
      const uniquePcl = new Map();    // nama -> { kec_kode }
      const uniqueKorlap = new Map(); // nama -> { kec_kode }

      let totalDesa = 0, totalSls = 0, totalSubSls = 0;

      for (const kec of kecamatanList) {
        // Insert kecamatan
        const [kecResult] = await conn.query(
          'INSERT IGNORE INTO kecamatan (kode_kec, nama_kec) VALUES (?, ?)',
          [kec.kode_kec, kec.nama_kec]
        );

        let kecId;
        if (kecResult.insertId) {
          kecId = kecResult.insertId;
        } else {
          const [kecRow] = await conn.query('SELECT id FROM kecamatan WHERE kode_kec = ?', [kec.kode_kec]);
          kecId = kecRow[0].id;
        }

        // Insert desa
        for (const desa of (kec.desa || [])) {
          totalDesa++;
          const [desaResult] = await conn.query(
            'INSERT IGNORE INTO desa (id_desa, kode_desa, nama_desa, kecamatan_id) VALUES (?, ?, ?, ?)',
            [desa.id_desa, desa.kode_desa, desa.nama_desa, kecId]
          );

          let desaId;
          if (desaResult.insertId) {
            desaId = desaResult.insertId;
          } else {
            const [desaRow] = await conn.query('SELECT id FROM desa WHERE id_desa = ?', [desa.id_desa]);
            desaId = desaRow[0].id;
          }

          // Insert SLS
          for (const sls of (desa.sls || [])) {
            totalSls++;
            const [slsResult] = await conn.query(
              'INSERT INTO sls (kode_sls, nama_sls, desa_id) VALUES (?, ?, ?)',
              [sls.kode_sls, sls.nama_sls, desaId]
            );
            const slsId = slsResult.insertId;

            // Insert Sub-SLS
            for (const subsls of (sls.subsls || [])) {
              totalSubSls++;
              await conn.query(
                `INSERT IGNORE INTO sub_sls 
                  (kode_sub_sls, id_sub_sls, id_sub_sls_2025, nama_korlap, nama_pml, nama_pcl, total_muatan, sls_id) 
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  subsls.kode_subsls,
                  subsls.id_subsls,
                  subsls.id_subsls_2025 || null,
                  subsls.nama_korlap || null,
                  subsls.nama_pml || null,
                  subsls.nama_pcl || null,
                  subsls.total_muatan_assignment || 0,
                  slsId
                ]
              );

              // Collect unique staff names
              if (subsls.nama_pml) {
                if (!uniquePml.has(subsls.nama_pml)) {
                  uniquePml.set(subsls.nama_pml, { kec_kode: kec.kode_kec, kec_nama: kec.nama_kec, kecId });
                }
              }
              if (subsls.nama_pcl) {
                if (!uniquePcl.has(subsls.nama_pcl)) {
                  uniquePcl.set(subsls.nama_pcl, { kec_kode: kec.kode_kec, kecId });
                }
              }
              if (subsls.nama_korlap) {
                if (!uniqueKorlap.has(subsls.nama_korlap)) {
                  uniqueKorlap.set(subsls.nama_korlap, { kec_kode: kec.kode_kec, kecId });
                }
              }
            }
          }
        }

        process.stdout.write(`  📍 Kec ${kec.kode_kec} - ${kec.nama_kec} → selesai\n`);
      }

      console.log(`\n  ✅ Total inserted: ${kecamatanList.length} kecamatan, ${totalDesa} desa, ${totalSls} SLS, ${totalSubSls} sub-SLS\n`);

      // ========================================================
      // STEP 4: Insert User (Admin + Korlap + PML + PCL)
      // ========================================================
      console.log('══════════════════════════════════════════════════');
      console.log(' STEP 4: Membuat akun user dari data JSON');
      console.log('══════════════════════════════════════════════════');

      const [existUser] = await conn.query('SELECT COUNT(*) AS cnt FROM user');

      if (existUser[0].cnt > 0) {
        console.log('ℹ️  User sudah ada. Skip insert user.\n');
      } else {
        // Hash default passwords
        const passAdmin   = await bcrypt.hash('adminse2026', 10);
        const passKorlap  = await bcrypt.hash('korlap123', 10);
        const passPml     = await bcrypt.hash('pml123', 10);
        const passPcl     = await bcrypt.hash('pcl123', 10);

        // Insert Admin
        await conn.query(
          `INSERT INTO user (nama_lengkap, username, password, role, is_active, kecamatan_id) VALUES (?, ?, ?, 'admin', true, null)`,
          ['Administrator', 'admin', passAdmin]
        );
        console.log('  👤 Admin: username=admin, password=adminse2026');

        // Insert Korlap (unique)
        let korlapCount = 0;
        const korlapUsernames = new Map();
        for (const [nama, info] of uniqueKorlap) {
          let base = toUsername(nama);
          let uname = base;
          let suffix = 2;
          while (korlapUsernames.has(uname)) {
            uname = `${base}_${suffix++}`;
          }
          korlapUsernames.set(uname, true);

          const [res] = await conn.query(
            `INSERT IGNORE INTO user (nama_lengkap, username, password, role, is_active, kecamatan_id) VALUES (?, ?, ?, 'korlap', true, ?)`,
            [nama, uname, passKorlap, info.kecId]
          );
          if (res.insertId) korlapCount++;
        }
        console.log(`  👤 Korlap: ${korlapCount} akun dibuat (password default: korlap123)`);

        // Insert PML (unique)
        let pmlCount = 0;
        const pmlUsernames = new Map();
        const pmlIdByName = new Map();
        for (const [nama, info] of uniquePml) {
          let base = 'pml_' + toUsername(nama);
          let uname = base;
          let suffix = 2;
          while (pmlUsernames.has(uname)) {
            uname = `${base}_${suffix++}`;
          }
          pmlUsernames.set(uname, true);

          const [res] = await conn.query(
            `INSERT IGNORE INTO user (nama_lengkap, username, password, role, is_active, kecamatan_id) VALUES (?, ?, ?, 'pml', true, ?)`,
            [nama, uname, passPml, info.kecId]
          );
          if (res.insertId) {
            pmlCount++;
            pmlIdByName.set(nama, res.insertId);
          }
        }
        console.log(`  👤 PML: ${pmlCount} akun dibuat (password default: pml123)`);

        // Insert PCL (unique)
        let pclCount = 0;
        const pclUsernames = new Map();
        const pclIdByName = new Map();
        for (const [nama, info] of uniquePcl) {
          let base = 'pcl_' + toUsername(nama);
          let uname = base;
          let suffix = 2;
          while (pclUsernames.has(uname)) {
            uname = `${base}_${suffix++}`;
          }
          pclUsernames.set(uname, true);

          const [res] = await conn.query(
            `INSERT IGNORE INTO user (nama_lengkap, username, password, role, is_active, kecamatan_id) VALUES (?, ?, ?, 'pcl', true, ?)`,
            [nama, uname, passPcl, info.kecId]
          );
          if (res.insertId) {
            pclCount++;
            pclIdByName.set(nama, res.insertId);
          }
        }
        console.log(`  👤 PCL: ${pclCount} akun dibuat (password default: pcl123)\n`);

        // ========================================================
        // STEP 5: Insert tugas_pcl (link PCL ke sub_sls)
        // ========================================================
        console.log('══════════════════════════════════════════════════');
        console.log(' STEP 5: Menghubungkan PCL ke sub-SLS (tugas_pcl)');
        console.log('══════════════════════════════════════════════════');

        // Get all sub_sls with their PCL names
        const [allSubSls] = await conn.query('SELECT id, id_sub_sls, nama_pcl FROM sub_sls WHERE nama_pcl IS NOT NULL');

        // Refresh PCL IDs (in case INSERT IGNORE skipped some)
        const [allPclUsers] = await conn.query("SELECT id, nama_lengkap FROM user WHERE role = 'pcl'");
        for (const u of allPclUsers) {
          pclIdByName.set(u.nama_lengkap, u.id);
        }

        // Build tugas_pcl rows
        const tugasPclRows = [];
        for (const row of allSubSls) {
          const pclId = pclIdByName.get(row.nama_pcl);
          if (pclId) {
            tugasPclRows.push([pclId, row.id]);
          }
        }

        // Bulk insert in chunks of 500
        let tugasInserted = 0;
        for (const chunk of chunkArray(tugasPclRows, 500)) {
          const placeholders = chunk.map(() => '(?, ?)').join(', ');
          const values = chunk.flat();
          await conn.query(
            `INSERT IGNORE INTO tugas_pcl (pcl_id, sub_sls_id) VALUES ${placeholders}`,
            values
          );
          tugasInserted += chunk.length;
        }
        console.log(`  ✅ ${tugasInserted} penugasan PCL → sub-SLS berhasil diinsert\n`);
      }
    }

    // ========================================================
    // STEP 6: Insert target_periode (jika belum ada)
    // ========================================================
    console.log('══════════════════════════════════════════════════');
    console.log(' STEP 6: Inisialisasi target periode (jika belum ada)');
    console.log('══════════════════════════════════════════════════');

    const [existTarget] = await conn.query('SELECT COUNT(*) AS cnt FROM target_periode');
    if (existTarget[0].cnt === 0) {
      const today = new Date();
      const formatYMD = (d) => d.toISOString().split('T')[0];
      const startDate = formatYMD(new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000));
      const endDate   = formatYMD(new Date(today.getTime() + 21 * 24 * 60 * 60 * 1000));

      const [allKec] = await conn.query('SELECT id FROM kecamatan');
      for (const kec of allKec) {
        await conn.query(
          'INSERT INTO target_periode (target_persen, tanggal_mulai, tanggal_selesai, kecamatan_id) VALUES (100.00, ?, ?, ?)',
          [startDate, endDate, kec.id]
        );
      }
      console.log(`  ✅ Target periode 100% dibuat untuk ${allKec.length} kecamatan`);
      console.log(`     Periode: ${startDate} s/d ${endDate}\n`);
    } else {
      console.log('  ℹ️  Target periode sudah ada. Skip.\n');
    }

    // ========================================================
    // SUMMARY
    // ========================================================
    console.log('══════════════════════════════════════════════════');
    console.log(' ✅ DATABASE SETUP SELESAI!');
    console.log('══════════════════════════════════════════════════');

    const [[{ cntKec }]]    = await conn.query('SELECT COUNT(*) AS cntKec FROM kecamatan');
    const [[{ cntDesa }]]   = await conn.query('SELECT COUNT(*) AS cntDesa FROM desa');
    const [[{ cntSls }]]    = await conn.query('SELECT COUNT(*) AS cntSls FROM sls');
    const [[{ cntSubSls }]] = await conn.query('SELECT COUNT(*) AS cntSubSls FROM sub_sls');
    const [[{ cntUser }]]   = await conn.query('SELECT COUNT(*) AS cntUser FROM user');
    const [[{ cntTugas }]]  = await conn.query('SELECT COUNT(*) AS cntTugas FROM tugas_pcl');

    console.log(`  📊 Kecamatan  : ${cntKec}`);
    console.log(`  📊 Desa       : ${cntDesa}`);
    console.log(`  📊 SLS        : ${cntSls}`);
    console.log(`  📊 Sub-SLS    : ${cntSubSls}`);
    console.log(`  📊 User       : ${cntUser}`);
    console.log(`  📊 Tugas PCL  : ${cntTugas}`);
    console.log('\n  🔐 Default Passwords:');
    console.log('     admin    → adminse2026');
    console.log('     korlap   → korlap123');
    console.log('     pml_*    → pml123');
    console.log('     pcl_*    → pcl123');
    console.log('══════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    if (err.sql) console.error('   SQL:', err.sql.substring(0, 200));
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

setupDatabase();
