require('dotenv').config();

const {
  Booking,
  ChatbotSetting,
  Product,
  TikTokChannel,
  TikTokPartnerAuthorization,
  TikTokShop,
  TikTokShopAnalyticsSnapshot,
  TikTokShopAuthorization,
  User,
  Video,
  VideoAssignment,
  VideoDailyStats,
  WeeklyReport,
  sequelize,
} = require('../models');
const { encryptPartnerToken } = require('../lib/tiktokPartnerTokenEncryption');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEMO_PREFIX = 'demo_full_';
const now = new Date();
const dateOnly = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');
const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);
const avatar = (seed) => `https://api.dicebear.com/10.x/lorelei-neutral/svg?seed=${encodeURIComponent(seed)}&backgroundColor=e6f7f5`;

const demoUsers = [
  ['demo.leader@yumnetwork.vn', 'Hà My · Demo Leader', 'leader'],
  ['demo.content@yumnetwork.vn', 'Minh Anh · Demo Content', 'member'],
  ['demo.editor@yumnetwork.vn', 'Tuấn Kiệt · Demo Editor', 'member'],
  ['demo.media@yumnetwork.vn', 'Ngọc Hân · Demo Media', 'member'],
  ['demo.koc.lan@yumnetwork.vn', 'Lan Phương', 'koc'],
  ['demo.koc.ha@yumnetwork.vn', 'Thu Hà', 'koc'],
  ['demo.koc.linh@yumnetwork.vn', 'Mỹ Linh', 'koc'],
  ['demo.koc.nhi@yumnetwork.vn', 'Yến Nhi', 'koc'],
  ['demo.koc.trang@yumnetwork.vn', 'Quỳnh Trang', 'koc'],
  ['demo.koc.thao@yumnetwork.vn', 'Phương Thảo', 'koc'],
  ['demo.koc.chi@yumnetwork.vn', 'Mai Chi', 'koc'],
  ['demo.koc.ngan@yumnetwork.vn', 'Kim Ngân', 'koc'],
];

const productNames = [
  'Demo Lumilab Glow Serum',
  'Demo Follicas Hair Tonic',
  'Demo Acne Recovery Gel',
  'Demo Stretch Mark Body Oil',
  'Demo Scar Repair Cream',
  'Demo Daily Sunscreen',
];

const channelSeeds = [
  ['lanphuong.review', 'Lan Phương Review', 128400, 2840000],
  ['thuhabeauty.vn', 'Thu Hà Beauty', 96400, 1710000],
  ['mylinh.skincare', 'Mỹ Linh Skincare', 78200, 1290000],
  ['yennhi.daily', 'Yến Nhi Daily', 63500, 940000],
  ['quynhtrang.review', 'Quỳnh Trang Review', 52400, 786000],
  ['phuongthao.ugc', 'Phương Thảo UGC', 41700, 612000],
];

const videoTopics = [
  ['Routine phục hồi da sau mụn 7 ngày', 'routine'],
  ['Review chân thật sau 30 ngày sử dụng', 'review'],
  ['3 lỗi khiến skincare mãi không hiệu quả', 'education'],
  ['Get ready with me cùng sản phẩm yêu thích', 'lifestyle'],
];

const ensureUser = async ([email, name, role], transaction) => {
  const [user] = await User.findOrCreate({
    where: { email },
    defaults: { email, name, role, avatar_url: avatar(email) },
    transaction,
  });
  await user.update({ name, role, avatar_url: avatar(email) }, { transaction });
  return user;
};

const buildAnalyticsMetrics = (days, base, currency) => {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = addDays(end, -days);
  const buildInterval = (index, multiplier) => {
    const gmv = Math.round((base + index * base * 0.018 + (index % 5) * base * 0.04) * multiplier);
    const orders = Math.max(1, Math.round(gmv / (base * 0.12)));
    const impressions = Math.round((2600 + index * 47 + (index % 4) * 380) * multiplier);
    const pageViews = Math.round(impressions * (0.16 + (index % 3) * 0.012));
    return {
      start_date: dateOnly(addDays(start, index)),
      end_date: dateOnly(addDays(start, index + 1)),
      gmv: { amount: String(gmv), currency },
      orders,
      units_sold: Math.round(orders * 1.24),
      buyers: Math.max(1, Math.round(orders * 0.91)),
      product_impressions: impressions,
      product_page_views: pageViews,
      refunds: { amount: String(Math.round(gmv * 0.025)), currency },
      cancellations_and_returns: Math.round(orders * 0.035),
      gmv_breakdowns: [
        { type: 'VIDEO', amount: String(Math.round(gmv * 0.52)), currency },
        { type: 'LIVE', amount: String(Math.round(gmv * 0.31)), currency },
        { type: 'PRODUCT_CARD', amount: String(Math.round(gmv * 0.17)), currency },
      ],
    };
  };
  return {
    range: { startDate: dateOnly(start), endDate: dateOnly(end) },
    metrics: {
      intervals: Array.from({ length: days }, (_, index) => buildInterval(index, 1)),
      comparison_intervals: Array.from({ length: days }, (_, index) => buildInterval(index, 0.82)),
    },
  };
};

const seed = async () => {
  await sequelize.authenticate();
  const summary = {};

  await sequelize.transaction(async (transaction) => {
    const users = [];
    for (const seedUser of demoUsers) users.push(await ensureUser(seedUser, transaction));
    const staff = users.slice(0, 4);
    const kocs = users.slice(4);
    summary.users = users.length;

    const products = [];
    for (const name of productNames) {
      const [product] = await Product.findOrCreate({ where: { name }, defaults: { name }, transaction });
      products.push(product);
    }
    summary.products = products.length;

    const channels = [];
    const videos = [];
    for (const [channelIndex, [username, displayName, followers, likes]] of channelSeeds.entries()) {
      const [channel] = await TikTokChannel.findOrCreate({
        where: { username: `${DEMO_PREFIX}${username}` },
        defaults: {
          platform: 'tiktok',
          creator_id: kocs[channelIndex].id,
          tiktok_open_id: `${DEMO_PREFIX}open_${channelIndex + 1}`,
          username: `${DEMO_PREFIX}${username}`,
          display_name: displayName,
          avatar_url: avatar(username),
          avatar_large_url: avatar(`${username}_large`),
          bio_description: 'Kênh demo phục vụ kiểm thử dashboard KOC.',
          is_verified: channelIndex < 2,
          follower_count: followers,
          following_count: 320 + channelIndex * 41,
          likes_count: likes,
          video_count: videoTopics.length,
          profile_url: `https://www.tiktok.com/@${username}`,
          sync_source: 'import',
          last_sync_at: now,
          last_sync_status: 'success',
        },
        transaction,
      });
      await channel.update({
        creator_id: kocs[channelIndex].id,
        display_name: displayName,
        avatar_url: avatar(username),
        follower_count: followers,
        likes_count: likes,
        video_count: videoTopics.length,
        last_sync_at: now,
        last_sync_status: 'success',
      }, { transaction });
      channels.push(channel);

      for (const [videoIndex, [topic, contentType]] of videoTopics.entries()) {
        const platformVideoId = `${DEMO_PREFIX}${channelIndex + 1}_${videoIndex + 1}`;
        const ageDays = channelIndex * 3 + videoIndex * 5 + 2;
        const views = 8200 + channelIndex * 6300 + videoIndex * 11700 + ((channelIndex + videoIndex) % 3) * 5100;
        const [video] = await Video.findOrCreate({
          where: { platform_video_id: platformVideoId },
          defaults: {
            platform: 'tiktok',
            platform_video_id: platformVideoId,
            channel_id: channel.id,
            title: `${topic} · ${displayName}`,
            video_url: `https://www.tiktok.com/@${username}/video/${platformVideoId}`,
            thumbnail_url: `https://picsum.photos/seed/${platformVideoId}/480/640`,
            published_at: addDays(now, -ageDays),
            views,
            likes: Math.round(views * (0.065 + videoIndex * 0.006)),
            comments: Math.round(views * 0.0045),
            shares: Math.round(views * 0.0032),
            duration: 28 + videoIndex * 11,
            campaign: ['Demo Summer Glow', 'Demo Hair Growth', 'Demo Acne Recovery'][channelIndex % 3],
            content_type: contentType,
            last_synced_at: now,
          },
          transaction,
        });
        await video.update({
          channel_id: channel.id,
          title: `${topic} · ${displayName}`,
          video_url: `https://www.tiktok.com/@${username}/video/${platformVideoId}`,
          thumbnail_url: `https://picsum.photos/seed/${platformVideoId}/480/640`,
          published_at: addDays(now, -ageDays),
          views,
          likes: Math.round(views * (0.065 + videoIndex * 0.006)),
          comments: Math.round(views * 0.0045),
          shares: Math.round(views * 0.0032),
          duration: 28 + videoIndex * 11,
          campaign: ['Demo Summer Glow', 'Demo Hair Growth', 'Demo Acne Recovery'][channelIndex % 3],
          content_type: contentType,
          last_synced_at: now,
        }, { transaction });
        await video.setProducts([
          products[(channelIndex + videoIndex) % products.length],
          products[(channelIndex + videoIndex + 2) % products.length],
        ], { transaction });
        await VideoAssignment.destroy({ where: { video_id: video.id }, transaction });
        await VideoAssignment.bulkCreate([
          { video_id: video.id, user_id: staff[1].id, assignment_role: 'script' },
          { video_id: video.id, user_id: staff[2].id, assignment_role: 'editor' },
          { video_id: video.id, user_id: kocs[channelIndex].id, assignment_role: 'creator' },
        ], { transaction });

        await VideoDailyStats.destroy({ where: { video_id: video.id }, transaction });
        const dailyStats = [];
        for (let day = 29; day >= 0; day -= 1) {
          const progress = (30 - day) / 30;
          dailyStats.push({
            video_id: video.id,
            date: dateOnly(addDays(now, -day)),
            views: Math.round(views * Math.min(1, 0.08 + progress * 0.92)),
            likes: Math.round(video.likes * Math.min(1, 0.1 + progress * 0.9)),
            comments: Math.round(video.comments * Math.min(1, 0.12 + progress * 0.88)),
            shares: Math.round(video.shares * Math.min(1, 0.1 + progress * 0.9)),
          });
        }
        await VideoDailyStats.bulkCreate(dailyStats, { transaction });
        videos.push(video);
      }
    }
    summary.channels = channels.length;
    summary.videos = videos.length;
    summary.dailyStats = videos.length * 30;

    await Booking.destroy({ where: { creator_id: kocs.map((koc) => koc.id) }, transaction });
    const bookingStatuses = ['booked', 'waiting_video', 'video_posted'];
    const bookingRows = Array.from({ length: 16 }, (_, index) => ({
      staff_id: staff[index % staff.length].id,
      creator_id: kocs[index % kocs.length].id,
      booking_cost: 900000 + (index % 6) * 350000,
      status: bookingStatuses[index % bookingStatuses.length],
      deadline: dateOnly(addDays(now, index - 5)),
      note: `[DEMO] Booking campaign ${['Summer Glow', 'Hair Growth', 'Acne Recovery'][index % 3]}.`,
      video_platform_id: index % 3 === 2 ? videos[index % videos.length].platform_video_id : null,
      video_url: index % 3 === 2 ? JSON.stringify([{
        title: videos[index % videos.length].title,
        platform_video_id: videos[index % videos.length].platform_video_id,
        video_url: videos[index % videos.length].video_url,
      }]) : null,
      posted_at: index % 3 === 2 ? addDays(now, -index) : null,
    }));
    await Booking.bulkCreate(bookingRows, { transaction });
    summary.bookings = bookingRows.length;

    await WeeklyReport.destroy({ where: { generated_content: { [require('sequelize').Op.like]: '[DEMO]%' } }, transaction });
    const reportRows = Array.from({ length: 4 }, (_, index) => {
      const end = addDays(now, -index * 7);
      const start = addDays(end, -6);
      return {
        week_start: dateOnly(start),
        week_end: dateOnly(end),
        generated_content: `[DEMO] Báo cáo tuần ${dateOnly(start)} – ${dateOnly(end)}\n\nKOC demo duy trì tăng trưởng tốt. Video review và routine đang đóng góp phần lớn lượt xem; đề xuất tăng nội dung có hook so sánh trước/sau.`,
      };
    });
    await WeeklyReport.bulkCreate(reportRows, { transaction });
    summary.weeklyReports = reportRows.length;

    for (const [index, koc] of kocs.slice(0, 3).entries()) {
      const values = {
        creator_id: koc.id,
        open_id: `${DEMO_PREFIX}creator_open_${index + 1}`,
        user_type: 1,
        granted_scopes: JSON.stringify([
          'creator.affiliate.info',
          'creator.showcase.read',
          'creator.affiliate_collaboration.read',
        ]),
        access_token_encrypted: encryptPartnerToken(`${DEMO_PREFIX}creator_access_${index + 1}`),
        refresh_token_encrypted: encryptPartnerToken(`${DEMO_PREFIX}creator_refresh_${index + 1}`),
        access_token_expires_at: addDays(now, 7),
        refresh_token_expires_at: addDays(now, 30),
        shop_id: null,
        username: channelSeeds[index][0],
        avatar_url: avatar(channelSeeds[index][0]),
        register_region: 'VN',
        showcase_count: 12 + index * 7,
        last_synced_at: addDays(now, -index),
        last_sync_status: 'success',
        last_sync_error: null,
        connected_at: addDays(now, -30),
        updated_at: now,
      };
      await TikTokPartnerAuthorization.upsert(values, { transaction });
      const authorization = await TikTokPartnerAuthorization.findOne({ where: { creator_id: koc.id }, transaction });
      await sequelize.query('DELETE FROM tiktok_partner_sync_logs WHERE authorization_id = :authorizationId', {
        replacements: { authorizationId: authorization.id },
        transaction,
      });
      for (let logIndex = 0; logIndex < 4; logIndex += 1) {
        await sequelize.query(`
          INSERT INTO tiktok_partner_sync_logs (authorization_id, creator_id, status, error, synced_at)
          VALUES (:authorizationId, :creatorId, :status, :error, :syncedAt)
        `, {
          replacements: {
            authorizationId: authorization.id,
            creatorId: koc.id,
            status: logIndex === 2 ? 'failed' : 'success',
            error: logIndex === 2 ? '[DEMO] TikTok tạm thời không phản hồi.' : null,
            syncedAt: addDays(now, -logIndex * 3),
          },
          transaction,
        });
      }
    }
    summary.creatorConnections = 3;

    await TikTokShopAuthorization.upsert({
      open_id: `${DEMO_PREFIX}seller_open`,
      user_type: 0,
      granted_scopes: ['data.shop_analytics.public.read', 'seller.affiliate_collaboration.read'],
      access_token_encrypted: encryptPartnerToken(`${DEMO_PREFIX}seller_access`),
      refresh_token_encrypted: encryptPartnerToken(`${DEMO_PREFIX}seller_refresh`),
      access_token_expires_at: addDays(now, 7),
      refresh_token_expires_at: addDays(now, 30),
      connected_at: addDays(now, -60),
      updated_at: now,
      last_sync_status: 'success',
      last_sync_error: null,
    }, { transaction });
    const shopAuthorization = await TikTokShopAuthorization.findOne({
      where: { open_id: `${DEMO_PREFIX}seller_open` },
      transaction,
    });
    const shopSeeds = [
      ['900000000000000001', 'Demo Beauty Lab', 'VN', 'LOCAL', 1450000],
      ['900000000000000002', 'Demo Hair Studio', 'VN', 'LOCAL', 980000],
    ];
    const shops = [];
    for (const [index, [platformShopId, name, region, currency, base]] of shopSeeds.entries()) {
      await TikTokShop.upsert({
        authorization_id: shopAuthorization.id,
        platform_shop_id: platformShopId,
        name,
        region,
        seller_type: 'LOCAL',
        cipher: `${DEMO_PREFIX}cipher_${index + 1}`,
        code: `DEMO-VN-${index + 1}`,
        last_synced_at: now,
        last_sync_status: 'success',
        last_sync_error: null,
      }, { transaction });
      const shop = await TikTokShop.findOne({ where: { platform_shop_id: platformShopId }, transaction });
      shops.push(shop);
      for (const days of [7, 30, 90]) {
        const analytics = buildAnalyticsMetrics(days, base, currency);
        await TikTokShopAnalyticsSnapshot.upsert({
          shop_id: shop.id,
          start_date: analytics.range.startDate,
          end_date: analytics.range.endDate,
          currency,
          metrics: analytics.metrics,
          latest_available_date: dateOnly(addDays(now, -1)),
          request_id: `${DEMO_PREFIX}analytics_${index + 1}_${days}`,
          synced_at: now,
        }, { transaction });
      }
    }
    summary.shops = shops.length;
    summary.shopAnalyticsSnapshots = shops.length * 3;

    await ChatbotSetting.findOrCreate({
      where: { id: 1 },
      defaults: { id: 1, provider: 'gemini', model: 'gemma-3-27b-it', ollama_host: 'http://127.0.0.1:11434', updated_at: now },
      transaction,
    });
  });

  console.log(JSON.stringify({ ok: true, seededAt: now.toISOString(), summary }, null, 2));
};

seed()
  .then(() => sequelize.close())
  .catch(async (error) => {
    console.error(error);
    await sequelize.close().catch(() => {});
    process.exitCode = 1;
  });
