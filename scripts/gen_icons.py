import zlib, struct, math, os, sys

def create_brand_png(width, height, filename):
    raw_data = bytearray()
    cx, cy = width / 2.0, height / 2.0
    corner_radius = width * 0.22
    
    for y in range(height):
        raw_data.append(0) # filter byte
        for x in range(width):
            dx = max(0, abs(x - cx) - (cx - corner_radius))
            dy = max(0, abs(y - cy) - (cy - corner_radius))
            dist_sq = dx * dx + dy * dy
            if dist_sq > corner_radius * corner_radius:
                raw_data.extend([0, 0, 0, 0])
                continue
                
            # Background deep dark
            r, g, b = 15, 23, 42
            
            # Swirl ring around center
            dist_c = math.hypot(x - cx, y - (cy * 0.85))
            r_ring = width * 0.28
            ring_w = width * 0.05
            if abs(dist_c - r_ring) < ring_w:
                angle = (math.atan2(y - (cy * 0.85), x - cx) + math.pi) / (2 * math.pi)
                # Orange to Cyan to Blue gradient along circle
                if angle < 0.33:
                    r, g, b = 249, 115, 22
                elif angle < 0.66:
                    r, g, b = 6, 182, 212
                else:
                    r, g, b = 59, 130, 246
            
            # Inner circle
            if dist_c < width * 0.16:
                r, g, b = 30, 41, 59
            if dist_c < width * 0.10:
                r, g, b = 14, 165, 233
            if dist_c < width * 0.05:
                r, g, b = 239, 68, 68 # Red shutter center
                
            # REC pill badge at lower portion
            rx = abs(x - cx)
            ry = abs(y - (height * 0.72))
            if rx < width * 0.24 and ry < height * 0.045:
                r, g, b = 30, 41, 59
                if math.hypot(x - (cx - width * 0.14), y - (height * 0.72)) < height * 0.025:
                    r, g, b = 239, 68, 68
                    
            raw_data.extend([r, g, b, 255])
            
    def png_chunk(chunk_type, data):
        c = chunk_type + data
        crc = zlib.crc32(c) & 0xffffffff
        return struct.pack('>I', len(data)) + c + struct.pack('>I', crc)

    header = b'\x89PNG\r\n\x1a\n'
    ihdr = png_chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    compressed = zlib.compress(bytes(raw_data), level=9)
    idat = png_chunk(b'IDAT', compressed)
    iend = png_chunk(b'IEND', b'')
    
    with open(filename, 'wb') as f:
        f.write(header + ihdr + idat + iend)

out_dir = r'D:\СОЛОНГОС ХЭЛ\MONGOLIAN_MEDIA_APP\public\assets'
create_brand_png(192, 192, os.path.join(out_dir, 'icon-192.png'))
create_brand_png(512, 512, os.path.join(out_dir, 'icon-512.png'))
print('Brand PNG icons generated!')
