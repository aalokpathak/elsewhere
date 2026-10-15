export function LoadingScreen({ progress, label }: { progress: number; label: string }) {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <img src={`${import.meta.env.BASE_URL}branding/logo-mark.svg`} alt="" className="loading-mark" width={72} height={72} />
      <p className="loading-label">{label}…</p>
      <div className="loading-bar" aria-hidden="true">
        <span style={{ transform: `scaleX(${Math.max(0.02, Math.min(1, progress))})` }} />
      </div>
    </div>
  );
}
