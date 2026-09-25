import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy } from 'lucide-react';

import { fetchShopOrderTracking, fetchTikTokShopVideoThumbnail } from '../../../lib/api';
import {
  getAffiliateOrderCommission,
  getAffiliateOrderCreators,
  getAffiliateOrderSettlementStatus,
  getAffiliateOrderSources,
  getAffiliateOrderValue,
  getOrderFinanceSummary,
  getOrderFinanceBreakdown,
  getOrderPaymentValue,
  getOrderProductDetails,
  getOrderDeliveryHistory,
  getUnifiedOrderTimeline,
  getOrderShipping,
  getOrderSla,
  getTrackingUrl,
  deliveryTypeLabel,
  paymentMethodLabel,
} from '../../../lib/sellerAffiliate';
import AppAvatar from '../../AppAvatar';
import DatePickerInput from '../../DatePickerInput';
import { internationalPhone } from '../utils/sellerAffiliateUtils';

const COUNTRY_DIAL_CODES = [
  { code: '+84', label: 'VN +84' },
  { code: '+60', label: 'MY +60' },
  { code: '+65', label: 'SG +65' },
  { code: '+62', label: 'ID +62' },
  { code: '+66', label: 'TH +66' },
  { code: '+63', label: 'PH +63' },
  { code: '+1', label: 'US +1' },
  { code: '+44', label: 'UK +44' },
];
export const CreatorAvatar = ({ src, name }) => <AppAvatar src={src} name={name || 'Creator'} />;
export const MetricTooltip = ({ text }) => {
  const id = useId();
  const triggerRef = useRef(null);
  const [position, setPosition] = useState(null);
  const show = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const showAbove = rect.bottom + 100 > window.innerHeight;
    setPosition({
      left: Math.min(window.innerWidth - 252, Math.max(12, rect.left + rect.width / 2 - 120)),
      top: showAbove ? rect.top - 8 : rect.bottom + 8,
      showAbove,
    });
  };
  const hide = () => setPosition(null);
  return (
    <span className="seller-affiliate__metric-help">
      <button
        ref={triggerRef}
        type="button"
        aria-describedby={position ? id : undefined}
        aria-label={text}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={() => position ? hide() : show()}
      >
        ?
      </button>
      {position ? createPortal(
        <span
          className={`seller-affiliate__metric-tooltip${position.showAbove ? ' seller-affiliate__metric-tooltip--above' : ''}`}
          id={id}
          role="tooltip"
          style={{ left: position.left, top: position.top }}
        >
          {text}
        </span>,
        document.body,
      ) : null}
    </span>
  );
};

const arrayValue = (value) => Array.isArray(value) ? value : value ? [value] : [];
const percentageValue = (value) => {
  const raw = typeof value === 'object'
    ? value?.percentage ?? value?.percentage_value ?? value?.ratio ?? value?.value
    : value;
  const numeric = Number(String(raw ?? '').replace('%', ''));
  if (!Number.isFinite(numeric)) return null;
  if (String(raw).includes('%')) return numeric;
  if (numeric <= 1) return numeric * 100;
  return numeric > 100 ? numeric / 100 : numeric;
};
const distributionItems = (values, labelKeys) => {
  if (Array.isArray(values)) return values;
  if (!values || typeof values !== 'object') return arrayValue(values);
  if (labelKeys.some((key) => values[key])) return [values];
  return Object.entries(values).map(([label, value]) => ({ label, value }));
};
const distributionWinner = (values, labelKeys) => distributionItems(values, labelKeys)
  .map((item) => ({
    label: typeof item === 'string' ? item : item?.label || labelKeys.map((key) => item?.[key]).find(Boolean),
    percentage: percentageValue(item),
  }))
  .filter((item) => item.label)
  .sort((left, right) => (right.percentage ?? -1) - (left.percentage ?? -1))[0] || null;
const creatorLevelLabel = (creator) => {
  const value = creator.creator_level?.level ?? creator.creator_level ?? creator.level?.level ?? creator.level;
  if (value === undefined || value === null || value === '') return '';
  const match = String(value).match(/(\d+)/);
  return match ? `Lv. ${match[1]}` : String(value);
};
const creatorCategoryLabels = (creator) => {
  const candidates = [creator.categories, creator.category_names, creator.top_categories, creator.category_info, creator.category_ids]
    .flatMap(arrayValue)
    .map((category) => typeof category === 'string'
      ? category
      : category?.local_name || category?.name || category?.category_name)
    .filter(Boolean);
  return [...new Set(candidates)];
};
const normalizeAudienceLabel = (value) => String(value || '')
  .replace(/^(?:AGE_RANGE_|FOLLOWER_AGE_)/, '')
  .replace(/_/g, '-')
  .replace(/^([A-Z])([A-Z]+)$/i, (_, first, rest) => `${first.toUpperCase()}${rest.toLowerCase()}`);
const creatorFollowerDemographics = (creator) => {
  const demographics = creator.follower_demographics || creator.follower_audience || {};
  const topDemographics = creator.top_follower_demographics || {};
  const gender = distributionWinner(
    creator.follower_gender_distribution || creator.gender_distribution || demographics.gender_distribution
      || creator.follower_gender || demographics.gender || topDemographics.major_gender,
    ['gender', 'type', 'name', 'key'],
  );
  const age = distributionWinner(
    creator.follower_age_distribution || creator.age_distribution || demographics.age_distribution
      || creator.follower_age_ranges || creator.follower_age || demographics.age_ranges || topDemographics.age_ranges,
    ['age_range', 'range', 'type', 'name', 'key'],
  );
  const genderLabel = gender
    ? `${normalizeAudienceLabel(gender.label)}${gender.percentage === null ? '' : ` ${gender.percentage.toLocaleString('en-US', { maximumFractionDigits: 0 })}%`}`
    : '';
  const ageLabel = age
    ? `${normalizeAudienceLabel(age.label)}${age.percentage === null ? '' : ` ${age.percentage.toLocaleString('en-US', { maximumFractionDigits: 0 })}%`}`
    : '';
  return { gender: genderLabel, age: ageLabel };
};
export const MarketplaceCreatorCell = ({ creator, followerCount, t }) => {
  const level = creatorLevelLabel(creator);
  const categories = creatorCategoryLabels(creator);
  const demographics = creatorFollowerDemographics(creator);
  const audience = [followerCount, demographics.gender, demographics.age].filter((value) => value && value !== '—');
  return <td className="marketplace-creator-cell"><div className="creator-identity marketplace-creator"><CreatorAvatar src={creator.avatar?.url || creator.avatar_url} name={creator.nickname || creator.username} /><span className="marketplace-creator__details"><span className="marketplace-creator__username">{creator.username || '—'}{level ? <span className="marketplace-creator__level">{level}</span> : null}</span><strong>{creator.nickname || creator.username || '—'}</strong>{creator.previously_invited ? <span className="marketplace-creator__previously-invited" title={t('sellerAffiliate.previouslyInvitedDescription')}>{t('sellerAffiliate.previouslyInvited')}</span> : null}{categories.length ? <span className="marketplace-creator__category">{categories[0]}{categories.length > 1 ? `, +${categories.length - 1}` : ''}</span> : null}{audience.length ? <span className="marketplace-creator__audience">{audience.join(' · ')}</span> : null}</span></div></td>;
};
export const AffiliateOrderProducts = ({ row, t }) => {
  const items = getOrderProductDetails(row);
  if (!items.length) return '—';
  return <div className="seller-affiliate__order-products">{items.map((item) => (
    <div className="seller-affiliate__order-product" key={item.id}>
      <span className="seller-affiliate__order-product-thumb">
        {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <span className="seller-affiliate__order-product-placeholder" aria-hidden="true">P</span>}
        <span
          className="booking-video-expansion__product-badge"
          aria-label={`${t('sellerAffiliate.quantity')}: ${item.quantity}`}
        >
          x{item.quantity}
        </span>
      </span>
      <span className="seller-affiliate__order-product-info">
        {item.productUrl ? <a href={item.productUrl} target="_blank" rel="noreferrer" title={item.productName} onClick={(event) => event.stopPropagation()}>{item.productName}</a> : <strong title={item.productName}>{item.productName}</strong>}
        <span className="row-subtitle">{item.skuName.replace(/^phân loại\s*:?\s*/i, '') || t('sellerAffiliate.defaultSku')}{item.sellerSku ? ` · ${item.sellerSku}` : ''}</span>
      </span>
    </div>
  ))}</div>;
};

export const AffiliateOrderSummary = ({ row, t }) => <div className="seller-affiliate__order-summary">
  <AffiliateOrderProducts row={row} t={t} />
  <span className="seller-affiliate__order-id">{row.order_id || row.id}</span>
</div>;

export const OrderIdentity = ({ row, formatTime }) => <div className="seller-affiliate__order-identity">
  <strong>{row.order_id || row.id}</strong>
  <span className="row-subtitle">{formatTime(row.create_time || row.created_time)}</span>
</div>;

export const OrderPayment = ({ row, formatMoneyValues }) => {
  const payment = getOrderPaymentValue(row);
  return payment ? <strong>{formatMoneyValues([payment])}</strong> : <AffiliateOrderMoney row={row} formatMoneyValues={formatMoneyValues} />;
};

const orderStatusLabel = (status, t) => t(`sellerAffiliate.orderState_${status}`, { defaultValue: status || '—' });

export const OrderStatus = ({ row, t }) => {
  const status = String(row.order_status || row.status || 'UNKNOWN').toUpperCase();
  return <span className={`seller-affiliate__order-state seller-affiliate__order-state--${status.toLowerCase()}`}>{orderStatusLabel(status, t)}</span>;
};

export const OrderShippingStatus = ({ row, t }) => {
  const shipping = getOrderShipping(row);
  return <span className={`seller-affiliate__order-state seller-affiliate__order-state--${shipping.status.toLowerCase()}`}>{orderStatusLabel(shipping.status, t)}</span>;
};

export const OrderCarrier = ({ row }) => {
  const shipping = getOrderShipping(row);
  if (!shipping.provider && !shipping.trackingNumber) return '—';
  const trackingUrl = getTrackingUrl(shipping.provider, shipping.trackingNumber);
  return (
    <div className="seller-affiliate__order-carrier">
      <strong>{shipping.provider || '—'}</strong>
      {shipping.trackingNumber ? (
        trackingUrl ? (
          <a
            className="row-subtitle seller-affiliate__tracking-link"
            href={trackingUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            title="Tra cứu vận đơn"
          >
            {shipping.trackingNumber} ↗
          </a>
        ) : (
          <span className="row-subtitle">{shipping.trackingNumber}</span>
        )
      ) : null}
    </div>
  );
};

export const OrderFinanceValue = ({ row, field, formatMoneyValues, t }) => {
  if (row.finance_status !== 'AVAILABLE') {
    return <span className="row-subtitle">{t(`sellerAffiliate.financeStatus_${row.finance_status || 'PENDING'}`)}</span>;
  }
  const summary = getOrderFinanceSummary(row);
  const value = summary?.[field];
  return value ? <strong>{formatMoneyValues([value])}</strong> : '—';
};

export const OrderSla = ({ row, formatTime, t }) => {
  const sla = getOrderSla(row);
  return <div className="seller-affiliate__order-sla"><span className={`seller-affiliate__sla seller-affiliate__sla--${sla.state.toLowerCase()}`}>{t(`sellerAffiliate.orderSla_${sla.state}`)}</span>{sla.deadline ? <span className="row-subtitle">{formatTime(sla.deadline)}</span> : null}</div>;
};

export const OrderActions = ({ row, onView, t }) => {
  const [copied, setCopied] = useState(false);
  const orderId = String(row.order_id || row.id || '');
  const copy = async (event) => {
    event.stopPropagation();
    if (!orderId || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(orderId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return <div className="seller-affiliate__order-actions"><button className="button button--small" type="button" onClick={(event) => { event.stopPropagation(); onView?.(row); }}>{t('sellerAffiliate.viewOrder')}</button><button className="button button--small button--ghost" type="button" onClick={copy} disabled={!orderId}>{t(copied ? 'sellerAffiliate.orderCopied' : 'sellerAffiliate.copyOrderId')}</button></div>;
};

const DrawerMoney = ({ value, formatMoneyValues }) => value
  ? formatMoneyValues([value])
  : '—';

export const OrderDetailDrawer = ({ order, shopId, onClose, formatTime, formatMoneyValues, t }) => {
  const [copied, setCopied] = useState(false);
  const [trackingNodes, setTrackingNodes] = useState(null);
  const [loadingTracking, setLoadingTracking] = useState(false);
  const [trackingError, setTrackingError] = useState(null);

  const orderId = String(order?.order_id || order?.id || '');
  const currentShopId = shopId || order?.shop_id;

  useEffect(() => {
    if (!order) return undefined;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, order]);

  useEffect(() => {
    if (!orderId || !currentShopId) {
      setTrackingNodes(null);
      setLoadingTracking(false);
      setTrackingError(null);
      return undefined;
    }
    let active = true;
    setLoadingTracking(true);
    setTrackingError(null);
    setTrackingNodes(null);

    fetchShopOrderTracking(currentShopId, orderId)
      .then((res) => {
        if (!active) return;
        const list = res?.tracking || res?.tracking_info_list || res?.tracking_info || res?.tracking_events || res?.records || [];
        let nodes = [];
        if (Array.isArray(list)) {
          if (list.length > 0 && Array.isArray(list[0]?.tracking_nodes)) {
            nodes = list.flatMap((item) => item.tracking_nodes || []);
          } else {
            nodes = list;
          }
        }
        setTrackingNodes(nodes);
      })
      .catch((err) => {
        if (!active) return;
        const isPermission = /seller\.logistics/i.test(err?.message) || err?.status === 403;
        setTrackingError(isPermission ? t('sellerAffiliate.trackingScopeRequired') : (err?.message || t('common.error')));
      })
      .finally(() => {
        if (active) setLoadingTracking(false);
      });

    return () => {
      active = false;
    };
  }, [currentShopId, orderId, t]);

  if (!order) return null;

  const copyOrderId = async () => {
    if (!orderId || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(orderId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };
  const status = String(order.order_status || order.status || 'UNKNOWN').toUpperCase();
  const shipping = getOrderShipping(order);
  const products = getOrderProductDetails(order);
  const finance = getOrderFinanceSummary(order);
  const breakdown = getOrderFinanceBreakdown(order);
  const history = getOrderDeliveryHistory(order);
  const timeline = getUnifiedOrderTimeline(order, trackingNodes, t);
  const deliveryType = order.delivery_type || order.shipping_type || order.fulfillment_type
    || order.delivery_option_name || '—';
  const breakdownRows = breakdown ? [
    ['productRevenue', breakdown.productRevenue],
    ['sellerDiscount', breakdown.sellerDiscount],
    ['tiktokFees', breakdown.fees],
    ['taxes', breakdown.taxes],
    ['shippingCost', breakdown.shippingCost],
    ['refund', breakdown.refund],
    ['settlement', breakdown.settlement],
  ] : [];

  const creators = getAffiliateOrderCreators(order);
  const sources = getAffiliateOrderSources(order);
  const trackingUrl = getTrackingUrl(shipping.provider, shipping.trackingNumber);

  // Additional Payment & Subsidy Data
  const payment = order.payment || {};
  const currency = payment.currency || order.currency || 'MYR';
  const hasPaymentDetails = Boolean(payment.total_amount || payment.original_total_product_price || payment.sub_total);
  const paymentMethod = order.payment_method_name || order.payment_method
    || payment.payment_method_name || payment.payment_method || '';

  // Cancellation Data
  const cancelTime = order.cancel_time;
  const cancelBy = order.cancel_user || order.cancellation_initiator;
  const cancelReason = order.cancel_reason;
  const isCancelled = status === 'CANCELLED' || Boolean(cancelTime || cancelReason);

  // Recipient & Address Data
  const address = order.recipient_address || {};
  const districtParts = Array.isArray(address.district_info)
    ? address.district_info.map((d) => d.address_name || d.name).filter(Boolean)
    : [address.state, address.city].filter(Boolean);
  const formattedAddress = [
    address.address_line1 || address.address_detail,
    address.address_line2,
    districtParts.join(', '),
    address.postal_code,
    address.region_code,
  ].filter(Boolean).join(', ') || address.full_address || '';
  const hasAddress = Boolean(address.name || address.phone_number || formattedAddress || order.buyer_message || order.seller_note);

  // Operational SLA Timestamps
  const rtsSla = order.rts_sla_time;
  const ttsSla = order.tts_sla_time;
  const autoCancelSla = order.cancel_order_sla_time;
  const hasSlaInfo = Boolean(rtsSla || ttsSla || autoCancelSla);

  return createPortal(
    <div className="koc-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="koc-drawer seller-affiliate__order-drawer" role="dialog" aria-modal="true" aria-labelledby="order-detail-title">
        <div className="koc-drawer__header">
          <div>
            <h2 id="order-detail-title">{t('sellerAffiliate.orderDetail')}</h2>
            <p style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span>{orderId}</span>
              <button
                type="button"
                className="order-compact-cell__copy-btn"
                onClick={copyOrderId}
                title={copied ? t('sellerAffiliate.orderCopied') : t('sellerAffiliate.copyOrderId')}
                aria-label={copied ? t('sellerAffiliate.orderCopied') : t('sellerAffiliate.copyOrderId')}
              >
                {copied ? <Check size={13} className="text-positive" /> : <Copy size={13} />}
              </button>
            </p>
          </div>
          <button className="button button--ghost" type="button" onClick={onClose} aria-label={t('common.close')}>×</button>
        </div>
        <div className="koc-drawer__body seller-affiliate__order-drawer-body">
          {/* Section 1: Overview */}
          <section className="drawer-section seller-affiliate__order-detail-section">
            <h3>{t('sellerAffiliate.orderDetailOverview')}</h3>
            <dl className="seller-affiliate__order-detail-grid">
              <div><dt>{t('sellerAffiliate.createdAt')}</dt><dd>{formatTime(order.create_time || order.created_time)}</dd></div>
              <div><dt>{t('sellerAffiliate.orderStatus')}</dt><dd><span className={`seller-affiliate__order-state seller-affiliate__order-state--${status.toLowerCase()}`}>{orderStatusLabel(status, t)}</span></dd></div>
              <div><dt>{t('sellerAffiliate.deliveryType')}</dt><dd>{deliveryTypeLabel(deliveryType, t)}</dd></div>
              {paymentMethod ? <div><dt>{t('sellerAffiliate.paymentMethod')}</dt><dd>{paymentMethodLabel(paymentMethod, t)}</dd></div> : null}
            </dl>
          </section>

          {/* Section 2: Cancellation Info (Only if cancelled) */}
          {isCancelled ? (
            <section className="drawer-section seller-affiliate__order-detail-section seller-affiliate__order-detail-section--alert">
              <h3>{t('sellerAffiliate.orderDetailCancellation')}</h3>
              <dl className="seller-affiliate__order-detail-grid">
                <div><dt>{t('sellerAffiliate.cancelledBy')}</dt><dd><strong>{cancelBy || '—'}</strong></dd></div>
                {cancelTime ? <div><dt>{t('sellerAffiliate.cancelTime')}</dt><dd>{formatTime(cancelTime)}</dd></div> : null}
                <div style={{ gridColumn: 'span 2' }}>
                  <dt>{t('sellerAffiliate.cancelReason')}</dt>
                  <dd className="text-danger"><strong>{cancelReason || '—'}</strong></dd>
                </div>
              </dl>
            </section>
          ) : null}

          {/* Section 3: Payment & Multi-tier Discounts Breakdown */}
          {hasPaymentDetails ? (
            <section className="drawer-section seller-affiliate__order-detail-section">
              <h3>{t('sellerAffiliate.orderDetailPayment')}</h3>
              <dl className="seller-affiliate__order-detail-grid">
                <div>
                  <dt>{t('sellerAffiliate.originalProductPrice')}</dt>
                  <dd>{formatMoneyValues([{ amount: Number(payment.original_total_product_price || payment.sub_total || 0), currency }])}</dd>
                </div>
                {Number(payment.seller_discount || 0) > 0 ? (
                  <div>
                    <dt>{t('sellerAffiliate.sellerDiscount')}</dt>
                    <dd className="text-danger">-{formatMoneyValues([{ amount: Number(payment.seller_discount), currency }])}</dd>
                  </div>
                ) : null}
                {Number(payment.platform_discount || 0) > 0 ? (
                  <div>
                    <dt>{t('sellerAffiliate.platformDiscount')}</dt>
                    <dd className="text-danger">-{formatMoneyValues([{ amount: Number(payment.platform_discount), currency }])}</dd>
                  </div>
                ) : null}
                {payment.original_shipping_fee ? (
                  <div>
                    <dt>{t('sellerAffiliate.originalShippingFee')}</dt>
                    <dd>{formatMoneyValues([{ amount: Number(payment.original_shipping_fee), currency }])}</dd>
                  </div>
                ) : null}
                {Number(payment.shipping_fee_platform_discount || 0) > 0 ? (
                  <div>
                    <dt>{t('sellerAffiliate.platformShippingDiscount')}</dt>
                    <dd className="text-danger">-{formatMoneyValues([{ amount: Number(payment.shipping_fee_platform_discount), currency }])}</dd>
                  </div>
                ) : null}
                {Number(payment.shipping_fee_seller_discount || 0) > 0 ? (
                  <div>
                    <dt>{t('sellerAffiliate.sellerShippingDiscount')}</dt>
                    <dd className="text-danger">-{formatMoneyValues([{ amount: Number(payment.shipping_fee_seller_discount), currency }])}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>{t('sellerAffiliate.customerShippingFee')}</dt>
                  <dd>{formatMoneyValues([{ amount: Number(payment.shipping_fee || 0), currency }])}</dd>
                </div>
                {Number(payment.tax || 0) > 0 ? (
                  <div>
                    <dt>{t('sellerAffiliate.taxes')}</dt>
                    <dd>{formatMoneyValues([{ amount: Number(payment.tax), currency }])}</dd>
                  </div>
                ) : null}
                <div className="seller-affiliate__order-detail-highlight" style={{ gridColumn: 'span 2' }}>
                  <dt>{t('sellerAffiliate.totalPayment')}</dt>
                  <dd><strong style={{ fontSize: '1.1rem' }}>{formatMoneyValues([{ amount: Number(payment.total_amount || 0), currency }])}</strong></dd>
                </div>
              </dl>
            </section>
          ) : null}

          {/* Section 4: Attribution */}
          {(creators.length || sources.length) ? (
            <section className="drawer-section seller-affiliate__order-detail-section">
              <h3>{t('sellerAffiliate.orderAttribution')}</h3>
              <dl className="seller-affiliate__order-detail-grid">
                {creators.length ? (
                  <div>
                    <dt>{t('sellerAffiliate.koc') || 'KOC'}</dt>
                    <dd>
                      <div className="creator-identity creator-identity--compact">
                        <CreatorAvatar src={creators[0].avatarUrl} name={creators[0].name || creators[0].username} />
                        <span><strong>{creators[0].name || creators[0].username}</strong>{creators[0].username ? <span className="row-subtitle">@{creators[0].username.replace(/^@+/, '')}</span> : null}</span>
                      </div>
                    </dd>
                  </div>
                ) : null}
                {sources.length ? (
                  <div>
                    <dt>{t('sellerAffiliate.video') || 'Nguồn'}</dt>
                    <dd>
                      <AffiliateOrderVideos row={order} shopId={order.shop_id} t={t} />
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}

          {/* Section 5: Products */}
          <section className="drawer-section seller-affiliate__order-detail-section">
            <h3>{t('sellerAffiliate.orderDetailProducts')}</h3>
            <div className="seller-affiliate__order-detail-products">{products.length ? products.map((item) => (
              <article className="seller-affiliate__order-detail-product" key={item.id}>
                {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <span className="seller-affiliate__order-product-placeholder" aria-hidden="true">P</span>}
                <div>{item.productUrl ? <a href={item.productUrl} target="_blank" rel="noreferrer">{item.productName}</a> : <strong>{item.productName}</strong>}<span>{item.skuName || t('sellerAffiliate.defaultSku')}</span>{item.sellerSku ? <span>{t('sellerAffiliate.sellerSku')}: {item.sellerSku}</span> : null}{item.productStatus ? <span>{t('sellerAffiliate.productStatus')}: {item.productStatus}</span> : null}<span>{t('sellerAffiliate.quantity')}: {item.quantity}</span></div>
                <dl><div><dt>{t('sellerAffiliate.price')}</dt><dd><DrawerMoney value={item.salePrice || item.price} formatMoneyValues={formatMoneyValues} /></dd></div><div><dt>{t('sellerAffiliate.originalPrice')}</dt><dd><DrawerMoney value={item.originalPrice} formatMoneyValues={formatMoneyValues} /></dd></div><div><dt>{t('sellerAffiliate.discount')}</dt><dd><DrawerMoney value={item.totalDiscount} formatMoneyValues={formatMoneyValues} /></dd></div></dl>
              </article>
            )) : <div className="empty-state empty-state--compact">{t('sellerAffiliate.noData')}</div>}</div>
          </section>

          {/* Section 6: Recipient & Address */}
          {hasAddress ? (
            <section className="drawer-section seller-affiliate__order-detail-section">
              <h3>{t('sellerAffiliate.orderDetailRecipient')}</h3>
              <dl className="seller-affiliate__order-detail-grid">
                {address.name ? <div><dt>{t('sellerAffiliate.recipientName')}</dt><dd>{address.name}</dd></div> : null}
                {address.phone_number ? <div><dt>{t('sellerAffiliate.recipientPhone')}</dt><dd>{address.phone_number}</dd></div> : null}
                {formattedAddress ? (
                  <div style={{ gridColumn: 'span 2' }}>
                    <dt>{t('sellerAffiliate.recipientAddress')}</dt>
                    <dd>{formattedAddress}</dd>
                  </div>
                ) : null}
                {order.buyer_message ? (
                  <div style={{ gridColumn: 'span 2' }}>
                    <dt>{t('sellerAffiliate.buyerMessage')}</dt>
                    <dd>{order.buyer_message}</dd>
                  </div>
                ) : null}
                {order.seller_note ? (
                  <div style={{ gridColumn: 'span 2' }}>
                    <dt>{t('sellerAffiliate.sellerNote')}</dt>
                    <dd>{order.seller_note}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}

          {/* Section 7: Settlement & Finance */}
          <section className="drawer-section seller-affiliate__order-detail-section">
            <h3>{t('sellerAffiliate.orderDetailFinance')}</h3>
            {order.finance_status === 'AVAILABLE' && finance ? <>
              <div className="seller-affiliate__order-finance-summary">
                <div><span>{t('sellerAffiliate.financeRevenue')}</span><strong><DrawerMoney value={finance.revenue} formatMoneyValues={formatMoneyValues} /></strong></div>
                <div><span>{t('sellerAffiliate.tiktokFees')}</span><strong><DrawerMoney value={finance.fees} formatMoneyValues={formatMoneyValues} /></strong></div>
                <div><span>{t('sellerAffiliate.shippingCost')}</span><strong><DrawerMoney value={finance.shippingCost} formatMoneyValues={formatMoneyValues} /></strong></div>
                <div><span>{t('sellerAffiliate.refund')}</span><strong><DrawerMoney value={finance.refund} formatMoneyValues={formatMoneyValues} /></strong></div>
                <div className="is-settlement"><span>{t('sellerAffiliate.actualSettlement')}</span><strong><DrawerMoney value={finance.settlement} formatMoneyValues={formatMoneyValues} /></strong></div>
              </div>
              <div className="seller-affiliate__finance-breakdown" aria-label={t('sellerAffiliate.financeBreakdown')}>{breakdownRows.map(([key, value]) => <div className={key === 'settlement' ? 'is-total' : ''} key={key}><span>{t(`sellerAffiliate.financeBreakdown_${key}`)}</span><strong><DrawerMoney value={value} formatMoneyValues={formatMoneyValues} /></strong></div>)}</div>
            </> : <div className="empty-state empty-state--compact">{t(`sellerAffiliate.financeStatus_${order.finance_status || 'PENDING'}`)}</div>}
          </section>

          {/* Section 8: Delivery & SLA */}
          <section className="drawer-section seller-affiliate__order-detail-section">
            <h3>{t('sellerAffiliate.orderDetailDelivery')}</h3>
            <dl className="seller-affiliate__order-detail-grid">
              <div><dt>{t('sellerAffiliate.packageId')}</dt><dd>{shipping.packageId || '—'}</dd></div>
              <div><dt>{t('sellerAffiliate.tracking')}</dt><dd>{shipping.trackingNumber ? (trackingUrl ? <a href={trackingUrl} target="_blank" rel="noreferrer" className="seller-affiliate__tracking-link">{shipping.trackingNumber} ↗</a> : shipping.trackingNumber) : '—'}</dd></div>
              <div><dt>{t('sellerAffiliate.shippingCarrier')}</dt><dd>{shipping.provider || '—'}</dd></div>
              <div><dt>{t('sellerAffiliate.deliveryStatus')}</dt><dd>{orderStatusLabel(shipping.status, t)}</dd></div>
              {hasSlaInfo ? (
                <>
                  {rtsSla ? <div><dt>{t('sellerAffiliate.rtsSla')}</dt><dd>{formatTime(rtsSla)}</dd></div> : null}
                  {ttsSla ? <div><dt>{t('sellerAffiliate.ttsSla')}</dt><dd>{formatTime(ttsSla)}</dd></div> : null}
                  {autoCancelSla ? <div><dt>{t('sellerAffiliate.autoCancelSla')}</dt><dd>{formatTime(autoCancelSla)}</dd></div> : null}
                </>
              ) : null}
            </dl>
            <div style={{ marginTop: '14px', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-soft)' }}>
                {t('sellerAffiliate.orderDetailTrackingNodes')}
              </span>
            </div>

            <div className="seller-affiliate__detailed-tracking">
              {loadingTracking ? (
                <div className="empty-state empty-state--compact">
                  <span className="loading-dot" /> {t('sellerAffiliate.loadingTracking')}
                </div>
              ) : (
                <>
                  {trackingError ? (
                    <div className="alert alert--warning" style={{ fontSize: '0.8rem', padding: '8px 12px', margin: '8px 0', borderRadius: 'var(--radius-sm)' }}>
                      {trackingError}
                    </div>
                  ) : null}

                  {trackingNodes !== null && Array.isArray(trackingNodes) && trackingNodes.length === 0 ? (
                    <p className="seller-affiliate__tracking-note" style={{ marginBottom: '6px' }}>
                      {t('sellerAffiliate.noTrackingNodes')}
                    </p>
                  ) : null}

                  {timeline && timeline.length ? (
                    <div className="seller-affiliate__order-timeline" style={{ marginTop: '6px' }}>
                      {timeline.map((event, idx) => {
                        const isLatest = idx === timeline.length - 1;
                        return (
                          <div key={`${event.time || idx}-${event.label}`}>
                            <i aria-hidden="true" style={{ background: isLatest ? 'var(--color-primary)' : undefined }} />
                            <span>
                              <strong>{event.label}</strong>
                              {event.time ? <small>{formatTime(event.time)}</small> : null}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </section>
        </div>
      </aside>
    </div>,
    document.body,
  );
};

export const AffiliateOrderCreators = ({ row, t }) => {
  const creators = getAffiliateOrderCreators(row);
  if (!creators.length) return '—';
  return <div className="seller-affiliate__order-creators">{creators.map((creator) => (
    <div className="creator-identity" key={creator.username || creator.name}>
      <CreatorAvatar src={creator.avatarUrl} name={creator.name || creator.username} />
      <span><strong>{creator.name || creator.username || t('common.unknown')}</strong>{creator.username ? <span className="row-subtitle">@{creator.username}</span> : null}</span>
    </div>
  ))}</div>;
};

export const AffiliateOrderMoney = ({ row, formatMoneyValues }) => {
  const values = getAffiliateOrderValue(row);
  return values.length ? <div className="seller-affiliate__order-money"><strong>{formatMoneyValues(values)}</strong></div> : '—';
};

export const AffiliateOrderCommission = ({ row, locale, formatMoneyValues }) => {
  const { amounts, rates } = getAffiliateOrderCommission(row);
  if (!amounts.length && !rates.length) return '—';
  return <div className="seller-affiliate__order-commission">
    {amounts.length ? <strong>{formatMoneyValues(amounts)}</strong> : null}
    {rates.length ? <span className="row-subtitle">{rates.map((rate) => `${rate.toLocaleString(locale, { maximumFractionDigits: 2 })}%`).join(' / ')}</span> : null}
  </div>;
};

export const AffiliateOrderSettlement = ({ row, t }) => {
  const status = getAffiliateOrderSettlementStatus(row);
  return <span className={`seller-affiliate__settlement seller-affiliate__settlement--${status.toLowerCase()}`}>{t(`sellerAffiliate.settlement_${status}`)}</span>;
};
const AffiliateOrderSource = ({ shopId, source, href, t }) => {
  const [thumbnail, setThumbnail] = useState(source.thumbnail || null);
  const [title, setTitle] = useState(source.title || '');
  const [failed, setFailed] = useState(false);
  const username = String(source.username || '').trim().replace(/^@+/, '');
  const isVideo = source.type === 'VIDEO';

  useEffect(() => {
    setThumbnail(source.thumbnail || null);
    setTitle(source.title || '');
    setFailed(false);
    if (!isVideo || (source.thumbnail && source.title) || !shopId || !/^\d{10,30}$/.test(source.id) || !username) return undefined;
    const controller = new AbortController();
    fetchTikTokShopVideoThumbnail(shopId, source.id, username, controller.signal)
      .then((payload) => {
        setThumbnail((current) => current || payload?.thumbnail_url || null);
        setTitle((current) => current || payload?.title || '');
      })
      .catch((error) => { if (error.name !== 'AbortError') setFailed(true); });
    return () => controller.abort();
  }, [isVideo, shopId, source.id, source.thumbnail, source.title, username]);

  const content = thumbnail && !failed
    ? <img src={thumbnail} alt={title} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <span className="seller-affiliate__order-video-placeholder" aria-hidden="true">{isVideo ? '▶' : source.type === 'LIVE' || source.type === 'PRE_LIVE' ? '●' : source.type === 'SHOP' ? '▣' : '↗'}</span>;
  const thumbnailElement = href ? <a className="seller-affiliate__order-video-thumbnail" href={href} target="_blank" rel="noreferrer" tabIndex={-1}>{content}</a> : <span className="seller-affiliate__order-video-thumbnail">{content}</span>;
  const sourceLabel = t(`sellerAffiliate.orderSource_${source.type}`, { defaultValue: source.type });
  const hasDistinctTitle = title.trim().toLocaleLowerCase() !== sourceLabel.trim().toLocaleLowerCase();
  const badgeClassName = `seller-affiliate__source-badge seller-affiliate__source-badge--${source.type.toLowerCase()}`;
  const badge = href && !hasDistinctTitle
    ? <a className={badgeClassName} href={href} target="_blank" rel="noreferrer">{sourceLabel}</a>
    : <span className={badgeClassName}>{sourceLabel}</span>;
  return <div className="seller-affiliate__order-video">{thumbnailElement}<span>{badge}{hasDistinctTitle ? (href ? <a href={href} target="_blank" rel="noreferrer">{title}</a> : <strong>{title}</strong>) : null}{source.id ? <span className="row-subtitle">{source.id}</span> : null}</span></div>;
};
export const AffiliateOrderVideos = ({ row, shopId, t }) => {
  const sources = getAffiliateOrderSources(row);
  if (!sources.length) return t('sellerAffiliate.orderSource_UNKNOWN');
  return <div className="seller-affiliate__order-videos">{sources.map((source) => {
    const username = String(source.username || '').trim().replace(/^@+/, '');
    const suppliedUrl = /^https?:\/\//i.test(String(source.url || '')) ? source.url : null;
    const profileUrl = username ? `https://www.tiktok.com/@${encodeURIComponent(username)}` : null;
    const href = suppliedUrl
      || (source.type === 'VIDEO' && profileUrl && source.id ? `${profileUrl}/video/${encodeURIComponent(source.id)}` : null)
      || (['LIVE', 'PRE_LIVE'].includes(source.type) && profileUrl ? `${profileUrl}/live` : null)
      || (source.type === 'SHOP' ? profileUrl : null);
    return <AffiliateOrderSource shopId={shopId} source={source} href={href} t={t} key={`${source.type}:${source.id}`} />;
  })}</div>;
};

const invitationDate = (invitation) => (
  invitation.update_time
  || invitation.modified_time
  || invitation.last_modified_time
  || invitation.create_time
  || invitation.created_time
);

export const InviteCreatorModal = ({
  t,
  locale,
  creator,
  activeTab,
  onTabChange,
  invitations,
  selectedInvitationId,
  onSelectInvitation,
  search,
  onSearchChange,
  products,
  form,
  setForm,
  onToggleProduct,
  loading,
  onClose,
  onSubmit,
}) => {
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const sampleOptionsRef = useRef(null);
  useEffect(() => {
    if (!form.hasFreeSample) return undefined;
    const frame = requestAnimationFrame(() => {
      sampleOptionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => cancelAnimationFrame(frame);
  }, [form.hasFreeSample]);
  const matchingInvitations = invitations
    .filter((invitation) => String(invitation.name || '').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    .slice(0, 5);
  const formatInvitationDate = (value) => {
    if (!value) return '—';
    const numeric = Number(value);
    const date = Number.isFinite(numeric)
      ? new Date(numeric < 1e12 ? numeric * 1000 : numeric)
      : new Date(value);
    return Number.isNaN(date.getTime())
      ? '—'
      : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
  };
  return (
    <div className="seller-affiliate__modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) onClose(); }}>
      <section className="seller-affiliate__invite-modal seller-affiliate__invite-picker" role="dialog" aria-modal="true" aria-labelledby="affiliate-invite-title">
        <header>
          <h2 id="affiliate-invite-title">{t('sellerAffiliate.inviteCollaborateHeader', { username: String(creator.username || '').replace(/^@/, '') })}</h2>
          <button type="button" className="seller-affiliate__invite-close" aria-label={t('common.close')} disabled={loading} onClick={onClose}>×</button>
        </header>
        <form onSubmit={onSubmit}>
          <nav className="seller-affiliate__invite-tabs" aria-label={t('sellerAffiliate.invitationTabs')}>
            <button className={activeTab === 'ongoing' ? 'is-active' : ''} type="button" onClick={() => { setProductPickerOpen(false); onTabChange('ongoing'); }}>{t('sellerAffiliate.ongoing')}</button>
            <button className={activeTab === 'create' ? 'is-active' : ''} type="button" onClick={() => onTabChange('create')}>{t('sellerAffiliate.createInvitation')}</button>
          </nav>
          {activeTab === 'ongoing' ? (
            <div className="seller-affiliate__invite-existing">
              <div className="seller-affiliate__invite-search">
                <select aria-label={t('sellerAffiliate.invitationSearchType')} defaultValue="name">
                  <option value="name">{t('sellerAffiliate.invitationName')}</option>
                </select>
                <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder={t('sellerAffiliate.searchInvitationName')} aria-label={t('sellerAffiliate.searchInvitationName')} />
                <button type="button" aria-label={t('common.search')}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
                </button>
              </div>
              <div className="seller-affiliate__invitation-list">
                {loading && !invitations.length ? <div className="empty-state"><span className="loading-dot" />{t('common.loading')}</div> : null}
                {!loading && !matchingInvitations.length ? <div className="empty-state">{t('sellerAffiliate.noOngoingInvitations')}</div> : null}
                {matchingInvitations.map((invitation) => {
                  const id = String(invitation.id);
                  const selected = id === String(selectedInvitationId || '');
                  const productCount = Number(invitation.products?.length ?? invitation.product_count ?? 0);
                  const creatorCount = Number(invitation.creators?.length ?? invitation.creator_count ?? 0);
                  return (
                    <article className={`seller-affiliate__invitation-card${selected ? ' is-selected' : ''}`} key={id} onClick={() => onSelectInvitation(id)}>
                      <input type="radio" name="ongoing-invitation" value={id} checked={selected} onChange={() => onSelectInvitation(id)} aria-label={invitation.name || id} />
                      <div className="seller-affiliate__invitation-card-body">
                        <div><strong>{invitation.name || t('sellerAffiliate.untitledInvitation')}</strong><span className="seller-affiliate__invitation-id">ID</span></div>
                        <p>{t('sellerAffiliate.invitationCardMeta', { date: formatInvitationDate(invitationDate(invitation)), products: productCount, creators: creatorCount })}</p>
                      </div>
                      <button type="button" onClick={(event) => { event.stopPropagation(); onSelectInvitation(id); }}>{t('sellerAffiliate.viewDetails')}</button>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="seller-affiliate__invite-grid">
              <div className="seller-affiliate__invite-method seller-affiliate__invite-grid--wide">
                <input type="radio" checked readOnly aria-label={t('sellerAffiliate.commissionOnly')} />
                <div><strong>{t('sellerAffiliate.commissionOnly')}</strong><p>{t('sellerAffiliate.commissionOnlyDescription')}</p></div>
              </div>
              <aside className="seller-affiliate__invite-notes seller-affiliate__invite-grid--wide"><strong>{t('sellerAffiliate.notes')}</strong><ul><li>{t('sellerAffiliate.invitationNameNote')}</li><li>{t('sellerAffiliate.invitationExpiryNote')}</li></ul></aside>
              <div className="field"><label htmlFor="affiliate-invite-name">{t('sellerAffiliate.invitationName')}</label><input id="affiliate-invite-name" value={form.name} maxLength={100} required onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></div>
              <div className="field"><label htmlFor="affiliate-invite-end">{t('sellerAffiliate.validity')}</label><DatePickerInput id="affiliate-invite-end" label={t('sellerAffiliate.validity')} min={new Date().toISOString().slice(0, 10)} value={form.endDate} required onChange={(value) => setForm((current) => ({ ...current, endDate: value }))} /></div>
              <details className="seller-affiliate__invite-compact seller-affiliate__invite-grid--wide">
                <summary><span><strong>{t('sellerAffiliate.contactInfo')}</strong><small>{t('sellerAffiliate.contactInfoDescription')}</small></span><em>{[form.whatsapp, form.facebook, form.telegram].filter(Boolean).length}/3</em></summary>
                <div className="seller-affiliate__invite-compact-body seller-affiliate__invite-compact-body--grid">
                  <div className="field"><label htmlFor="affiliate-invite-whatsapp">{t('sellerAffiliate.whatsappAccount')}</label><div className="seller-affiliate__invite-phone"><select value={form.whatsappCountry} aria-label={`${t('sellerAffiliate.whatsappAccount')} · ${t('sellerAffiliate.countryCode')}`} onChange={(event) => setForm((current) => ({ ...current, whatsappCountry: event.target.value }))}>{COUNTRY_DIAL_CODES.map((country) => <option value={country.code} key={country.code}>{country.label}</option>)}</select><input id="affiliate-invite-whatsapp" type="tel" inputMode="tel" value={form.whatsapp} placeholder={t('sellerAffiliate.phoneNumber')} onChange={(event) => setForm((current) => ({ ...current, whatsapp: event.target.value }))} /></div></div>
                  <div className="field"><label htmlFor="affiliate-invite-facebook">{t('sellerAffiliate.facebookAccount')}</label><input id="affiliate-invite-facebook" value={form.facebook} onChange={(event) => setForm((current) => ({ ...current, facebook: event.target.value }))} /></div>
                  <div className="field seller-affiliate__invite-grid--wide"><label htmlFor="affiliate-invite-telegram">{t('sellerAffiliate.telegram')}</label><div className="seller-affiliate__invite-phone"><select value={form.telegramCountry} aria-label={`${t('sellerAffiliate.telegram')} · ${t('sellerAffiliate.countryCode')}`} onChange={(event) => setForm((current) => ({ ...current, telegramCountry: event.target.value }))}>{COUNTRY_DIAL_CODES.map((country) => <option value={country.code} key={country.code}>{country.label}</option>)}</select><input id="affiliate-invite-telegram" type="tel" inputMode="tel" value={form.telegram} placeholder={t('sellerAffiliate.phoneNumber')} onChange={(event) => setForm((current) => ({ ...current, telegram: event.target.value }))} /></div></div>
                </div>
              </details>
              <details className="seller-affiliate__invite-compact seller-affiliate__invite-grid--wide">
                <summary><span><strong>{t('sellerAffiliate.invitationText')}</strong><small>{form.message || t('sellerAffiliate.invitationTextDescription')}</small></span></summary>
                <div className="seller-affiliate__invite-compact-body field"><textarea id="affiliate-invite-message" rows="4" aria-label={t('sellerAffiliate.invitationText')} value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} /></div>
              </details>
              <details className="seller-affiliate__invite-compact seller-affiliate__invite-grid--wide">
                <summary><span><strong>{t('sellerAffiliate.preferredContentType')}</strong><small>{form.contentType === 'VIDEO' ? t('sellerAffiliate.shoppableVideos') : form.contentType === 'LIVE' ? t('sellerAffiliate.liveSessions') : t('sellerAffiliate.noContentPreference')}</small></span></summary>
                <div className="seller-affiliate__invite-compact-body field"><label htmlFor="affiliate-invite-content-type">{t('sellerAffiliate.contentType')}</label><select id="affiliate-invite-content-type" value={form.contentType} onChange={(event) => setForm((current) => ({ ...current, contentType: event.target.value }))}><option value="ANY">{t('sellerAffiliate.noContentPreference')}</option><option value="VIDEO">{t('sellerAffiliate.shoppableVideos')}</option><option value="LIVE">{t('sellerAffiliate.liveSessions')}</option></select><small>{t('sellerAffiliate.preferredContentDescription')}</small></div>
              </details>
              <div className="seller-affiliate__invite-product-summary seller-affiliate__invite-grid--wide">
                <button className="seller-affiliate__invite-product-trigger" type="button" onClick={() => setProductPickerOpen(true)}><span>＋ {t('sellerAffiliate.chooseAndAddProducts')}</span><small>{t('sellerAffiliate.productsSelected', { count: form.products.length })}</small></button>
                {form.products.length ? <div className="seller-affiliate__selected-product-list">{form.products.map((selection) => { const item = products.find((product) => String(product.product.id) === String(selection.id)); return <div key={selection.id}>{item?.product.main_image_url ? <img src={item.product.main_image_url} alt="" /> : null}<span><strong>{item?.product.title || selection.id}</strong><small>{selection.commission}%</small></span></div>; })}</div> : null}
              </div>
              <label className="seller-affiliate__sample-offer seller-affiliate__invite-grid--wide"><span><strong>{t('sellerAffiliate.setupFreeSamples')}</strong><small>{t('sellerAffiliate.offerFreeSamples')}</small></span><input className="seller-affiliate__switch" type="checkbox" checked={form.hasFreeSample} onChange={(event) => setForm((current) => ({ ...current, hasFreeSample: event.target.checked, sampleApprovalExempt: event.target.checked ? current.sampleApprovalExempt : false }))} /></label>
              {form.hasFreeSample ? <div ref={sampleOptionsRef} className="seller-affiliate__sample-options seller-affiliate__invite-grid--wide"><label className={form.sampleApprovalExempt ? 'is-selected' : ''}><input type="radio" name="sample-approval" checked={form.sampleApprovalExempt} onChange={() => setForm((current) => ({ ...current, sampleApprovalExempt: true }))} /><span><strong>{t('sellerAffiliate.autoApproveRequests')}</strong><em>{t('sellerAffiliate.moreExposure')}</em><small>{t('sellerAffiliate.autoApproveDescription')}</small></span></label><label className={!form.sampleApprovalExempt ? 'is-selected' : ''}><input type="radio" name="sample-approval" checked={!form.sampleApprovalExempt} onChange={() => setForm((current) => ({ ...current, sampleApprovalExempt: false }))} /><span><strong>{t('sellerAffiliate.manualReviewRequests')}</strong><small>{t('sellerAffiliate.manualReviewDescription')}</small></span></label><p>{form.sampleApprovalExempt ? t('sellerAffiliate.autoApproveSummary') : t('sellerAffiliate.manualReviewSummary')}</p></div> : null}
            </div>
          )}
          <footer>
            <button className="button button--ghost" type="button" disabled={loading} onClick={onClose}>{t('common.cancel')}</button>
            <button className="button" type="submit" disabled={loading || (activeTab === 'ongoing' ? !selectedInvitationId : !form.products.length || (!internationalPhone(form.whatsappCountry, form.whatsapp) && !internationalPhone(form.telegramCountry, form.telegram)))}>{loading ? t('common.loading') : t('sellerAffiliate.inviteAction')}</button>
          </footer>
        </form>
        {productPickerOpen ? <div className="seller-affiliate__product-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProductPickerOpen(false); }}><aside className="seller-affiliate__product-drawer" role="dialog" aria-modal="true" aria-labelledby="affiliate-product-picker-title"><header><div><h3 id="affiliate-product-picker-title">{t('sellerAffiliate.chooseProducts')}</h3><p>{t('sellerAffiliate.chooseProductsDescription')}</p></div><button type="button" aria-label={t('common.close')} onClick={() => setProductPickerOpen(false)}>×</button></header><div className="seller-affiliate__invite-products">{!products.length ? <div className="empty-state">{t('sellerAffiliate.noInviteProducts')}</div> : products.map((item) => { const id = String(item.product.id); const selection = form.products.find((product) => String(product.id) === id); return <div className={`seller-affiliate__invite-product-option${selection ? ' is-selected' : ''}`} key={id}><label><input type="checkbox" checked={Boolean(selection)} onChange={() => onToggleProduct(item)} /><span>{item.product.main_image_url ? <img src={item.product.main_image_url} alt="" /> : null}<strong>{item.product.title || id}</strong></span></label>{selection ? <div className="field"><label htmlFor={`affiliate-commission-${id}`}>{t('sellerAffiliate.commissionPercent')}</label><input id={`affiliate-commission-${id}`} type="number" min="0.01" max="80" step="0.01" value={selection.commission} required onChange={(event) => setForm((current) => ({ ...current, products: current.products.map((product) => String(product.id) === id ? { ...product, commission: event.target.value } : product) }))} /></div> : null}</div>; })}</div><footer><span>{t('sellerAffiliate.productsSelected', { count: form.products.length })}</span><button className="button" type="button" onClick={() => setProductPickerOpen(false)}>{t('sellerAffiliate.done')}</button></footer></aside></div> : null}
      </section>
    </div>
  );
};
