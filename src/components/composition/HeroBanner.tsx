export function HeroBanner() {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <h1 className="reveal reveal-1 font-data text-mega font-extrabold uppercase leading-none tracking-[-0.02em] text-name [text-shadow:0_0_60px_var(--color-hero-glow)]">
        <span className="hero-bracket mr-[0.14em] inline-block text-isk">[</span>
        Lo-Gang
        <span className="hero-bracket hero-bracket-late ml-[0.14em] inline-block text-isk">]</span>
      </h1>
      <div className="reveal reveal-2 font-data font-normal text-[clamp(14px,1.6vw,20px)] tracking-[0.28em] uppercase leading-none">
        <span className="text-muted">Industries</span>
        <span className="text-isk tracking-normal">.</span>
        <span className="text-isk">tools</span>
      </div>
    </div>
  );
}
