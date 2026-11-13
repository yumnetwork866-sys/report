---
title: "Additional Notes"
document_id: 6aaa628bd7ff2a0502429f4f
document_path: 1cjht3qx
is_api_doc: true
updated_at: 2026-09-16 09:34:36 UTC
source: https://partner.tiktokshop.com/docv2/page/1cjht3qx
---
### **Reason Code**
| **Reason Code** | **英文含义** | **中文含义** | **常见回传场景** |
| --- | --- | --- | --- |
| **R104** | Failed to contact recipient | 无法联系收件人 | 电话无人接听、关机，或到达地址后无人响应 |
| **R148** | Exceptional reason | 其他异常原因 | 物流商原始原因无法映射到具体标准码时使用的异常兜底码 |
| **R400** | Recipient issues other | 收件人侧其他问题 | 收件人侧发生其他异常，但不属于拒收、联系不上、改期等明确原因 |
| **R103** | Error in address | 收件地址错误 | 门牌号缺失、街道错误、邮编与城市不匹配，导致无法派送 |
| **R106** | Recipient refused | 收件人拒收 | 收件人明确拒绝接收包裹，或表示未购买该商品 |
| **R110** | Bad weather conditions | 恶劣天气或不可抗力 | 暴雨、洪水、台风、道路封闭、区域管制等导致无法派送 |
| **R117** | Package damage | 包裹破损 | 外包装破裂、严重挤压、商品泄漏或运输中损坏 |
| **R116** | Package lost | 包裹丢失 | 分拣、转运或末端派送环节确认包裹遗失 |
| **R105** | Error in phone number | 收件人电话号码错误 <br>  | 电话号码位数错误、空号、区号错误或无法接通 |
| **R108** | Recipient request delivery change | 收件人要求变更派送 | 收件人要求改期、改地址或改送至代收点 |

### Action code 
| Action code Name | Action code value | Must have | Tracking event / 运输阶段 |  |
| --- | --- | --- | --- | --- |
| pickup_start | 20201 | N | 揽收开始 — Pickup initiated |  |
| pickup_failure | 20301 | N | 揽收失败 — Pickup failed |  |
| pickup_intransit | 31501 | N | 揽收在途 — En route for pickup |  |
| pickup_success | 30901 | **Y** | 揽收成功 — Pickup successful |  |
| pickup_station_in | 39901 | N | 揽收站点入库 — Inbound at pickup facility |  |
| pickup_station_out | 3010001 | N | 揽收站点出库 — Departed pickup facility |  |
| trans_inbound | 31001 | N | 转运入库 — Inbound at transfer hub |  |
| trans_outbound | 31101 | N | 转运出库 — Departed transfer hub |  |
| sc_sign | 31201 | N | 分拨签收 — Received at sorting center (signed) |  |
| sc_inbound | 31301 | N | 分拨入库 — Inbound at sorting center |  |
| sc_operate | 32701 | N | 分拨操作 — Processing at sorting center |  |
| sc_outbound | 31401 | N | 分拨出库 — Departed sorting center |  |
| trans_operate | 32001 | N | 转运操作 — Processing at transfer hub |  |
| trans_exception | 32101 | N | 转运异常 — Transit exception |  |
| trans_sign | 32201 | N | 转运签收 — Received at transfer hub (signed) |  |
| trans_handover | 32301 | N | 转运交接 — Transfer handover |  |
| transport_departed | 32401 | N | 干线发车 — Line-haul departure |  |
| transport_intransit | 32501 | N | 干线在途 — Line-haul in transit |  |
| transport_arrived | 32601 | N | 干线到达 — Line-haul arrival |  |
| transport_assigned | 32801 | N | 运输分配 — Shipment routing assigned |  |
| station_inbound | 40101 | N | 末端站点入库 — Inbound at last-mile station |  |
| station_operate | 40301 | N | 末端站点操作 — Processing at last-mile station |  |
| station_out | 40201 | N | 末端站点出库 — Departed last-mile station |  |
| delivery_start | 40501 | **Y** | 开始派送 — Out for delivery |  |
| delivery_exception | 41401 | N | 派送异常 — Delivery exception |  |
| pop_arrived | 41501 | N | 自提点到达 — Arrived at pickup point |  |
| **signed_personally** | 50101 <br>  | **Y** <br>  | 本人签收（平台终态） — Delivered — signed by recipient (platform final state) |  |
| sign_failure <br>  | 60101 | If not pass signed_personally, should have sign failure or unreachable_returned | 签收失败（非终态节点） — Delivery attempt failed (non-final status) |  |
| **unreachable_returned** | 80101 | If not pass signed_personally, should have sign failure or unreachable_returned | 退回商家（平台终态） — Returned to merchant (platform final state) |  |
|  |  |  |  |  |
