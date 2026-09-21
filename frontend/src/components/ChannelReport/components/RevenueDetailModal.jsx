import React from 'react';
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
import { compactProductName, orderStatusLabel } from '../utils/reportUtils';

export const RevenueDetailModal = ({
  closeVideoRevenueDetail,
  compactNumber,
  expandedRevenueDates,
  formatDailyDate,
  formatNumber,
  formatPublishedTime,
  formatRevenue,
  openVideoRevenueDetail,
  setExpandedRevenueDates,
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
                  <span><small>Sản phẩm bán</small><strong>{formatNumber(videoRevenueDetail.data.items_sold)}</strong></span>
                  <span><small>Đơn hàng</small><strong>{formatNumber(videoRevenueDetail.data.sku_orders)}</strong></span>
                  <span><small>Ngày phát sinh GMV</small><strong>{formatNumber(videoRevenueDetail.data.revenue_days)}</strong></span>
                  <span><small>TB mỗi ngày</small><strong>{formatRevenue(videoRevenueDetail.data.revenue / Math.max(videoRevenueDetail.data.days.length, 1), videoRevenueDetail.data.currency)}</strong></span>
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
                    <thead><tr><th>Ngày</th><th>Sản phẩm bán</th><th className="cell-number">SL bán</th><th className="cell-number">Đơn</th><th className="cell-number">GMV</th></tr></thead>
                    <tbody>{[...videoRevenueDetail.data.days].reverse().map((day) => {
                      const orders = Array.isArray(day.orders) ? day.orders : [];
                      const expanded = expandedRevenueDates.has(day.date);
                      return <React.Fragment key={day.date}>
                      <tr className={orders.length ? 'channel-report-revenue-modal__day-row' : ''}>
                        <td>{orders.length ? (
                          <button
                            type="button"
                            className="channel-report-revenue-modal__day-trigger"
                            aria-expanded={expanded}
                            onClick={() => setExpandedRevenueDates((current) => {
                              const next = new Set(current);
                              if (next.has(day.date)) next.delete(day.date);
                              else next.add(day.date);
                              return next;
                            })}
                          >
                            <span className={`sidebar__chevron${expanded ? ' sidebar__chevron--open' : ''}`} aria-hidden="true" />
                            {formatDailyDate(day.date)}
                          </button>
                        ) : formatDailyDate(day.date)}</td>
                        <td>
                          {day.affiliate_orders_available && day.items_sold > 0 ? (
                            <div className="member-detail__product-tags channel-report-revenue-modal__products">
                              {day.products.slice(0, 2).map((product) => <span key={product.id} title={product.name}>{compactProductName(product.name)}{product.quantity ? ` ×${formatNumber(product.quantity)}` : ''}</span>)}
                              {day.products.length > 2 ? <span>+{day.products.length - 2}</span> : null}
                              {!day.products.length ? <span>Chưa xác định sản phẩm</span> : null}
                            </div>
                          ) : day.affiliate_orders_available ? '—' : <span className="channel-report-revenue-modal__sync-pending">Chờ đồng bộ đơn</span>}
                        </td>
                        <td className="cell-number">{formatNumber(day.items_sold)}</td>
                        <td className="cell-number">{formatNumber(day.sku_orders)}</td>
                        <td className="cell-number">{formatRevenue(day.revenue, day.currency || videoRevenueDetail.data.currency)}</td>
                      </tr>
                      {expanded ? <tr className="channel-report-revenue-modal__orders-row">
                        <td colSpan="5">
                          <div className="channel-report-revenue-modal__orders">
                            <div className="channel-report-revenue-modal__orders-heading">
                              <strong>Đơn hàng ngày {formatDailyDate(day.date)}</strong>
                              <span>{formatNumber(orders.length)} đơn quy gán cho video</span>
                            </div>
                            <div className="table-wrap">
                              <table className="data-table data-table--compact">
                                <thead><tr><th>Mã đơn</th><th>Thời gian</th><th>Sản phẩm</th><th className="cell-number">SL</th><th className="cell-number">Giá trị đơn</th><th>Trạng thái</th></tr></thead>
                                <tbody>{orders.map((order) => (
                                  <tr key={`${order.shop_id || 'shop'}-${order.id}`}>
                                    <td><strong className="channel-report-revenue-modal__order-id" title={order.id}>{order.id || '—'}</strong>{order.shop_name ? <small>{order.shop_name}</small> : null}</td>
                                    <td>{order.create_time ? formatPublishedTime(order.create_time) : '—'}</td>
                                    <td><div className="member-detail__product-tags channel-report-revenue-modal__order-products">
                                      {(order.products || []).slice(0, 2).map((product, index) => <span key={`${product.id || 'product'}-${index}`} title={product.name}>{compactProductName(product.name)}{product.quantity ? ` ×${formatNumber(product.quantity)}` : ''}</span>)}
                                      {(order.products || []).length > 2 ? <span>+{order.products.length - 2}</span> : null}
                                      {!order.products?.length ? <span>Chưa xác định sản phẩm</span> : null}
                                    </div></td>
                                    <td className="cell-number">{formatNumber(order.quantity)}</td>
                                    <td className="cell-number">{formatRevenue(order.gross_amount, order.currency || day.currency || videoRevenueDetail.data.currency)}</td>
                                    <td>{orderStatusLabel(order.status)}</td>
                                  </tr>
                                ))}</tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr> : null}
                      </React.Fragment>;
                    })}</tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>,
        document.body,
      ) : null;
};

