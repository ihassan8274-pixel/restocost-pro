#!/bin/bash
set -e

echo "========================================="
echo "  ERPNext Setup Script for WSL Ubuntu"
echo "========================================="

# Step 1: System dependencies
echo ""
echo "[1/6] Installing system dependencies..."
sudo apt-get update
sudo apt-get install -y python3-dev python3-pip python3-venv \
  python3-setuptools python3-wheel \
  mariadb-server redis-server \
  git curl wget \
  libffi-dev libssl-dev \
  xvfb

# Install wkhtmltopdf manually (not in Ubuntu 25.04 repos)
echo ""
echo "Installing wkhtmltopdf manually..."
cd /tmp
wget -q https://github.com/wkhtmltopdf/packaging/releases/download/0.16.7-1/wkhtmltox_0.16.7-1.jammy_amd64.deb -O wkhtmltopdf.deb || echo "WARN: wkhtmltopdf download failed, skipping..."
sudo dpkg -i wkhtmltopdf.deb 2>/dev/null || sudo apt-get install -f -y 2>/dev/null || echo "WARN: wkhtmltopdf install failed, skipping..."
cd "$HOME"

# Step 2: Configure MariaDB
echo ""
echo "[2/6] Configuring MariaDB..."
sudo service mariadb start 2>/dev/null || true

sudo tee /tmp/mariadb_config.cnf > /dev/null << 'EOF'
[mysqld]
innodb-file-format=barracuda
innodb-file-per-table=1
innodb-large-prefix=1
character-set-client-handshake=FALSE
character-set-server=utf8mb4
collation-server=utf8mb4_unicode_ci

[mysql]
default-character-set=utf8mb4
EOF

sudo cp /tmp/mariadb_config.cnf /etc/mysql/mariadb.conf.d/99-erpnext.cnf
sudo service mariadb restart 2>/dev/null || true

sudo mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED BY 'root';" 2>/dev/null || true
sudo mysql -u root -proot -e "DELETE FROM mysql.user WHERE User='';" 2>/dev/null || true
sudo mysql -u root -proot -e "FLUSH PRIVILEGES;" 2>/dev/null || true

# Step 3: Install Node.js 18
echo ""
echo "[3/6] Installing Node.js 18..."
if ! command -v node &> /dev/null || [[ $(node -v | cut -d'.' -f1 | tr -d 'v') -lt 18 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "Node.js version: $(node -v)"

# Step 4: Install bench
echo ""
echo "[4/6] Installing Frappe bench..."
pip3 install --user bench

export PATH="$HOME/.local/bin:$PATH"
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc

# Step 5: Initialize bench and install ERPNext
echo ""
echo "[5/6] Setting up ERPNext (this takes 15-30 minutes)..."
cd "$HOME"

rm -rf frappe-bench 2>/dev/null || true

bench init frappe-bench --frappe-branch version-15
cd frappe-bench

bench get-app erpnext --branch version-15

bench new-site erpnext.localhost \
  --mariadb-root-password root \
  --admin-password admin123

bench use erpnext.localhost

bench --site erpnext.localhost install-app erpnext

# Step 6: Done
echo ""
echo "[6/6] Setup complete!"
echo ""
echo "========================================="
echo "  ERPNext is ready!"
echo "========================================="
echo ""
echo "  URL:      http://erpnext.localhost:8080"
echo "  Username: Administrator"
echo "  Password: admin123"
echo ""
echo "  To start:  cd ~/frappe-bench && bench start"
echo "  To stop:   Ctrl+C"
echo ""
echo "  Your RestoCost ERP is at: http://localhost:3001"
echo "========================================="
