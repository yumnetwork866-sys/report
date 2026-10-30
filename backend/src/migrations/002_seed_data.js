const {
  Booking,
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

    await Booking.findOrCreate({
      where: {
        staff_id: leader.id,
        creator_id: kocOne.id,
        deadline: '2026-07-05',
      },
      defaults: {
        staff_id: leader.id,
        creator_id: kocOne.id,
        booking_cost: 1500000,
        status: 'waiting_video',
        deadline: '2026-07-05',
        note: 'Booking cho campaign skincare, ưu tiên hook 3 giây đầu.',
        video_platform_id: 'tt_booking_001',
        video_url: JSON.stringify([
          {
            title: 'Cách xử lý sẹo sau mụn trong 30 ngày',
            platform_video_id: 'tt_001',
            video_url: 'https://www.tiktok.com/@brandclinic.vn/video/tt_001',
          },
          {
            title: 'Routine buổi sáng cho da dầu mụn',
            platform_video_id: 'tt_005',
            video_url: 'https://www.tiktok.com/@brandclinic.vn/video/tt_005',
          },
        ]),
        posted_at: new Date(),
      },
    });

    await Booking.findOrCreate({
      where: {
        staff_id: scriptWriter.id,
        creator_id: kocTwo.id,
        deadline: '2026-07-08',
      },
      defaults: {
        staff_id: scriptWriter.id,
        creator_id: kocTwo.id,
        booking_cost: 1200000,
        status: 'booked',
        deadline: '2026-07-08',
        note: 'Chờ KOC xác nhận lịch đăng.',
      },
    });

    await Booking.findOrCreate({
      where: {
        staff_id: aiCreator.id,
        creator_id: kocOne.id,
        deadline: '2026-07-10',
      },
      defaults: {
        staff_id: aiCreator.id,
        creator_id: kocOne.id,
        booking_cost: 1750000,
        status: 'video_posted',
        deadline: '2026-07-10',
        note: 'Booking đã post, cần đối chiếu hiệu quả và comment chất lượng.',
        video_platform_id: 'tt_booking_002',
        video_url: JSON.stringify([
          {
            title: 'Routine Follicas cho tóc yếu',
            platform_video_id: 'tt_002',
            video_url: 'https://www.tiktok.com/@brandclinic.vn/video/tt_002',
          },
          {
            title: '3 dấu hiệu cần đổi sản phẩm chăm da',
            platform_video_id: 'tt_006',
            video_url: 'https://www.tiktok.com/@brandclinic.vn/video/tt_006',
          },
        ]),
        posted_at: new Date(),
      },
    });

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
