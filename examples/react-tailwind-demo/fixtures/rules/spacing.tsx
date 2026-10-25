// Valid versus invalid spacing (the demo sets numericSpacing: flag and remBasePx: 16).
export function Spacing() {
  return (
    <div className="flex flex-col gap-md p-lg">
      <div className="mx-auto mt-0 -mb-sm">Named tokens, auto, zero, negative token: no findings.</div>
      <div className="p-[13px]">Arbitrary length: DR002.</div>
      <div className="mt-4">Numeric utility (flagged by the demo policy): DR002.</div>
      <div style={{ padding: 16 }}>Inline 16px equals spacing.md: DR002 with a token suggestion.</div>
    </div>
  );
}
