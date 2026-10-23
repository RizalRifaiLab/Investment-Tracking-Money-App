"""Builds the final Nilai masters (concept A, growing dots) as outlined, filled paths. Run: python build.py"""
INK, ACCENT, PAPER = "#201e1d", "#ec3013", "#f3f2f2"


def stem(x, top, w, bottom=200):
    return f"M{x - w / 2:g} {top}H{x + w / 2:g}V{bottom}H{x - w / 2:g}Z"


def word(w=36, small=22, big=50):
    """'nilai' outlined: baseline 200, x-height 80, ascender 30. Returns (ink path, small dot, big dot, width)."""
    h, a = w / 2, 40
    i1, l = a + 144, a + 204
    ac = l + 102
    i2 = ac + 102
    ro, ri = 42 + h, 42 - h  # n arch and a ring: centre radius 42
    d = (stem(a, 80, w)
         + f"M{a - h:g} 140A{ro:g} {ro:g} 0 0 1 {a + 84 + h:g} 140V200H{a + 84 - h:g}V140A{ri:g} {ri:g} 0 0 0 {a + h:g} 140Z"  # n arch
         + stem(i1, 80, w) + stem(l, 30, w) + stem(ac + 42, 80, w) + stem(i2, 80, w)
         # a ring: outer clockwise, counter clockwise so nonzero fill leaves the counter open
         + f"M{ac - ro:g} 140A{ro:g} {ro:g} 0 1 1 {ac + ro:g} 140A{ro:g} {ro:g} 0 1 1 {ac - ro:g} 140Z"
         + f"M{ac - ri:g} 140A{ri:g} {ri:g} 0 1 0 {ac + ri:g} 140A{ri:g} {ri:g} 0 1 0 {ac - ri:g} 140Z")
    dot = lambda cx, s: f"M{cx - s / 2:g} {66 - s}h{s}v{s}h-{s}Z"  # i-dots sit 14 above the x-height
    return d, dot(i1, small), dot(i2, big), i2 + big / 2 + 22  # big dot overhangs the stem


def symbol(stem_w=48, small=30, big=72):
    """Two i's, a small dot then a big one: small amounts become value."""
    d = stem(86, 116, stem_w, 224) + stem(158, 116, stem_w, 224)
    return d + f"M{86 - small / 2:g} {102 - small}h{small}v{small}h-{small}Z", f"M{158 - big / 2:g} {102 - big}h{big}v{big}h-{big}Z"


def save(name, w, h, paths):
    body = "\n".join(f'<path d="{d}" fill="{c}"/>' for d, c in paths)
    open(name, "w", encoding="utf-8").write(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {h}" width="{w:g}" height="{h}">\n<title>Nilai</title>\n{body}\n</svg>\n')


ink, sd, bd, ww = word()
save("nilai-wordmark.svg", ww, 220, [(ink + sd, INK), (bd, ACCENT)])
save("nilai-wordmark-black.svg", ww, 220, [(ink + sd + bd, "#000")])
# reversed: 2 units thinner against irradiation on dark backgrounds
rink, rsd, rbd, _ = word(w=34, small=21, big=48)
save("nilai-wordmark-reversed.svg", ww, 220, [(rink + rsd, PAPER), (rbd, ACCENT)])

sym, big = symbol()
save("nilai-symbol.svg", 256, 256, [(sym, INK), (big, ACCENT)])
# small-size cut for 16–32 px: slightly heavier stems with a gap that stays open, bigger small dot so it doesn't drop out
ssym, sbig = symbol(stem_w=52, small=40, big=76)
save("nilai-symbol-small.svg", 256, 256, [(ssym, INK), (sbig, ACCENT)])

print("written", ww)
