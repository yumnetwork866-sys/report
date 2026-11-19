import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { saveLiveSessionAds } from '../lib/api';

export default function LiveAdsCostEditor({ session, onClose, onSaved, t }) {
  const dialogRef = useRef(null);
  const [adsCost, setAdsCost] = useState(
    session.adsCost !== null && session.adsCost !== undefined ? String(session.adsCost) : ''
  );
  const [currency, setCurrency] = useState(
    session.adsCurrency || session.currency || 'MYR'
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const numCost = adsCost === '' ? 0 : Number(adsCost);
      if (Number.isNaN(numCost) || numCost < 0) {
        throw new Error(t('common.invalidAmount', 'Số tiền không hợp lệ'));
      }
      const result = await saveLiveSessionAds(session.shopId, session.sessionId, {
        ads_cost: numCost,
        currency: currency.toUpperCase(),
        source: 'manual',
      });
      onSaved(result);
      onClose();
    } catch (err) {
      setError(err.message || 'Lỗi khi lưu chi phí Ads');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      className="live-host-editor"
      aria-labelledby="live-ads-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
    >
      <form onSubmit={save}>
        <div className="live-host-editor__header">
          <h3 id="live-ads-editor-title">{t('liveAnalytics.editAdsCost')}</h3>
          <button
            type="button"
            className="live-action-btn"
            onClick={onClose}
            disabled={saving}
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>
        <p style={{ marginTop: 4, marginBottom: 16, fontSize: '0.875rem', color: 'var(--color-muted)' }}>
          {session.creatorNickname || session.creatorUsername} · <span className="font-mono">{session.sessionId}</span>
        </p>

        <div className="field" style={{ marginBottom: 16 }}>
          <label htmlFor="live-ads-cost" style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: '0.875rem' }}>
            {t('liveAnalytics.colAdsCost')}
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                id="live-ads-cost"
                type="number"
                step="0.01"
                min="0"
                className="input"
                style={{ width: '100%', paddingLeft: 12, height: 38 }}
                placeholder="0.00"
                value={adsCost}
                onChange={(e) => setAdsCost(e.target.value)}
                disabled={saving}
                autoFocus
              />
            </div>
            <input
              type="text"
              className="input font-mono"
              style={{ width: 80, height: 38, textAlign: 'center', textTransform: 'uppercase' }}
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              disabled={saving}
              title="Currency"
            />
          </div>
        </div>

        {error ? <p role="alert" className="live-host-editor__error">{error}</p> : null}

        <div className="live-host-editor__actions">
          <button
            type="button"
            className="button button--ghost"
            onClick={onClose}
            disabled={saving}
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="button"
            disabled={saving}
          >
            {saving ? t('liveAnalytics.savingAdsCost') : t('common.save')}
          </button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}
