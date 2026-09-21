import DatePickerInput from '../DatePickerInput';

import {
  ChannelSelectDropdown,
  ReportSelectDropdown,
  TeamSelectDropdown,
} from './components/ReportControls';
import { MemberTable } from './components/MemberTable';
import { RevenueDetailModal } from './components/RevenueDetailModal';
import { useChannelReportData } from './hooks/useChannelReportData';

const ChannelReport = () => {
  const {
    activeReportTab,
    allTeamOrders,
    channels,
    changePeriodMode,
    closeVideoRevenueDetail,
    compactNumber,
    endDate,
    error,
    expandedMemberIds,
    expandedRevenueDates,
    formatDailyDate,
    formatNumber,
    formatPublishedDate,
    formatPublishedTime,
    formatRevenue,
    isAllTeams,
    loadMemberDetail,
    loading,
    memberDetails,
    memberTabs,
    mergedMembers,
    mergedMetrics,
    monthOptions,
    openVideoRevenueDetail,
    periodMode,
    previousGroups,
    previousRevenueGroups,
    productSearchQuery,
    productTeamFilter,
    renderMetricChange,
    selectedChannelId,
    selectedMonth,
    selectedTeamIds,
    setActiveReportTab,
    setEndDate,
    setExpandedRevenueDates,
    setMemberTabs,
    setProductSearchQuery,
    setProductTeamFilter,
    setSelectedChannelId,
    setSelectedMonth,
    setSelectedTeamIds,
    setStartDate,
    setTableSort,
    startDate,
    tableSort,
    teamProductsData,
    teamProductsSummary,
    teams,
    toggleMember,
    videoRevenueDetail,
    visibleGroups,
  } = useChannelReportData();

  const renderMembersTable = (members, showTeamBadge = false) => (
    <MemberTable
      activeReportTab={activeReportTab}
      expandedMemberIds={expandedMemberIds}
      formatNumber={formatNumber}
      formatPublishedDate={formatPublishedDate}
      formatRevenue={formatRevenue}
      loadMemberDetail={loadMemberDetail}
      memberDetails={memberDetails}
      memberTabs={memberTabs}
      members={members}
      openVideoRevenueDetail={openVideoRevenueDetail}
      setMemberTabs={setMemberTabs}
      setTableSort={setTableSort}
      showTeamBadge={showTeamBadge}
      tableSort={tableSort}
      toggleMember={toggleMember}
    />
  );
  return (
    <div className="page channel-report-page">
      <section className="page__hero koc-hero channel-report-hero">
        <div>
          <h1 className="page__title">Báo cáo</h1>
        </div>
        <div className="koc-tabs channel-report-tabs" role="tablist" aria-label="Chế độ xem báo cáo">
          <button
            id="channel-report-teams-tab"
            type="button"
            role="tab"
            aria-selected={activeReportTab === 'teams'}
            aria-controls="channel-report-teams-panel"
            tabIndex={activeReportTab === 'teams' ? 0 : -1}
            className={activeReportTab === 'teams' ? 'is-active' : ''}
            onClick={() => setActiveReportTab('teams')}
          >
            Video
          </button>
          <button
            id="channel-report-revenue-tab"
            type="button"
            role="tab"
            aria-selected={activeReportTab === 'revenue'}
            aria-controls="channel-report-revenue-panel"
            tabIndex={activeReportTab === 'revenue' ? 0 : -1}
            className={activeReportTab === 'revenue' ? 'is-active' : ''}
            onClick={() => setActiveReportTab('revenue')}
          >
            Doanh thu
          </button>
          <button
            id="channel-report-comparison-tab"
            type="button"
            role="tab"
            aria-selected={activeReportTab === 'comparison'}
            aria-controls="channel-report-comparison-panel"
            tabIndex={activeReportTab === 'comparison' ? 0 : -1}
            className={activeReportTab === 'comparison' ? 'is-active' : ''}
            onClick={() => setActiveReportTab('comparison')}
          >
            Thống kê
          </button>
        </div>
      </section>

      {error ? <section className="section-card empty-state empty-state--compact">{error}</section> : null}

      <section className="section-card content-performance">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">
              {activeReportTab === 'comparison' ? 'Thống kê' : activeReportTab === 'revenue' ? 'Doanh thu' : 'Video'}
            </h2>

          </div>
          <div className="channel-report-filters">
            {activeReportTab !== 'comparison' ? <div className="field channel-report-team">
              <label htmlFor="channel-report-team">Team</label>
              <TeamSelectDropdown
                teams={teams}
                value={selectedTeamIds}
                onChange={setSelectedTeamIds}
              />
            </div> : null}
            <div className="field channel-report-channel">
              <label htmlFor="channel-report-channel">Kênh</label>
              <ChannelSelectDropdown
                channels={channels}
                value={selectedChannelId}
                onChange={setSelectedChannelId}
              />
            </div>
            <div className="field channel-report-month">
              <label htmlFor="channel-report-period-mode">Kỳ báo cáo</label>
              <ReportSelectDropdown
                id="channel-report-period-mode"
                value={periodMode}
                onChange={changePeriodMode}
                options={[
                  { value: 'month', label: 'Theo tháng' },
                  { value: 'custom', label: 'Tùy chỉnh' },
                ]}
              />
            </div>
            {periodMode === 'month' ? (
              <div className="field channel-report-month">
                <label htmlFor="channel-report-month">Tháng đánh giá</label>
                <ReportSelectDropdown
                  id="channel-report-month"
                  value={selectedMonth}
                  onChange={setSelectedMonth}
                  options={monthOptions}
                />
              </div>
            ) : (
              <>
                <div className="field channel-report-date">
                  <label htmlFor="channel-report-start-date">Từ ngày</label>
                  <DatePickerInput id="channel-report-start-date" label="Chọn ngày bắt đầu" value={startDate} min="" max={endDate || todayValue()} onChange={setStartDate} />
                </div>
                <div className="field channel-report-date">
                  <label htmlFor="channel-report-end-date">Đến ngày</label>
                  <DatePickerInput id="channel-report-end-date" label="Chọn ngày kết thúc" value={endDate} min={startDate || undefined} max={todayValue()} onChange={setEndDate} />
                </div>
              </>
            )}

          </div>
        </div>

        {loading ? <div className="empty-state"><div className="loading-dot" />Đang tải báo cáo</div> : !teams.length ? (
          <div className="empty-state empty-state--compact">
            <strong>Chưa có team.</strong>
            <span>Hãy tạo team và gắn hashtag cho nhân viên trong trang Quản lý User.</span>
          </div>
        ) : (
          <>
            {activeReportTab === 'comparison' ? (
              <div
                id="channel-report-comparison-panel"
                className="channel-report-comparison-content"
                role="tabpanel"
                aria-labelledby="channel-report-comparison-tab"
              >

                <section className="team-orders-card" aria-labelledby="team-orders-title">
                  <div className="team-orders-card__header">
                    <div>
                      <h3 id="team-orders-title">Đơn hàng theo sản phẩm</h3>
                    </div>
                    <div className="team-orders-card__controls">
                      <div className="field team-orders-card__search">
                        <input
                          type="search"
                          placeholder="Tìm tên hoặc ID sản phẩm..."
                          value={productSearchQuery}
                          onChange={(e) => setProductSearchQuery(e.target.value)}
                        />
                      </div>
                      <div className="field team-orders-card__team-select">
                        <label htmlFor="team-orders-team-select">Team</label>
                        <select
                          id="team-orders-team-select"
                          value={productTeamFilter}
                          onChange={(e) => setProductTeamFilter(e.target.value)}
                        >
                          <option value="all">Tất cả team ({formatNumber(allTeamOrders)} đơn)</option>
                          {teams.map((team) => {
                            const currentGroupList = activeReportTab === 'revenue' ? revenueGroups : groups;
                            const teamRevGroup = currentGroupList.find((g) => g.key === String(team.id));
                            const orderCount = teamRevGroup?.orders || 0;
                            return (
                              <option key={team.id} value={String(team.id)}>
                                {team.name} ({formatNumber(orderCount)} đơn)
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="team-orders-card__kpis">
                    <div className="team-orders-card__kpi">
                      <small>Tổng đơn hàng</small>
                      <strong>{formatNumber(teamProductsSummary.totalOrders)}</strong>
                    </div>
                    <div className="team-orders-card__kpi">
                      <small>Tổng sản phẩm bán</small>
                      <strong>{formatNumber(teamProductsSummary.totalItems)}</strong>
                    </div>
                    <div className="team-orders-card__kpi">
                      <small>Doanh số (GMV)</small>
                      <strong>
                        {teamProductsSummary.currency
                          ? formatRevenue(teamProductsSummary.totalRevenue, teamProductsSummary.currency)
                          : (teamProductsSummary.totalRevenue ? formatNumber(teamProductsSummary.totalRevenue) : '—')}
                      </strong>
                    </div>
                    <div className="team-orders-card__kpi">
                      <small>Số sản phẩm</small>
                      <strong>{formatNumber(teamProductsSummary.productCount)}</strong>
                    </div>
                  </div>

                  {teamProductsData.length ? (
                    <div className="table-wrap team-orders-card__table-wrap">
                      <table className="data-table data-table--compact team-orders-card__table">
                        <thead>
                          <tr>
                            <th>Sản phẩm</th>
                            {productTeamFilter === 'all' ? <th>Team bán</th> : null}
                            <th className="cell-number">Số đơn hàng</th>
                            <th className="cell-number">Số lượng bán</th>
                            <th className="cell-number">Doanh số</th>
                          </tr>
                        </thead>
                        <tbody>
                          {teamProductsData.map((product) => (
                            <tr key={`${product.id}-${product.name}`}>
                              <td>
                                <div className="team-orders-card__product-cell">
                                  <div className="team-orders-card__product-thumb">
                                    {product.image_url ? (
                                      <img src={product.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" />
                                    ) : (
                                      <span className="team-orders-card__product-thumb-fallback" aria-hidden="true">
                                        {(product.name || 'P').trim().charAt(0).toUpperCase()}
                                      </span>
                                    )}
                                  </div>
                                  <div className="team-orders-card__product-info">
                                    <strong className="team-orders-card__product-name" title={product.name}>
                                      {compactProductName(product.name)}
                                    </strong>
                                    {product.id && product.id !== 'unknown' ? (
                                      <span className="team-orders-card__product-id">ID: {product.id}</span>
                                    ) : null}
                                  </div>
                                </div>
                              </td>
                              {productTeamFilter === 'all' ? (
                                <td>
                                  <div className="team-orders-card__teams-list">
                                    {Array.isArray(product.teams) && product.teams.length ? (
                                      product.teams.map((t) => (
                                        <button
                                          type="button"
                                          key={t.team_id}
                                          className="team-orders-card__team-badge"
                                          title={`Xem chi tiết ${t.team_name}: ${t.orders} đơn`}
                                          onClick={() => setProductTeamFilter(String(t.team_id))}
                                        >
                                          {t.team_name}: <strong>{t.orders} đơn</strong>
                                        </button>
                                      ))
                                    ) : (
                                      <span>—</span>
                                    )}
                                  </div>
                                </td>
                              ) : null}
                              <td className="cell-number">
                                <span className="team-orders-card__order-badge">
                                  {formatNumber(product.orders)} đơn
                                </span>
                              </td>
                              <td className="cell-number">{formatNumber(product.quantity)}</td>
                              <td className="cell-number">
                                {product.revenue ? formatRevenue(product.revenue, product.currency || teamProductsSummary.currency) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="team-orders-card__empty">
                      <strong>Chưa có đơn hàng nào</strong>
                      <span>Không phát sinh đơn hàng cho sản phẩm nào của team trong kỳ đã chọn.</span>
                    </div>
                  )}
                </section>
              </div>
            ) : null}
            {activeReportTab === 'teams' || activeReportTab === 'revenue' ? <div
              id={activeReportTab === 'revenue' ? 'channel-report-revenue-panel' : 'channel-report-teams-panel'}
              className="content-performance__groups content-performance__groups--filtered"
              role="tabpanel"
              aria-labelledby={activeReportTab === 'revenue' ? 'channel-report-revenue-tab' : 'channel-report-teams-tab'}
            >
              {visibleGroups.length >= 2 ? (
                <article className="content-performance__group">
                  <div className="content-performance__group-header">
                    <h3>
                      {isAllTeams
                        ? 'Tất cả team'
                        : (visibleGroups.length <= 3
                          ? visibleGroups.map((g) => g.label).join(', ')
                          : `${visibleGroups.length} team đã chọn`)}
                    </h3>
                    <span>{formatNumber(mergedMembers.length)} thành viên</span>
                  </div>
                  <div className="content-performance__metrics">
                    <span>
                      <small>Video</small>
                      <strong>{formatNumber(mergedMetrics.videos)}</strong>
                      {renderMetricChange(mergedMetrics.videos, mergedMetrics.prevVideos)}
                    </span>
                    <span>
                      <small>Lượt xem</small>
                      <strong>{formatNumber(mergedMetrics.views)}</strong>
                      {renderMetricChange(mergedMetrics.views, mergedMetrics.prevViews)}
                    </span>
                    <span>
                      <small>Đơn hàng</small>
                      <strong>{formatNumber(mergedMetrics.orders)}</strong>
                      {renderMetricChange(mergedMetrics.orders, mergedMetrics.prevOrders)}
                    </span>
                    <span>
                      <small>Doanh số</small>
                      <strong>
                        {mergedMetrics.revenueAvailable
                          ? formatRevenue(mergedMetrics.revenue, mergedMetrics.currency)
                          : '—'}
                      </strong>
                      {renderMetricChange(
                        mergedMetrics.revenue,
                        mergedMetrics.prevRevenue,
                        mergedMetrics.revenueAvailable && mergedMetrics.prevRevenueAvailable
                      )}
                    </span>
                  </div>
                  {renderMembersTable(mergedMembers, true)}
                </article>
              ) : visibleGroups.length === 1 ? (
                (() => {
                  const group = visibleGroups[0];
                  const singleMembers = (group.members || []).map((m) => ({
                    ...m,
                    teamKey: group.key,
                    teamName: group.label,
                    videos: Number(m.videos || 0),
                    views: Number(m.views || 0),
                    revenue: Number(m.revenue || 0),
                    revenueAvailable: Boolean(m.revenueAvailable),
                    currency: m.currency,
                    orders: Number(m.orders || 0),
                  }));

                  const singleSummary = (() => {
                    let videos = 0;
                    let views = 0;
                    let orders = 0;
                    let revenue = 0;
                    let revenueAvailable = false;
                    let currency = null;

                    for (const m of singleMembers) {
                      videos += Number(m.videos || 0);
                      views += Number(m.views || 0);
                      orders += Number(m.orders || 0);
                      revenue += Number(m.revenue || 0);
                      if (m.revenueAvailable) revenueAvailable = true;
                      if (!currency && m.currency) currency = m.currency;
                    }

                    if (!videos && !views && !orders && !revenue) {
                      videos = Number(group.videos || 0);
                      views = Number(group.views || 0);
                      orders = Number(group.orders || 0);
                      revenue = Number(group.revenue || 0);
                      revenueAvailable = Boolean(group.revenueAvailable);
                      currency = group.currency;
                    }

                    const currentPreviousGroups = activeReportTab === 'revenue' ? previousRevenueGroups : previousGroups;
                    const prevTarget = currentPreviousGroups.find((item) => item.key === group.key);

                    let prevVideos = 0;
                    let prevViews = 0;
                    let prevOrders = 0;
                    let prevRevenue = 0;
                    let prevRevenueAvailable = false;

                    if (prevTarget) {
                      const pMems = prevTarget.members || [];
                      if (pMems.length) {
                        for (const pm of pMems) {
                          prevVideos += Number(pm.videos || 0);
                          prevViews += Number(pm.views || 0);
                          prevOrders += Number(pm.orders || 0);
                          prevRevenue += Number(pm.revenue || 0);
                          if (pm.revenueAvailable) prevRevenueAvailable = true;
                        }
                      } else {
                        prevVideos = Number(prevTarget.videos || 0);
                        prevViews = Number(prevTarget.views || 0);
                        prevOrders += Number(prevTarget.orders || 0);
                        prevRevenue += Number(prevTarget.revenue || 0);
                        if (prevTarget.revenueAvailable) prevRevenueAvailable = true;
                      }
                    }

                    return {
                      videos,
                      views,
                      orders,
                      revenue,
                      revenueAvailable: revenueAvailable || revenue > 0,
                      currency: currency || group.currency,
                      prevVideos,
                      prevViews,
                      prevOrders,
                      prevRevenue,
                      prevRevenueAvailable,
                    };
                  })();

                  return (
                    <article className="content-performance__group" key={group.key}>
                      <div className="content-performance__group-header">
                        <h3>{group.label}</h3>
                        <span>{formatNumber(group.members.length)} thành viên</span>
                      </div>
                      <div className="content-performance__metrics">
                        <span>
                          <small>Video</small>
                          <strong>{formatNumber(singleSummary.videos)}</strong>
                          {renderMetricChange(singleSummary.videos, singleSummary.prevVideos)}
                        </span>
                        <span>
                          <small>Lượt xem</small>
                          <strong>{formatNumber(singleSummary.views)}</strong>
                          {renderMetricChange(singleSummary.views, singleSummary.prevViews)}
                        </span>
                        <span>
                          <small>Đơn hàng</small>
                          <strong>{formatNumber(singleSummary.orders)}</strong>
                          {renderMetricChange(singleSummary.orders, singleSummary.prevOrders)}
                        </span>
                        <span>
                          <small>Doanh số</small>
                          <strong>{singleSummary.revenueAvailable ? formatRevenue(singleSummary.revenue, singleSummary.currency) : '—'}</strong>
                          {renderMetricChange(
                            singleSummary.revenue,
                            singleSummary.prevRevenue,
                            singleSummary.revenueAvailable && singleSummary.prevRevenueAvailable
                          )}
                        </span>
                      </div>
                      {renderMembersTable(singleMembers, false)}
                    </article>
                  );
                })()
              ) : (
                <div className="content-performance__group-empty">
                  <strong>Không tìm thấy team phù hợp</strong>
                  <span>Vui lòng chọn team khác từ bộ lọc.</span>
                </div>
              )}
            </div> : null}
          </>
        )}
      </section>

      <RevenueDetailModal
        closeVideoRevenueDetail={closeVideoRevenueDetail}
        compactNumber={compactNumber}
        expandedRevenueDates={expandedRevenueDates}
        formatDailyDate={formatDailyDate}
        formatNumber={formatNumber}
        formatPublishedTime={formatPublishedTime}
        formatRevenue={formatRevenue}
        openVideoRevenueDetail={openVideoRevenueDetail}
        setExpandedRevenueDates={setExpandedRevenueDates}
        videoRevenueDetail={videoRevenueDetail}
      />

    </div>
  );
};

export default ChannelReport;
