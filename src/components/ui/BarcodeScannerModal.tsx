import React, { useEffect, useRef, useState } from 'react';
import { ScanLine, CameraOff, Keyboard, X } from 'lucide-react';
import { Modal, Btn, inputCls } from '../ui';

interface BarcodeScannerModalProps {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
  hint?: string;
}

type Detector = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue?: string; format?: string }[]>;
};

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({ open, onClose, onDetected, hint }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [cameraError, setCameraError] = useState('');
  const [supports, setSupports] = useState<'checking' | 'available' | 'missing'>('checking');
  const [detecting, setDetecting] = useState(true);
  const [manual, setManual] = useState('');
  const focused = useRef(true);

  useEffect(() => {
    if (!open) return;
    if ('BarcodeDetector' in window) setSupports('available');
    else setSupports('missing');
    setCameraError('');
    setManual('');
    setDetecting(true);

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setCameraError('تعذر الوصول للكاميرا — امنح صلاحية الكاميرا أو استخدم الإدخال اليدوي.');
      }
    };
    start();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      cancelAnimationFrame(rafRef.current);
    };
  }, [open]);

  useEffect(() => {
    if (!open || supports !== 'available' || !detecting) return;
    const tick = async () => {
      rafRef.current = requestAnimationFrame(tick);
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      try {
        const DetectorCtor = (window as unknown as { BarcodeDetector: new (_opts?: unknown) => Detector }).BarcodeDetector;
        const detector: Detector = 'getSupportedFormats' in DetectorCtor.prototype ? new DetectorCtor() : (new DetectorCtor() as Detector);
        const codes = await detector.detect(video);
        if (codes.length > 0 && focused.current) {
          const code = codes[0].rawValue || '';
          if (code) { focused.current = false; onDetected(code); setDetecting(false); }
        }
      } catch { /* frame error — تابع المحاولة */ }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [open, supports, detecting, onDetected]);

  const close = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    onClose();
    setTimeout(() => { focused.current = true; }, 350);
  };

  const submitManual = () => {
    const code = manual.trim();
    if (code) { onDetected(code); setManual(''); setDetecting(true); }
  };

  return (
    <Modal open={open} onClose={close} title="ماسح الباركود بالكاميرا" wide>
      <div className="space-y-3 text-xs">
        {supports === 'available' ? (
          <div className="relative rounded-2xl overflow-hidden bg-stone-950">
            <video ref={videoRef} className="w-full h-64 object-cover" muted playsInline autoPlay />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-56 h-32 rounded-xl border-2 border-emerald-400/90 shadow-[0_0_0_9999px_rgba(12,10,9,0.55)]" />
            </div>
            <div className="absolute bottom-3 inset-x-3 flex items-center justify-between">
              <span className="bg-black/50 text-emerald-300 text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1"><ScanLine className="w-3 h-3" /> وجّه الكاميرا إلى الرمز</span>
              {cameraError && <span className="bg-rose-900/80 text-rose-100 text-[10px] font-bold px-2 py-1 rounded-lg">{cameraError}</span>}
            </div>
            {!detecting && (
              <button onClick={() => { focused.current = true; setDetecting(true); }} className="absolute top-3 inset-x-3 mx-auto w-fit bg-emerald-600 text-white text-[11px] font-black px-3 py-1.5 rounded-xl">
                جاهز للقراءة التالية
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
            <CameraOff className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-black text-amber-900 text-xs">المتصفح الحالي لا يدعم قراءة الكاميرا تلقائياً</p>
              <p className="text-[11px] text-amber-800 font-bold mt-1">جرّب Chrome أو Edge على الهاتف، أو استخدم الإدخال اليدوي أدناه.</p>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
          <p className="flex items-center gap-1.5 font-black text-slate-700"><Keyboard className="w-3.5 h-3.5 text-indigo-500" /> إدخال يدوي (بديل)</p>
          <div className="flex gap-2">
            <input className={inputCls} dir="ltr" placeholder="مثال: 6291041500213" value={manual} onChange={(e) => setManual(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitManual(); }} />
            <Btn onClick={submitManual} disabled={!manual.trim()}>قراءة الكود</Btn>
          </div>
        </div>

        {hint && <p className="text-[11px] font-bold text-slate-500">{hint}</p>}
        <div className="flex justify-end pt-1">
          <Btn tone="ghost" onClick={close}><X className="w-4 h-4" /> إغلاق</Btn>
        </div>
      </div>
    </Modal>
  );
};