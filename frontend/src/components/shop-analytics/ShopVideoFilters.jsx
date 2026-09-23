import { ArrowUpDown, CalendarDays } from 'lucide-react';
import ShopDropdown from '../ShopDropdown';
import SelectDropdown from '../SelectDropdown';
import DatePickerInput from '../DatePickerInput';
import AnalyticsIcon from './AnalyticsIcon';
import CreatorDropdown from './CreatorDropdown';
import { dateOnly, shiftDate } from './shopAnalyticsUtils';

const ShopVideoFilters = ({
  endDate, invalidRange, loading, missingAnalyticsScope, onAccountTypeChange,
  onCreatorChange, onEndDateChange, onPeriodChange, onRefresh, onShopChange,
  onSortChange, onStartDateChange, periodOptions, periodPreset, selectedShopId,
  shops, sortOptions, startDate, t, tokenExpired, videoAccountType,
  videoAnalyticsLoading, videoCreator, videoCreatorOptions, videoExportOnly,
  videoRows, videoSortField,
}) => (
  <section className="section-card shop-analytics__filters" aria-label={t('shopAnalytics.filtersTitle')}>
    {!videoExportOnly ? (
      <div className="shop-analytics__filter-heading">
        <div><h2 className="section-card__title" id="shop-video-filters-title">{t('shopAnalytics.videoFiltersTitle')}</h2></div>
        <button className="button shop-analytics__sync-button" type="button" disabled={!selectedShopId || videoAnalyticsLoading || invalidRange || missingAnalyticsScope || tokenExpired} onClick={onRefresh}>
          <AnalyticsIcon name="sync" />
          {videoAnalyticsLoading ? t('common.loading') : t('shopAnalytics.refreshVideos')}
        </button>
      </div>
    ) : null}
    {!videoExportOnly ? (
      <div className="shop-video-analytics__account-tabs" role="tablist" aria-label={t('shopAnalytics.videoAccountType')}>
        {['LINKED_ACCOUNTS', 'AFFILIATE_ACCOUNTS'].map((type) => (
          <button className={videoAccountType === type ? 'is-active' : ''} type="button" role="tab" aria-selected={videoAccountType === type} onClick={() => onAccountTypeChange(type)} key={type}>
            {t(type === 'LINKED_ACCOUNTS' ? 'shopAnalytics.linkedAccounts' : 'shopAnalytics.affiliateAccounts')}
          </button>
        ))}
      </div>
    ) : null}
    <div className="shop-analytics__filter-grid shop-video-analytics__filters">
      <div className="field">
        <label htmlFor="video-analytics-shop">{t('shopAnalytics.shop')}</label>
        <ShopDropdown id="video-analytics-shop" value={selectedShopId} shops={shops} disabled={loading || !shops.length} onChange={onShopChange} placeholder={loading ? t('common.loading') : t('shopAnalytics.selectShop')} unknownLabel={t('common.unknown')} />
      </div>
      {!videoExportOnly ? (
        <div className="field">
          <label htmlFor="video-sort-field">{t('shopAnalytics.sortBy')}</label>
          <SelectDropdown id="video-sort-field" value={videoSortField} onChange={onSortChange} icon={<ArrowUpDown size={16} />} options={sortOptions} />
        </div>
      ) : (
        <div className="field">
          <label htmlFor="video-creator-filter">{t('shopAnalytics.creator')}</label>
          <CreatorDropdown id="video-creator-filter" options={videoCreatorOptions} value={videoCreator} disabled={videoAnalyticsLoading && !videoRows.length} allLabel={t('shopAnalytics.allCreators')} searchPlaceholder={t('shopAnalytics.searchCreators')} noResultsLabel={t('shopAnalytics.creatorSearchNoResults')} onChange={onCreatorChange} />
        </div>
      )}
      <div className="field">
        <label htmlFor="video-analytics-period">{t('shopAnalytics.period')}</label>
        <SelectDropdown id="video-analytics-period" value={periodPreset} onChange={onPeriodChange} icon={<CalendarDays size={16} />} options={periodOptions} />
      </div>
      {periodPreset === 'custom' ? (
        <>
          <div className="field"><label htmlFor="video-start-date">{t('shopAnalytics.startDate')}</label><DatePickerInput id="video-start-date" label={t('shopAnalytics.startDate')} value={startDate} max={dateOnly(new Date())} onChange={onStartDateChange} /></div>
          <div className="field"><label htmlFor="video-end-date">{t('shopAnalytics.endDate')}</label><DatePickerInput id="video-end-date" label={t('shopAnalytics.endDate')} value={shiftDate(endDate, -1)} max={dateOnly(new Date())} invalid={invalidRange} onChange={onEndDateChange} /></div>
        </>
      ) : null}
    </div>
    {invalidRange ? <p className="shop-analytics__validation" role="alert">{t('shopAnalytics.invalidRange')}</p> : null}
  </section>
);

export default ShopVideoFilters;
