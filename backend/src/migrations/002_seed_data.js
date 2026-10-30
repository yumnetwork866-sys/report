const {
  Booking,
  BookingVideo,
  TikTokChannel,
  User,
  Video,
} = require('../models');
const { getAdminAccount } = require('../lib/adminAccount');

const ensureUserRole = async (user, role) => {
  if (user.role !== role) {
    await user.update({ role });
  }
};

const seedDatabase = async () => {
  try {
    const adminAccount = getAdminAccount();
    const [admin] = await User.findOrCreate({
      where: { email: adminAccount.email },
      defaults: {
        name: adminAccount.username,
        email: adminAccount.email,
        role: 'admin',
      },
    });
    await ensureUserRole(admin, 'admin');

    const [leader] = await User.findOrCreate({
      where: { email: 'leader@company.com' },
      defaults: {
        name: 'Mai Leader',
        email: 'leader@company.com',
        role: 'leader',
      },
    });
    await ensureUserRole(leader, 'leader');

    const [scriptWriter] = await User.findOrCreate({
      where: { email: 'script@company.com' },
      defaults: {
        name: 'Nam Script',
        email: 'script@company.com',
        role: 'member',
      },
    });
    await ensureUserRole(scriptWriter, 'member');

    const [aiCreator] = await User.findOrCreate({
      where: { email: 'ai@company.com' },
      defaults: {
        name: 'Linh AI',
        email: 'ai@company.com',
        role: 'member',
      },
    });
    await ensureUserRole(aiCreator, 'member');

    const [editor] = await User.findOrCreate({
      where: { email: 'news@company.com' },
      defaults: {
        name: 'Quân Editor',
        email: 'news@company.com',
        role: 'member',
      },
    });
    await ensureUserRole(editor, 'member');

    const [kocOne] = await User.findOrCreate({
      where: { email: 'koc1@creator.com' },
      defaults: {
        name: 'An KOC',
        email: 'koc1@creator.com',
        role: 'koc',
      },
    });
    await ensureUserRole(kocOne, 'koc');

    const [kocTwo] = await User.findOrCreate({
      where: { email: 'koc2@creator.com' },
      defaults: {
        name: 'Bình KOC',
        email: 'koc2@creator.com',
        role: 'koc',
      },
    });
    await ensureUserRole(kocTwo, 'koc');

    const [channel] = await TikTokChannel.findOrCreate({
      where: { username: 'brandclinic.vn' },
      defaults: {
        platform: 'tiktok',
        tiktok_open_id: 'open_brandclinic_vn',
        username: 'brandclinic.vn',
        display_name: 'Brand Clinic',
        avatar_url: null,
        profile_url: 'https://www.tiktok.com/@brandclinic.vn',
        sync_source: 'import',
      },
    });

    const samples = [
      {
        platform_video_id: 'tt_001',
        title: 'Cách xử lý sẹo sau mụn trong 30 ngày',
        views: 48500,
        likes: 3900,
        comments: 228,
        shares: 320,
        content_type: 'education',
        campaign: 'Q2 Skin Recovery',
      },
      {
        platform_video_id: 'tt_002',
        title: 'Routine Follicas cho tóc yếu',
        views: 21400,
        likes: 1600,
        comments: 91,
        shares: 140,
        content_type: 'review',
        campaign: 'Follicas Always On',
      },
      {
        platform_video_id: 'tt_003',
        title: 'Hiểu đúng về rạn da sau sinh',
        views: 8800,
        likes: 580,
        comments: 54,
        shares: 73,
        content_type: 'explain',
        campaign: 'Body Care',
      },
      {
        platform_video_id: 'tt_004',
        title: 'Lumilab và thói quen chống xỉn màu da',
        views: 12600,
        likes: 970,
        comments: 61,
        shares: 88,
        content_type: 'tips',
        campaign: 'Lumilab Glow',
      },
      {
        platform_video_id: 'tt_005',
        title: 'Routine buổi sáng cho da dầu mụn',
        views: 16300,
        likes: 1240,
        comments: 73,
        shares: 102,
        content_type: 'routine',
        campaign: 'Morning Care',
      },
      {
        platform_video_id: 'tt_006',
        title: '3 dấu hiệu cần đổi sản phẩm chăm da',
        views: 9400,
        likes: 710,
        comments: 48,
        shares: 55,
        content_type: 'tips',
        campaign: 'Skin Check',
      },
    ];

    for (const [index, sample] of samples.entries()) {
      const publishedAt = new Date();
      publishedAt.setDate(publishedAt.getDate() - index);

      await Video.findOrCreate({
        where: { platform_video_id: sample.platform_video_id },
        defaults: {
          platform: 'tiktok',
          platform_video_id: sample.platform_video_id,
          channel_id: channel.id,
          title: sample.title,
          video_url: `${channel.profile_url}/video/${sample.platform_video_id}`,
          thumbnail_url: null,
          published_at: publishedAt,
          views: sample.views,
          likes: sample.likes,
          comments: sample.comments,
          shares: sample.shares,
          duration: 42 + index * 7,
          content_type: sample.content_type,
          campaign: sample.campaign,
          last_synced_at: new Date(),
        },
      });

    }

    const [firstBooking] = await Booking.findOrCreate({
      where: {
        staff_id: leader.id,
        creator_username: 'koc1',
        start_date: '2026-07-05',
      },
      defaults: {
        staff_id: leader.id,
        creator_username: 'koc1',
        creator_name: kocOne.name,
        total_cost: 1500000,
        status: 'waiting_video',
        start_date: '2026-07-05',
        note: 'Booking cho campaign skincare, ưu tiên hook 3 giây đầu.',
      },
    });
    for (const video of [
      ['tt_001', 'Cách xử lý sẹo sau mụn trong 30 ngày'],
      ['tt_005', 'Routine buổi sáng cho da dầu mụn'],
    ]) {
      await BookingVideo.findOrCreate({
        where: { booking_id: firstBooking.id, platform_video_id: video[0] },
        defaults: {
          booking_id: firstBooking.id,
          platform_video_id: video[0],
          video_url: `https://www.tiktok.com/@brandclinic.vn/video/${video[0]}`,
          creator_username: 'brandclinic.vn',
          title: video[1],
          posted_at: new Date(),
          attribution_start: '2026-07-05',
          attribution_end: '2026-08-04',
          mapping_source: 'SEED',
          status: 'FINALIZED',
        },
      });
    }

    const [thirdBooking] = await Booking.findOrCreate({
      where: {
        staff_id: scriptWriter.id,
        creator_username: 'koc2',
        start_date: '2026-07-08',
      },
      defaults: {
        staff_id: scriptWriter.id,
        creator_username: 'koc2',
        creator_name: kocTwo.name,
        total_cost: 1200000,
        status: 'booked',
        start_date: '2026-07-08',
        note: 'Chờ KOC xác nhận lịch đăng.',
      },
    });

    await Booking.findOrCreate({
      where: {
        staff_id: aiCreator.id,
        creator_username: 'koc1',
        start_date: '2026-07-10',
      },
      defaults: {
        staff_id: aiCreator.id,
        creator_username: 'koc1',
        creator_name: kocOne.name,
        total_cost: 1750000,
        status: 'video_posted',
        start_date: '2026-07-10',
        note: 'Booking đã post, cần đối chiếu hiệu quả và comment chất lượng.',
      },
    });
    for (const video of [
      ['tt_002', 'Routine Follicas cho tóc yếu'],
      ['tt_006', '3 dấu hiệu cần đổi sản phẩm chăm da'],
    ]) {
      await BookingVideo.findOrCreate({
        where: { booking_id: thirdBooking.id, platform_video_id: video[0] },
        defaults: {
          booking_id: thirdBooking.id,
          platform_video_id: video[0],
          video_url: `https://www.tiktok.com/@brandclinic.vn/video/${video[0]}`,
          creator_username: 'brandclinic.vn',
          title: video[1],
          posted_at: new Date(),
          attribution_start: '2026-07-10',
          attribution_end: '2026-08-09',
          mapping_source: 'SEED',
          status: 'FINALIZED',
        },
      });
    }

    console.log('TikTok performance seed data created');
    void admin;
  } catch (error) {
    console.error('Error seeding database:', error);
    throw error;
  }
};

module.exports = {
  up: seedDatabase,
  down: async () => {
    try {
      await Video.destroy({ where: {} });
      await Booking.destroy({ where: {} });
      await TikTokChannel.destroy({ where: {} });
      await User.destroy({ where: {} });
      console.log('Database cleared');
    } catch (error) {
      console.error('Error clearing database:', error);
      throw error;
    }
  },
};
