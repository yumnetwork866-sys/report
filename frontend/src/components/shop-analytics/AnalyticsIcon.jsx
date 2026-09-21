const ICON_PATHS = {
  shop: ['M4 9h16', 'M5 9l1-5h12l1 5', 'M6 9v11h12V9', 'M9 20v-6h6v6'],
  gmv: ['M12 3v18', 'M17 7.5C17 5.6 15.2 4 12.5 4S8 5.4 8 7.5s1.8 3 4.5 3 4.5 1.4 4.5 3S15.2 17 12.5 17 8 15.4 8 13.5'],
  orders: ['M5 7h14l-1 13H6L5 7Z', 'M9 9V6a3 3 0 0 1 6 0v3'],
  unitsSold: ['M4 8l8-4 8 4-8 4-8-4Z', 'M4 8v8l8 4 8-4V8', 'M12 12v8'],
  buyers: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M5 21a7 7 0 0 1 14 0'],
  avgOrderValue: ['M4 6h16v12H4z', 'M8 12h8', 'M12 9v6'],
  refunds: ['M8 7H4v-4', 'M4 7a8 8 0 1 1-1 7', 'M4 7l4-4'],
  sync: ['M20 7h-5V2', 'M4 17h5v5', 'M19 12a7 7 0 0 0-12-5l-2 2', 'M5 12a7 7 0 0 0 12 5l2-2'],
  connect: ['M12 5v14', 'M5 12h14'],
  analytics: ['M4 19V9', 'M10 19V5', 'M16 19v-7', 'M3 19h18'],
  connections: ['M8 12h8', 'M9 8H7a4 4 0 0 0 0 8h2', 'M15 8h2a4 4 0 0 1 0 8h-2'],
  likes: ['M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6a5.5 5.5 0 0 0 1-8.8Z'],
  comments: ['M21 12a8 8 0 0 1-8 8 9 9 0 0 1-4-.9L3 21l1.4-3.5A8 8 0 1 1 21 12Z'],
  shares: [
    'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    'M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    'M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    'M8.6 10.5l6.8-4',
    'M8.6 13.5l6.8 4',
  ],
  views: ['M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
};

const AnalyticsIcon = ({ name, className = '' }) => (
  <svg
    className={`shop-analytics__icon ${className}`.trim()}
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    {(ICON_PATHS[name] || ICON_PATHS.analytics).map((path) => (
      <path key={path} d={path} />
    ))}
  </svg>
);

export default AnalyticsIcon;
