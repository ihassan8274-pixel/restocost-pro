import React from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  label?: string;
  resetKey?: string | number;
  onHome?: () => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] ' + (this.props.label || 'screen'), error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center px-4" dir="rtl">
        <div className="w-16 h-16 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <div>
          <p className="font-extrabold text-slate-900 text-base">حدث خطأ غير متوقع في {this.props.label || 'هذه الشاشة'}</p>
          <p className="text-xs text-slate-500 font-bold mt-1 leading-relaxed max-w-md">
            لم تتأثر باقي أجزاء النظام — أعد تحميل الشاشة أو استخدم <span className="text-rose-600">Ctrl+Z</span> للتراجع عن آخر تعديل.
          </p>
          {error.message && (
            <p className="mt-2 text-[11px] font-mono bg-rose-50 border border-rose-200 text-rose-800 rounded-lg px-3 py-2 inline-block max-w-lg break-all">
              {error.message}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={this.reset}
            className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-extrabold transition-colors shadow-card"
          >
            <RotateCcw className="w-3.5 h-3.5" /> إعادة المحاولة
          </button>
          {this.props.onHome && (
            <button
              onClick={this.props.onHome}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-700 text-white rounded-xl text-xs font-extrabold transition-colors"
            >
              <Home className="w-3.5 h-3.5" /> العودة للوحة التحكم
            </button>
          )}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;