const DEMO_PREFIX = 'demo_full_';

const isDemoAuthorization = (authorization) => String(authorization?.open_id || '').startsWith(DEMO_PREFIX);

const sellerAffiliateFixture = (namespace, shop, query = {}) => {
  const shopName = shop.name || 'Demo Shop';
  const products = Array.from({ length: 8 }, (_, index) => ({
    id: `${DEMO_PREFIX}product_${index + 1}`,
    title: `${['Glow Serum', 'Hair Tonic', 'Acne Gel', 'Body Oil'][index % 4]} · ${shopName}`,
    main_image_url: `https://picsum.photos/seed/demo-affiliate-${index + 1}/160/160`,
  }));
  const requestId = `${DEMO_PREFIX}${namespace}`;
  if (namespace === 'open-collaboration-settings') {
    return {
      data: { auto_add_product: { enable: true, commission_rate: 1200 } },
      request_id: requestId,
    };
  }
  if (namespace === 'open-collaborations') {
    return {
      data: {
        total_count: products.length,
        next_page_token: null,
        open_collaborations: products.map((product, index) => ({
          id: `${DEMO_PREFIX}open_${index + 1}`,
          product,
          current_commission: { rate: 900 + index * 75 },
          showcase_creator_count: 18 + index * 4,
          content_creator_count: 9 + index * 3,
          status: index % 4 === 0 ? 'INACTIVE' : 'ACTIVE',
        })),
      },
      request_id: requestId,
    };
  }
  if (namespace === 'target-collaborations') {
    const rows = Array.from({ length: 7 }, (_, index) => ({
      id: `${DEMO_PREFIX}target_${index + 1}`,
      name: `Demo Invitation ${index + 1}`,
      products: products.slice(index % 4, index % 4 + 2),
      showcase_creator_count: 4 + index,
      content_creator_count: 2 + index,
      creators: Array.from({ length: Math.min(3, 1 + index % 3) }, (_, creatorIndex) => ({
        username: `demo.creator.${creatorIndex + 1}`,
        nickname: `Demo Creator ${creatorIndex + 1}`,
        avatar: { url: `https://api.dicebear.com/10.x/lorelei-neutral/svg?seed=demo-creator-${creatorIndex + 1}` },
      })),
      end_time: Math.floor(Date.now() / 1000) + (index + 2) * 86400,
      status: ['ONGOING', 'VALID', 'COMPLETED'][index % 3],
    }));
    return {
      data: {
        total_count: rows.length,
        next_page_token: null,
        target_collaborations: query.status ? rows.filter((row) => row.status === query.status) : rows,
      },
      request_id: requestId,
    };
  }
  if (namespace === 'creators') {
    const sampleApplications = Array.from({ length: 10 }, (_, index) => ({
      id: `${DEMO_PREFIX}sample_${index + 1}`,
      status: ['PENDING', 'AWAITING_SHIPMENT', 'CONTENT_PENDING', 'COMPLETED'][index % 4],
      commission_rate: String(0.1 + index * 0.005),
      fulfillment_status: ['PENDING', 'ONGOING', 'SUCCEED'][index % 3],
      creator: {
        user_id: `${DEMO_PREFIX}creator_${index + 1}`,
        username: `demo.creator.${index + 1}`,
        nickname: `Demo Creator ${index + 1}`,
        follower_count: 12000 + index * 7300,
        avatar_url: `https://api.dicebear.com/10.x/lorelei-neutral/svg?seed=demo-creator-${index + 1}`,
        gmv: { amount: String(320 + index * 185), currency: 'USD' },
        content_count: 4 + index * 2,
        fulfillment_percentage: String(58 + index * 4),
        ec_video_view: 18000 + index * 9200,
      },
      sample_content_count: index % 4 === 3 ? 1 + index % 3 : 0,
      sample_content_views: index % 4 === 3 ? 18000 + index * 9200 : null,
      sample_content_status: index % 4 === 3 ? 'AVAILABLE' : 'NOT_POSTED',
      product: products[index % products.length],
    }));
    const filteredApplications = query.status
      ? sampleApplications.filter((application) => application.status === query.status)
      : sampleApplications;
    return {
      data: {
        total_count: filteredApplications.length,
        next_page_token: null,
        sample_applications: filteredApplications,
      },
      request_id: requestId,
    };
  }
  if (namespace === 'marketplace-creators') {
    const normalizedKeyword = String(query.keyword || '').trim().replace(/^@/, '').toLowerCase();
    const creators = Array.from({ length: 8 }, (_, index) => ({
      creator_open_id: `${DEMO_PREFIX}marketplace_creator_${index + 1}`,
      username: `demo.creator.${index + 1}`,
      nickname: `Demo Creator ${index + 1}`,
      follower_count: 18000 + index * 9400,
      avatar: { url: `https://api.dicebear.com/10.x/lorelei-neutral/svg?seed=demo-marketplace-${index + 1}` },
      gmv: { amount: String(640 + index * 275), currency: 'USD' },
      register_region: index % 2 ? 'VN' : 'MY',
    })).filter((creator) => !normalizedKeyword
      || creator.username.includes(normalizedKeyword)
      || creator.nickname.toLowerCase().includes(normalizedKeyword));
    return {
      data: { total_count: creators.length, next_page_token: null, creators },
      request_id: requestId,
    };
  }
  if (namespace === 'marketplace-creator-detail') {
    const match = String(query.creatorId || '').match(/(\d+)$/);
    const index = Math.max(0, Number(match?.[1] || 1) - 1);
    return {
      data: {
        creator: {
          creator_open_id: query.creatorId,
          username: `demo.creator.${index + 1}`,
          nickname: `Demo Creator ${index + 1}`,
          ec_video_count: 18 + index * 3,
          units_sold: 42 + index * 11,
          avg_ec_video_play_count: 18000 + index * 4200,
          avg_ec_video_like_count: 920 + index * 130,
          avg_ec_video_comment_count: 74 + index * 9,
          avg_ec_video_share_count: 51 + index * 7,
          gmv: { amount: String(640 + index * 275), currency: 'USD' },
        },
      },
      request_id: requestId,
    };
  }
  if (namespace === 'creator-content-details') {
    return {
      data: {
        total_count: 1,
        next_page_token: null,
        creator_content_details: [{
          creator_profile: {
            username: 'demo.creator.1',
            nickname: 'Demo Creator 1',
            follower_count: 12000,
            avatar: { url: 'https://api.dicebear.com/10.x/lorelei-neutral/svg?seed=demo-creator-1' },
            creator_open_id: `${DEMO_PREFIX}creator_1`,
          },
          video_count: 6,
          live_count: 2,
          promotion_status: 'NORMAL',
          promotion_end_time: Math.floor(Date.now() / 1000) + 30 * 86400,
        }],
        product: products[0],
      },
      request_id: requestId,
    };
  }
  if (namespace === 'shop-video-performance') {
    const currency = query.currency === 'USD' ? 'USD' : 'VND';
    const multiplier = currency === 'USD' ? 1 : 25000;
    const accountType = String(query.account_type || 'ALL');
    const videos = Array.from({ length: 12 }, (_, index) => ({
      id: `${7400000000000000000n + BigInt(index)}`,
      title: `${['Routine dưỡng sáng', 'Review serum 7 ngày', 'Get ready with me', 'Mẹo chăm tóc'][index % 4]} · ${shopName}`,
      username: `demo.creator.${index % 5 + 1}`,
      creator: {
        user_name: `demo.creator.${index % 5 + 1}`,
        nick_name: `Demo Creator ${index % 5 + 1}`,
        author_type: index % 3 === 0 ? 'OFFICIAL' : index % 3 === 1 ? 'MARKETING' : 'AFFILIATE',
      },
      video_post_time: `2026-07-${String(Math.max(1, 20 - index)).padStart(2, '0')} 10:30:00`,
      duration: 24 + index * 3,
      gmv: { amount: String((820 - index * 37) * multiplier), currency },
      gpm: { amount: String((18.5 - index * 0.55) * multiplier), currency },
      avg_customers: 62 + index * 4,
      sku_orders: 74 + index * 5,
      items_sold: 81 + index * 6,
      views: 42000 + index * 7300,
      click_through_rate: 0.071 + index * 0.002,
      products: [{ id: products[index % products.length].id, name: products[index % products.length].title }],
    })).filter((video) => {
      if (accountType === 'LINKED_ACCOUNTS') return ['OFFICIAL', 'MARKETING'].includes(video.creator.author_type);
      if (accountType === 'OFFICIAL_ACCOUNTS') return video.creator.author_type === 'OFFICIAL';
      if (accountType === 'MARKETING_ACCOUNTS') return video.creator.author_type === 'MARKETING';
      if (accountType === 'AFFILIATE_ACCOUNTS') return video.creator.author_type === 'AFFILIATE';
      return true;
    });
    return {
      data: { total_count: videos.length, next_page_token: null, videos },
      request_id: requestId,
    };
  }
  if (namespace === 'shop-video-performance-detail') {
    const video = query.video || {};
    const match = String(query.video_id || video.id || '').match(/(\d{1,2})$/);
    const index = Number(match?.[1] || 0) % products.length;
    const currency = query.currency === 'USD' ? 'USD' : 'VND';
    const multiplier = currency === 'USD' ? 1 : 25000;
    const views = Number(video.views || 42000 + index * 7300);
    return {
      data: {
        performance: {
          intervals: [{
            start_date: query.start_date,
            end_date: query.end_date,
            sales: {
              overall: {
                gmv: video.gmv || { amount: String((820 - index * 37) * multiplier), currency },
                gpm: video.gpm || { amount: String((18.5 - index * 0.55) * multiplier), currency },
                customers: Number(video.avg_customers || 62 + index * 4),
                items_sold: Number(video.items_sold || 81 + index * 6),
                ctr: Number(video.click_through_rate || 0.071 + index * 0.002),
                product_impressions: Math.round(views * 0.72),
                product_clicks: Math.round(views * Number(video.click_through_rate || 0.071)),
              },
              breakdowns: [{
                product_id: video.products?.[0]?.id || products[index].id,
              }],
            },
            traffic: {
              views,
              likes: 860 + index * 73,
              comments: 48 + index * 5,
              shares: 31 + index * 4,
            },
          }],
        },
      },
      request_id: requestId,
    };
  }
  const orders = Array.from({ length: 12 }, (_, index) => ({
    order_id: `${DEMO_PREFIX}order_${String(index + 1).padStart(3, '0')}`,
    product_id: products[index % products.length].id,
    program_id: `${DEMO_PREFIX}program_${index % 3 + 1}`,
    products: [products[index % products.length]],
    programs: [{ id: `${DEMO_PREFIX}program_${index % 3 + 1}`, name: `Demo Program ${index % 3 + 1}`, type: 'TARGET' }],
    skus: [{
      product_id: products[index % products.length].id,
      product_name: products[index % products.length].title,
      quantity: index % 3 + 1,
      target_collaboration_id: `${DEMO_PREFIX}program_${index % 3 + 1}`,
      content_type: 'VIDEO',
      content_id: `76000000000000000${String(index + 1).padStart(2, '0')}`,
      creator_username: `demo.creator${index % 4 + 1}`,
    }],
    create_time: Math.floor(Date.now() / 1000) - index * 21600,
  }));
  if (namespace === 'order-statistics') {
    const creatorUsername = String(query.creator_username || '').trim().replace(/^@+/, '').toLowerCase();
    const categoryId = String(query.category_id || 'all');
    const matchingOrders = orders.filter((order) => !creatorUsername
      || order.skus.some((sku) => sku.creator_username.toLowerCase() === creatorUsername));
    const rows = categoryId !== 'all' && categoryId !== 'uncategorized' ? [] : products.map((product) => {
      const matchingSkus = matchingOrders.flatMap((order) => order.skus.map((sku) => ({ order, sku })))
        .filter(({ sku }) => sku.product_id === product.id);
      return {
        product_id: product.id,
        product_name: product.title,
        image_url: product.main_image_url,
        category_id: null,
        category_name: null,
        quantity: matchingSkus.reduce((sum, { sku }) => sum + sku.quantity, 0),
        order_count: matchingSkus.length,
        creator_count: new Set(matchingSkus.map(({ sku }) => sku.creator_username)).size,
      };
    }).filter((row) => row.quantity > 0).sort((left, right) => right.quantity - left.quantity);
    return {
      data: {
        rows,
        creators: [...new Set(orders.flatMap((order) => order.skus.map((sku) => sku.creator_username)))].map((username) => ({ username })),
        categories: [],
        totals: {
          quantity: rows.reduce((sum, row) => sum + row.quantity, 0),
          products: rows.length,
          orders: new Set(matchingOrders.map((order) => order.order_id)).size,
        },
        truncated: false,
      },
      request_id: requestId,
    };
  }
  return {
    data: { total_count: orders.length, next_page_token: null, orders },
    request_id: requestId,
  };
};

const creatorOverviewFixture = (authorization) => ({
  profile: {
    creator_user_open_id: authorization.open_id,
    username: authorization.username,
    avatar_url: authorization.avatar_url,
    register_region: authorization.register_region || 'VN',
  },
  showcase: {
    totalCount: Number(authorization.showcase_count || 0),
    nextPageToken: null,
    products: Array.from({ length: Math.min(8, Number(authorization.showcase_count || 0)) }, (_, index) => ({
      id: `${DEMO_PREFIX}creator_product_${index + 1}`,
      title: `Demo Showcase Product ${index + 1}`,
      main_image_url: `https://picsum.photos/seed/demo-showcase-${index + 1}/160/160`,
    })),
  },
  collaborations: Array.from({ length: 5 }, (_, index) => ({
    id: `${DEMO_PREFIX}creator_collaboration_${index + 1}`,
    name: `Demo Creator Collaboration ${index + 1}`,
    status: ['ONGOING', 'VALID', 'COMPLETED'][index % 3],
    products: [{ id: `${DEMO_PREFIX}creator_product_${index + 1}` }],
  })),
  errors: { profile: null, showcase: null, collaborations: null },
});

const creatorCollaborationsFixture = (authorization) => {
  const overview = creatorOverviewFixture(authorization);
  return {
    collaborations: overview.collaborations,
    nextPageToken: null,
    totalCount: overview.collaborations.length,
    requestId: `${DEMO_PREFIX}creator_collaborations`,
  };
};

module.exports = {
  isDemoAuthorization,
  sellerAffiliateFixture,
  creatorOverviewFixture,
  creatorCollaborationsFixture,
};
