import { createPortal } from 'react-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { CHART_TICK as chartTick } from '../constants';

export const RevenueDetailModal = ({
  closeVideoRevenueDetail,
  compactNumber,
  formatDailyDate,
  formatNumber,
  formatRevenue,
  openVideoRevenueDetail,
  videoRevenueDetail,
}) => {
  return videoRevenueDetail ? createPortal(
        <div className="modal-backdrop channel-report-revenue-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeVideoRevenueDetail(); }}>
          <section className="modal-card channel-report-revenue-modal" role="dialog" aria-modal="true" aria-labelledby="channel-report-revenue-modal-title">
            <header className="channel-report-revenue-modal__header">
              <div>
                <h2 id="channel-report-revenue-modal-title">Doanh thu video theo ngày</h2>
                <p title={videoRevenueDetail.video.title}>{videoRevenueDetail.video.title || `Video ${videoRevenueDetail.video.platform_video_id}`}</p>
              </div>
              <button className="button button--ghost" type="button" aria-label="Đóng" onClick={closeVideoRevenueDetail}>×</button>
            </header>
            {videoRevenueDetail.loading ? (
              <div className="member-detail__state"><span className="loading-dot" />Đang tải doanh thu theo ngày</div>
            ) : videoRevenueDetail.error ? (
              <div className="member-detail__state member-detail__state--error">
                <span>{videoRevenueDetail.error}</span>
                <button className="button button--small button--ghost" type="button" onClick={() => openVideoRevenueDetail(videoRevenueDetail.video)}>Thử lại</button>
              </div>
            ) : (
              <div className="channel-report-revenue-modal__body">
                <div className="channel-report-revenue-modal__summary">
                  <span><small>Tổng GMV</small><strong>{formatRevenue(videoRevenueDetail.data.revenue, videoRevenueDetail.data.currency)}</strong></span>
                  <span><small>Tổng đơn TikTok</small><strong>{formatNumber(videoRevenueDetail.data.sku_orders)}</strong></span>
                  <span><small>Ngày phát sinh GMV</small><strong>{formatNumber(videoRevenueDetail.data.revenue_days)}</strong></span>
                  <span><small>GMV trung bình / đơn</small><strong>{formatRevenue(videoRevenueDetail.data.revenue / Math.max(videoRevenueDetail.data.sku_orders, 1), videoRevenueDetail.data.currency)}</strong></span>
                </div>
                <div className="channel-report-revenue-modal__chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={videoRevenueDetail.data.days} barSize={18} margin={{ top: 12, right: 8, bottom: 4, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="var(--color-border)" />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} tick={chartTick} minTickGap={20} tickFormatter={(value) => {
                        const [, month, day] = String(value).split('-');
                        return day && month ? `${day}/${month}` : value;
                      }} />
                      <YAxis width={58} tickLine={false} axisLine={false} tick={chartTick} tickFormatter={compactNumber} />
                      <Tooltip
                        cursor={{ fill: 'var(--color-accent-soft)' }}
                        labelFormatter={formatDailyDate}
                        formatter={(value) => [formatRevenue(value, videoRevenueDetail.data.currency), 'GMV']}
                      />
                      <Bar dataKey="revenue" name="GMV" fill="var(--color-primary)" radius={[5, 5, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="table-wrap channel-report-revenue-modal__table">
                  <table className="data-table data-table--compact">
                    <thead><tr><th>Ngày</th><th className="cell-number">Số đơn TikTok</th><th className="cell-number">GMV</th></tr></thead>
                    <tbody>{[...videoRevenueDetail.data.days].reverse().map((day) => (
                      <tr key={day.date}>
                        <td>{formatDailyDate(day.date)}</td>
                        <td className="cell-number">{formatNumber(day.sku_orders)}</td>
                        <td className="cell-number">{formatRevenue(day.revenue, day.currency || videoRevenueDetail.data.currency)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>,
        document.body,
      ) : null;
};
