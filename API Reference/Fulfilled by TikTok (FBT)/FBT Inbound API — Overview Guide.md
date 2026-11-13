---
title: "FBT Inbound API — Overview Guide"
document_id: 69faa9472096e004e5297760
document_path: 16f0ojsg
is_api_doc: true
updated_at: 2026-05-06 02:49:59 UTC
source: https://partner.tiktokshop.com/docv2/page/16f0ojsg
---
**Consolidated Reference** — Getting Started, Key Concepts, Workflow Diagram, and Merchant Integration Guide for the FBT Inbound and Goods Creation APIs. 

## 1. Overview
The **FBT Inbound API** suite enables sellers and logistics partners to programmatically create, manage, and track inbound shipments to TikTok's **Fulfillment by TikTok (FBT)** warehouses.
###  New API Capabilities
FBT is launching **2 new API groups** alongside the existing APIs (which already support inventory search, inbound search, and inventory records).
**① Create Inbound**
End-to-end workflow to ship inventory into FBT warehouses:

* Create an inbound plan & placement selection
* Confirm shipping method & review requirements
* Pack & ship — submit carton or unit manifest
* Get shipping labels & update carrier tracking
* Manage & cancel inbound orders as needed

→ Covered by **Carton Splitting** & **Unit Splitting**
**② Create & Match Goods**
Manage the FBT goods catalog and bind TikTok Shop SKUs:

* Check hazmat & expiration requirements per SKU
* Create FBT goods records and bind to Shop SKUs
* Update goods info (dimensions, barcodes, hazmat)
* Manage SKU-to-goods bindings (bind / unbind)

→ Covered by **Goods Management**

### Two Inbound Workflows Supported
**Carton Splitting**

* Inventory is pre-packed into cartons before inbound creation and shipping
* Each carton contains one or more SKUs
* TikTok assigns warehouse per carton

**Unit Splitting**

* Inventory is not packed at time of inbound creation, packing information is shared later during ship step
* Higher flexibility for flow based packing


**Required Auth Scope**: `seller.fbt.inbound` — all endpoints in both workflows require this scope on the seller access token.


## 2. Key Concepts
Core terminology for FBT API integration.
###  Merchant
A **Merchant** represents an entity that offers products or services for sale in TikTok Shop with FBT fulfillment. Every merchant has a unique **FBT Merchant ID**, required before any API calls can be made.
> **Getting your Merchant ID**: Merchant IDs are assigned during FBT onboarding. Use **Get FBT Merchant Onboarded Regions** to verify a seller is registered and retrieve their active regions before calling any inbound APIs.

###  Goods
**FBT Goods** is a unique record assigned by FBT to track and manage an individual seller's inventory within the Fulfilled by TikTok system.
Goods must be **matched to a TikTok product ID** before merchants can create inbound shipments, manage inventory, or fulfill orders. If goods are unmatched from SKUs, the corresponding inventory is no longer available for sale on TikTok Shop.
**Key Terms**
| Full Name | Who Assigns It | Used In |
| --- | --- | --- |
| TikTok Shop Product /SKU ID | TikTok Shop (from your product catalog) | CreateGoods, GetHazmatInfo, UpdateSkuRelation |
| FBT Goods ID | FBT system — returned on CreateGoods success | UpdateGoods, UpdateSkuRelation, Inbound APIs |
**Goods Lifecycle**

1. **Check requirements** — call *Get Hazmat & Expiration Info* to determine special handling needs
2. **Create & bind** — call *Create Goods* with `CREATE_AND_BIND` to create the FBT goods record and link it to a TikTok Shop SKU
3. **Create inbound** — once matched, use the Inbound APIs to ship inventory
4. **Manage bindings** — use *Update Goods SKU Relation* to add or remove SKU associations at any time

**Tip**: A single FBT Goods record can be bound to **multiple TikTok Shop SKUs (1:N)** when the merchant enables channel inventory — useful for selling the same physical product across multiple shops or regions.

### FBT Warehouse
FBT warehouses are **subscribed automatically after onboarding**. There are two warehouse types, each with a distinct role:
| Warehouse Type | Accepts Inbound | Fulfills Orders | Notes |
| --- | --- | --- | --- |
| **HUB** | ✅ Yes | ❌ No | Inbound processing & sorting only — inventory is transferred to an FC before becoming sellable.  <br> Charges hub placement fees, refer to FBT [merchant academy](https://scm-us.tiktok.com/merchant-university/home) for fees details  |
| **FC** (Fulfillment Center) | ✅ Yes | ✅ Yes | Receives inventory; used for order fulfillment.  <br> Merchants cannot select these manually, FBT placement decides FC. |
Use **Get FBT Warehouse List** to retrieve all warehouse IDs, names, addresses, and types. The `warehouse_id` returned is required when creating an inbound plan.

## 3. Authentication
Every API request must include the following headers:
| Header | Value | Notes |
| --- | --- | --- |
| `content-type` | `application/json` | Required on all requests |
| `x-tts-access-token` | Your seller access token | Obtain via TikTok Shop OAuth (`user_type = 0`). **Tokens expire** — build refresh logic into your pipeline |
**Example**
```HTTP
POST /fbt/202602/create_update_inbound_plan?shop_id=123456 HTTP/1.1
content-type: application/json
x-tts-access-token: eyJhbGciOiJSUzI1NiIsInR5cCI6...
```

**Token Expiry**: Access tokens expire. Always check expiry time and refresh using the refresh token before making API calls in automated pipelines.


## 4. Before You Start — Checklist
Confirm all of the following before making your first API call:

- [ ] You have a valid **FBT Merchant ID** (assigned during FBT onboarding). Verify with *Get FBT Merchant Onboarded Regions*
- [ ] Your TikTok Shop goods are **created and matched** to FBT via the Goods Management APIs or the FBT seller portal
- [ ] You have a **seller access token** with the `seller.fbt.inbound` OAuth scope
- [ ] You have decided between **Carton Splitting** (pre-packed boxes) and **Unit Splitting** (loose units)
- [ ] You have decided between **Single_Hub (Single Shipment)** and **D2FC (Multiple Shipments)** to FBT


## 5. Create & Match Goods — API Overview
Before sending inventory to FBT, sellers must have **FBT Goods records created and matched** to their TikTok Shop SKUs. These APIs should typically be called **before** creating an inbound plan.
### Recommended Goods Setup Sequence
| # | API | Method | Purpose | Key Output |
| --- | --- | --- | --- | --- |
| 1 | **Get Hazmat & Expiration Info** | POST | Check if SKUs have hazmat classification or expiration/shelf-life rules before creating goods. Up to 50 SKUs per call. | Hazmat flags, shelf-life rules |
| 2 | **Create Goods** | POST | Create FBT goods records and bind to TikTok Shop SKUs (`CREATE_AND_BIND`). Include hazmat/shelf-life fields if flagged in step 1. | `tts_goods_id` |
| 3 | **Update Goods** | POST | Edit an existing goods record — name, dimensions, barcodes, return handling, hazmat/shelf-life info. | Update confirmation |
| 4 | **Update Goods SKU Relation** | POST | Manage bindings between FBT goods and Shop SKUs. Use `BIND` to add or `UN_BIND` to remove. | Operation confirmation |
### Key Goods Parameters
| Parameter | Where Used | Description |
| --- | --- | --- |
| `tt_sku_id` | GetHazmat, CreateGoods | TikTok Shop SKU ID — primary identifier from the seller's product catalog |
| `tts_goods_id` | UpdateGoods, UpdateSkuRelation | FBT Goods ID — assigned on CreateGoods success. **Save this value** |
| `create_goods_type` | CreateGoods | `CREATE_AND_BIND` — creates the FBT goods record and binds it to the SKU in one call |
| `operation_type` | UpdateSkuRelation | `BIND` to associate a SKU, `UN_BIND` to remove association |
### Special Handling Flags
Some products require additional data fields when creating goods:

* **Hazmat** (`is_hazmat = true`): Must provide `hazmat_info` with `hazmat_type` (`BATTERY`, `MAGNETIZED`, `FLAMMABLE_LIQUID`, `AEROSOLS`) and type-specific details
* **Battery products**: Require battery type (`LITHIUM_ION`, `LITHIUM_METAL`, `OTHER`), capacity, packaging type (`STANDALONE` / `IN_EQUIPMENT` / `WITH_EQUIPMENT`), and UN code. Please note SDS for 

Please refer to the table below for hazmat info mapping rule
| **Hazmat type** | **Class** | **How batteries are packed** | **Battery type** | **Flammable liquid type** | **Un code** |
| --- | --- | --- | --- | --- | --- |
| Battery | 9 | Standalone | Lithion Ion |  | UN 3480 |
| Battery | 9 | Standalone | Lithion metal |  | UN3090 |
| Battery | 9 | Standalone | Other |  | Other |
| Battery | 9 | In equipment | Lithion Ion |  | UN 3481 |
| Battery | 9 | In equipment | Lithion metal |  | UN3091 |
| Battery | 9 | In equipment | Other |  | Other |
| Battery | 9 | With equipment | Lithion Ion |  | UN 3481 |
| Battery | 9 | With equipment | Lithion metal |  | UN3091 |
| Battery | 9 | With equipment | Other |  | Other |
| Magnetized material | 9 |  |  |  | UN2807 |
| Flammable liquids | 3 |  |  | Paints | UN1263 |
| Flammable liquids | 3 |  |  | Perfumery products | UN1266 |
| Flammable liquids | 3 |  |  | Alcohols | UN3065 |
| Flammable liquids | 3 |  |  | Other | Other |
| Aerosols | 2 |  |  |  | UN1950 |
| Aerosols | 2 |  |  |  | Other |

* **Shelf-Life** (`is_expiration_management = true`): Must provide `shelf_life_attribute_info` including inbound cutoff days, expiration alert days, sales cutoff days and handling methods for expired units


## 6. Choose Your Inbound Workflow
| Criteria | Carton Splitting | Unit Splitting |
| --- | --- | --- |
| **When to use** | You know carton dimensions & contents before shipping | You have not packed cartons at time of inbound order creation, or cartons are packed dynamically by your warehouse |
| **inbound_type value** | `CARTON_SPLITTING` | `UNIT_SPLITTING` |
| **Carton data in payload** | Required — at plan creation;  | Not required, has to be provided later at Ship IBR step <br>  |

![Image](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/9589c9d242b34d60847afa481ab4a129~tplv-k9wyc2ijk0-image.image)

## 7. Create Inbound — API Call Sequence
Follow these **9 steps in order**. Each step may produce IDs required by the next step. Both workflows (Carton / Unit) share this same sequence — the only differences are in request/response fields.
| # | API | Method | Purpose | Key Output | Comments |
| --- | --- | --- | --- | --- | --- |
| 1 | **Create / Update Inbound Plan** | POST | Create a new inbound plan or update an existing draft. Specify SKUs, quantities, and destination warehouse. | `inbound_plan_id` |  |
| 2 | **List Available Inbound Methods** | GET | Retrieve available Inbound methods with expected time ranges for the plan (Single Hub, D2FC). <br> For hubs it also includes placement fee estimate.  <br>  | ETA for which an Inbound method is available | This step tells you about availability of inbound methods. <br> FBT Inbound method  |
| 3 | **Get Inbound Method Detail** | POST | Get details for each inbound method and ETA, including placement option id and warehouse id. <br> For hubs it also includes placement fee estimate.  | `placement_option_id` <br> If you want to go to a specific hub, please use the correct placement option id corresponding to the hub. | **Async polling operation**: This endpoint may take up to **3-5 seconds** to return success. <br> We recommend polling every 3-5 seconds until placement task is successful  <br>  |
| 4 | **Confirm Inbound Method** | POST | Select and confirm the preferred inbound method and placement option. Include the `placement_option_id` returned from Step 3. | Confirmed `inbound_order_ids` <br> For single hub, you will get 1 order id <br> For D2FC you will see a list of order ids <br>  |  |
| 5 | **Ship Inbound Order** | POST | Submit final shipment details: carton/unit manifest, carton contents if unit split <br>  | `inbound_order_id` status changes to "shipped" | This is required to receive inventory. Inbound orders that have not been shipped will result in NCI |
| 6 | **Print Label** | POST | Generate printable shipping labels (per carton / per shipment). | Label PDF / URL | **Async polling operation**: This endpoint may take up to **30 seconds** to return success. <br> We recommend polling every 3-5 seconds until task_status is successful and URL is returned |
| 7 | **Update Tracking** | POST | Push carrier tracking number after small parcel label is available for each carton. |  |  |
| 8 | **Get Inbound Order** | GET | Retrieve order details | Order status & details |  |
| 9 | **Cancel Inbound Order** | POST | Cancel an order (only before warehouse receives the shipment).  <br> Please note D2FC IBR cancellation may incur a fee if part of the plan is received and remaining is not received.  | Cancellation confirmation |  |
Key Field Reference
### `plan_id` — Create vs Update
| Scenario | `plan_id` in request body |
| --- | --- |
| Creating a new inbound plan | **Omit** — the system generates and returns a new `inbound_plan_id` |
| Updating an existing draft plan | **Required** — include the `inbound_plan_id` returned from the original create call |
### Timestamp— Format
All `timestamp` fields inside request parameters must be a **Unix timestamp in seconds (UTC)**:
```JSON
{
  "cartons": [
    {
      "items": [
        {
          "tts_goods_id": "9988776655",
          "quantity": 10,
          "expiration_timestamp": "1780000000"
        }
      ]
    }
  ]
}
```

> Use seconds (UTC), **not milliseconds**.



## 8. Error Handling
### HTTP Error Codes

* **400 Bad Request** — Validate all required fields and data types before submission
* **401 Unauthorized** — Token expired or missing. Refresh and retry
* **409 Conflict** — Duplicate plan/order. Check `idempotency_key` or existing records
* **429 Rate Limited** — Implement exponential backoff with jitter. Default limit: **10 req/sec per shop**
* **5xx Server Error** — Retry with backoff (max 3 retries). Log `request_id` from response headers for escalation

### Common Issues & Fixes
**ETA slot unavailable.** ETA helps FBT plan warehouse inbound capacity. **** During peak some inbound methods or sites might not be available, please select a different ETA 

* Retrieve available ETAs from *Get Inbound Method Detail* (Step 3) and pick from that list

**Generic "Internal Error" on Create Inbound Plan:** Try the following steps

* Verify your goods are matched to TikTok Shop SKUs (unmatched goods cannot be inbounded)
* If it persists, escalate with full request payload and `request_id` from the response header

**Print Label API delay** Label printing runs **asynchronously** after print label API call.

## 9. Other FBT APIs & Webhooks
| # | Type | API / Webhook | Description |
| --- | --- | --- | --- |
| 1 | API | Get FBT Warehouse List | Retrieve all FBT warehouse info including name and address |
| 2 | API | Search Goods Info | Retrieve goods info including dimensions and weight as verified by the warehouse |
| 3 | API | Search FBT Inventory | Retrieve inventory details — sellable, reserved, unsellable, and in-transit at warehouse level |
| 4 | API | Search FBT Inventory Record | Retrieve inventory change records, filterable by warehouse and time range |
| 5 | API | Get Inbound Orders | Retrieve inbound order details including planned/actual inbound detail and status |
| 6 | Webhook | Merchant Onboard | Triggered when a seller onboards to FBT |
| 7 | Webhook | Goods Match | Triggered when a TikTok Shop SKU is matched or unmatched with FBT goods |
| 8 | Webhook | FBT Inventory Update | Triggered when FBT inventory is updated |
| 9 | Webhook | FBT Inbound Status Change | Triggered when an FBT inbound order status is updated |

## 10. Testing & Go-Live Checklist
### Go-Live

- [ ] Token refresh logic implemented
- [ ] ETA selection: Retrieve available ETA by calling List Inbound method 
- [ ] Label generation: call Print Label after brief async delay post-printlable
- [ ] Error handling: log `request_id` from response for all 5xx errors
- [ ] Goods matching confirmed for all SKUs in your inbound plan
- [ ] Warehouse confirmed as active for your merchant
- [ ] Move to production with real `shop_id` and credentials **only after sandbox sign-off**


## 11. FAQs
### Inbound Method Values
**Q: What do D2FC and ONE_HUB mean in ListAvailableInboundMethod response?**

* **D2FC**: *Direct to Fulfillment Center* — your shipment goes directly to the final FC that fulfills customer orders
* **ONE_HUB**: Your shipment is first sent to a hub/consolidation point for sorting, then forwarded to the FCThese are the two standard values; additional region-specific values may be available depending on the warehouse location.

**Q: Can I update the tracking number after submission?​**Yes — use the *Update Tracking* API to push a new or corrected carrier tracking number at any time after handing off to the carrier.
