# -*- coding: utf-8 -*-
"""
MONGOLIAN MEDIA — Солонгос хэлний сургалтын апп
Production REST API Server & Content Controller
Built strictly following OWASP authorization, Session management, 
Email OTP authentication, Payment verification, Admin panel, and PWA static serving.
"""

import http.server
import socketserver
import threading
import json
import sqlite3
import hashlib
import secrets
import os
import sys
import time
import datetime
import urllib.parse
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, 'public')
DB_PATH = os.path.join(BASE_DIR, 'database.db')
CONFIG_PATH = os.path.join(BASE_DIR, 'config.json')

# -------------------------------------------------------------
# Configuration Loader
# -------------------------------------------------------------
DEFAULT_CONFIG = {
    "server": {
        "host": "0.0.0.0",
        "port": 8080,
        "app_name": "MONGOLIAN MEDIA",
        "app_title": "Солонгос хэл — өдөр тутам ба ажил",
        "owner_name": "Батцогт",
        "owner_email": "admin@mongolianmedia.mn"
    },
    "payment": {
        "bank_name": "Хаан Банк (Khan Bank)",
        "account_number": "5946179010",
        "account_holder": "Н.Батцогт",
        "amount_mnt": 49000,
        "currency": "MNT",
        "instructions": "Гүйлгээний утга дээр бүртгүүлсэн ИМЭЙЛ ХАЯГ-аа заавал бичнэ үү."
    },
    "smtp": {
        "enabled": False,
        "host": "smtp.gmail.com",
        "port": 587,
        "user": "",
        "password": "",
        "from_email": "noreply@mongolianmedia.mn"
    },
    "security": {
        "otp_expiry_minutes": 10,
        "invite_expiry_hours": 24,
        "max_devices_per_user": 1,
        "session_expiry_days": 30
    }
}

def load_config():
    if not os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(DEFAULT_CONFIG, f, ensure_ascii=False, indent=2)
        return DEFAULT_CONFIG
    try:
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            cfg = json.load(f)
            return cfg
    except Exception:
        return DEFAULT_CONFIG

CONFIG = load_config()

# -------------------------------------------------------------
# Database Setup & Migrations
# -------------------------------------------------------------
def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=60.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA busy_timeout=60000;")
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    
    # 1. Users table
    c.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        role TEXT DEFAULT 'user',
        status TEXT DEFAULT 'pending_payment', -- 'pending_payment', 'active', 'suspended'
        is_verified INTEGER DEFAULT 0,
        otp_hash TEXT,
        otp_expires_at REAL,
        created_at REAL,
        last_login_at REAL
    )
    ''')

    # 2. Sessions table
    c.execute('''
    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token_hash TEXT UNIQUE NOT NULL,
        device_id TEXT NOT NULL,
        device_name TEXT,
        created_at REAL,
        expires_at REAL,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
    ''')

    # 3. Approved Devices table (Enforcing 1 device limit)
    c.execute('''
    CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        device_id TEXT NOT NULL,
        device_name TEXT,
        is_approved INTEGER DEFAULT 1,
        created_at REAL,
        last_used_at REAL,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(user_id, device_id)
    )
    ''')

    # 4. Payments table
    c.execute('''
    CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount REAL,
        currency TEXT DEFAULT 'MNT',
        reference_no TEXT,
        receipt_notes TEXT,
        status TEXT DEFAULT 'submitted', -- 'submitted', 'approved', 'rejected'
        created_at REAL,
        reviewed_at REAL,
        reviewed_by TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
    ''')

    # 5. One-time personalized Invites table
    c.execute('''
    CREATE TABLE IF NOT EXISTS invites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        token_hash TEXT,
        email TEXT,
        expires_at REAL,
        is_used INTEGER DEFAULT 0,
        created_by TEXT,
        created_at REAL,
        used_at REAL,
        used_by_user_id INTEGER,
        used_by_device_id TEXT
    )
    ''')

    # 6. User Progress table
    c.execute('''
    CREATE TABLE IF NOT EXISTS user_progress (
        user_id INTEGER PRIMARY KEY,
        state_json TEXT NOT NULL,
        updated_at REAL,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
    ''')

    # 7. Notifications table
    c.execute('''
    CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL, -- 'user_registered', 'payment_submitted', 'invite_used', 'device_change'
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        user_id INTEGER,
        is_read INTEGER DEFAULT 0,
        created_at REAL
    )
    ''')

    # 8. Audit Logs table
    c.execute('''
    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT,
        details TEXT,
        timestamp REAL
    )
    ''')

    # Seed Admin / Owner if not exists
    admin_email = CONFIG["server"]["owner_email"].lower()
    admin_name = CONFIG["server"]["owner_name"]
    c.execute("SELECT id FROM users WHERE email = ?", (admin_email,))
    admin_row = c.fetchone()
    if not admin_row:
        now = time.time()
        c.execute('''
        INSERT INTO users (name, email, role, status, is_verified, created_at, last_login_at)
        VALUES (?, ?, 'admin', 'active', 1, ?, ?)
        ''', (admin_name, admin_email, now, now))
        admin_id = c.lastrowid
        # Add initial audit log
        c.execute('''
        INSERT INTO audit_logs (actor, action, target, details, timestamp)
        VALUES ('SYSTEM', 'INIT_OWNER', ?, 'Owner account initialized with full permissions', ?)
        ''', (admin_email, now))
        print(f"[+] Initialized Owner account: {admin_name} ({admin_email})")

    conn.commit()
    conn.close()

# -------------------------------------------------------------
# Security & Hash Helpers
# -------------------------------------------------------------
def hash_token(token):
    return hashlib.sha256(token.encode('utf-8')).hexdigest()

def generate_otp():
    # 6-digit random number
    return f"{secrets.randbelow(900000) + 100000}"

def send_email_otp(to_email, otp_code, user_name):
    smtp_cfg = CONFIG["smtp"]
    subject = f"[{CONFIG['server']['app_name']}] Таны нэвтрэх 6 оронтой код: {otp_code}"
    
    html_body = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px;">
        <h2 style="color: #2563eb; margin-top: 0;">MONGOLIAN MEDIA</h2>
        <p>Сайн байна уу, <b>{user_name}</b>?</p>
        <p>Солонгос хэлний ярианы сургалтын апп-д нэвтрэх таны нэг удаагийн нууц код:</p>
        <div style="background: #f1f5f9; padding: 18px; border-radius: 12px; text-align: center; margin: 24px 0;">
            <span style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #0f172a;">{otp_code}</span>
        </div>
        <p style="font-size: 13px; color: #64748b;">Энэхүү код нь 10 минутын хугацаанд хүчинтэй. Кодоо бусдад дамжуулж болохгүй.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        <p style="font-size: 11px; color: #94a3b8;">MONGOLIAN MEDIA — Солонгос хэл: өдөр тутам ба ажил</p>
    </div>
    """

    if smtp_cfg["enabled"] and smtp_cfg["user"] and smtp_cfg["password"]:
        try:
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = smtp_cfg["from_email"] or smtp_cfg["user"]
            msg['To'] = to_email
            msg.attach(MIMEText(html_body, 'html', 'utf-8'))

            server = smtplib.SMTP(smtp_cfg["host"], smtp_cfg["port"], timeout=10)
            server.starttls()
            server.login(smtp_cfg["user"], smtp_cfg["password"])
            server.sendmail(msg['From'], [to_email], msg.as_string())
            server.quit()
            print(f"[SMTP] Successfully sent OTP code to {to_email}")
            return True, "Имэйл илгээгдлээ"
        except Exception as e:
            print(f"[SMTP Error] Failed to send email to {to_email}: {e}")
            return False, str(e)
    else:
        # SMTP is not configured yet: Log clearly for development/testing
        print("\n" + "=" * 60)
        print(f"📧 [EMAIL OTP SIMULATION] To: {to_email} | Name: {user_name}")
        print(f"🔑 OTP CODE: {otp_code}")
        print(f"⏱ Valid for: {CONFIG['security']['otp_expiry_minutes']} minutes")
        print("=" * 60 + "\n")
        return True, "Туршилтын горимд код үүсгэгдлээ"

def log_audit(actor, action, target, details=""):
    conn = get_db()
    c = conn.cursor()
    c.execute('''
    INSERT INTO audit_logs (actor, action, target, details, timestamp)
    VALUES (?, ?, ?, ?, ?)
    ''', (actor, action, target, details, time.time()))
    conn.commit()
    conn.close()

def add_notification(ntype, title, message, user_id=None):
    conn = get_db()
    c = conn.cursor()
    c.execute('''
    INSERT INTO notifications (type, title, message, user_id, is_read, created_at)
    VALUES (?, ?, ?, ?, 0, ?)
    ''', (ntype, title, message, user_id, time.time()))
    conn.commit()
    conn.close()

# -------------------------------------------------------------
# Auth & Session Verifier
# -------------------------------------------------------------
def get_authenticated_user(headers):
    auth_header = headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return None, None
    raw_token = auth_header.split('Bearer ', 1)[1].strip()
    token_h = hash_token(raw_token)
    now = time.time()
    
    conn = get_db()
    c = conn.cursor()
    c.execute('''
    SELECT s.id as session_id, s.device_id, u.* 
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token_hash = ? AND s.is_active = 1 AND s.expires_at > ?
    ''', (token_h, now))
    row = c.fetchone()
    conn.close()
    
    if not row:
        return None, None
        
    user_dict = dict(row)
    session_id = user_dict.pop('session_id')
    return user_dict, raw_token

# -------------------------------------------------------------
# HTTP Request Handler
# -------------------------------------------------------------
class MongolianMediaServer(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def end_headers(self):
        # Security headers
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'SAMEORIGIN')
        self.send_header('X-XSS-Protection', '1; mode=block')
        # Allow service worker scope
        self.send_header('Service-Worker-Allowed', '/')
        super().end_headers()

    def send_json(self, status_code, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Device-ID')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Device-ID')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD')
        self.end_headers()

    def do_HEAD(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        clean_path = path.lstrip('/')
        base_name = os.path.basename(clean_path)
        target_path = os.path.join(PUBLIC_DIR, clean_path)
        if not os.path.exists(target_path):
            target_path = os.path.join(PUBLIC_DIR, 'assets', base_name)
        if not os.path.exists(target_path):
            target_path = os.path.join(PUBLIC_DIR, base_name)
        if os.path.exists(target_path) and os.path.isfile(target_path):
            ctype = 'image/png' if target_path.endswith('.png') else 'text/html; charset=utf-8'
            self.send_response(200)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Length', str(os.path.getsize(target_path)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'public, max-age=86400')
            self.end_headers()
            return
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # 1. API Endpoints
        if path.startswith('/api/'):
            return self.handle_api_get(path, query)

        # 1.1 Service Worker: ALWAYS serve fresh with no-cache so browsers install updates immediately
        if path == '/sw.js':
            sw_path = os.path.join(PUBLIC_DIR, 'sw.js')
            if os.path.exists(sw_path):
                with open(sw_path, 'rb') as sw_f:
                    sw_bytes = sw_f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/javascript; charset=utf-8')
                self.send_header('Content-Length', str(len(sw_bytes)))
                self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0')
                self.send_header('Pragma', 'no-cache')
                self.send_header('Expires', '0')
                self.send_header('Service-Worker-Allowed', '/')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(sw_bytes)
                return

        # 1.2 Web App Manifest: always fresh with CORS
        if path == '/manifest.json':
            man_path = os.path.join(PUBLIC_DIR, 'manifest.json')
            if os.path.exists(man_path):
                with open(man_path, 'rb') as man_f:
                    man_bytes = man_f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/manifest+json; charset=utf-8')
                self.send_header('Content-Length', str(len(man_bytes)))
                self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(man_bytes)
                return

        # 1.3 HTML App Shell: never store in browser HTTP cache so new icons/versions take effect
        if path in ['/', '/index.html']:
            idx_path = os.path.join(PUBLIC_DIR, 'index.html')
            if os.path.exists(idx_path):
                with open(idx_path, 'rb') as idx_f:
                    idx_bytes = idx_f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(idx_bytes)))
                self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0')
                self.send_header('Pragma', 'no-cache')
                self.send_header('Expires', '0')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(idx_bytes)
                return

        # 1.5 Handle root & asset icon requests directly with proper MIME types
        icon_names = [
            'apple-touch-icon.png', 'apple-touch-icon-precomposed.png',
            'favicon.ico', 'favicon.png', 'icon-192.png', 'icon-512.png',
            'app-icon.png', 'app-icon-192.png', 'app-icon-512.png',
            'mascot-icon-v1.png'
        ]
        clean_path = path.lstrip('/')
        base_name = os.path.basename(clean_path)
        if base_name in icon_names or base_name.endswith('.png') or base_name.endswith('.ico'):
            # Check public root or public/assets
            target_path = os.path.join(PUBLIC_DIR, clean_path)
            if not os.path.exists(target_path):
                target_path = os.path.join(PUBLIC_DIR, 'assets', base_name)
            if not os.path.exists(target_path):
                target_path = os.path.join(PUBLIC_DIR, base_name)
            # Fallback for any apple-touch-icon variant (e.g. apple-touch-icon-180x180.png)
            if not os.path.exists(target_path) and 'apple-touch-icon' in base_name:
                target_path = os.path.join(PUBLIC_DIR, 'apple-touch-icon.png')
            if os.path.exists(target_path) and os.path.isfile(target_path):
                ctype = 'image/png' if target_path.endswith('.png') else 'image/x-icon'
                try:
                    with open(target_path, 'rb') as img_f:
                        img_bytes = img_f.read()
                    self.send_response(200)
                    self.send_header('Content-Type', ctype)
                    self.send_header('Content-Length', str(len(img_bytes)))
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('Cache-Control', 'public, max-age=86400')
                    self.end_headers()
                    self.wfile.write(img_bytes)
                    return
                except Exception as e:
                    pass

        # 2. Static File Serving with Single Page App fallback
        file_path = os.path.join(PUBLIC_DIR, path.lstrip('/'))
        if not os.path.exists(file_path):
            # Only fallback to index.html for navigation/SPA routes (routes without a file extension)
            ext = os.path.splitext(path)[1]
            if not ext and not path.startswith('/api'):
                self.path = '/index.html'
            else:
                self.send_error(404, "File not found")
                return

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path.startswith('/api/'):
            content_length = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
            try:
                data = json.loads(post_body)
            except Exception:
                data = {}
            return self.handle_api_post(path, data)

        return self.send_json(404, {"error": "Not Found"})

    # ---------------------------------------------------------
    # API GET Router
    # ---------------------------------------------------------
    def handle_api_get(self, path, query):
        user, _ = get_authenticated_user(self.headers)

        # Public App Info
        if path == '/api/info':
            return self.send_json(200, {
                "appName": CONFIG["server"]["app_name"],
                "appTitle": CONFIG["server"]["app_title"],
                "owner": CONFIG["server"]["owner_name"],
                "payment": CONFIG["payment"],
                "timestamp": time.time()
            })

        # Auth Me (Profile & Entitlement check)
        if path == '/api/auth/me':
            if not user:
                return self.send_json(401, {"error": "unauthorized", "message": "Нэвтрээгүй байна."})
            
            # Check device status
            device_id = self.headers.get('X-Device-ID', '')
            conn = get_db()
            c = conn.cursor()
            c.execute("SELECT is_approved FROM devices WHERE user_id = ? AND device_id = ?", (user['id'], device_id))
            dev_row = c.fetchone()
            conn.close()

            device_approved = dev_row['is_approved'] if dev_row else 0
            
            return self.send_json(200, {
                "user": {
                    "id": user['id'],
                    "name": user['name'],
                    "email": user['email'],
                    "role": user['role'],
                    "status": user['status'],
                    "is_verified": user['is_verified'],
                    "created_at": user['created_at'],
                    "device_approved": device_approved
                }
            })

        # Protected Content: 30-Day Curriculum
        if path == '/api/content/curriculum':
            if not user:
                return self.send_json(401, {"error": "unauthorized", "message": "Нэвтэрч орно уу."})
            
            # Strict Server-Side Entitlement Check
            if user['status'] != 'active' and user['role'] != 'admin':
                return self.send_json(403, {
                    "error": "payment_required",
                    "status": user['status'],
                    "message": "Сургалтын эрх хараахан идэвхжээгүй байна. Төлбөрийн зөвшөөрөл шалгагдаж байна.",
                    "payment_instructions": CONFIG["payment"]
                })

            # Check Device Approval
            device_id = self.headers.get('X-Device-ID', '')
            conn = get_db()
            c = conn.cursor()
            c.execute("SELECT is_approved FROM devices WHERE user_id = ? AND device_id = ?", (user['id'], device_id))
            dev_row = c.fetchone()
            conn.close()

            if not dev_row or dev_row['is_approved'] != 1:
                return self.send_json(403, {
                    "error": "device_unauthorized",
                    "message": "Энэ төхөөрөмж баталгаажаагүй байна. Нэг аккаунт зөвхөн 1 зөвшөөрөгдсөн утсан дээр ажиллана."
                })

            # Return complete verified curriculum data
            curr_file = os.path.join(PUBLIC_DIR, 'js', 'curriculum_data.js')
            with open(curr_file, 'r', encoding='utf-8') as f:
                raw_js = f.read()
            # Robust JSON extraction
            s_idx = raw_js.find('[')
            e_idx = raw_js.rfind(']') + 1
            curriculum = json.loads(raw_js[s_idx:e_idx])
            return self.send_json(200, {"curriculum": curriculum})

        # User Progress Sync (GET)
        if path == '/api/progress/get':
            if not user:
                return self.send_json(401, {"error": "unauthorized"})
            conn = get_db()
            c = conn.cursor()
            c.execute("SELECT state_json, updated_at FROM user_progress WHERE user_id = ?", (user['id'],))
            row = c.fetchone()
            conn.close()
            if row:
                return self.send_json(200, {"progress": json.loads(row['state_json']), "updated_at": row['updated_at']})
            return self.send_json(200, {"progress": None})

        # Admin: Get System Stats & Users List
        if path == '/api/admin/users':
            if not user or user['role'] != 'admin':
                return self.send_json(403, {"error": "forbidden", "message": "Зөвхөн админ хандах эрхтэй."})
            
            filter_status = query.get('status', ['all'])[0]
            conn = get_db()
            c = conn.cursor()
            
            if filter_status == 'all':
                c.execute('''
                SELECT u.id, u.name, u.email, u.role, u.status, u.is_verified, u.created_at, u.last_login_at,
                       p.reference_no, p.amount, p.status as payment_status, p.receipt_notes,
                       d.device_name, d.is_approved as device_approved
                FROM users u
                LEFT JOIN payments p ON u.id = p.user_id
                LEFT JOIN devices d ON u.id = d.user_id AND d.is_approved = 1
                ORDER BY u.id DESC
                ''')
            else:
                c.execute('''
                SELECT u.id, u.name, u.email, u.role, u.status, u.is_verified, u.created_at, u.last_login_at,
                       p.reference_no, p.amount, p.status as payment_status, p.receipt_notes,
                       d.device_name, d.is_approved as device_approved
                FROM users u
                LEFT JOIN payments p ON u.id = p.user_id
                LEFT JOIN devices d ON u.id = d.user_id AND d.is_approved = 1
                WHERE u.status = ?
                ORDER BY u.id DESC
                ''', (filter_status,))
            
            rows = [dict(r) for r in c.fetchall()]
            conn.close()
            return self.send_json(200, {"users": rows})

        # Admin: Get Notifications
        if path == '/api/admin/notifications':
            if not user or user['role'] != 'admin':
                return self.send_json(403, {"error": "forbidden"})
            conn = get_db()
            c = conn.cursor()
            c.execute("SELECT * FROM notifications ORDER BY id DESC LIMIT 50")
            notifs = [dict(r) for r in c.fetchall()]
            conn.close()
            return self.send_json(200, {"notifications": notifs})

        # Admin: Get Audit Logs
        if path == '/api/admin/audit-logs':
            if not user or user['role'] != 'admin':
                return self.send_json(403, {"error": "forbidden"})
            conn = get_db()
            c = conn.cursor()
            c.execute("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100")
            logs = [dict(r) for r in c.fetchall()]
            conn.close()
            return self.send_json(200, {"logs": logs})

        # Admin: Get Invites / Access Codes
        if path == '/api/admin/invites':
            if not user or user['role'] != 'admin':
                return self.send_json(403, {"error": "forbidden"})
            conn = get_db()
            c = conn.cursor()
            c.execute('''
            SELECT i.id, i.code, i.is_used, i.created_by, i.created_at, i.used_at, i.used_by_device_id,
                   u.name as student_name, u.email as student_email
            FROM invites i
            LEFT JOIN users u ON i.used_by_user_id = u.id
            ORDER BY i.id DESC
            ''')
            invites = [dict(r) for r in c.fetchall()]
            conn.close()
            return self.send_json(200, {"invites": invites})

        return self.send_json(404, {"error": "Not Found"})

    # ---------------------------------------------------------
    # API POST Router
    # ---------------------------------------------------------
    def handle_api_post(self, path, data):
        user, raw_token = get_authenticated_user(self.headers)

        # 0. Primary Frictionless 1-Time Code Login (Name + Code only)
        if path == '/api/auth/code-login':
            name = data.get('name', '').strip() or 'Суралцагч'
            raw_code = data.get('code', '').strip().upper()
            digits_only = re.sub(r'\D', '', raw_code)
            code = raw_code
            device_id = data.get('device_id', '').strip() or secrets.token_hex(8)
            device_name = data.get('device_name', '').strip() or 'Mobile Device'

            if not code:
                return self.send_json(400, {"error": "missing_code", "message": "Батцогтоос авсан 6 оронтой нэвтрэх кодоо оруулна уу."})

            conn = get_db()
            c = conn.cursor()
            now = time.time()

            # Find matching code (supports 6-digit numbers and legacy codes)
            c.execute("SELECT * FROM invites WHERE UPPER(code) = ? OR code = ? OR code = ?", (code, digits_only, f"MM-{digits_only}"))
            inv = c.fetchone()

            if not inv:
                conn.close()
                return self.send_json(400, {"error": "invalid_code", "message": "Нэвтрэх код буруу байна. Батцогтоос авсан кодоо шалгана уу."})

            # If code is already used, check if the same device is re-authenticating
            if inv['is_used'] == 1:
                if inv['used_by_device_id'] == device_id and inv['used_by_user_id']:
                    c.execute("SELECT * FROM users WHERE id = ?", (inv['used_by_user_id'],))
                    u = c.fetchone()
                    if u:
                        session_token = secrets.token_urlsafe(32)
                        token_h = hash_token(session_token)
                        session_exp = now + (CONFIG["security"]["session_expiry_days"] * 86400)
                        c.execute('''
                        INSERT INTO sessions (user_id, token_hash, device_id, device_name, created_at, expires_at, is_active)
                        VALUES (?, ?, ?, ?, ?, ?, 1)
                        ''', (u['id'], token_h, device_id, device_name, now, session_exp))
                        conn.commit()
                        conn.close()
                        return self.send_json(200, {
                            "success": True,
                            "token": session_token,
                            "user": {
                                "id": u['id'],
                                "name": u['name'],
                                "email": u['email'],
                                "role": u['role'],
                                "status": u['status'],
                                "is_verified": 1,
                                "device_approved": 1
                            },
                            "message": f"Тавтай морил, {u['name']}! Сургалтын эрх сэргээгдлээ."
                        })
                conn.close()
                return self.send_json(400, {
                    "error": "code_already_used",
                    "message": "Энэ кодыг өмнө нь өөр төхөөрөмж дээр ашигласан байна. Нэг код зөвхөн 1 төхөөрөмжид хүчинтэй. Батцогтоос шинэ код авна уу."
                })

            # Check expiration if set
            if inv['expires_at'] and now > inv['expires_at']:
                conn.close()
                return self.send_json(400, {"error": "code_expired", "message": "Энэ кодын хүчинтэй хугацаа дууссан байна."})

            # Fresh Code Activation: Create student user with active status
            clean_tag = code.lower().replace('-', '_')
            user_email = f"student_{clean_tag}@mongolianmedia.mn"
            c.execute('''
            INSERT INTO users (name, email, role, status, is_verified, created_at, last_login_at)
            VALUES (?, ?, 'user', 'active', 1, ?, ?)
            ''', (name, user_email, now, now))
            user_id = c.lastrowid

            # Bind invite to this user and device
            c.execute('''
            UPDATE invites SET is_used = 1, used_at = ?, used_by_user_id = ?, used_by_device_id = ?
            WHERE id = ?
            ''', (now, user_id, device_id, inv['id']))

            # Register approved device
            c.execute('''
            INSERT INTO devices (user_id, device_id, device_name, is_approved, created_at, last_used_at)
            VALUES (?, ?, ?, 1, ?, ?)
            ''', (user_id, device_id, device_name, now, now))

            # Create authenticated session
            session_token = secrets.token_urlsafe(32)
            token_h = hash_token(session_token)
            session_exp = now + (CONFIG["security"]["session_expiry_days"] * 86400)
            c.execute('''
            INSERT INTO sessions (user_id, token_hash, device_id, device_name, created_at, expires_at, is_active)
            VALUES (?, ?, ?, ?, ?, ?, 1)
            ''', (user_id, token_h, device_id, device_name, now, session_exp))

            conn.commit()
            conn.close()

            log_audit(user_email, 'CODE_LOGIN_SUCCESS', code, f"Student: {name} | Device: {device_name}")
            add_notification('invite_used', 'Шинэ суралцагч нэвтэрлээ', f"{name} ({code}) кодоор 30 өдрийн хичээлээ нээлээ.", user_id)

            return self.send_json(200, {
                "success": True,
                "token": session_token,
                "user": {
                    "id": user_id,
                    "name": name,
                    "email": user_email,
                    "role": "user",
                    "status": "active",
                    "is_verified": 1,
                    "device_approved": 1
                },
                "message": f"Тавтай морил, {name}! 30 өдрийн хичээл амжилттай нээгдлээ."
            })

        # 1. Request OTP Code (Register or Login)
        if path == '/api/auth/request-otp':
            email = data.get('email', '').strip().lower()
            name = data.get('name', '').strip() or 'Суралцагч'
            
            if not email or '@' not in email:
                return self.send_json(400, {"error": "invalid_email", "message": "Зөв имэйл хаяг оруулна уу."})

            otp = generate_otp()
            otp_h = hash_token(otp)
            expiry = time.time() + (CONFIG["security"]["otp_expiry_minutes"] * 60)
            now = time.time()

            conn = get_db()
            c = conn.cursor()
            c.execute("SELECT * FROM users WHERE email = ?", (email,))
            existing = c.fetchone()

            if existing:
                c.execute('''
                UPDATE users SET otp_hash = ?, otp_expires_at = ? WHERE id = ?
                ''', (otp_h, expiry, existing['id']))
                user_id = existing['id']
                user_name = existing['name']
                is_new = False
            else:
                c.execute('''
                INSERT INTO users (name, email, role, status, is_verified, otp_hash, otp_expires_at, created_at)
                VALUES (?, ?, 'user', 'pending_payment', 0, ?, ?, ?)
                ''', (name, email, otp_h, expiry, now))
                user_id = c.lastrowid
                user_name = name
                is_new = True

            conn.commit()
            conn.close()

            # Dispatch OTP email
            ok, msg = send_email_otp(email, otp, user_name)

            if is_new:
                add_notification('user_registered', 'Шинэ бүртгэл үүсгэгдлээ', f"Шинэ хэрэглэгч: {user_name} ({email})", user_id)
                log_audit('SYSTEM', 'USER_REGISTER_REQUEST', email)

            resp_payload = {
                "success": True,
                "message": f"6 оронтой код {email} хаяг руу илгээгдлээ." if ok else "Имэйл сервер тохируулагдаагүй тул нэвтрэх кодыг доор харууллаа.",
                "email": email,
                "smtp_sent": ok,
                "expires_in_minutes": CONFIG["security"]["otp_expiry_minutes"]
            }
            # Provide dev_otp ONLY for normal test users when SMTP is disabled, NEVER for owner/admin
            admin_email = CONFIG["server"]["owner_email"].strip().lower()
            if email != admin_email and (not ok or not CONFIG["smtp"]["enabled"]):
                resp_payload["dev_otp"] = otp

            return self.send_json(200, resp_payload)

        # 2. Dedicated Secure Admin Password Login (Owner: Battsogt only)
        if path == '/api/auth/admin-login':
            email = data.get('email', '').strip().lower()
            password = data.get('password', '').strip()
            device_id = data.get('device_id', '').strip() or secrets.token_hex(8)
            device_name = data.get('device_name', '').strip() or 'Admin Device'

            admin_pwd = os.environ.get('ADMIN_PASSWORD') or CONFIG["server"].get("admin_password", "admin")
            if password != admin_pwd:
                log_audit('SYSTEM', 'ADMIN_LOGIN_FAILED', f"Email: {email} | IP: {self.client_address[0]}")
                return self.send_json(401, {"error": "invalid_password", "message": "Админы нууц үг буруу байна."})

            conn = get_db()
            c = conn.cursor()
            c.execute("SELECT * FROM users WHERE email = ? AND role = 'admin'", (email,))
            u = c.fetchone()
            if not u:
                # If email matches owner_email or smtp user, auto promote to admin
                owner_emails = [
                    CONFIG["server"]["owner_email"].strip().lower(),
                    CONFIG["smtp"].get("user", "").strip().lower(),
                    "nbattsogt@gmail.com",
                    "admin@mongolianmedia.mn"
                ]
                if email in owner_emails:
                    c.execute("SELECT * FROM users WHERE email = ?", (email,))
                    existing = c.fetchone()
                    now = time.time()
                    if existing:
                        c.execute("UPDATE users SET role = 'admin', status = 'active', is_verified = 1 WHERE id = ?", (existing['id'],))
                        c.execute("SELECT * FROM users WHERE id = ?", (existing['id'],))
                        u = c.fetchone()
                    else:
                        c.execute("INSERT INTO users (name, email, role, status, is_verified, created_at) VALUES ('Батцогт', ?, 'admin', 'active', 1, ?)", (email, now))
                        c.execute("SELECT * FROM users WHERE id = ?", (c.lastrowid,))
                        u = c.fetchone()
                    conn.commit()
                else:
                    conn.close()
                    return self.send_json(403, {"error": "forbidden", "message": "Зөвхөн админ эрхтэй имэйлээр нэвтэрнэ."})

            now = time.time()
            session_token = secrets.token_urlsafe(32)
            token_h = hash_token(session_token)
            session_exp = now + (CONFIG["security"]["session_expiry_days"] * 86400)

            c.execute('''
            INSERT INTO sessions (user_id, token_hash, device_id, device_name, created_at, expires_at, is_active)
            VALUES (?, ?, ?, ?, ?, ?, 1)
            ''', (u['id'], token_h, device_id, device_name, now, session_exp))

            # Auto approve admin device
            c.execute("SELECT id FROM devices WHERE user_id = ? AND device_id = ?", (u['id'], device_id))
            dev = c.fetchone()
            if dev:
                c.execute("UPDATE devices SET is_approved = 1, last_used_at = ? WHERE id = ?", (now, dev['id']))
            else:
                c.execute('''
                INSERT INTO devices (user_id, device_id, device_name, is_approved, created_at, last_used_at)
                VALUES (?, ?, ?, 1, ?, ?)
                ''', (u['id'], device_id, device_name, now, now))

            c.execute("UPDATE users SET last_login_at = ? WHERE id = ?", (now, u['id']))
            conn.commit()
            conn.close()

            log_audit(u['email'], 'ADMIN_PASSWORD_LOGIN_SUCCESS', u['email'])

            return self.send_json(200, {
                "success": True,
                "token": session_token,
                "user": {
                    "id": u['id'],
                    "name": u['name'],
                    "email": u['email'],
                    "role": u['role'],
                    "status": u['status'],
                    "is_verified": 1,
                    "device_approved": 1
                }
            })

        # 2. Verify OTP Code & Establish Session
        if path == '/api/auth/verify-otp':
            email = data.get('email', '').strip().lower()
            otp = data.get('otp', '').strip()
            device_id = data.get('device_id', '').strip() or secrets.token_hex(8)
            device_name = data.get('device_name', '').strip() or 'Mobile Device'

            if not email or not otp:
                return self.send_json(400, {"error": "missing_params", "message": "Имэйл болон кодоо оруулна уу."})

            conn = get_db()
            c = conn.cursor()
            c.execute("SELECT * FROM users WHERE email = ?", (email,))
            u = c.fetchone()

            if not u:
                conn.close()
                return self.send_json(404, {"error": "user_not_found", "message": "Хэрэглэгч олдсонгүй."})

            now = time.time()
            if not u['otp_hash'] or not u['otp_expires_at'] or now > u['otp_expires_at']:
                conn.close()
                return self.send_json(400, {"error": "otp_expired", "message": "Кодын хугацаа дууссан байна. Дахин код авна уу."})

            if hash_token(otp) != u['otp_hash']:
                conn.close()
                return self.send_json(400, {"error": "otp_invalid", "message": "Нэвтрэх код буруу байна."})

            # OTP Verified: Invalidate OTP so it cannot be reused
            c.execute('''
            UPDATE users SET otp_hash = NULL, otp_expires_at = NULL, is_verified = 1, last_login_at = ?
            WHERE id = ?
            ''', (now, u['id']))

            # Device registration & single-device policy
            c.execute("SELECT * FROM devices WHERE user_id = ?", (u['id'],))
            existing_devices = c.fetchall()
            
            device_approved = 1
            if not existing_devices:
                # First device is approved automatically
                c.execute('''
                INSERT INTO devices (user_id, device_id, device_name, is_approved, created_at, last_used_at)
                VALUES (?, ?, ?, 1, ?, ?)
                ''', (u['id'], device_id, device_name, now, now))
            else:
                # Check if this exact device is already approved
                c.execute("SELECT * FROM devices WHERE user_id = ? AND device_id = ?", (u['id'], device_id))
                dev = c.fetchone()
                if dev:
                    device_approved = dev['is_approved']
                    c.execute("UPDATE devices SET last_used_at = ? WHERE id = ?", (now, dev['id']))
                else:
                    # New device detected! Enforce single-device rule
                    device_approved = 0
                    c.execute('''
                    INSERT INTO devices (user_id, device_id, device_name, is_approved, created_at, last_used_at)
                    VALUES (?, ?, ?, 0, ?, ?)
                    ''', (u['id'], device_id, device_name, now, now))
                    add_notification('device_change', 'Шинэ төхөөрөмж бүртгэгдлээ', f"{u['name']} ({email}) шинэ төхөөрөмжөөр ({device_name}) орлоо. Зөвшөөрөл шаардлагатай.", u['id'])

            # Create new Session token
            session_token = secrets.token_urlsafe(32)
            token_h = hash_token(session_token)
            session_exp = now + (CONFIG["security"]["session_expiry_days"] * 86400)

            c.execute('''
            INSERT INTO sessions (user_id, token_hash, device_id, device_name, created_at, expires_at, is_active)
            VALUES (?, ?, ?, ?, ?, ?, 1)
            ''', (u['id'], token_h, device_id, device_name, now, session_exp))

            conn.commit()
            conn.close()

            log_audit(email, 'LOGIN_VERIFIED', email, f"Device: {device_name}")

            return self.send_json(200, {
                "success": True,
                "token": session_token,
                "user": {
                    "id": u['id'],
                    "name": u['name'],
                    "email": u['email'],
                    "role": u['role'],
                    "status": u['status'],
                    "is_verified": 1,
                    "device_approved": device_approved
                }
            })

        # 3. Submit Payment Confirmation Receipt
        if path == '/api/payment/submit':
            if not user:
                return self.send_json(401, {"error": "unauthorized"})
            
            ref_no = data.get('reference_no', '').strip()
            notes = data.get('notes', '').strip()
            amount = float(data.get('amount', CONFIG["payment"]["amount_mnt"]))

            conn = get_db()
            c = conn.cursor()
            now = time.time()
            c.execute('''
            INSERT INTO payments (user_id, amount, currency, reference_no, receipt_notes, status, created_at)
            VALUES (?, ?, ?, ?, ?, 'submitted', ?)
            ''', (user['id'], amount, CONFIG["payment"]["currency"], ref_no, notes, now))
            
            add_notification('payment_submitted', 'Төлбөрийн хүсэлт ирлээ', f"{user['name']} ({user['email']}) төлбөр шалгуулахаар хүсэлт илгээлээ. Лавлагаа: {ref_no}", user['id'])
            log_audit(user['email'], 'PAYMENT_SUBMITTED', user['email'], f"Ref: {ref_no}, Amt: {amount}")
            conn.commit()
            conn.close()

            return self.send_json(200, {
                "success": True,
                "message": "Таны төлбөрийн мэдээллийг хүлээн авлаа. Эзэн (Батцогт) шалгаад эрхийг тань нээх болно."
            })

        # 4. Save User Progress
        if path == '/api/progress/save':
            if not user:
                return self.send_json(401, {"error": "unauthorized"})
            progress_state = data.get('state', {})
            now = time.time()

            conn = get_db()
            c = conn.cursor()
            c.execute('''
            INSERT INTO user_progress (user_id, state_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at
            ''', (user['id'], json.dumps(progress_state, ensure_ascii=False), now))
            conn.commit()
            conn.close()

            return self.send_json(200, {"success": True, "updated_at": now})

        # 5. Redeem One-Time Personalized Invite
        if path == '/api/invite/redeem':
            if not user:
                return self.send_json(401, {"error": "unauthorized"})
            raw_invite = data.get('invite_token', '').strip()
            if not raw_invite:
                return self.send_json(400, {"error": "missing_token", "message": "Урилгын кодыг оруулна уу."})

            invite_h = hash_token(raw_invite)
            now = time.time()

            conn = get_db()
            c = conn.cursor()
            # Atomic transaction check
            c.execute('''
            SELECT * FROM invites 
            WHERE token_hash = ? AND is_used = 0 AND expires_at > ?
            ''', (invite_h, now))
            inv = c.fetchone()

            if not inv:
                conn.close()
                return self.send_json(400, {"error": "invalid_or_used_invite", "message": "Энэ урилга хүчингүй болсон эсвэл өмнө нь ашиглагдсан байна."})

            # Check email match
            if inv['email'].lower() != user['email'].lower():
                conn.close()
                return self.send_json(403, {"error": "email_mismatch", "message": f"Энэ урилга зөвхөн {inv['email']} хаягт зориулагдсан байна."})

            # Mark invite used atomically & activate user
            c.execute('''
            UPDATE invites SET is_used = 1, used_at = ?, used_by_user_id = ? WHERE id = ?
            ''', (now, user['id'], inv['id']))
            c.execute("UPDATE users SET status = 'active' WHERE id = ?", (user['id'],))
            conn.commit()
            conn.close()

            log_audit(user['email'], 'INVITE_REDEEMED', user['email'], f"Invite ID: {inv['id']}")
            add_notification('invite_used', 'Урилга амжилттай ашиглагдлаа', f"{user['name']} урилгаар сургалтын эрхээ шууд идэвхжүүллээ.", user['id'])

            return self.send_json(200, {"success": True, "message": "Урилга амжилттай идэвхжиж, сургалтын эрх бүрэн нээгдлээ!"})

        # 6. Admin Actions (Requires Admin Role)
        if path.startswith('/api/admin/'):
            if not user or user['role'] != 'admin':
                return self.send_json(403, {"error": "forbidden", "message": "Зөвхөн админ хандах эрхтэй."})

            action = path.replace('/api/admin/', '')
            conn = get_db()
            c = conn.cursor()
            now = time.time()

            if action == 'approve-payment':
                target_user_id = data.get('user_id')
                c.execute("UPDATE users SET status = 'active' WHERE id = ?", (target_user_id,))
                c.execute("UPDATE payments SET status = 'approved', reviewed_at = ?, reviewed_by = ? WHERE user_id = ?", (now, user['email'], target_user_id))
                conn.commit()
                log_audit(user['email'], 'ADMIN_APPROVE_PAYMENT', str(target_user_id))
                conn.close()
                return self.send_json(200, {"success": True, "message": "Хэрэглэгчийн сургалтын эрхийг идэвхжүүллээ."})

            elif action == 'reject-payment':
                target_user_id = data.get('user_id')
                reason = data.get('reason', 'Төлбөрийн баримт таарсангүй.')
                c.execute("UPDATE payments SET status = 'rejected', receipt_notes = ?, reviewed_at = ?, reviewed_by = ? WHERE user_id = ?", (reason, now, user['email'], target_user_id))
                conn.commit()
                log_audit(user['email'], 'ADMIN_REJECT_PAYMENT', str(target_user_id), reason)
                conn.close()
                return self.send_json(200, {"success": True, "message": "Төлбөрийн хүсэлтийг татгалзлаа."})

            elif action == 'toggle-status':
                target_user_id = data.get('user_id')
                new_status = data.get('status', 'suspended')
                c.execute("UPDATE users SET status = ? WHERE id = ?", (new_status, target_user_id))
                if new_status == 'suspended':
                    # Revoke all active sessions immediately
                    c.execute("UPDATE sessions SET is_active = 0 WHERE user_id = ?", (target_user_id,))
                conn.commit()
                log_audit(user['email'], f"ADMIN_SET_STATUS_{new_status.upper()}", str(target_user_id))
                conn.close()
                return self.send_json(200, {"success": True, "message": f"Төлөвийг '{new_status}' болгож өөрчиллөө."})

            elif action == 'approve-device':
                target_user_id = data.get('user_id')
                # Unapprove all previous devices
                c.execute("UPDATE devices SET is_approved = 0 WHERE user_id = ?", (target_user_id,))
                # Approve latest device
                c.execute("UPDATE devices SET is_approved = 1 WHERE user_id = ? AND id = (SELECT MAX(id) FROM devices WHERE user_id = ?)", (target_user_id, target_user_id))
                conn.commit()
                log_audit(user['email'], 'ADMIN_APPROVE_DEVICE', str(target_user_id))
                conn.close()
                return self.send_json(200, {"success": True, "message": "Шинэ төхөөрөмжийг баталгаажуулж хуучныг цуцаллаа."})

            elif action == 'delete-user':
                target_user_id = data.get('user_id')
                c.execute("DELETE FROM sessions WHERE user_id = ?", (target_user_id,))
                c.execute("DELETE FROM devices WHERE user_id = ?", (target_user_id,))
                c.execute("DELETE FROM payments WHERE user_id = ?", (target_user_id,))
                c.execute("DELETE FROM user_progress WHERE user_id = ?", (target_user_id,))
                c.execute("DELETE FROM users WHERE id = ?", (target_user_id,))
                conn.commit()
                log_audit(user['email'], 'ADMIN_DELETE_USER', str(target_user_id))
                conn.close()
                return self.send_json(200, {"success": True, "message": "Хэрэглэгчийн бүх мэдээллийг бүрэн устгалаа."})

            elif action == 'create-invite':
                target_email = data.get('email', '').strip().lower()
                if not target_email or '@' not in target_email:
                    conn.close()
                    return self.send_json(400, {"error": "invalid_email", "message": "Зөв имэйл хаяг оруулна уу."})

                invite_token = secrets.token_urlsafe(24)
                invite_h = hash_token(invite_token)
                exp = now + (CONFIG["security"]["invite_expiry_hours"] * 3600)

                c.execute('''
                INSERT INTO invites (code, email, token_hash, expires_at, is_used, created_by, created_at)
                VALUES (?, ?, ?, ?, 0, ?, ?)
                ''', (invite_token, target_email, invite_h, exp, user['email'], now))
                conn.commit()
                log_audit(user['email'], 'ADMIN_CREATE_INVITE', target_email)
                conn.close()

                return self.send_json(200, {
                    "success": True,
                    "invite_token": invite_token,
                    "email": target_email,
                    "expires_in_hours": CONFIG["security"]["invite_expiry_hours"]
                })

            elif action == 'create-code':
                count = int(data.get('count', 1))
                count = max(1, min(count, 50))
                raw_custom = data.get('custom_code', '').strip()
                custom_code = re.sub(r'\D', '', raw_custom) if raw_custom else ''
                created = []

                if custom_code:
                    if len(custom_code) != 6:
                        conn.close()
                        return self.send_json(400, {"error": "invalid_code", "message": "Нэвтрэх код заавал 6 оронтой тоо байх ёстой (Жишээ: 123456)."})
                    c.execute("SELECT id FROM invites WHERE code = ?", (custom_code,))
                    if c.fetchone():
                        conn.close()
                        return self.send_json(400, {"error": "duplicate_code", "message": f"'{custom_code}' код аль хэдийн бүртгэгдсэн байна."})
                    c.execute('''
                    INSERT INTO invites (code, token_hash, is_used, created_by, created_at)
                    VALUES (?, ?, 0, ?, ?)
                    ''', (custom_code, hash_token(custom_code), user['email'], now))
                    created.append(custom_code)
                else:
                    for _ in range(count):
                        while True:
                            new_c = str(secrets.randbelow(900000) + 100000)
                            c.execute("SELECT id FROM invites WHERE code = ?", (new_c,))
                            if not c.fetchone():
                                break
                        c.execute('''
                        INSERT INTO invites (code, token_hash, is_used, created_by, created_at)
                        VALUES (?, ?, 0, ?, ?)
                        ''', (new_c, hash_token(new_c), user['email'], now))
                        created.append(new_c)

                conn.commit()
                log_audit(user['email'], 'ADMIN_CREATE_CODES', f"Created {len(created)} codes")
                conn.close()

                return self.send_json(200, {
                    "success": True,
                    "codes": created,
                    "message": f"{len(created)} шинэ нэвтрэх код амжилттай үүсгэгдлээ."
                })

            elif action == 'delete-code':
                code_id = data.get('code_id')
                c.execute("DELETE FROM invites WHERE id = ?", (code_id,))
                conn.commit()
                log_audit(user['email'], 'ADMIN_DELETE_CODE', str(code_id))
                conn.close()
                return self.send_json(200, {"success": True, "message": "Код амжилттай устгагдлаа."})

            conn.close()
            return self.send_json(404, {"error": "unknown_admin_action"})

        return self.send_json(404, {"error": "Not Found"})

# -------------------------------------------------------------
# Main Server Runner
# -------------------------------------------------------------
def run_server(host=None, port=None):
    init_db()
    env_port = os.environ.get('PORT')
    if env_port:
        try:
            port = int(env_port)
        except Exception:
            pass
    port = port or CONFIG["server"]["port"]
    host = host or os.environ.get('HOST') or CONFIG["server"]["host"]

    # Re-use socket
    socketserver.TCPServer.allow_reuse_address = True

    # In local environment, also attempt port 80 if not already on 80
    if port != 80 and not os.environ.get('RENDER') and not os.environ.get('PORT'):
        try:
            httpd_80 = socketserver.TCPServer((host, 80), MongolianMediaServer)
            t = threading.Thread(target=httpd_80.serve_forever, daemon=True)
            t.start()
            print("[+] Порт 80 (шууд хандалт) нээгдлээ: http://localhost/")
        except Exception as e:
            print(f"[*] Порт 80 нээгдсэнгүй (Үндсэн порт {port} ажиллана): {e}")

    with socketserver.TCPServer((host, port), MongolianMediaServer) as httpd:
        print("=" * 65)
        print(f"  {CONFIG['server']['app_name']} — {CONFIG['server']['app_title']}")
        print("=" * 65)
        print(f"[+] Үндсэн сервер амжилттай ажиллаж байна: http://localhost:{port}")
        print(f"[+] Өгөгдлийн сан: {DB_PATH}")
        print(f"[+] Эзэн / Админ: {CONFIG['server']['owner_name']} ({CONFIG['server']['owner_email']})")
        print("\nСерверийг зогсоохын тулд гар дээрх Ctrl+C товчийг дарна уу.\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nСервер зогслоо.")

if __name__ == '__main__':
    run_server()
