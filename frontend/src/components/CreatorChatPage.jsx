import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchTikTokSellerCreatorConversation,
  fetchTikTokSellerMarketplaceCreators,
  fetchTikTokShops,
  sendTikTokSellerCreatorMessage,
} from '../lib/api';
import { useI18n } from '../lib/language';
import {
  creatorMessagingErrorText,
  creatorMessagingText,
  isCreatorMessagingNotice,
} from '../lib/tiktokCreatorMessaging';
import ShopDropdown from './ShopDropdown';
import {
  getStoredSelectedShopId,
  resolveSelectedShopId,
  setStoredSelectedShopId,
  subscribeSelectedShop,
} from '../lib/shopSelection';
import AppAvatar from './AppAvatar';

const MESSAGES_SCOPE = 'seller.affiliate_messages.write';
const MARKETPLACE_SCOPE = 'seller.creator_marketplace.read';

const messageBody = (message) => message?.message_body || message || {};
const messageText = (message) => {
  const content = messageBody(message).content;
  if (content && typeof content === 'object') return content.content || '';
  try {
    return JSON.parse(String(content || '{}')).content || '';
  } catch {
    return String(content || '');
  }
};

const creatorIdOf = (creator) => creator?.creator_open_id || creator?.user_id || '';
const avatarOf = (creator) => creator?.avatar?.url || creator?.avatar_url || '';

const CreatorAvatar = ({ creator }) => {
  const source = avatarOf(creator);
  const name = creator?.nickname || creator?.username || 'Creator';
  return <AppAvatar src={source} name={name} seed={creatorIdOf(creator) || creator?.username} className="creator-chat__avatar" fallbackClassName="creator-chat__avatar--fallback" />;
};

const CreatorChatPage = () => {
  const { t, language } = useI18n();
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const [shops, setShops] = useState([]);
  const [shopId, setShopId] = useState(getStoredSelectedShopId);
  const [creators, setCreators] = useState([]);
  const [selectedCreator, setSelectedCreator] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [keyword, setKeyword] = useState('');
  const [submittedKeyword, setSubmittedKeyword] = useState('');
  const [loadingCreators, setLoadingCreators] = useState(true);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const messagesRef = useRef(null);

  const selectedShop = useMemo(
    () => shops.find((shop) => String(shop.id) === String(shopId)),
    [shopId, shops],
  );
  const scopes = Array.isArray(selectedShop?.authorization?.granted_scopes)
    ? selectedShop.authorization.granted_scopes
    : [];
  const hasAccess = scopes.includes(MESSAGES_SCOPE) && scopes.includes(MARKETPLACE_SCOPE);

  useEffect(() => {
    const controller = new AbortController();
    fetchTikTokShops(controller.signal)
      .then((items) => {
        const list = Array.isArray(items) ? items : [];
        setShops(list);
        setShopId((current) => {
          const preferred = current || getStoredSelectedShopId();
          const resolved = resolveSelectedShopId(list, preferred);
          if (resolved && resolved !== getStoredSelectedShopId()) {
            setStoredSelectedShopId(resolved);
          }
          return resolved;
        });
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingCreators(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    return subscribeSelectedShop((event) => {
      const nextId = event?.detail ?? getStoredSelectedShopId();
      if (!nextId) return;
      setShopId((current) => {
        if (String(nextId) === String(current)) return current;
        if (shops.length && !shops.some((shop) => String(shop.id) === String(nextId))) return current;
        setSelectedCreator(null);
        setConversation(null);
        return String(nextId);
      });
    });
  }, [shops]);

  useEffect(() => {
    if (!shopId || !hasAccess) {
      setCreators([]);
      setSelectedCreator(null);
      setConversation(null);
      return undefined;
    }
    const controller = new AbortController();
    setLoadingCreators(true);
    setError('');
    fetchTikTokSellerMarketplaceCreators(shopId, {
      pageSize: 50,
      keyword: submittedKeyword.replace(/^@+/, '').trim(),
      sort: 'most_recent',
      signal: controller.signal,
    })
      .then((result) => {
        const nextCreators = result.creators || [];
        setCreators(nextCreators);
        setSelectedCreator((current) => {
          if (!current) return null;
          return nextCreators.find((creator) => String(creatorIdOf(creator)) === String(creatorIdOf(current))) || null;
        });
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingCreators(false);
      });
    return () => controller.abort();
  }, [hasAccess, shopId, submittedKeyword]);

  const loadConversation = useCallback(async (creator, signal) => {
    if (!creator || !shopId) return;
    setLoadingConversation(true);
    setConversation(null);
    setError('');
    try {
      const result = await fetchTikTokSellerCreatorConversation(
        shopId,
        creatorIdOf(creator),
        { pageSize: 20, signal },
      );
      setConversation(result);
    } catch (requestError) {
      if (requestError.name !== 'AbortError') setError(creatorMessagingErrorText(requestError, t));
    } finally {
      if (!signal?.aborted) setLoadingConversation(false);
    }
  }, [shopId, t]);

  useEffect(() => {
    if (!selectedCreator) return undefined;
    const controller = new AbortController();
    loadConversation(selectedCreator, controller.signal);
    return () => controller.abort();
  }, [loadConversation, selectedCreator]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (messagesRef.current) {
        messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [conversation?.messages, selectedCreator]);

  const submitSearch = (event) => {
    event.preventDefault();
    setSubmittedKeyword(keyword);
  };

  const submitMessage = async (event) => {
    event.preventDefault();
    const value = text.trim();
    if (!value || !selectedCreator || sending) return;
    setSending(true);
    setError('');
    try {
      await sendTikTokSellerCreatorMessage(shopId, creatorIdOf(selectedCreator), value);
      const messagedAt = new Date().toISOString();
      setCreators((current) => [
        ...current
          .map((creator) => (
            String(creatorIdOf(creator)) === String(creatorIdOf(selectedCreator))
              ? { ...creator, last_messaged_at: messagedAt }
              : creator
          ))
          .sort((left, right) => (
            new Date(right.last_messaged_at || 0).getTime()
            - new Date(left.last_messaged_at || 0).getTime()
          )),
      ]);
      setText('');
      await loadConversation(selectedCreator);
    } catch (requestError) {
      setError(creatorMessagingErrorText(requestError, t));
    } finally {
      setSending(false);
    }
  };

  const messages = [...(conversation?.messages || [])]
    .sort((left, right) => Number(messageBody(left).create_time || 0) - Number(messageBody(right).create_time || 0));

  return (
    <div className="page creator-chat">
      <section className="page__hero creator-chat__hero">
        <div><h1 className="page__title">{t('creatorChat.title')}</h1></div>
        <div className="field creator-chat__shop"><label htmlFor="creator-chat-shop">{t('sellerAffiliate.shop')}</label><ShopDropdown id="creator-chat-shop" shops={shops} value={shopId} onChange={(value) => { setShopId(value); setStoredSelectedShopId(value); setSelectedCreator(null); setConversation(null); }} disabled={!shops.length} placeholder={t('sellerAffiliate.selectShop')} unknownLabel={t('common.unknown')} /></div>
      </section>

      {error ? <div className="creator-chat__notice" role="alert">{error}<button type="button" onClick={() => setError('')} aria-label={t('common.close')}>×</button></div> : null}
      {!shops.length && !loadingCreators ? <section className="section-card empty-state"><h2>{t('sellerAffiliate.noShop')}</h2><p>{t('sellerAffiliate.noShopMeta')}</p></section> : null}
      {selectedShop && !hasAccess ? <section className="section-card seller-affiliate__permission" role="alert"><div><strong>{t('creatorChat.missingScope')}</strong><p>{t('creatorChat.missingScopeMeta')}</p><code>{MESSAGES_SCOPE}</code></div></section> : null}

      {selectedShop && hasAccess ? (
        <section className="creator-chat__workspace">
          <aside className="creator-chat__sidebar">
            <div className="creator-chat__sidebar-header">
              <div><h2>{t('creatorChat.creators')}</h2><span>{creators.length}</span></div>
              <form onSubmit={submitSearch}><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={t('creatorChat.searchPlaceholder')} aria-label={t('common.search')} /><button type="submit" aria-label={t('common.search')}>⌕</button></form>
            </div>
            <div className="creator-chat__creator-list">
              {loadingCreators ? <div className="empty-state"><span className="loading-dot" />{t('common.loading')}</div> : null}
              {!loadingCreators && !creators.length ? <div className="empty-state">{t('creatorChat.noCreators')}</div> : null}
              {creators.map((creator) => {
                const selected = String(creatorIdOf(creator)) === String(creatorIdOf(selectedCreator));
                return (
                  <button className={`creator-chat__creator${selected ? ' is-active' : ''}`} type="button" onClick={() => setSelectedCreator(creator)} key={creatorIdOf(creator)}>
                    <CreatorAvatar creator={creator} />
                    <span><strong>{creator.nickname || creator.username || '—'}</strong><small>@{String(creator.username || '').replace(/^@/, '')}</small></span>
                    {creator.previously_invited ? <i aria-label={t('sellerAffiliate.previouslyInvited')} title={t('sellerAffiliate.previouslyInvited')} /> : null}
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="creator-chat__panel">
            {!selectedCreator ? <div className="creator-chat__welcome"><span>✦</span><h2>{t('creatorChat.selectCreator')}</h2><p>{t('creatorChat.selectCreatorMeta')}</p></div> : (
              <>
                <header className="creator-chat__conversation-header"><CreatorAvatar creator={selectedCreator} /><div><h2>{selectedCreator.nickname || selectedCreator.username}</h2><p>@{String(selectedCreator.username || '').replace(/^@/, '')}</p></div></header>
                <div className="creator-chat__messages" ref={messagesRef}>
                  {loadingConversation ? <div className="empty-state"><span className="loading-dot" />{t('common.loading')}</div> : null}
                  {!loadingConversation && !messages.length ? <div className="creator-chat__welcome creator-chat__welcome--small"><h3>{t('sellerAffiliate.noMessages')}</h3></div> : null}
                  {messages.map((message, index) => {
                    const body = messageBody(message);
                    const rawText = messageText(message);
                    if (isCreatorMessagingNotice(rawText)) {
                      return (
                        <aside className="creator-chat__system-notice" role="status" key={body.id || message.conversation_index || index}>
                          <span aria-hidden="true">i</span>
                          <p>{creatorMessagingText(rawText, t)}</p>
                        </aside>
                      );
                    }
                    const incoming = message.local_direction !== 'out'
                      && String(body.sender_id || '') === String(conversation?.conversation?.creator_im_id || selectedCreator.creator_im_id || creatorIdOf(selectedCreator));
                    const timestamp = Number(body.create_time || 0);
                    return (
                      <article className={`creator-chat__message creator-chat__message--${incoming ? 'in' : 'out'}`} key={body.id || message.conversation_index || index}>
                        <p>{creatorMessagingText(rawText, t) || t('sellerAffiliate.unsupportedMessage')}</p>
                        <time>{timestamp ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(timestamp * 1000)) : ''}</time>
                      </article>
                    );
                  })}
                </div>
                <form className="creator-chat__compose" onSubmit={submitMessage}>
                  <div className="creator-chat__composer-input">
                    <textarea rows="1" maxLength={2000} value={text} placeholder={t('sellerAffiliate.messagePlaceholder')} aria-label={t('sellerAffiliate.messagePlaceholder')} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
                  </div>
                  <button className="button creator-chat__send" type="submit" disabled={sending || loadingConversation || !text.trim()}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 17 8-17 8 3-8-3-8Z" /><path d="M7 12h14" /></svg>
                    <span>{sending ? t('common.loading') : t('sellerAffiliate.sendMessage')}</span>
                  </button>
                </form>
              </>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default CreatorChatPage;
