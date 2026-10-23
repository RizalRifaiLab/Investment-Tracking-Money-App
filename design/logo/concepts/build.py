"""Builds the three Nilai logo concepts (black). Run: python build.py"""
W = 36  # letter stroke weight


def word(dots=(36, 36)):
    """'nilai' as stroked paths: baseline 200, x-height 80, ascender 30, square ends. Returns (svg, width)."""
    a = 40
    i1, l = a + 144, a + 204
    ac = l + 102
    i2 = ac + 102
    d = (f"M{a} 200V80M{a} 140A42 42 0 0 1 {a+84} 140V200"  # n
         f"M{i1} 200V80"                                    # i
         f"M{l} 200V30"                                     # l
         f"M{ac+42} 80V200"                                 # a stem
         f"M{i2} 200V80")                                   # i
    out = [f'<path d="{d}" fill="none" stroke="#000" stroke-width="{W}"/>',
           f'<circle cx="{ac}" cy="140" r="42" fill="none" stroke="#000" stroke-width="{W}"/>']
    for cx, s in zip((i1, i2), dots):  # i-dots sit 14 above the x-height
        out.append(f'<rect x="{cx - s / 2:g}" y="{66 - s}" width="{s}" height="{s}" fill="#000"/>')
    return "\n".join(out), i2 + 18 + 20


def svg(w, body, h=256):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n<title>Nilai</title>\n{body}\n</svg>\n'


def save(name, w, body, h=256):
    open(name, "w", encoding="utf-8").write(svg(w, body, h))


# A: growing dots — the two i-dots grow, small amounts become value
body, w = word(dots=(22, 50))
save("a-lockup.svg", w, body)
# two i's, centred: a small dot, then one more than twice its size
save("a-symbol.svg", 256, '<path d="M86 224V116M158 224V116" fill="none" stroke="#000" stroke-width="48"/>\n'
                           '<rect x="71" y="72" width="30" height="30" fill="#000"/>\n'
                           '<rect x="122" y="30" width="72" height="72" fill="#000"/>')

# B: tally N — four strokes and a 45° slash between the outer stems
b_sym = "".join(f'<rect x="{c - 13:g}" y="36" width="26" height="184" fill="#000"/>' for c in (49, 101.67, 154.33, 207))
b_sym += '\n<polygon points="62,44 62,80 194,212 194,176" fill="#000"/>'
save("b-symbol.svg", 256, b_sym)

# C: sempoa n — the n is an abacus rod carrying one diamond bead
c_sym = ('<path d="M70 216V64M70 132A58 58 0 0 1 186 132V216" fill="none" stroke="#000" stroke-width="36"/>\n'
         '<polygon points="186,118 230,162 186,206 142,162" fill="#000"/>')
save("c-symbol.svg", 256, f'<g transform="translate(-13 -8)">{c_sym}</g>')  # optically centred

plain, pw = word()
for k, sym in (("b", b_sym), ("c", c_sym)):
    save(f"{k}-lockup.svg", 220 + pw, f'<g transform="translate(0 28) scale(0.78)">{sym}</g>\n<g transform="translate(220 0)">{plain}</g>')
print("written")
