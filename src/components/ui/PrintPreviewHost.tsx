import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Printer, X } from 'lucide-react';

interface PreviewDoc {
  title: string;
  html: string;
}

const PrintPreviewOverlay: React.FC = () => {
  const [doc, setDoc] = useState<PreviewDoc | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    (window as unknown as { __rcerpPrintPreview?: (p: PreviewDoc) => void }).__rcerpPrintPreview = (p) => setDoc(p);
    return () => {
      delete (window as unknown as { __rcerpPrintPreview?: unknown }).__rcerpPrintPreview;
    };
  }, []);

  const close = useCallback(() => setDoc(null), []);

  useEffect(() => {
    if (!doc) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doc, close]);

  if (!doc) return null;

  const doPrint = () => {
    const w = frameRef.current?.contentWindow;
    if (w) { w.focus(); w.print(); }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-slate-950/85 backdrop-blur-sm">
      <div className="h-12 shrink-0 bg-slate-900 border-b border-slate-700 flex items-center justify-between px-4 shadow-lg">
        <strong className="text-white text-sm truncate">{doc.title}</strong>
        <div className="flex items-center gap-2">
          <button onClick={doPrint} className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
            <Printer className="w-4 h-4" /> طباعة
          </button>
          <button onClick={close} className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 transition-colors">
            <X className="w-4 h-4" /> إغلاق
          </button>
        </div>
      </div>
      <iframe
        ref={frameRef}
        title={doc.title}
        srcDoc={doc.html}
        className="flex-1 w-full border-0 bg-white"
      />
    </div>
  );
};

export const mountPrintPreviewHost = () => {
  const hostId = 'rcerp-print-preview-host';
  if (document.getElementById(hostId)) return;
  const el = document.createElement('div');
  el.id = hostId;
  document.body.appendChild(el);
  createRoot(el).render(<PrintPreviewOverlay />);
};
mountPrintPreviewHost();
