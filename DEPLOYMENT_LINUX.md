# Panduan Deployment Linux (Ubuntu / Debian / VPS)

Dokumen ini berisi panduan konfigurasi saat memindahkan atau meng-hosting aplikasi **Telunas Issue Tracker** ke server berbasis **Linux**.

---

## 1. Prasyarat Sistem (System Packages)

Pastikan server Linux sudah terinstal PHP 8.2 atau 8.3 beserta ekstensi berikut:

```bash
# Update repository
sudo apt update && sudo apt upgrade -y

# Instal PHP & ekstensi yang dibutuhkan Laravel & Google API
sudo apt install -y php8.2-fpm php8.2-cli php8.2-mysql php8.2-sqlite3 \
    php8.2-curl php8.2-mbstring php8.2-xml php8.2-zip php8.2-gd \
    php8.2-intl composer nginx git

# Instal Node.js (LTS v20) untuk build frontend & WhatsApp Bot
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

---

## 2. Izin Direktori (File Permissions)

Web server (Nginx / Apache dengan user `www-data`) memerlukan izin tulis pada folder `storage/`, `bootstrap/cache/`, dan `public/uploads/`:

```bash
cd /var/www/TelunasIssueTracker

# Atur kepemilikan ke user web server
sudo chown -R www-data:www-data storage bootstrap/cache public/uploads

# Atur permission yang aman (775 untuk direktori, 664 untuk file cache)
sudo chmod -R 775 storage bootstrap/cache public/uploads
```

---

## 3. Konfigurasi Environment (`.env`)

Salin dan sesuaikan konfigurasi `.env`:

```bash
cp .env.example .env
php artisan key:generate
```

Pastikan variabel berikut disesuaikan dengan domain/IP server:
```ini
APP_NAME="Telunas Resort"
APP_ENV=production
APP_DEBUG=false
APP_URL=https://your-domain.com # atau http://IP_SERVER

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=telunas_db
DB_USERNAME=telunas_user
DB_PASSWORD=your_password
```

Lakukan migrasi database & optimasi cache:
```bash
php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan view:cache
npm install
npm run build
```

---

## 4. Konfigurasi Nginx (Virtual Host)

Contoh konfigurasi `/etc/nginx/sites-available/telunas`:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/TelunasIssueTracker/public;

    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";

    index index.php;
    charset utf-8;

    # Batas ukuran upload foto bukti & laporan (misal: 25MB)
    client_max_body_size 25M;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location = /favicon.ico { access_log off; log_not_found off; }
    location = /robots.txt  { access_log off; log_not_found off; }

    error_page 404 /index.php;

    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~ /\.(?!well-known).* {
        deny all;
    }
}
```

Aktifkan konfigurasi Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/telunas /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 5. Linux Crontab (Untuk Autosync Google Calendar)

Agar fitur sinkronisasi Google Calendar otomatis berjalan setiap 5 menit sesuai [routes/console.php](file:///c:/laragon/www/TelunasIssueTracker/routes/console.php):

Buka editor crontab:
```bash
sudo crontab -e -u www-data
```

Tambahkan baris berikut di bagian bawah:
```cron
* * * * * cd /var/www/TelunasIssueTracker && php artisan schedule:run >> /dev/null 2>&1
```

---

## 6. Menjalankan WhatsApp Bot di Linux (PM2)

Gunakan **PM2** agar proses WhatsApp Bot selalu berjalan di latar belakang (*daemon*) dan otomatis menyala kembali jika server reboot:

```bash
# Instal PM2 secara global
sudo npm install -g pm2

# Masuk ke direktori bot
cd /var/www/TelunasIssueTracker/whatsapp-bot

# Instal dependensi bot
npm install

# Buat file .env untuk bot jika URL web berbeda dengan default
# (Contoh: BASE_URL=http://localhost)
echo "BASE_URL=http://localhost" > .env

# Jalankan bot dengan PM2
pm2 start bot.js --name "telunas-bot"

# Atur agar PM2 auto-start saat OS boot
pm2 startup
pm2 save
```

Untuk melihat status dan log bot di Linux:
```bash
pm2 status
pm2 logs telunas-bot
```
