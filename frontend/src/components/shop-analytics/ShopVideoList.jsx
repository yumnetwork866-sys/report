import Pagination from '../Pagination';
import AnalyticsIcon from './AnalyticsIcon';
import { CreatorAvatar, VideoProduct, VideoThumbnail } from './VideoCells';
import { formatVideoPostDate, productsForVideo } from './shopAnalyticsUtils';

const ShopVideoList = ({
  filteredVideoRows,
  formatNumber,
  formatRate,
  formatVideoMoney,
  paginatedVideoRows,
  selectedShopId,
  setVideoPage,
  setVideoSearch,
  t,
  videoAnalyticsLoading,
  videoExportOnly,
  videoPage,
  videoPageCount,
  videoProductMetadata,
  videoRows,
  videoSearch,
  videoUrl,
}) => (
  <>
    {videoExportOnly ? (
      <section className="section-card shop-video-analytics__table-card">
      <div className="section-card__header">
        <div>
          <h2 className="section-card__title">{t('shopAnalytics.videoExportTableTitle')}</h2>
          <p className="section-card__meta">{t('shopAnalytics.videoExportTableMeta', { count: filteredVideoRows.length })}</p>
        </div>
        <label className="video-export-search">
          <span className="sr-only">{t('common.search')}</span>
          <input
            type="search"
            value={videoSearch}
            placeholder={t('shopAnalytics.videoSearchPlaceholder')}
            onChange={(event) => {
              setVideoSearch(event.target.value);
              setVideoPage(1);
            }}
          />
        </label>
      </div>
      <div className="table-wrap shop-analytics__table-wrap video-export-table-wrap">
        <table className="data-table shop-analytics__table shop-video-analytics__table video-export-table">
          <thead>
            <tr>
              <th>{t('shopAnalytics.video')}</th>
              <th>{t('shopAnalytics.postDate')}</th>
              <th>{t('shopAnalytics.creator')}</th>
              <th>{t('shopAnalytics.productId')}</th>
              <th className="cell-number">{t('shopAnalytics.videoRevenue')}</th>
              <th className="cell-number">AOV</th>
              <th className="cell-number">{t('shopAnalytics.unitsSold')}</th>
              <th className="cell-number">{t('shopAnalytics.videoImpressions')}</th>
              <th className="cell-number">{t('shopAnalytics.videoClicks')}</th>
            </tr>
          </thead>
          <tbody>
            {videoAnalyticsLoading && !videoRows.length ? (
              <tr><td colSpan={9}><div className="empty-state"><span className="loading-dot" />{t('shopAnalytics.loadingVideos')}</div></td></tr>
            ) : null}
            {paginatedVideoRows.map((video, index) => {
              const url = videoUrl(video);
              const creatorName = video.creator?.nick_name || video.creator?.user_name || video.username || '—';
              const creatorUsername = video.creator_username || video.creator?.user_name || video.username || '';
              const title = video.video_title || video.title || video.video_id || t('common.unknown');
              const products = productsForVideo(video, videoProductMetadata);
              return (
                <tr key={video.id || index}>
                  <td>
                    <div className="shop-video-analytics__video">
                      <VideoThumbnail shopId={selectedShopId} video={video} href={url} />
                      <span>
                        {url ? (
                          <a className="shop-video-analytics__title-link" href={url} target="_blank" rel="noreferrer" title={title}>
                            <strong>{title}</strong>
                          </a>
                        ) : <strong title={title}>{title}</strong>}
                        <span className="shop-video-analytics__creator video-export-table__video-id">ID: {video.video_id || '—'}</span>
                        <span className="video-export-table__engagement">
                          <span title={`${t('shopAnalytics.videoViews')}: ${formatNumber(video.video_views ?? video.views)}`}>
                            <AnalyticsIcon name="views" />
                            {formatNumber(video.video_views ?? video.views)}
                          </span>
                          <span title={`${t('videoLibrary.likes')}: ${formatNumber(video.likes)}`}>
                            <AnalyticsIcon name="likes" />
                            {formatNumber(video.likes)}
                          </span>
                          <span title={`${t('videoLibrary.comments')}: ${formatNumber(video.comments)}`}>
                            <AnalyticsIcon name="comments" />
                            {formatNumber(video.comments)}
                          </span>
                          <span title={`${t('videoLibrary.shares')}: ${formatNumber(video.shares)}`}>
                            <AnalyticsIcon name="shares" />
                            {formatNumber(video.shares)}
                          </span>
                        </span>
                      </span>
                    </div>
                  </td>
                  <td>{formatVideoPostDate(video.post_date)}</td>
                  <td>
                    <div className="creator-identity video-export-table__creator">
                      <CreatorAvatar src={video.creator_avatar_url || video.creator?.avatar_url} name={video.creator_name || creatorName} />
                      <span>
                        <strong>{video.creator_name || creatorName || '—'}</strong>
                        {creatorUsername ? <span className="row-subtitle">@{String(creatorUsername).replace(/^@+/, '')}</span> : null}
                      </span>
                    </div>
                  </td>
                  <td>
                    {products.length ? (
                      <div className="video-export-products">
                        {products.map((product) => (
                          <VideoProduct product={product} key={product.id} />
                        ))}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="cell-number"><strong>{formatVideoMoney(video.creator_attributed_gmv ?? video.gmv)}</strong></td>
                  <td className="cell-number">{formatVideoMoney(video.aov)}</td>
                  <td className="cell-number">{formatNumber(video.attributed_items_sold ?? video.items_sold ?? video.units_sold)}</td>
                  <td className="cell-number">{formatNumber(video.product_impressions)}</td>
                  <td className="cell-number">{formatNumber(video.product_clicks)}</td>
                </tr>
              );
            })}
            {!videoAnalyticsLoading && !videoRows.length ? (
              <tr><td colSpan={9}><div className="empty-state">{t('shopAnalytics.videoApiNoData')}</div></td></tr>
            ) : null}
            {!videoAnalyticsLoading && videoRows.length > 0 && !filteredVideoRows.length ? (
              <tr><td colSpan={9}><div className="empty-state">{t('shopAnalytics.videoSearchNoResults')}</div></td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {filteredVideoRows.length ? (
        <Pagination
          currentPage={videoPage}
          totalPages={videoPageCount}
          onPageChange={setVideoPage}
          disabled={videoAnalyticsLoading}
          previousLabel={t('common.previous')}
          nextLabel={t('common.next')}
          ariaLabel={t('shopAnalytics.videoExportPagination')}
          className="video-export-pagination"
        />
      ) : null}
      </section>
    ) : (
      <section className="section-card shop-video-analytics__table-card">
        <div className="section-card__header">
          <div><h2 className="section-card__title">{t('shopAnalytics.videoPerformance')}</h2></div>
        </div>
        <div className="table-wrap shop-analytics__table-wrap">
          <table className="data-table shop-analytics__table shop-video-analytics__table">
            <colgroup>
              <col className="shop-video-analytics__col-video" />
              <col className="shop-video-analytics__col-hashtags" />
              <col className="shop-video-analytics__col-gmv" />
              <col className="shop-video-analytics__col-views" />
              <col className="shop-video-analytics__col-orders" />
              <col className="shop-video-analytics__col-sold" />
              <col className="shop-video-analytics__col-ctr" />
              <col className="shop-video-analytics__col-date" />
            </colgroup>
            <thead>
              <tr>
                <th>{t('shopAnalytics.video')}</th>
                <th>{t('videoLibrary.hashtags')}</th>
                <th className="cell-number">{t('shopAnalytics.videoRevenue')}</th>
                <th className="cell-number">{t('shopAnalytics.videoViews')}</th>
                <th className="cell-number">{t('shopAnalytics.orders')}</th>
                <th className="cell-number">{t('shopAnalytics.unitsSold')}</th>
                <th className="cell-number">{t('shopAnalytics.videoCtr')}</th>
                <th>{t('shopAnalytics.postedAt')}</th>
              </tr>
            </thead>
            <tbody>
              {videoAnalyticsLoading && !videoRows.length ? (
                <tr><td colSpan={8}><div className="empty-state"><span className="loading-dot" />{t('shopAnalytics.loadingVideos')}</div></td></tr>
              ) : null}
              {videoRows.map((video, index) => {
                const url = videoUrl(video);
                const hashtags = (video.hash_tags || video.hashtags || [])
                  .map((hashtag) => String(hashtag || '').trim())
                  .filter(Boolean)
                  .map((hashtag) => hashtag.startsWith('#') ? hashtag : `#${hashtag}`);
                return (
                  <tr key={video.id || index}>
                    <td>
                      <div className="shop-video-analytics__video">
                        <VideoThumbnail shopId={selectedShopId} video={video} href={url} />
                        <span>
                          <strong>{video.title || video.id || t('common.unknown')}</strong>
                          <span className="shop-video-analytics__creator" title={video.creator?.nick_name || video.creator?.user_name || video.username || ''}>
                            {video.creator?.nick_name || video.creator?.user_name || video.username || '—'}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td>{hashtags.length ? hashtags.slice(0, 3).join(' ') : '—'}</td>
                    <td className="cell-number"><strong>{formatVideoMoney(video.gmv)}</strong></td>
                    <td className="cell-number">{formatNumber(video.views ?? video.video_views)}</td>
                    <td className="cell-number">{formatNumber(video.sku_orders ?? video.orders)}</td>
                    <td className="cell-number">{formatNumber(video.items_sold ?? video.units_sold)}</td>
                    <td className="cell-number">{formatRate(video.click_through_rate ?? video.ctr)}</td>
                    <td>{video.video_post_time || video.post_time || (url ? <a href={url} target="_blank" rel="noreferrer">Open</a> : '—')}</td>
                  </tr>
                );
              })}
              {!videoAnalyticsLoading && !videoRows.length ? (
                <tr><td colSpan={8}><div className="empty-state">{t('shopAnalytics.noVideoData')}</div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    )}
  </>
);

export default ShopVideoList;
