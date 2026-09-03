export function HeroBanner() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex w-fit flex-col gap-2 text-center">
        <h1 className="font-data text-hero font-extrabold uppercase leading-none tracking-[-0.02em] text-name">
          <span className="text-isk mr-[0.18em]">[</span>

          Lo-Gang
          <span className="text-isk ml-[0.18em]">]</span>

        </h1>

        <div className="font-data font-normal text-[clamp(14px,2vw,20px)] tracking-[0.28em] uppercase leading-none">
          <span className="text-muted">Industries</span>

          <span className="text-isk tracking-normal">.</span>

          <span className="text-isk">tools</span>

        </div>

      </div>

    </div>

  );
}
