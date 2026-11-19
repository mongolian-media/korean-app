import os, glob

def check_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        code = f.read()

    i = 0
    n = len(code)
    stack = []
    pairs = {')': '(', '}': '{', ']': '['}
    line = 1
    errors = []
    modes = ['code']

    while i < n:
        c = code[i]
        if c == '\n':
            line += 1
            i += 1
            continue

        curr = modes[-1]

        if isinstance(curr, tuple) and curr[0] == 'string':
            quote = curr[1]
            if c == '\\':
                i += 2
                continue
            if c == quote:
                modes.pop()
            i += 1
            continue

        if isinstance(curr, tuple) and curr[0] == 'template':
            if c == '\\':
                i += 2
                continue
            if c == '`':
                modes.pop()
                i += 1
                continue
            if c == '$' and i + 1 < n and code[i+1] == '{':
                modes.append('code')
                stack.append(('${', line))
                i += 2
                continue
            i += 1
            continue

        # In code mode
        if c == '/' and i + 1 < n and code[i+1] == '/':
            while i < n and code[i] != '\n':
                i += 1
            continue

        if c == '/' and i + 1 < n and code[i+1] == '*':
            i += 2
            while i + 1 < n and not (code[i] == '*' and code[i+1] == '/'):
                if code[i] == '\n':
                    line += 1
                i += 1
            i += 2
            continue

        if c in ("'", '"'):
            modes.append(('string', c))
            i += 1
            continue

        if c == '`':
            modes.append(('template', line))
            i += 1
            continue

        if c in '({[':
            stack.append((c, line))
        elif c in ')}]':
            if not stack:
                errors.append(f'Unmatched closing {c} at line {line}')
            else:
                top, t_line = stack.pop()
                if top == '${' and c == '}':
                    if modes[-1] == 'code' and len(modes) > 1 and isinstance(modes[-2], tuple) and modes[-2][0] == 'template':
                        modes.pop()
                elif top != pairs.get(c):
                    errors.append(f'Mismatched {c} at line {line}, expected {top} from line {t_line}')

        i += 1

    if stack:
        errors.append(f'Unclosed brackets: {len(stack)}, first unclosed {stack[0]}')

    if errors:
        print(f'FAIL {os.path.basename(path)}:')
        for e in errors[:5]:
            print('   ', e)
    else:
        print(f'OK {os.path.basename(path)}')

if __name__ == '__main__':
    for p in sorted(glob.glob('D:/СОЛОНГОС ХЭЛ/MONGOLIAN_MEDIA_APP/public/js/*.js')):
        check_file(p)
