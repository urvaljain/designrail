// Raw color versus token reference.
export function Colors() {
  return (
    <div>
      <p className="text-text-muted bg-surface">Token utilities: no findings.</p>
      <p style={{ color: "var(--color-text)" }}>Token variable: no finding.</p>
      <p className="bg-[#1d4ed8]">Arbitrary hex equal to color.brand-hover: DR001.</p>
      <p className="text-slate-700">Default palette: DR001.</p>
      <p style={{ borderColor: "rgb(226, 232, 240)" }}>Inline rgb(): DR001.</p>
      <a href="#ffffff">A URL fragment that looks like a color: no finding.</a>
    </div>
  );
}
