import React from 'react';

const BookingPageHero = ({
  heroTitle,
  hashtagFilterEnabled,
  onHashtagFilterChange,
  bookingTab,
  stats,
  selectedCurrency,
  formatNumber,
  formatMoney,
  formatRatio,
  t,
}) => (
  <section className="page__hero booking-page-hero">
    <div className="booking-page-hero__title-row">
      <h1 className="page__title">{t('booking.heroTitle') || heroTitle}</h1>
      <label
        className={`booking-hashtag-toggle${hashtagFilterEnabled ? ' booking-hashtag-toggle--active' : ''}`}
        title={t('booking.hashtagFilterHelp')}
      >
        <input
          type="checkbox"
          checked={hashtagFilterEnabled}
          onChange={(event) => onHashtagFilterChange(event.target.checked)}
        />
        <span className="booking-hashtag-toggle__track" aria-hidden="true"><i /></span>
        <span>{t('booking.hashtagFilter')}</span>
      </label>
    </div>
    <div className="page__stats booking-stats booking-stats--evaluation">
      <article className="stat-card"><p className="stat-card__label">{t('booking.evaluations')}</p><p className="stat-card__value">{stats.total}</p></article>
      <article className="stat-card"><p className="stat-card__label">{t(bookingTab === 'product' ? 'booking.affiliateOrders' : 'booking.matchedVideo')}</p><p className="stat-card__value">{formatNumber(stats.videoCount)}</p></article>
      <article className="stat-card"><p className="stat-card__label">{t('booking.totalCost')}</p><p className="stat-card__value">{formatMoney(stats.totalCost, selectedCurrency)}</p></article>
      <article className="stat-card"><p className="stat-card__label">{t('booking.totalRevenue')}</p><p className="stat-card__value">{formatMoney(stats.totalRevenue, selectedCurrency)}</p></article>
      <article className="stat-card"><p className="stat-card__label">{t('booking.costRevenueRatio')}</p><p className="stat-card__value">{formatRatio(stats.totalRevenue > 0 ? stats.totalCost / stats.totalRevenue : null)}</p></article>
    </div>
  </section>
);

export default BookingPageHero;
