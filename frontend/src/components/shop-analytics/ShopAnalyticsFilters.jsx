import { CalendarDays } from 'lucide-react';
import ShopDropdown from '../ShopDropdown';
import SelectDropdown from '../SelectDropdown';
import DatePickerInput from '../DatePickerInput';
import { dateOnly, shiftDate } from './shopAnalyticsUtils';

const ShopAnalyticsFilters = ({
  endDate, invalidRange, loading, onEndDateChange, onPeriodChange, onShopChange,
  onStartDateChange, periodOptions, periodPreset, selectedShopId, shops, startDate, t,
}) => (
  <section className="shop-analytics__filters" aria-label={t('shopAnalytics.filtersTitle')}>
    <div className="shop-analytics__filter-grid">
      <div className="field">
        <label htmlFor="analytics-shop">{t('shopAnalytics.shop')}</label>
        <ShopDropdown
          id="analytics-shop"
          value={selectedShopId}
          shops={shops}
          disabled={loading || !shops.length}
          onChange={onShopChange}
          placeholder={loading ? t('common.loading') : t('shopAnalytics.selectShop')}
          unknownLabel={t('common.unknown')}
          allLabel={t('shopAnalytics.allShops')}
          allDescription={t('shopAnalytics.allShopsCount', { count: shops.length })}
        />
      </div>
      <div className="field">
        <label htmlFor="analytics-period">{t('shopAnalytics.period')}</label>
        <SelectDropdown
          id="analytics-period"
          value={periodPreset}
          onChange={onPeriodChange}
          icon={<CalendarDays size={16} />}
          options={periodOptions}
        />
      </div>
      {periodPreset === 'custom' ? (
        <>
          <div className="field">
            <label htmlFor="analytics-start-date">{t('shopAnalytics.startDate')}</label>
            <DatePickerInput id="analytics-start-date" label={t('shopAnalytics.startDate')} value={startDate} max={dateOnly(new Date())} onChange={onStartDateChange} />
          </div>
          <div className="field">
            <label htmlFor="analytics-end-date">{t('shopAnalytics.endDate')}</label>
            <DatePickerInput id="analytics-end-date" label={t('shopAnalytics.endDate')} value={shiftDate(endDate, -1)} max={dateOnly(new Date())} invalid={invalidRange} onChange={onEndDateChange} />
          </div>
        </>
      ) : null}
    </div>
    {invalidRange ? <p className="shop-analytics__validation" role="alert">{t('shopAnalytics.invalidRange')}</p> : null}
  </section>
);

export default ShopAnalyticsFilters;
