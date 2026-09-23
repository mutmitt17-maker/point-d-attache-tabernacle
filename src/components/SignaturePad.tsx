import { useEffect, useRef } from 'react';
import SignaturePadLib from 'signature_pad';
import { Eraser } from 'lucide-react';

export function SignaturePad({ label, onChange }: { label: string; onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d')?.scale(ratio, ratio);
    const pad = new SignaturePadLib(canvas, { backgroundColor: '#ffffff' });
    pad.addEventListener('endStroke', () => onChange(pad.isEmpty() ? null : pad.toDataURL('image/png')));
    padRef.current = pad;
    return () => pad.off();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="signature-field">
      <div className="signature-head">
        <span>{label}</span>
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            padRef.current?.clear();
            onChange(null);
          }}
        >
          <Eraser size={15} /> Effacer
        </button>
      </div>
      <canvas ref={canvasRef} className="signature-canvas" />
    </div>
  );
}
