require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '3306')
};

async function setupDatabase() {
  console.log('📡 Connecting to MySQL server...');
  console.log(`Database details: Host=${dbConfig.host}, Database=${dbConfig.database}, User=${dbConfig.user}`);

  if (!dbConfig.user || !dbConfig.database) {
    console.error('❌ Database credentials not found in environment variables!');
    process.exit(1);
  }

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connection established.');
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    process.exit(1);
  }

  try {
    // 1. Create tables
    console.log('🔧 Creating table `kecamatan`...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS kecamatan (
        id INT AUTO_INCREMENT PRIMARY KEY,
        kode_kec VARCHAR(10) UNIQUE NOT NULL,
        nama_kec VARCHAR(100) NOT NULL
      ) ENGINE=InnoDB;
    `);

    console.log('🔧 Creating table `desa`...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS desa (
        id INT AUTO_INCREMENT PRIMARY KEY,
        kode_desa VARCHAR(10) UNIQUE NOT NULL,
        nama_desa VARCHAR(100) NOT NULL,
        kecamatan_id INT NOT NULL,
        FOREIGN KEY (kecamatan_id) REFERENCES kecamatan(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    console.log('🔧 Creating table `sls`...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sls (
        id INT AUTO_INCREMENT PRIMARY KEY,
        kode_sls VARCHAR(20) NOT NULL,
        nama_sls VARCHAR(100) NOT NULL,
        desa_id INT NOT NULL,
        FOREIGN KEY (desa_id) REFERENCES desa(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    console.log('🔧 Creating table `sub_sls`...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sub_sls (
        id INT AUTO_INCREMENT PRIMARY KEY,
        kode_sub_sls VARCHAR(20) NOT NULL,
        id_sub_sls VARCHAR(50) UNIQUE NOT NULL,
        id_sub_sls_alt VARCHAR(50) NULL,
        nama_sub_sls VARCHAR(100) NOT NULL,
        nama_korlap VARCHAR(100) NULL,
        nama_pml VARCHAR(100) NULL,
        nama_pcl VARCHAR(100) NULL,
        total_muatan INT DEFAULT 0,
        sls_id INT NOT NULL,
        FOREIGN KEY (sls_id) REFERENCES sls(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    console.log('🔧 Creating table `user`...');
    await connection.query(`
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

    console.log('🔧 Creating table `tugas_pcl`...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS tugas_pcl (
        pcl_id INT NOT NULL,
        sub_sls_id INT NOT NULL,
        PRIMARY KEY (pcl_id, sub_sls_id),
        FOREIGN KEY (pcl_id) REFERENCES user(id) ON DELETE CASCADE,
        FOREIGN KEY (sub_sls_id) REFERENCES sub_sls(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    console.log('🔧 Creating table `laporan_harian`...');
    await connection.query(`
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

    console.log('🔧 Creating table `target_periode`...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS target_periode (
        id INT AUTO_INCREMENT PRIMARY KEY,
        target_persen DECIMAL(5,2) NOT NULL,
        tanggal_mulai DATE NOT NULL,
        tanggal_selesai DATE NOT NULL,
        kecamatan_id INT NOT NULL,
        FOREIGN KEY (kecamatan_id) REFERENCES kecamatan(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    // 2. Insert Seed Data
    console.log('🌱 Checking seed data...');
    
    // Check if Kecamatan already has entries
    const [rowsKec] = await connection.query('SELECT COUNT(*) AS cnt FROM kecamatan');
    if (rowsKec[0].cnt === 0) {
      console.log('🌱 Seeding `kecamatan`...');
      const k1 = await connection.query("INSERT INTO kecamatan (kode_kec, nama_kec) VALUES ('3171010', 'Menteng')");
      const k2 = await connection.query("INSERT INTO kecamatan (kode_kec, nama_kec) VALUES ('3171020', 'Senen')");
      const k3 = await connection.query("INSERT INTO kecamatan (kode_kec, nama_kec) VALUES ('3171030', 'Cempaka Putih')");
      
      const mentengId = k1[0].insertId;
      const senenId = k2[0].insertId;
      const cempakaId = k3[0].insertId;

      console.log('🌱 Seeding `desa`...');
      const d1 = await connection.query(`INSERT INTO desa (kode_desa, nama_desa, kecamatan_id) VALUES 
        ('3171010001', 'Menteng', ${mentengId}),
        ('3171010002', 'Cikini', ${mentengId}),
        ('3171020001', 'Kwitang', ${senenId}),
        ('3171020002', 'Kenari', ${senenId}),
        ('3171030001', 'Cempaka Putih Barat', ${cempakaId});
      `);
      
      const mentengDesaId = d1[0].insertId; // ID of first inserted (Menteng)
      const cikiniDesaId = mentengDesaId + 1;
      const kwitangDesaId = mentengDesaId + 2;

      console.log('🌱 Seeding `sls`...');
      const s1 = await connection.query(`INSERT INTO sls (kode_sls, nama_sls, desa_id) VALUES 
        ('001', 'RT 001 / RW 01', ${mentengDesaId}),
        ('002', 'RT 002 / RW 01', ${mentengDesaId}),
        ('001', 'RT 001 / RW 02', ${cikiniDesaId}),
        ('003', 'RT 003 / RW 03', ${kwitangDesaId});
      `);

      const sls1 = s1[0].insertId;
      const sls2 = sls1 + 1;
      const sls3 = sls1 + 2;
      const sls4 = sls1 + 3;

      console.log('🌱 Seeding `sub_sls`...');
      await connection.query(`INSERT INTO sub_sls (kode_sub_sls, id_sub_sls, id_sub_sls_alt, nama_sub_sls, nama_korlap, nama_pml, nama_pcl, total_muatan, sls_id) VALUES 
        ('01', '3171010001001-01', 'ALT-01', 'Sub-SLS A', 'Budi Korlap', 'PML Menteng', 'PCL Budi', 20, ${sls1}),
        ('02', '3171010001001-02', 'ALT-02', 'Sub-SLS B', 'Budi Korlap', 'PML Menteng', 'PCL Iwan', 15, ${sls1}),
        ('01', '3171010001002-01', null, 'Sub-SLS C', 'Budi Korlap', 'PML Menteng', 'PCL Budi', 0, ${sls2}),
        ('01', '3171010002001-01', null, 'Sub-SLS D', 'Budi Korlap', 'PML Menteng', 'PCL Susi', 25, ${sls3}),
        ('01', '3171020001003-01', 'ALT-05', 'Sub-SLS E', 'Siti Korlap', 'PML Senen', 'PCL Roni', 10, ${sls4});
      `);

      console.log('🌱 Seeding `target_periode`...');
      // Targets that are active now (deadline in 7 days) and target that ended soon (deadline in 1 day)
      const today = new Date();
      const past3Days = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const future7Days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const future1Day = new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      await connection.query(`INSERT INTO target_periode (target_persen, tanggal_mulai, tanggal_selesai, kecamatan_id) VALUES 
        (100.00, '${past3Days}', '${future7Days}', ${mentengId}),
        (90.00, '${past3Days}', '${future1Day}', ${senenId});
      `);
    }

    // Check if Users already exist
    const [rowsUser] = await connection.query('SELECT COUNT(*) AS cnt FROM user');
    if (rowsUser[0].cnt === 0) {
      console.log('🌱 Seeding `user`...');
      const adminPass = await bcrypt.hash('adminse2026', 10);
      const korlapPass = await bcrypt.hash('korlap123', 10);
      const pmlPass = await bcrypt.hash('pml123', 10);
      const pclPass1 = await bcrypt.hash('pcl123', 10);
      const pclPass2 = await bcrypt.hash('pcl234', 10);

      const [mentengRows] = await connection.query("SELECT id FROM kecamatan WHERE nama_kec = 'Menteng' LIMIT 1");
      const mentengKecId = mentengRows[0]?.id || null;

      // Insert Admin
      await connection.query(`INSERT INTO user (nama_lengkap, username, password, role, is_active, kecamatan_id) VALUES 
        ('Administrator Sensus', 'admin', '${adminPass}', 'admin', true, null);
      `);

      // Insert Korlap
      await connection.query(`INSERT INTO user (nama_lengkap, username, password, role, is_active, kecamatan_id) VALUES 
        ('Hendra Korlap', 'korlap1', '${korlapPass}', 'korlap', true, null);
      `);

      // Insert PML (Menteng)
      const uPml = await connection.query(`INSERT INTO user (nama_lengkap, username, password, role, is_active, kecamatan_id) VALUES 
        ('PML Menteng', 'pml_menteng', '${pmlPass}', 'pml', true, ${mentengKecId});
      `);
      const pmlUserId = uPml[0].insertId;

      // Insert PCLs
      const uPcl1 = await connection.query(`INSERT INTO user (nama_lengkap, username, password, role, is_active, kecamatan_id) VALUES 
        ('PCL Budi', 'pcl1', '${pclPass1}', 'pcl', true, null);
      `);
      const uPcl2 = await connection.query(`INSERT INTO user (nama_lengkap, username, password, role, is_active, kecamatan_id) VALUES 
        ('PCL Iwan', 'pcl2', '${pclPass2}', 'pcl', true, null);
      `);

      const pcl1Id = uPcl1[0].insertId;
      const pcl2Id = uPcl2[0].insertId;

      // Link PCL to Sub-SLS (Penugasan)
      console.log('🌱 Seeding `tugas_pcl`...');
      const [subSlsRows] = await connection.query('SELECT id, id_sub_sls FROM sub_sls');
      const subSlsA = subSlsRows.find(s => s.id_sub_sls === '3171010001001-01')?.id;
      const subSlsB = subSlsRows.find(s => s.id_sub_sls === '3171010001001-02')?.id;
      const subSlsC = subSlsRows.find(s => s.id_sub_sls === '3171010001002-01')?.id;
      
      if (subSlsA && subSlsB && subSlsC) {
        await connection.query(`INSERT INTO tugas_pcl (pcl_id, sub_sls_id) VALUES 
          (${pcl1Id}, ${subSlsA}),
          (${pcl1Id}, ${subSlsC}),
          (${pcl2Id}, ${subSlsB});
        `);
      }

      // Seeding some initial Laporan Harian
      console.log('🌱 Seeding `laporan_harian`...');
      const today = new Date();
      const formatYMD = (d) => d.toISOString().split('T')[0];
      const dateToday = formatYMD(today);
      const dateYesterday = formatYMD(new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000));
      const date4DaysAgo = formatYMD(new Date(today.getTime() - 4 * 24 * 60 * 60 * 1000));

      if (subSlsA && subSlsB && subSlsC) {
        // Sub-SLS A: progress selesai sebagian tapi ada kendala pada hari ini
        await connection.query(`INSERT INTO laporan_harian (tanggal, jml_open, jml_submit, jml_reject, jml_pending, jml_approved, status, keterangan, sub_sls_id, user_id) VALUES 
          ('${dateToday}', 5, 10, 2, 8, 5, 'tidak_selesai_kendala', 'Hujan deras menghambat pencacahan di sektor pemukiman kumuh.', ${subSlsA}, ${pmlUserId});
        `);

        // Sub-SLS B: laporan terakhir 4 hari yang lalu, progres baru 10 dari 15 target (Kritis EWS test)
        await connection.query(`INSERT INTO laporan_harian (tanggal, jml_open, jml_submit, jml_reject, jml_pending, jml_approved, status, keterangan, sub_sls_id, user_id) VALUES 
          ('${date4DaysAgo}', 5, 10, 0, 4, 6, 'selesain_sebagian', 'Progres lambat karena responden berlibur.', ${subSlsB}, ${pmlUserId});
        `);

        // Sub-SLS C: target muatan 0, tapi dilaporkan selesai 100% kemarin
        await connection.query(`INSERT INTO laporan_harian (tanggal, jml_open, jml_submit, jml_reject, jml_pending, jml_approved, status, keterangan, sub_sls_id, user_id) VALUES 
          ('${dateYesterday}', 0, 0, 0, 0, 0, 'selesai_100%', 'Tidak ditemukan target unit usaha.', ${subSlsC}, ${pmlUserId});
        `);
      }
    }

    console.log('🎉 Database setup completed successfully!');
  } catch (err) {
    console.error('❌ Database operations failed:', err.message);
  } finally {
    if (connection) await connection.end();
  }
}

setupDatabase();
