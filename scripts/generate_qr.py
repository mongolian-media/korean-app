#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pure Python QR Code Generator (Version 2-M, 25x25)
Standard-compliant ISO/IEC 18004.
"""
import sys

def build_qr_svg(url, scale=10, border=4):
    # GF(256) tables with primitive poly 0x11d
    exp = [0] * 512
    log = [0] * 256
    x = 1
    for i in range(255):
        exp[i] = x
        exp[i + 255] = x
        log[x] = i
        x <<= 1
        if x & 256: x ^= 0x11d

    def gf_mul(a, b):
        return 0 if (a == 0 or b == 0) else exp[log[a] + log[b]]

    # RS generator polynomial for 16 EC codewords
    gen = [1]
    for i in range(16):
        ng = [0] * (len(gen) + 1)
        for j, c in enumerate(gen):
            ng[j] ^= gf_mul(c, exp[i])
            ng[j + 1] ^= c
        gen = ng

    data_bytes = url.encode('utf-8')
    assert len(data_bytes) <= 26, f"URL too long ({len(data_bytes)} bytes > 26)"
    
    # 4-bit mode (0100 for Byte mode) + 8-bit character count + data
    bits = [0, 1, 0, 0]
    for b in format(len(data_bytes), '08b'):
        bits.append(int(b))
    for byte in data_bytes:
        for b in format(byte, '08b'):
            bits.append(int(b))
    
    # Terminator
    bits.extend([0] * min(4, 28 * 8 - len(bits)))
    while len(bits) % 8 != 0:
        bits.append(0)
    
    data = []
    for i in range(0, len(bits), 8):
        byte = 0
        for b in bits[i:i+8]:
            byte = (byte << 1) | b
        data.append(byte)
    
    pad = [0xEC, 0x11]
    idx = 0
    while len(data) < 28:
        data.append(pad[idx % 2])
        idx += 1
    
    # Calculate 16 Reed-Solomon EC bytes
    ec = [0] * 16
    for b in data:
        factor = b ^ ec[0]
        ec = ec[1:] + [0]
        for j in range(16):
            ec[j] ^= gf_mul(gen[j + 1], factor)
    
    all_bits = []
    for byte in (data + ec):
        for b in format(byte, '08b'):
            all_bits.append(int(b))

    N = 25
    mat = [[0] * N for _ in range(N)]
    res = [[False] * N for _ in range(N)]

    def set_res(r, c, v):
        mat[r][c] = v
        res[r][c] = True

    # 1. Finder patterns (7x7) + Separators (1 module white space)
    def place_finder(r0, c0):
        # 7x7 finder
        for r in range(7):
            for c in range(7):
                v = 1 if (r in (0, 6) or c in (0, 6) or (2 <= r <= 4 and 2 <= c <= 4)) else 0
                set_res(r0 + r, c0 + c, v)
        # Separator border
        for r in range(-1, 8):
            for c in range(-1, 8):
                rr, cc = r0 + r, c0 + c
                if 0 <= rr < N and 0 <= cc < N and not res[rr][cc]:
                    set_res(rr, cc, 0)

    place_finder(0, 0)
    place_finder(0, N - 7)
    place_finder(N - 7, 0)

    # 2. Alignment pattern at (18, 18) for Version 2 (5x5)
    for r in range(16, 21):
        for c in range(16, 21):
            v = 1 if (r in (16, 20) or c in (16, 20) or (r == 18 and c == 18)) else 0
            set_res(r, c, v)

    # 3. Timing patterns (row 6, col 6) alternating 1 and 0
    for i in range(8, N - 8):
        if not res[6][i]:
            set_res(6, i, 1 if i % 2 == 0 else 0)
        if not res[i][6]:
            set_res(i, 6, 1 if i % 2 == 0 else 0)

    # 4. Dark module: (4*V + 9, 8) = (17, 8) for V=2
    set_res(17, 8, 1)

    # 5. Format info area reservations
    # Top-left format positions: bit 0 at (8,0), bit 1 at (8,1) ... bit 14 at (0,8)
    fmt_coords_tl = [
        (8, 0), (8, 1), (8, 2), (8, 3), (8, 4), (8, 5), (8, 7), (8, 8),
        (7, 8), (5, 8), (4, 8), (3, 8), (2, 8), (1, 8), (0, 8)
    ]
    # Other format positions: bit 0 at (24,8) ... bit 14 at (8,24)
    fmt_coords_other = [
        (24, 8), (23, 8), (22, 8), (21, 8), (20, 8), (19, 8), (18, 8),
        (8, 17), (8, 18), (8, 19), (8, 20), (8, 21), (8, 22), (8, 23), (8, 24)
    ]
    for r, c in fmt_coords_tl + fmt_coords_other:
        res[r][c] = True

    # 6. Place data bits with Mask 0: (row + col) % 2 == 0
    bit_idx = 0
    col = N - 1
    up = True
    while col > 0:
        if col == 6:
            col -= 1  # Skip timing column
        row_range = range(N - 1, -1, -1) if up else range(N)
        for r in row_range:
            for c in (col, col - 1):
                if not res[r][c]:
                    b = all_bits[bit_idx] if bit_idx < len(all_bits) else 0
                    bit_idx += 1
                    # Apply Mask 0
                    if (r + c) % 2 == 0:
                        b ^= 1
                    mat[r][c] = b
        up = not up
        col -= 2

    # 7. Write Format Information Bits
    # Format info for ECC M (00) and Mask 0 (000):
    # Mask value 0x5412. Bits: b0..b14 where b0 is LSB
    fmt_val = 0x5412
    fmt_bits = [(fmt_val >> i) & 1 for i in range(15)]
    for i, (r, c) in enumerate(fmt_coords_tl):
        mat[r][c] = fmt_bits[i]
    for i, (r, c) in enumerate(fmt_coords_other):
        mat[r][c] = fmt_bits[i]

    # 8. Render Clean SVG with generous quiet zone
    size = (N + 2 * border) * scale
    rects = []
    for r in range(N):
        for c in range(N):
            if mat[r][c] == 1:
                x_pos = (c + border) * scale
                y_pos = (r + border) * scale
                rects.append(f'<rect x="{x_pos}" y="{y_pos}" width="{scale}" height="{scale}" fill="#000000"/>')

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  {''.join(rects)}
</svg>'''
    return svg

if __name__ == '__main__':
    url = sys.argv[1] if len(sys.argv) > 1 else 'http://172.20.10.5:8080/'
    out = sys.argv[2] if len(sys.argv) > 2 else 'qr.svg'
    svg = build_qr_svg(url)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(svg)
    print(f"[+] QR Code SVG generated: {out} for {url}")
