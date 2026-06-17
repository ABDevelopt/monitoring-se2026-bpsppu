# Dewaweb Node.js Server Dashboard

Sebuah proyek Node.js sederhana (Server Status & Monitoring Dashboard) yang dirancang khusus untuk berjalan dengan baik di **Dewaweb Shared Hosting** (cPanel). Proyek ini memantau performa server secara real-time dan memverifikasi konfigurasi server.

## 📁 Struktur Proyek
- `server.js`: File utama aplikasi Node.js (Express server).
- `package.json`: Konfigurasi dependensi dan perintah run.
- `public/`: Berisi file antarmuka frontend (HTML, CSS, JS).
  - `index.html`: Layout Dashboard Glassmorphic.
  - `style.css`: Gaya tampilan modern premium dengan responsive dark-mode.
  - `app.js`: File client-side untuk interaksi & visualisasi telemetri.
- `.gitignore`: Mengabaikan berkas lokal yang tidak perlu diunggah.

---

## 🚀 Panduan Deployment di cPanel Dewaweb Shared Hosting

Ikuti langkah-langkah di bawah ini untuk memasang aplikasi di hosting Dewaweb Anda:

### Langkah 1: Persiapkan Berkas Proyek (Zip)
Arsipkan semua file proyek di atas menjadi satu file `.zip` (misal: `app.zip`).
> [!IMPORTANT]
> **Jangan menyertakan folder `node_modules`** ke dalam file zip. File dependensi tersebut akan diinstal langsung di server cPanel untuk menghemat kuota upload dan mencegah bentrok arsitektur biner OS.

### Langkah 2: Buat Aplikasi Node.js di cPanel Dewaweb
1. Masuk ke **cPanel** akun Dewaweb Anda.
2. Cari dan klik menu **Setup Node.js App** (di kategori *Software*).
3. Klik tombol **Create Application** di sebelah kanan atas.
4. Isi konfigurasi aplikasi sebagai berikut:
   - **Node.js version**: Pilih versi terbaru yang didukung (direkomendasikan v18 atau v20).
   - **Application mode**: Pilih `Development` (untuk pengetesan awal) atau `Production` (untuk kecepatan maksimal).
   - **Application root**: Masukkan nama folder tempat kode Anda ditaruh (misal: `monitoring-app`).
   - **Application URL**: Pilih subdomain atau domain utama Anda serta path opsional yang akan digunakan untuk mengakses aplikasi ini.
   - **Application startup file**: Masukkan nama file startup utama, yaitu `server.js`.
5. Klik tombol **Create** di kanan atas. cPanel akan secara otomatis membuat folder kosong dengan nama yang diisi di *Application root*.

### Langkah 3: Unggah Berkas Kode ke Server
1. Kembali ke halaman utama cPanel, cari dan buka **File Manager**.
2. Masuk ke folder *Application root* yang baru dibuat (sesuai contoh di atas: `/monitoring-app`).
3. Anda akan melihat beberapa berkas bawaan cPanel (seperti folder `tmp` atau `passenger_wsgi.py`). Anda bisa menghapusnya (kecuali folder `tmp` jika ada).
4. Klik **Upload** di menu atas, pilih berkas `app.zip` yang telah Anda persiapkan pada **Langkah 1**.
5. Ekstrak isi file `app.zip` tersebut di dalam folder `/monitoring-app` tersebut.

### Langkah 4: Instalasi Dependensi NPM
1. Kembali lagi ke menu **Setup Node.js App** di cPanel.
2. Klik tombol edit (ikon pensil) pada aplikasi Node.js yang Anda buat untuk membuka pengaturannya.
3. Di bagian bawah pengaturan, sistem akan mendeteksi file `package.json` yang baru saja Anda upload.
4. Klik tombol **Run NPM Install**. Proses ini akan mendownload Express secara otomatis di server Dewaweb.
5. Setelah instalasi selesai, klik tombol **Restart** di bagian atas konfigurasi agar perubahan berjalan dengan aktif.

### Langkah 5: Selesai!
Buka URL aplikasi yang telah Anda pilih pada **Langkah 2** di web browser. Anda akan disambut dengan **Dewaweb Node.js Server Dashboard** yang menampilkan visualisasi data server real-time dan detail status kompatibilitas sistem.
