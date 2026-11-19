#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MONGOLIAN MEDIA — Launcher Script
Discovers network IP, updates QR Code, opens browser, and runs the server.
"""
import os
import sys
import socket
import webbrowser
import threading
import time

# Ensure working directory is this folder
APP_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(APP_DIR)
sys.path.insert(0, APP_DIR)

import server
from scripts.generate_qr import build_qr_svg

def get_lan_ip():
    """Discover local network IP address"""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Does not actually connect, just resolves outbound route
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        try:
            ip = socket.gethostbyname(socket.gethostname())
        except Exception:
            ip = '127.0.0.1'
    finally:
        s.close()
    return ip

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'app'
    ip = get_lan_ip()
    port = server.CONFIG.get('server', {}).get('port', 8080)

    lan_url = f"http://{ip}:{port}/"
    local_url = f"http://localhost:{port}/"
    connect_url = f"http://localhost:{port}/connect.html?ip={ip}:{port}"

    # Generate QR Code for LAN URL
    try:
        svg_content = build_qr_svg(lan_url)
        qr_path = os.path.join(APP_DIR, 'public', 'assets', 'qr_code.svg')
        with open(qr_path, 'w', encoding='utf-8') as f:
            f.write(svg_content)
    except Exception as e:
        print(f"[!] QR үүсгэхэд анхаар: {e}")

    print("=" * 65)
    print("      MONGOLIAN MEDIA — Солонгос хэлний сургалтын систем")
    print("=" * 65)
    print(f"[*] Компьютер дээр нээх холбоос: {local_url}")
    print(f"[*] Гар утаснаас нээх холбоос:   {lan_url}")
    print(f"[*] QR кодоор холбогдох:        {connect_url}")
    print("=" * 65)
    print("[+] Сервер ажиллаж байна. Зогсоох бол энэ цонхыг хаана уу (Ctrl+C).")

    # Automatically open browser after 1 second
    target_browser_url = connect_url if mode == 'phone' else local_url
    def open_browser():
        time.sleep(1.2)
        try:
            webbrowser.open(target_browser_url)
        except Exception:
            pass

    threading.Thread(target=open_browser, daemon=True).start()

    # Run Server
    server.run_server()

if __name__ == '__main__':
    main()
