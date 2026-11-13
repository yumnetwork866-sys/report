import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { UserRound, X } from 'lucide-react';
import { fetchLiveHostUsers, saveLiveHost } from '../lib/api';
import SelectDropdown from './SelectDropdown';
import TargetKocAvatar from './booking/TargetKocAvatar';

export default function LiveHostEditor({ session, onClose, onSaved, t }) {
  const dialogRef = useRef(null);
  const [users, setUsers] = useState([]);
  const [userId, setUserId] = useState(String(session.host?.id || ''));
  const [comment, setComment] = useState(session.host?.comment || session.comment || '');
  const [loading, setLoading] = useState(true);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selectedUser = users.find((user) => String(user.id) === userId)
    || (String(session.host?.id) === userId ? session.host : null);
  const userAvatar = (user) => (
    <TargetKocAvatar
      src={user.avatar_url}
      name={user.name || user.email}
    />
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchLiveHostUsers(controller.signal).then((rows) => {
      if (!controller.signal.aborted) {
        setUsers(rows);
        setUsersLoaded(true);
      }
    }).catch((err) => {
      if (!controller.signal.aborted) setError(err.message);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, []);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const result = await saveLiveHost(session.shopId, session.sessionId, userId ? Number(userId) : null, comment.trim());
      onSaved({ host: result.host, comment: result.comment !== undefined ? result.comment : comment.trim() });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <dialog ref={dialogRef} className="live-host-editor" aria-labelledby="live-host-editor-title" onCancel={(event) => {
      event.preventDefault();
      if (!saving) onClose();
    }}>
      <form onSubmit={save}>
        <div className="live-host-editor__header">
          <h3 id="live-host-editor-title">{t('liveAnalytics.editHost')}</h3>
          <button type="button" className="live-action-btn" onClick={onClose} disabled={saving} aria-label={t('common.close')}><X size={18} /></button>
        </div>
        <p>{session.creatorNickname || session.creatorUsername} · {session.sessionId}</p>
        <div className="field">
          <label htmlFor="live-host-user">{t('liveAnalytics.appHost')}</label>
          <SelectDropdown
            id="live-host-user"
            value={userId}
            onChange={setUserId}
            disabled={loading || saving}
            icon={selectedUser ? userAvatar(selectedUser) : <UserRound size={16} />}
            options={[
              { value: '', label: t('liveAnalytics.unassignedHost'), icon: <UserRound size={16} /> },
              ...(session.host && !users.some((user) => String(user.id) === String(session.host.id))
                ? [{ value: String(session.host.id), label: session.host.name || session.host.email, subtitle: session.host.email, icon: userAvatar(session.host) }]
                : []),
              ...users.map((user) => ({ value: String(user.id), label: user.name || user.email, subtitle: user.email, icon: userAvatar(user) })),
            ]}
          />
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="live-session-comment">{t('liveAnalytics.colComment', 'Ghi chú / Comment')}</label>
          <textarea
            id="live-session-comment"
            className="input"
            rows={3}
            style={{ width: '100%', resize: 'vertical', fontSize: '0.8125rem' }}
            placeholder={t('liveAnalytics.commentPlaceholder', 'Nhập ghi chú hoặc nhận xét về phiên live này...')}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={saving}
          />
        </div>
        {loading ? <p>{t('liveAnalytics.loading')}</p> : null}
        {error ? <p role="alert" className="live-host-editor__error">{error}</p> : null}
        <div className="live-host-editor__actions">
          <button type="button" className="button button--ghost" onClick={onClose} disabled={saving}>{t('common.cancel')}</button>
          <button type="submit" className="button" disabled={!usersLoaded || loading || saving}>{saving ? t('liveAnalytics.savingHost') : t('common.save')}</button>
        </div>
      </form>
    </dialog>, document.body,
  );
}
