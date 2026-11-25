const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { buildHostLeaderboardWorkbook } = require('../src/services/liveHostExportService');

test('buildHostLeaderboardWorkbook creates Tong_hop_Host summary sheet and one tab per host with session & order details', () => {
  const buffer = buildHostLeaderboardWorkbook({
    shopName: 'Actiscar Malaysia',
    startDate: '2026-11-16',
    endDate: '2026-11-23',
    currency: 'MYR',
    hosts: [
      {
        id: '10',
        isUnassigned: false,
        hostName: 'Elly',
        hostEmail: 'elly@example.com',
        sessionsCount: 2,
        totalDurationSec: 7200,
        hours: 2,
        totalGmv: 429.3,
        cancelledGmv: 202.5,
        gmvPerHour: 214.65,
        orderCount: 2,
        cancelledOrderCount: 1,
        totalQuantity: 3,
        closingRate: 4,
        aov: 214.65,
        convertedAdsCost: 74.53,
        costRevenueRatio: 17.36,
        gmvShare: 60,
        currency: 'MYR',
        sessions: [
          {
            sessionId: '77112191999097',
            creatorUsername: 'actiscar.live',
            firstTime: Date.UTC(2026, 10, 23, 5, 29),
            durationSec: 7200,
            orderCount: 2,
            cancelledOrderCount: 1,
            totalGmv: 429.3,
            cancelledGmv: 202.5,
            convertedAdsCost: 74.53,
            costRevenueRatio: 17.36,
            gmvPerHour: 214.65,
            totalComments: 50,
            closingRate: 4,
            aov: 214.65,
            currency: 'MYR',
          },
        ],
        orders: [
          {
            orderId: '576891234567890123',
            sessionId: '77112191999097',
            createTime: Date.UTC(2026, 10, 23, 5, 35),
            creatorUsername: 'actiscar.live',
            productSummary: 'Serum A (x2)',
            netQuantity: 2,
            cancelledQuantity: 0,
            netGmv: 429.3,
            cancelledGmv: 0,
            status: 'COMPLETED',
            statusLabel: 'Hoàn thành',
            isCancelled: false,
            currency: 'MYR',
          },
          {
            orderId: '576891234567890124',
            sessionId: '77112191999097',
            createTime: Date.UTC(2026, 10, 23, 5, 45),
            creatorUsername: 'actiscar.live',
            productSummary: 'Serum B (x1)',
            netQuantity: 0,
            cancelledQuantity: 1,
            netGmv: 0,
            cancelledGmv: 202.5,
            status: 'CANCELLED',
            statusLabel: 'Đã hủy',
            isCancelled: true,
            currency: 'MYR',
          },
        ],
      },
      {
        id: '__unassigned__',
        isUnassigned: true,
        hostName: 'Phiên chưa gán Host',
        hostEmail: '',
        sessionsCount: 1,
        totalDurationSec: 3600,
        hours: 1,
        totalGmv: 286.2,
        cancelledGmv: 0,
        gmvPerHour: 286.2,
        orderCount: 1,
        cancelledOrderCount: 0,
        totalQuantity: 1,
        closingRate: 2.5,
        aov: 286.2,
        convertedAdsCost: 0,
        costRevenueRatio: 0,
        gmvShare: 40,
        currency: 'MYR',
        sessions: [],
        orders: [],
      },
    ],
  });

  const workbook = XLSX.read(buffer, { type: 'buffer' });
  assert.deepEqual(workbook.SheetNames, ['Tong_hop_Host', 'Elly', 'Phiên chưa gán Host']);

  const summaryRows = XLSX.utils.sheet_to_json(workbook.Sheets.Tong_hop_Host, { header: 1 });
  const ellySummary = summaryRows.find((r) => r[1] === 'Elly');
  assert.equal(ellySummary[0], 1);
  assert.equal(ellySummary[6], 429.3);
  assert.equal(ellySummary[7], 202.5);
  assert.equal(ellySummary[9], 2);
  assert.equal(ellySummary[10], 1);

  const totalRow = summaryRows.find((r) => r[1] === 'TỔNG CỘNG');
  assert.equal(totalRow[3], 3);
  assert.equal(totalRow[6], 715.5);
  assert.equal(totalRow[9], 3);
  assert.equal(totalRow[10], 1);

  const ellyRows = XLSX.utils.sheet_to_json(workbook.Sheets.Elly, { header: 1 });
  const orderRow1 = ellyRows.find((r) => r[0] === '576891234567890123');
  const orderRow2 = ellyRows.find((r) => r[0] === '576891234567890124');
  assert.equal(orderRow1[7], 429.3);
  assert.equal(orderRow1[10], 'Tính vào doanh thu');
  assert.equal(orderRow2[8], 202.5);
  assert.equal(orderRow2[10], 'Đã trừ (Hủy/Hoàn)');
});
