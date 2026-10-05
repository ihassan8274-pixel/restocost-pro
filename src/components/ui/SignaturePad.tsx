import React, { useEffect, useRef, useState } from 'react';
import { Trash2, PenLine, Eraser } from 'lucide-react';

interface SignaturePadProps {
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
  height?: number;
  label?: string;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({ value, onChange, height = 180, label = 'وقّع هنا باللمس أو بالفأرة' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(!!value);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = cv.getBoundingClientRect();
    cv.width = rect.width * dpr;
    cv.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e293b';
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = value;
    }
  }, [value]);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawing.current = true;
    canvasRef.current!.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const end = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    emit();
  };

  const emit = () => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let empty = true;
    for (let i = 3; i < data.length; i += 4) { if (data[i] !== 0) { empty = false; break; } }
    if (empty) { onChange(null); setHasInk(false); return; }
    onChange(cv.toDataURL('image/png'));
    setHasInk(true);
  };

  const clear = () => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (cv && ctx) ctx.clearRect(0, 0, cv.width, cv.height);
    onChange(null);
    setHasInk(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[11px] font-extrabold text-slate-600 flex items-center gap-1.5"><PenLine className="w-3.5 h-3.5 text-brand-500" /> {label}</span>
        <div className="flex items-center gap-1">
          {hasInk && (
            <button type="button" onClick={emit} className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1 hover:bg-emerald-100">
              <Eraser className="w-3 h-3" /> اعتماد الرسم
            </button>
          )}
          <button type="button" onClick={clear} className="flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1 hover:bg-rose-100">
            <Trash2 className="w-3 h-3" /> مسح
          </button>
        </div>
      </div>
      <div className="relative border-2 border-dashed border-slate-300 rounded-xl bg-white overflow-hidden" style={{ height }}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
        {!hasInk && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-slate-300 font-bold text-xs select-none">
            {label}
          </div>
        )}
      </div>
    </div>
  );
};