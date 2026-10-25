// Missing alt versus decorative alt.
export function Images({ caption }: { caption: string }) {
  return (
    <div>
      <img src="/hero.png" />
      <img src="/divider.svg" alt="" />
      <img src="/chart.png" alt={caption} />
    </div>
  );
}
