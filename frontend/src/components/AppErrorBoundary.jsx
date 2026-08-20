import React from 'react';
import { Check, Copy } from 'lucide-react';

const CHUNK_ERROR_PATTERN = /Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null, copied: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Log the real error so it can be inspected in the browser console.
    console.error('[AppErrorBoundary] Render error:', error);
    console.error('[AppErrorBoundary] Component stack:', info?.componentStack || '(none)');
  }

  handleReload = () => {
    window.location.reload();
  };

  handleCopy = async () => {
    const { error, info } = this.state;
    const message = String(error?.message || error || 'Unknown error');
    const stack = String(error?.stack || '');
    const componentStack = String(info?.componentStack || '');
    const text = [message, stack, componentStack].filter(Boolean).join('\n\n');

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }

    this.setState({ copied: true });
    window.setTimeout(() => this.setState({ copied: false }), 2000);
  };

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    const isChunkError = CHUNK_ERROR_PATTERN.test(String(error?.message || error));
    const message = String(error?.message || error || 'Unknown error');
    const stack = String(error?.stack || '');
    const componentStack = String(info?.componentStack || '');

    return (
      <div className="app-shell">
        <main className="page">
          <section className="section-card empty-state" role="alert">
            <h1>Không thể hiển thị giao diện</h1>
            <p>
              {isChunkError
                ? 'Phiên bản giao diện vừa được cập nhật. Hãy tải lại ứng dụng để dùng phiên bản mới nhất.'
                : 'Ứng dụng gặp lỗi khi hiển thị. Phiên đăng nhập của bạn vẫn được giữ an toàn.'}
            </p>
            <div className="error-boundary__card">
              <details className="error-boundary__details">
                <summary>Chi tiết lỗi</summary>
                <pre className="error-boundary__stack">{stack || message}</pre>
                {componentStack ? <pre className="error-boundary__stack">{componentStack}</pre> : null}
              </details>
              <button
                className="error-boundary__copy"
                type="button"
                onClick={this.handleCopy}
                aria-label={this.state.copied ? 'Đã sao chép lỗi' : 'Sao chép lỗi'}
                title={this.state.copied ? 'Đã sao chép lỗi' : 'Sao chép lỗi'}
              >
                {this.state.copied ? <Check size={15} /> : <Copy size={15} />}
              </button>
            </div>
            <button className="button" type="button" onClick={this.handleReload}>
              Tải lại ứng dụng
            </button>
          </section>
        </main>
      </div>
    );
  }
}

export default AppErrorBoundary;
