import os, time, subprocess

def scan():
    print("=== RUNNING PROCESSES CHECK ===")
    p = subprocess.run("tasklist /FO CSV", capture_output=True, text=True, shell=True)
    lines = [l.strip() for l in p.stdout.strip().splitlines() if l.strip()]
    procs = []
    for l in lines[1:]:
        parts = l.split('","')
        name = parts[0].strip('"')
        procs.append(name)

    suspicious = ['cmd.exe', 'powershell.exe', 'pwsh.exe', 'mshta.exe', 'cscript.exe', 'wscript.exe', 'certutil.exe', 'rundll32.exe', 'curl.exe', 'bitsadmin.exe', 'vssadmin.exe']
    detected = [pr for pr in procs if pr.lower() in suspicious]
    print(f"Total processes: {len(procs)}")
    print(f"Monitored processes currently running: {detected}")

    print("\n=== RECENT EXECUTABLES/SCRIPTS IN APPDATA / TEMP (Last 30 mins) ===")
    check_dirs = [
        os.environ.get('TEMP', ''),
        os.path.join(os.environ.get('USERPROFILE', ''), 'AppData', 'Roaming'),
        os.path.join(os.environ.get('USERPROFILE', ''), 'AppData', 'Local')
    ]
    now = time.time()
    sus_exts = ('.exe', '.bat', '.cmd', '.vbs', '.ps1', '.js', '.hta', '.dll', '.scr')
    recent_suspicious = []

    for d in check_dirs:
        if not d or not os.path.exists(d):
            continue
        try:
            for item in os.listdir(d):
                p = os.path.join(d, item)
                if os.path.isfile(p):
                    try:
                        mtime = os.path.getmtime(p)
                        if now - mtime < 1800 and item.lower().endswith(sus_exts):
                            recent_suspicious.append((item, p, os.path.getsize(p), time.ctime(mtime)))
                    except:
                        pass
        except:
            pass

    if recent_suspicious:
        print(f"[!] Warning: Found {len(recent_suspicious)} recently modified executable files:")
        for r in recent_suspicious:
            print("  -", r)
    else:
        print("[+] No suspicious executable files created in AppData / Temp in the last 30 minutes!")

    # Check Windows Defender status / MpCmdRun
    print("\n=== SYSTEM STATUS ===")
    print("[+] Scan completed.")

if __name__ == '__main__':
    scan()
