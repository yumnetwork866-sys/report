import React, { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { EyeOff } from 'lucide-react';

import { compactVideoTitle } from '../utils/reportUtils';
import { ProductRowThumb, VideoProductThumb } from './ReportControls';

export const MemberTable = ({
  activeReportTab,
  expandedMemberIds,
  formatNumber,
  formatPublishedDate,
  formatRevenue,
  loadMemberDetail,
  memberDetails,
  memberTabs,
  members,
  openVideoRevenueDetail,
  setMemberTabs,
  setTableSort,
  showTeamBadge,
  tableSort,
  toggleMember,
}) => {
  const renderMemberDetail = (member) => {
    const memberId = String(member.key);
    const detail = memberDetails[memberId] || {};
    const data = detail.data;
    const activeTab = memberTabs[memberId] || 'videos';
    const videos = data?.videos?.items || [];
    const products = data?.products || [];
    const pagination = data?.videos?.pagination;
    if (detail.loading && !data) {
      return <div className="member-detail__state"><span className="loading-dot" />Đang tải video và sản phẩm</div>;
    }
    if (detail.error && !data) {
      return (
        <div className="member-detail__state member-detail__state--error">
          <span>{detail.error}</span>
          <button className="button button--small button--ghost" type="button" onClick={() => loadMemberDetail(memberId)}>Thử lại</button>
        </div>
      );
    }
    return (
      <div className="member-detail">
        <div className="member-detail__tabs" role="tablist" aria-label={`Chi tiết ${member.name}`}>
          <button type="button" role="tab" aria-selected={activeTab === 'videos'} className={activeTab === 'videos' ? 'is-active' : ''} onClick={() => setMemberTabs((current) => ({ ...current, [memberId]: 'videos' }))}>
            Video <span>{formatNumber(pagination?.total)}</span>
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'products'} className={activeTab === 'products' ? 'is-active' : ''} onClick={() => setMemberTabs((current) => ({ ...current, [memberId]: 'products' }))}>
            Sản phẩm <span>{formatNumber(products.length)}</span>
          </button>
        </div>
        {activeTab === 'videos' ? (
          <div className="member-detail__videos">
            {videos.map((video) => {
              const fullTitle = video.title || `Video ${video.platform_video_id}`;
              const displayTitle = compactVideoTitle(fullTitle, 40);
  
              const canOpenDetail = ['revenue', 'orders'].includes(activeReportTab) || Boolean(Number(video.orders) > 0 || (video.revenue && video.revenue.amount > 0));
  
              return (
                <article
                  className={`member-detail__video${canOpenDetail ? ' member-detail__video--revenue-clickable' : ''}${video.status === 'unavailable' ? ' member-detail__video--unavailable' : ''}`}
                  key={video.id}
                  role={canOpenDetail ? 'button' : undefined}
                  tabIndex={canOpenDetail ? 0 : undefined}
                  title={canOpenDetail ? 'Xem chi tiết đơn hàng & doanh thu video' : undefined}
                  onClick={(event) => {
                    if (!canOpenDetail || event.target.closest('a, button')) return;
                    openVideoRevenueDetail(video);
                  }}
                  onKeyDown={(event) => {
                    if (!canOpenDetail || !['Enter', ' '].includes(event.key)) return;
                    event.preventDefault();
                    openVideoRevenueDetail(video);
                  }}
                >
                  {video.status === 'unavailable' ? (
                    <div
                      className="member-detail__video-placeholder member-detail__video-placeholder--unavailable"
                      title="Video đã bị ẩn hoặc xóa trên TikTok"
                    >
                      <EyeOff size={14} strokeWidth={2.2} aria-hidden="true" />
                      <span>Đã ẩn</span>
                    </div>
                  ) : (
                    <>
                      {video.thumbnail_url ? (
                        <img
                          src={video.thumbnail_url}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const placeholder = e.currentTarget.nextElementSibling;
                            if (placeholder) placeholder.style.display = 'grid';
                          }}
                        />
                      ) : null}
                      <div
                        className="member-detail__video-placeholder"
                        style={{ display: video.thumbnail_url ? 'none' : 'grid' }}
                      >
                        Video
                      </div>
                    </>
                  )}
                  <div className="member-detail__video-copy" title={fullTitle}>
                    <div className="member-detail__video-title-row">
                      {video.video_url
                        ? <a href={video.video_url} target="_blank" rel="noreferrer" title={fullTitle}>{displayTitle}</a>
                        : <strong title={fullTitle}>{displayTitle}</strong>}
                    </div>
                    <small>{video.channel?.display_name || video.channel?.username || 'TikTok'}</small>
                    <small className="member-detail__video-posted-at" title="Thời gian đăng">
                      {video.published_at ? `${formatPublishedDate(video.published_at)} ${formatPublishedTime(video.published_at)}` : '—'}
                    </small>
                  </div>
                  <div className="member-detail__video-metrics">
                    <div>
                      <span>Lượt xem</span>
                      <strong>{formatNumber(video.views)}</strong>
                    </div>
                    <div className="member-detail__video-metric-orders">
                      <span>Đơn hàng</span>
                      <div className="member-detail__video-orders-content">
                        {video.products?.length ? (
                          <div className="member-detail__video-order-thumbs">
                            {video.products.slice(0, 4).map((product) => (
                              <VideoProductThumb key={product.id || product.name} product={product} />
                            ))}
                            {video.products.length > 4 ? (
                              <span
                                className="member-detail__video-order-more"
                                title={video.products.slice(4).map((p) => `${p.name} (x${Number(p.quantity || 0)})`).join(', ')}
                              >
                                +{video.products.length - 4}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <strong>—</strong>
                        )}
                      </div>
                    </div>
                    <div>
                      <span>GMV</span>
                      <strong>{video.revenue ? formatRevenue(video.revenue.amount, video.revenue.currency) : '—'}</strong>
                    </div>
                  </div>
                </article>
              );
            })}
            {!videos.length ? <div className="member-detail__state">Không có video trong kỳ đã chọn.</div> : null}
            {pagination && pagination.page < pagination.total_pages ? (
              <button className="button button--small button--ghost member-detail__more" type="button" disabled={detail.loading} onClick={() => loadMemberDetail(memberId, pagination.page + 1, true)}>
                {detail.loading ? 'Đang tải...' : 'Xem thêm video'}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="table-wrap member-detail__products">
            <table className="data-table data-table--compact">
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th className="cell-number">Video</th>
                  <th className="cell-number">Lượt xem</th>
                  <th className="cell-number">Số đơn</th>
                  <th className="cell-number">GMV</th>
                </tr>
              </thead>
              <tbody>{products.map((product) => (
                <tr key={product.id ?? product.name}>
                  <td>
                    <div className="member-detail__product-cell">
                      <ProductRowThumb product={product} />
                      <div className="member-detail__product-info">
                        <strong className="member-detail__product-name" title={product.name}>
                          {compactProductName(product.name)}
                        </strong>
                      </div>
                    </div>
                  </td>
                  <td className="cell-number">{formatNumber(product.videos)}</td>
                  <td className="cell-number">{formatNumber(product.views)}</td>
                  <td className="cell-number">{formatNumber(product.orders || 0)}</td>
                  <td className="cell-number">{product.revenue_available ? formatRevenue(product.revenue, product.currency) : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
            {!products.length ? <div className="member-detail__state">Không có sản phẩm trong kỳ đã chọn.</div> : null}
          </div>
        )}
      </div>
    );
  };
  
  const toggleTableSort = (key) => {
    setTableSort((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === 'desc' ? 'asc' : 'desc' };
      }
      return { key, direction: key === 'name' ? 'asc' : 'desc' };
    });
  };
  
  const sortMark = (key) => {
    const effectiveKey = tableSort.key || (activeReportTab === 'revenue' ? 'revenue' : 'views');
    const effectiveDir = tableSort.key ? tableSort.direction : 'desc';
    if (effectiveKey === key) {
      return effectiveDir === 'asc' ? ' ↑' : ' ↓';
    }
    return '';
  };
  
  const sortMembers = useCallback((membersList) => {
    return [...membersList].sort((a, b) => {
      if (tableSort.key) {
        const factor = tableSort.direction === 'asc' ? 1 : -1;
        if (tableSort.key === 'name') {
          return factor * a.name.localeCompare(b.name);
        }
        if (tableSort.key === 'avgViews') {
          const avgA = a.views / Math.max(a.videos, 1);
          const avgB = b.views / Math.max(b.videos, 1);
          return factor * (avgA - avgB);
        }
        if (tableSort.key === 'avgRevenue') {
          const avgA = a.revenue / Math.max(a.videos, 1);
          const avgB = b.revenue / Math.max(b.videos, 1);
          return factor * (avgA - avgB);
        }
        const valA = Number(a[tableSort.key] || 0);
        const valB = Number(b[tableSort.key] || 0);
        if (valA !== valB) return factor * (valA - valB);
      }
  
      if (activeReportTab === 'revenue') {
        return (b.revenue - a.revenue)
          || (b.orders - a.orders)
          || (b.views - a.views)
          || (b.videos - a.videos)
          || a.name.localeCompare(b.name);
      }
      return (b.views - a.views)
        || (b.videos - a.videos)
        || (b.orders - a.orders)
        || (b.revenue - a.revenue)
        || a.name.localeCompare(b.name);
    });
  }, [activeReportTab, tableSort]);
  
  const renderMembersTable = (membersList, showTeamBadge = false) => {
    const sorted = sortMembers(membersList);
    if (!sorted.length) {
      return (
        <div className="content-performance__group-empty">
          <strong>Team chưa có nhân viên</strong>
          <span>Gắn nhân viên vào team để bắt đầu thống kê.</span>
          <Link to="/manage/users">Quản lý nhân viên →</Link>
        </div>
      );
    }
    return (
      <div className="table-wrap">
        <table className="data-table data-table--compact">
          <thead>
            <tr>
              <th>
                <button className="table-sort" type="button" onClick={() => toggleTableSort('name')}>
                  Thành viên{sortMark('name')}
                </button>
              </th>
              <th className="cell-number">
                <button className="table-sort" type="button" onClick={() => toggleTableSort('videos')}>
                  Video{sortMark('videos')}
                </button>
              </th>
              <th className="cell-number">
                <button className="table-sort" type="button" onClick={() => toggleTableSort('views')}>
                  Lượt xem{sortMark('views')}
                </button>
              </th>
              <th className="cell-number">
                <button className="table-sort" type="button" onClick={() => toggleTableSort('avgViews')}>
                  TB lượt xem/video{sortMark('avgViews')}
                </button>
              </th>
              <th className="cell-number">
                <button className="table-sort" type="button" onClick={() => toggleTableSort('orders')}>
                  Đơn hàng{sortMark('orders')}
                </button>
              </th>
              <th className="cell-number">
                <button className="table-sort" type="button" onClick={() => toggleTableSort('revenue')}>
                  Doanh số{sortMark('revenue')}
                </button>
              </th>
              <th className="cell-number">
                <button className="table-sort" type="button" onClick={() => toggleTableSort('avgRevenue')}>
                  TB doanh số/video{sortMark('avgRevenue')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((member) => {
              const rowId = `${member.teamKey || ''}-${member.key}`;
              const expanded = expandedMemberIds.has(String(member.key));
              return (
                <React.Fragment key={rowId}>
                  <tr
                    className={expanded ? 'member-row member-row--expanded' : 'member-row'}
                    onClick={(event) => {
                      if (event.target.closest('button, a, input, select, textarea')) return;
                      toggleMember(member);
                    }}
                  >
                    <td>
                      <button className="member-row__trigger" type="button" aria-expanded={expanded} onClick={() => toggleMember(member)}>
                        <span className={`sidebar__chevron${expanded ? ' sidebar__chevron--open' : ''}`} aria-hidden="true" />
                        <strong>{member.name}</strong>
                        {showTeamBadge && member.teamName ? (
                          <span className="member-row__team-badge">{member.teamName}</span>
                        ) : null}
                      </button>
                    </td>
                    <td className="cell-number">
                      <div>{formatNumber(member.videos)}</div>
                      {Number(member.unavailableVideos) > 0 ? (
                        <small
                          className="member-row__unavailable-count"
                          title={`${member.unavailableVideos} video đã bị ẩn hoặc xóa trên TikTok`}
                          style={{ display: 'block', color: '#ea580c', fontSize: '0.72rem', fontWeight: 600 }}
                        >
                          ({member.unavailableVideos} video ẩn/xóa)
                        </small>
                      ) : null}
                    </td>
                    <td className="cell-number">{formatNumber(member.views)}</td>
                    <td className="cell-number">{formatNumber(Math.round(member.views / Math.max(member.videos, 1)))}</td>
                    <td className="cell-number">{formatNumber(member.orders || 0)}</td>
                    <td className="cell-number">{member.revenueAvailable ? formatRevenue(member.revenue, member.currency) : '—'}</td>
                    <td className="cell-number">{member.revenueAvailable ? formatRevenue(member.revenue / Math.max(member.videos, 1), member.currency) : '—'}</td>
                  </tr>
                  {expanded ? (
                    <tr className="member-detail-row">
                      <td colSpan="7">{renderMemberDetail(member)}</td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };
  

  return renderMembersTable(members, showTeamBadge);
};

