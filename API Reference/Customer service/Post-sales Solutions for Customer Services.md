---
title: "Post-sales Solutions for Customer Services"
document_id: 69ba2b3f28d41304ee5dc3c9
document_path: gx13i64p
is_api_doc: true
updated_at: 2026-03-18 04:40:36 UTC
source: https://partner.tiktokshop.com/docv2/page/gx13i64p
---
## Business Scenario and Use Cases
> This document provides a comprehensive technical integration guide for Independent Software Vendors (ISVs) and merchant developers aiming to build advanced customer service applications on the TikTok Shop Open Platform. The focus is on leveraging **Message Cards** to manage post-sales actions—specifically **returns, refunds, and cancellations**—directly within a third-party customer service platform.


In a typical post-sales scenario, a buyer initiates a request (e.g., to return a product) through the chat interface. A customer service agent must then navigate to the TikTok Shop Seller Center to manage this request, creating a disconnected and inefficient workflow.
This solution enables a seamless experience where post-sales events are managed entirely within the agent's primary workspace. For example:

1. **Card-based Initiation**: A buyer, dissatisfied with a purchase, sends a message. The agent, instead of replying with plain text, can send an interactive **Return/Refund Card**. The buyer fills out the necessary details (reason, evidence) after redirecting to the post-sales initiation page from this card.
2. **In-Chat Actions**: The submitted request, now containing the buyer's post-sales request, appears in the chat window sidebar after ISV integrated the TikTok Shop return/refund/cancel APIs. The agent reviews the information within the chat context and uses action buttons on the sidebar (e.g., **Approve**, **Reject**) to process the request.
3. **API-driven Orchestration**: Clicking an action button triggers a call to the corresponding TikTok Shop Open API endpoint (e.g., `POST /return_refund/.../approve`).
4. **Real-time Status Updates**: The state of the return process (e.g., `AWAITING_BUYER_SHIP`, `REFUND_COMPLETED`) is updated in real-time. This can be achieved by updating the original message card, sending a new system message, or displaying the status in a dedicated UI panel, all powered by Webhook notifications (`RETURN_STATUS_CHANGED`).

By integrating message cards with post-sales APIs, ISVs can deliver a superior agent experience, reduce resolution times, and provide a transparent, interactive process for buyers.
## Card-based Post-sales Request Initiation
Card-based initiation turns an unstructured complaint message into a guided post-sales flow. Instead of asking the buyer to navigate to a separate returns page, the agent sends a structured **Return/Refund Card** from the chat, and the buyer completes the request in a few guided steps.
| **Stage** | **Actor** | **Message / Card in Chat** | **Backend Action / API** | **Expected Outcome** |
| --- | --- | --- | --- | --- |
| 1. Issue discovered | Buyer | Buyer sends a plain-text message (optionally with images/video) describing the problem with the order. | ISV app resolves the buyer and order context using existing Customer Service APIs (conversation and order linkage). | The relevant order is identified and shown to the agent together with the buyer's message. |
| 2. Card offered | Agent | Agent sends a `RETURN_REFUND_CARD` (optionally together with an `ORDER_CARD`) instead of a free-form reply. | `POST /customer_service/202309/conversations/{conversation_id}/messages` with `type: "RETURN_REFUND_CARD"` and `content` containing `order_id` and `sku_id`. Eligibility can be checked first via `GET /return_refund/.../aftersale_eligibility`. | The buyer receives a structured card showing the order line(s), eligible post-sales options and a clear call-to-action. |
| 3. Buyer fills details | Buyer | Buyer opens the card, selects affected items, chooses **reason**, uploads **evidence** and confirms the request. | ISV backend receives the submission and calls the appropriate post-sales API, for example `POST /return_refund/202309/returns` (Create Return) or `POST /return_refund/202309/cancellations` (Create Cancellation). | A new `return_id` or `cancel_id` is created on TikTok Shop and stored in the ISV system together with conversation identifiers. |
| 4. Confirmation in chat | System | System sends an updated `RETURN_REFUND_CARD` or a confirmation message summarizing the buyer's request (items, amount, reason). | ISV optionally calls `Search Returns` / `Search Cancellations` to verify the created request and then sends an updated card via `Send Message`. | Both buyer and agent see the same structured view of the newly created post-sales case within the conversation. |
| 5. Next-step guidance | System | Card clearly indicates the next step (e.g., "Awaiting seller review", "Awaiting buyer shipment"). | Status is derived from the post-sales object (e.g., `RETURN_OR_REFUND_REQUEST_PENDING`, `AWAITING_BUYER_SHIP`) and mapped to card fields. | The buyer knows what to expect next without leaving the chat, reducing repeated contacts and confusion. |
### **Typical card-based initiation scenarios (message-card aligned):**

* **Refund-only request (no return):**

Buyer reports that an item never arrived or is unusable. Agent sends a `RETURN_REFUND_CARD` configured for **refund only**, and the ISV calls `Create Return` followed by `Approve Return` with `decision: APPROVE_REFUND`.

* **Return & refund request:**

Buyer received the item but is dissatisfied (e.g., wrong size, damaged). The card exposes options for **return & refund**. After submission, the ISV calls `Create Return` and later guides the buyer to ship the item back.

* **Order cancellation before shipment:**

Buyer asks to cancel an order that has not yet been shipped. The agent sends a cancellation-specific card (or an `ORDER_CARD` with a **Cancel order** CTA), and the ISV calls `POST /return_refund/202309/cancellations` to create a cancellation request.

* **Partial or returnless refund:**

Only part of a multi-line order is problematic, or the seller chooses to issue a **returnless refund** for low-value items. The `RETURN_REFUND_CARD` allows the buyer or agent to select relevant SKUs and amount. The ISV calls `Approve Return` with `decision: APPROVE_REFUND` and `buyer_keep_item: true` where applicable.
## In-Chat Actions & Real-time Status Updates
Once a post-sales request has been created, agents should be able to review and resolve it without leaving the chat window. The ISV surfaces the request in a sidebar panel and/or as an updated message card, so that actions like **Approve**, **Reject**, or **Modify refund amount** stay fully in context.
| **Stage** | **Actor** | **Message / Card in Chat** | **Backend Action / API** | **Expected Outcome** |
| --- | --- | --- | --- | --- |
| 1. Request surfaces to agent | System | A new or updated `RETURN_REFUND_CARD` appears, and the sidebar shows a post-sales summary panel for the current conversation. | ISV listens to `RETURN_STATUS_CHANGED` / `CANCELLATION_STATUS_CHANGED` Webhooks or polls `Search Returns` / `Search Cancellations`, then binds the latest post-sales record to the conversation. | The agent immediately sees which order and items are under review, without searching in Seller Center. |
| 2. Context review | Agent | Agent inspects the card and sidebar: order details (via `ORDER_CARD`), logistics information (via `LOGISTICS_CARD`), and buyer messages/evidence. | ISV fetches details via `Get Order Detail`, `Search Returns`, and related logistics APIs to populate the side panel and card fields. | Agent has all necessary context (timeline, status, prior attempts) in a single view. |
| 3. Action selection | Agent | Agent clicks an action button such as **Approve**, **Reject**, **Refund only**, **Partial refund**, or **Cancel order** from the sidebar or card. | ISV calls the appropriate endpoint, for example: `Approve Return`, `Reject Return`, `Approve Cancellation`, or `Cancel Order`. Write calls include an idempotency key and validation of eligibility before execution. | The post-sales record on TikTok Shop transitions to the next status based on the selected action. |
| 4. Buyer notified in chat | System | Card and messages in the conversation are updated to show the decision (e.g., "Return approved – please ship the item", "Refund approved – no need to return", "Request rejected with reason"). | Webhooks trigger UI refresh; ISV updates the `RETURN_REFUND_CARD` or sends a new system message via `Send Message`. Logistics instructions can be shared via `LOGISTICS_CARD`. | Buyer receives an immediate, structured update and clear next steps directly inside the chat. |
| 5. Case closure | System | Final state (e.g., "Refund completed", "Cancellation completed") is reflected in a read-only card in the chat and sidebar. | Final Webhook (e.g., `RETURN_OR_REFUND_REQUEST_COMPLETE`) is processed; ISV marks the case as resolved and updates the UI accordingly. | The agent can close the ticket or conversation, knowing the post-sales flow has completed successfully. |
### **Typical in-chat action scenarios (message-card aligned):**

* **Standard return & refund approval:**

In the sidebar, the agent reviews a pending `RETURN_REFUND_CARD` for a delivered order and clicks **Approve return**. The ISV calls `Approve Return` (`decision: APPROVE_RETURN`), then later **Confirm goods received** (`decision: APPROVE_RECEIVED_PACKAGE`) once the package arrives.

* **Refund-only or returnless refund approval:**

For items that are low value or not required to be returned, the agent chooses **Refund only** from the card. The ISV calls `Approve Return` with `decision: APPROVE_REFUND` and may set `buyer_keep_item: true` to implement a returnless refund.

* **Order cancellation in chat:**

For an `AWAITING_SHIPMENT` order, the agent triggers **Cancel order** from the order-related card. The ISV calls `Cancel Order` and uses `CANCELLATION_STATUS_CHANGED` Webhooks to update the card and mark the cancelled line items.

* **Partial refund on multi-line orders:**

When only one SKU in a multi-item order has an issue, the sidebar allows the agent to select the affected line items and the refund amount. The ISV passes the selected items and amount into the `Create Return` and `Approve Return` calls, and the card highlights which items were refunded.

* **Reject invalid or abusive requests:**

If eligibility checks fail (e.g., out-of-window, wrong reason), the agent clicks **Reject** from the card, chooses a standardized reject reason, and the ISV calls `Reject Return`. The card becomes read-only and documents the decision within the conversation history.
## Message Cards Used (per use case)
**Cancel journey**
**Overview**: Cancellation cards let the seller or chatbot surface a one-click cancel experience for orders that are still cancellable (typically `UNPAID`, `ON_HOLD`, `AWAITING_SHIPMENT`). The card presents the order lines and eligible cancel reasons, then creates a cancellation request and surfaces the final decision back into the conversation using `seller_im_order_cancellation_text_card`, `seller_im_order_cancellation_notification_card`, `seller_im_order_cancellation_voucher_card`, `seller_im_chatbot_cancel_order`, and `seller_im_chatbot_cancel_order_result`.
**Relevant APIs:**

* `POST /return_refund/202309/cancellations` — Cancel Order (seller-initiated cancellation, supports partial cancel via `skus` or `order_line_item_ids` in some markets).
* `POST /return_refund/202309/cancellations/search` — Search Cancellations (list and filter cancellation records by order, buyer, status or time window).
* `POST /return_refund/202309/cancellations/{cancel_id}/approve` — Approve Cancellation (seller accepts a buyer-initiated cancel request).
* `POST /return_refund/202309/cancellations/{cancel_id}/reject` — Reject Cancellation (seller rejects a buyer-initiated cancel request with a structured reason).
* `GET /return_refund/202309/reject_reasons` — Get Reject Reasons (returns localised texts for valid reject reasons for a specific cancellation).

**Eligibility:**

* `GET /return_refund/202512/orders/{order_id}/aftersale_eligibility`:
   * Call before rendering `seller_im_order_cancellation_text_card` or `seller_im_chatbot_cancel_order`.
   * Pass `initiate_aftersale_user` as `SELLER` or `BUYER` and include `CANCEL` in `request_types`.
   * Use `sku_eligibility[].line_item_eligibility[].eligible` and `available_reason_names` to decide which line items can still be cancelled and which `cancel_reason` codes to expose in the card.
* `GET /return_refund/202601/decision_eligibility`:
   * Call with `return_or_cancel_id = cancel_id` and `check_decisions` including `APPROVE_REQUEST_CANCEL` and `REJECT_REQUEST_CANCEL` before showing Approve/Reject buttons on `seller_im_order_cancellation_notification_card` or `seller_im_chatbot_cancel_order_result`.
   * Use `decisions[].eligible`, `ineligible_reason` and `available_reject_reasons` to enable/disable actions and pre-populate reject-reason pickers.

**Action → State mapping:**
| **Action** | **API call** | **Next state label** |
| --- | --- | --- |
| Create seller-initiated cancellation | `POST /return_refund/202309/cancellations` | `CANCELLATION_REQUEST_PENDING` (or `CANCELLATION_REQUEST_SUCCESS` when processed immediately) |
| Approve buyer cancellation request | `POST /return_refund/202309/cancellations/{cancel_id}/approve` | `CANCELLATION_REQUEST_SUCCESS` |
| Reject buyer cancellation request | `POST /return_refund/202309/cancellations/{cancel_id}/reject` | `CANCELLATION_REQUEST_CANCEL` |
| Platform completes cancellation and refund | Webhook + `Search Cancellations` (no direct write API) | `CANCELLATION_REQUEST_COMPLETE` |
**Payload essentials:**

* For `Cancel Order` (`POST /return_refund/202309/cancellations`):
   * `order_id` (required TikTok Shop order id).
   * `skus[].sku_id`, `skus[].quantity` or `order_line_item_ids[]` for partial cancellation where supported.
   * `cancel_reason` (required; use a reason name from the Cancel reasons tables that matches the current order status).
   * Standard query envelope: `app_key`, `sign`, `timestamp`, `shop_cipher`.
   * Headers: `x-tts-access-token`, `content-type: application/json`.
* For Approve/Reject Cancellation:
   * `cancel_id` (path parameter).
   * For reject: `reject_reason` (from `Get Reject Reasons`), optional `comment`, optional `images[].image_id` with basic metadata.

**Operational notes:**

* Use `idempotency_key` on Cancel/Approve/Reject calls to deduplicate retries from card clicks or network errors.
* Map common errors into card-level messages:
   * `25001021 Reason not match order status` → update the card to tell the agent that this reason is no longer applicable for the current order status.
   * `25001045` / `25001051` → the order has already shipped or completed and cannot be cancelled; guide the agent to use a refund/return flow instead.
   * `25001011` → a cancellation or return is already in process; re-bind the existing case instead of creating a new one.
* Use `Search Cancellations` to drive in-chat timelines and to recover from missed Webhooks; filter by `cancel_status`, `cancel_types`, and time range.
* Explicit rate limits are not listed per endpoint; implement client-side throttling and exponential backoff, and rely on platform documentation for any global limits.

**Refund-only / Returnless refund journey**
**Overview**: Refund-only and returnless refund cards power fast monetary compensation flows without forcing the buyer to ship items back. Cards such as `seller_im_quick_refund_confirmation`, `seller_im_quick_refund_succeeded`, `seller_im_approve_refund_withdout_return`, and `seller_im_chatbot_aftersales_check_status` let agents offer full or partial refunds, optionally with `buyer_keep_item = true` for returnless refunds.
**Relevant APIs:**

* `POST /return_refund/202309/returns` — Create Return (use `return_type = REFUND` for refund-only cases, with optional `refund_total` and `currency`).
* `POST /return_refund/202309/refunds/calculate` — Calculate Refund (preview refundable amounts per order/line before showing them on the card).
* `POST /return_refund/202309/returns/{return_id}/approve` — Approve Return (set `decision = APPROVE_REFUND`, optionally `buyer_keep_item = true` and/or a `partial_refund` amount).
* `POST /return_refund/202309/returns/{return_id}/reject` — Reject Return (with `decision = REJECT_REFUND` when the refund-only request is invalid).
* `POST /return_refund/202309/returns/search` — Search Returns (list refund cases and their statuses for a shop or order).
* `GET /return_refund/202309/returns/{return_id}/records` — Get Return Records (timeline used to enrich `seller_im_chatbot_aftersales_check_status`).

**Eligibility:**

* `GET /return_refund/202512/orders/{order_id}/aftersale_eligibility`:
   * Call with `request_types` containing `REFUND` before displaying quick-refund options.
   * Use `sku_eligibility[].line_item_eligibility[].eligible` to restrict refund-only actions to eligible lines and to drive which SKUs can be preselected in the card.
* `GET /return_refund/202601/decision_eligibility`:
   * Call with `return_or_cancel_id = return_id` and `check_decisions` including `APPROVE_REFUND`, `DIRECT_REFUND`, `OFFER_PARTIAL_REFUND`, and `REJECT_REFUND` where supported.
   * Use the response to enable or disable buttons on `seller_im_quick_refund_confirmation` and to obtain `available_reject_reasons` when the agent chooses to decline.

**Action → State mapping:**
| **Action** | **API call** | **Next state label** |
| --- | --- | --- |
| Create refund-only request (full or partial) | `POST /return_refund/202309/returns` (`return_type = REFUND`) | `RETURN_OR_REFUND_REQUEST_PENDING` |
| Approve refund-only / returnless refund | `POST /return_refund/202309/returns/{return_id}/approve` (`decision = APPROVE_REFUND`, optional `buyer_keep_item`, `partial_refund`) | `RETURN_OR_REFUND_REQUEST_SUCCESS` |
| Platform completes refund payout | Webhook + `Search Returns` (no direct write API) | `RETURN_OR_REFUND_REQUEST_COMPLETE` |
| Reject refund-only request | `POST /return_refund/202309/returns/{return_id}/reject` (`decision = REJECT_REFUND`) | `REFUND_OR_RETURN_REQUEST_REJECT` |
**Payload essentials:**

* For `Calculate Refund`:
   * `order_id` (required), `request_type` (`REFUND` or `CANCEL`), `reason_name` (from Refund reasons),
   * `order_line_item_ids[]` and/or `skus[]` (each with `sku_id`, `quantity`) to scope the refund,
   * optional `shipment_type` and `handover_method` for scenarios that might later convert into a return & refund.
* For `Create Return` (refund-only):
   * `order_id`, `return_type = REFUND`, `return_reason` (reason name aligned with the Refund reasons tables),
   * optional `refund_total` and `currency` (must not exceed the calculated refundable amount),
   * `order_line_item_ids[]` and/or `skus[]` to support partial refunds.
* For `Approve Return` (refund-only):
   * `return_id`, `decision = APPROVE_REFUND`,
   * optional `buyer_keep_item` (true for returnless),
   * optional `partial_refund.currency` and `partial_refund.amount` for partial refunds.

**Operational notes:**

* Always call `Calculate Refund` before committing a quick-refund card, and show `refund_total`, `refund_shipping_fee`, `refund_tax` and other components transparently to the agent.
* If `Create Return` is called with `refund_total` greater than the platform-calculated refundable amount, the API returns `25005005`; surface this error in the card and re-sync the amount from `Calculate Refund`.
* Use `buyer_keep_item = true` only where your policy and TikTok Shop policy explicitly allow returnless refunds; cards like `seller_im_approve_refund_withdout_return` should clearly communicate that the buyer can keep the items.
* For partial refunds on multi-line orders, keep the mapping between `order_line_item_ids` / `skus` and UI rows so that `seller_im_quick_refund_succeeded` can highlight exactly which items were refunded.
* Handle common validation errors (`25001014`/`25001020` unknown or offline reason, `25005011` line items exceed limit) by disabling the confirm button and asking the agent to adjust the selection rather than repeatedly calling the API.

**Return & refund journey**
**Overview**: Return & refund cards handle the full physical return flow: seller review, buyer shipment, seller inspection and final refund. Cards like `seller_im_seller_approve_return_request_card`, `seller_im_seller_reject_return_request_card`, and `seller_im_chatbot_aftersales_check_status` keep both buyer and agent aligned with platform statuses such as `AWAITING_BUYER_SHIP`, `BUYER_SHIPPED_ITEM`, and `RETURN_OR_REFUND_REQUEST_COMPLETE`.
**Relevant APIs:**

* `POST /return_refund/202309/returns` — Create Return (use `return_type = RETURN_AND_REFUND` for standard returns with physical goods coming back).
* `POST /return_refund/202309/returns/{return_id}/approve` — Approve Return:
   * initial approval (`decision = APPROVE_RETURN`) moves the case to "awaiting buyer shipment";
   * later approval (`decision = APPROVE_RECEIVED_PACKAGE`) confirms the returned parcel and triggers refund.
* `POST /return_refund/202309/returns/{return_id}/reject` — Reject Return (with `decision = REJECT_RETURN` or `REJECT_RECEIVED_PACKAGE` depending on whether the seller is rejecting the request itself or the received parcel).
* `POST /return_refund/202309/returns/search` — Search Returns (primary source of return status, arbitration status, and seller next actions).
* `GET /return_refund/202309/returns/{return_id}/records` — Get Return Records (chronological event log used to enrich status-check cards).
* `GET /return_refund/202309/reject_reasons` — Get Reject Reasons (for returns).

**Eligibility:**

* `GET /return_refund/202512/orders/{order_id}/aftersale_eligibility`:
   * Call with `request_types` including `RETURN_AND_REFUND` before enabling "Return & refund" CTAs on cards.
   * Use per-SKU `eligible` flags and `available_reason_names` to control which lines can be returned and which return reasons to expose in `seller_im_seller_approve_return_request_card`.
* `GET /return_refund/202601/decision_eligibility`:
   * For an existing `return_id`, call with `return_or_cancel_id = return_id` and `check_decisions` including `APPROVE_RETURN`, `APPROVE_RECEIVED_PACKAGE`, `REJECT_RETURN`, and `REJECT_RECEIVED_PACKAGE`.
   * Use `decisions[].eligible` to decide whether to show or disable Approve/Reject buttons on the card for the current status, and `available_reject_reasons` to populate the reject-reason dropdown.

**Action → State mapping:**
| **Action** | **API call** | **Next state label** |
| --- | --- | --- |
| Create return & refund request | `POST /return_refund/202309/returns` (`return_type = RETURN_AND_REFUND`) | `RETURN_OR_REFUND_REQUEST_PENDING` |
| Approve return request (ask buyer to ship) | `POST /return_refund/202309/returns/{return_id}/approve` (`decision = APPROVE_RETURN`) | `AWAITING_BUYER_SHIP` |
| Buyer ships item and logistics update status | Logistics update → Webhook `RETURN_STATUS_CHANGED` or `Search Returns` | `BUYER_SHIPPED_ITEM` |
| Confirm goods received and pass inspection | `POST /return_refund/202309/returns/{return_id}/approve` (`decision = APPROVE_RECEIVED_PACKAGE`) | `RETURN_OR_REFUND_REQUEST_SUCCESS` |
| Platform completes refund payout | Webhook + `Search Returns` | `RETURN_OR_REFUND_REQUEST_COMPLETE` |
| Reject request or reject parcel after inspection | `POST /return_refund/202309/returns/{return_id}/reject` (`decision = REJECT_RETURN` or `REJECT_RECEIVED_PACKAGE`) | `REFUND_OR_RETURN_REQUEST_REJECT` or `REJECT_RECEIVE_PACKAGE` |
**Payload essentials:**

* For `Create Return` (return & refund):
   * `order_id` (required), `return_type = RETURN_AND_REFUND`,
   * `return_reason` (reason name from the Return reasons tables that matches order status and category),
   * `order_line_item_ids[]` and/or `skus[]` (`sku_id`, `quantity`) describing the items to be returned,
   * optional `refund_total` and `currency` (must be within the refundable amount for those lines),
   * `shipment_type` (`PLATFORM` or `BUYER_ARRANGE`) and, when `PLATFORM`, a `handover_method` (`DROP_OFF` or `PICKUP`).
* For `Approve Return` / `Reject Return`:
   * `return_id` (path parameter),
   * `decision` matching the current stage (`APPROVE_RETURN`, `APPROVE_RECEIVED_PACKAGE`, `REJECT_RETURN`, `REJECT_RECEIVED_PACKAGE`),
   * for approve: optional `buyer_keep_item` and `partial_refund` (for advanced flows such as partial refunds after inspection),
   * for reject: `reject_reason` (from `Get Reject Reasons`), optional `comment`, optional `images[]`.

**Operational notes:**

* Use `idempotency_key` on `Create Return`, `Approve Return`, and `Reject Return` to guard against duplicate clicks on `seller_im_seller_approve_return_request_card` or `seller_im_seller_reject_return_request_card`.
* Handle typical errors gracefully in the UI:
   * `25001010` / `25001011` indicate an existing or completed return; instead of failing the action silently, re-bind the card to the existing `return_id`.
   * `25005005` / `25005011` indicate invalid refund amounts or item quantities; refresh calculated amounts via `Calculate Refund`.
   * `25001014` / `25001020` indicate invalid or offline reasons; refresh the reason list from the reasons/eligibility APIs.
* Combine Webhooks (`RETURN_STATUS_CHANGED`) with `Search Returns` and `Get Return Records` to keep `seller_im_chatbot_aftersales_check_status` in sync with the authoritative platform state, including arbitration outcomes and parcel events.

**Logistics & address confirmations (proactive)**
Proactive logistics and address cards—`seller_im_proactive_confirm_address`, `seller_im_proactive_order_received`, and `seller_im_proactive_abnormal_logistics`—are primarily **notification surfaces**. Sending these cards should not by itself trigger order, return, or cancellation API calls: the backend treats them as read-only status or confirmation messages. Only when the buyer or agent clicks a deep link or CTA inside the card (for example, to edit the shipping address or open a return initiation page) should the ISV invoke the corresponding workflow APIs (address update, logistics claim, or aftersales initiation). This keeps proactive logistics messaging side-effect free while still allowing deep-link actions to start full post-sales flows when explicitly requested.
# Seller Workbench Display Guidance & Text Fallback
## Supported Message Types & Display Rules
Use the `content` / `data` / `plaintext` triad from the Message Types specification as the basis for rendering:

* `content`: minimal metadata used to identify the resource (order, product, coupon, package, etc.).
* `data`: rich business payload for building custom UI; only present when `need_data = true`.
* `plaintext`: pre-flattened text description for simple clients or fallback; only present when `need_plaintext = true`.

On the seller workbench, always prefer `data` for rich card rendering and keep `plaintext` as a fallback.

* **Text (`TEXT`)**
   * **Minimal fields**: `content.content` (plain text). Optionally `plaintext` for full text representation.
   * **Display**: Render as multi-line left-aligned text; support URL auto-linking; preserve line breaks and basic punctuation. Do not truncate by default; if truncation is needed, provide a "Show more" expansion.
   * **Accessibility**: Ensure sufficient color contrast and adjustable font size; expose the full text to screen readers.
* **Image / Emoji (`IMAGE` / emoticons)**
   * **Minimal fields**: `content.url`, `content.width`, `content.height`.
   * **Display**: Show a scaled thumbnail that preserves aspect ratio and fits the chat width; clicking the thumbnail should open a full-size preview. For emoji-style images, you may render them inline with text where appropriate.
   * **Accessibility**: If `plaintext` is present, use it as the alt text/accessible label. When the image fails to load, show a placeholder with the same alt text instead of an empty box.
* **Video (`VIDEO`)**
   * **Minimal fields**: `content.url` and `content.cover`; where available, also use `width`, `height`, `duration`.
   * **Display**: Show the cover image with a clear play icon. Do not auto-play in the conversation list; open a modal or side panel player on click. Indicate duration on the thumbnail when available.
   * **Accessibility**: Provide an accessible label such as "Video message" and read out the duration; ensure keyboard focus can reach the play button.
* **Order Card (`ORDER_CARD`)**
   * **Minimal fields**: `content.order_id`. For rich display, rely on `data.order_status`, `data.product_name`, `data.product_image`, `data.paid_price`, `data.quantity`, `data.order_link`.
   * **Display**: Render a compact card with product thumbnail, title, quantity, order status, and paid amount. The primary CTA should be **View order details**, using `data.order_link` or an internal deep link to the seller's order detail panel.
   * **Accessibility**: Make the entire card focusable as a single unit with a clear label (for example, "Order card – {product_name}, status {order_status}"). Ensure the CTA is reachable via keyboard.
* **Product Card (`PRODUCT_CARD`)**
   * **Minimal fields**: `content.product_id`. For UI, use `data.product_name`, `data.product_image`, `data.product_lowest_price`, `data.product_highest_price`, `data.sold_quantity`, `data.product_link`.
   * **Display**: Show product image, name, price range and key selling signals (for example, sold quantity). Primary CTA: **View product** (opens `product_link` or an internal product page). In proactive logistics flows, this can be used to suggest replacements or upsell items when deliveries are delayed.
   * **Accessibility**: Provide a label like "Product card – {product_name}, price from {product_lowest_price}"; ensure cards are navigable via keyboard.
* **Coupon Card (`COUPON_CARD`)**
   * **Minimal fields**: `content.coupon_id`. For UI, use `data.coupon_title`, `data.discount`, `data.threshold`, `data.scope`, `data.start_time`, `data.end_time`, `data.coupon_link`.
   * **Display**: Render discount amount or percentage prominently, with condition (threshold) and validity period. Primary CTA: **View coupon** or **Apply coupon**, driving to `coupon_link` or an in-app coupon panel.
   * **Accessibility**: Announce the discount, threshold and expiry in plain text so screen readers can convey the full offer.
* **Logistics Card (`LOGISTICS_CARD`)**
   * **Minimal fields**: `content.order_id`, `content.package_id`. For detailed UI, use `data.packages[*].product_name`, `product_image`, `quantity`, `tracking_number`, `shipping_provider_name`, `predict_delivery_time_*`, and `tracking` history.
   * **Display**: Summarise the key package in the card header (carrier, tracking number, latest status and timestamp), followed by product thumbnails and names. Primary CTA: **Track package**, opening a dedicated tracking view built from `data.tracking` or an external tracking link.
   * **Accessibility**: Ensure the latest status text (for example, "Out for delivery") is always present in text form and not only represented by icons or colors.
* **Proactive logistics & address cards (`seller_im_proactive_confirm_address`, `seller_im_proactive_order_received`, `seller_im_proactive_abnormal_logistics`)**
   * **Minimal fields**: Same structural backbone as `LOGISTICS_CARD` (order and package identifiers). Where present, also surface buyer shipping name, phone, and address summary for `seller_im_proactive_confirm_address`, and the latest logistics event for `seller_im_proactive_abnormal_logistics`.
   * **Display**:
      * Highlight the scenario in the card title (for example, "Confirm shipping address", "We have received your order", "Issue with your delivery").
      * Use a single primary CTA per card: **Confirm address**, **Track package**, or **Open support options**, which should deep link into the appropriate address-edit, tracking, or post-sales initiation flow.
      * Treat the card as read-only status/notification in the seller workbench; any state-changing actions must happen only after explicit user interaction with the CTA.
   * **Accessibility**: Provide explicit text descriptions of what the card is asking the buyer to do (confirm, review, or contact support) so that even in text-only or screen-reader scenarios the intent remains clear.

## Text Fallback Mechanism
Design the seller workbench to degrade gracefully when rich card rendering is not possible.

* **When to fallback**
   * The `type` is unknown or not yet supported by your UI capability matrix.
   * The `type` is known but the expected `data` structure is missing or fails validation.
   * Media assets (image/video URLs) cannot be loaded or have expired.
   * The platform rejects a card send or update because of rate limits, permission issues, or policy/moderation checks.
* **Fallback priority**
   1. **Card UI**: Render a full interactive card using `type` and `data` whenever possible.
   2. **Rich text view**: If you cannot support the card component for a given `type`, format `data` into a structured text block (for example, order summary, logistics status, coupon details) and show it as a non-interactive message, retaining key values.
   3. **Plain text view**: If `data` is unavailable or parsing fails, fall back to `plaintext` (when present) or construct a minimal text stub from `content` (for example, "Logistics update for order {order_id} – tracking number {tracking_number}").
* **Fields that must be preserved in any fallback**
   * Order identifiers: `order_id`, and if applicable `sku_id` or `order_line_item_ids`.
   * Logistics identifiers: `package_id` and/or `tracking_number`.
   * Primary deep-link URL(s): order detail link, tracking link, post-sales initiation link, address-edit link.
   * Human-readable status text (for example, "Awaiting shipment", "Out for delivery", "Delivery exception").
* **CTA phrasing in text mode**
   * Use clear, action-oriented text with explicit links, for example:
      * "View order details: {order_link}"
      * "Track package: {tracking_link}"
      * "Confirm shipping address: {address_link}"
      * "Open return / refund page: {aftersales_link}"
   * Avoid exposing raw query-string parameters or internal IDs in the visible text; keep technical details in logs, not in user-facing CTAs.

## Implementation Checklist

* **Server-side type detection**
   * Parse `type`, `content`, `data`, and `plaintext` for every message returned by the Customer Service APIs.
   * Maintain a mapping from message `type` (and, where relevant, specific card identifiers such as `seller_im_proactive_confirm_address`) to UI components and supported actions.
* **UI capability matrix**
   * Store a configuration describing, for each message type, whether the seller workbench supports full card rendering, card + actions, or text-only.
   * Use this matrix at render time to decide between native card, rich-text fallback, and plain-text fallback.
* **Safe text and HTML rendering**
   * Treat `plaintext` as untrusted text: escape HTML, do not execute scripts, and avoid injecting raw HTML from `data`.
   * Only allow a minimal set of formatting (line breaks, basic emphasis) in the seller workbench; avoid embedding iframes or third-party widgets inside cards.
* **Deep-link validation**
   * Whitelist domains for deep links (for example, TikTok Shop official domains and your own ISV domains).
   * Validate URL schemes before navigation; open links in a controlled webview or browser tab and handle errors gracefully (for example, show "Link unavailable" if the target cannot be reached).
* **Error surfaces and retries**
   * When an action triggered from a card (for example, "Confirm address", "Track package") fails, show an inline error state on the card and log the failure with the related `message_id`, `order_id` and API `request_id`.
   * Implement bounded retry with idempotency keys on server-side; never re-send the same action multiple times from the UI without clear feedback.
* **Audit logging and observability**
   * Log message ingestion, card renders, user interactions (clicks on CTAs), and downstream API calls in a way that can be correlated per conversation and order.
   * Capture enough context (message `type`, identifiers, status transitions) to reconstruct what the seller and buyer saw in the workbench during incident investigations.
* **Accessibility and internationalization**
   * Ensure all card actions can be operated via keyboard and are announced to screen readers.
   * Do not encode business-critical information only in images or colors; always include a textual status line.
   * Design layouts that can accommodate localized strings of different lengths without truncating key information.

# API Solution Design
## Solution Description
This solution centers on the powerful combination of the TikTok Shop **Customer Service API** and the **Return/Refund/Cancel API**. It orchestrates the entire post-sales lifecycle through interactive message cards sent within a conversation.
The core architectural principles are:

* **Presentation Layer (Message Cards)**: All post-sales actions and status displays are rendered as structured, interactive message cards within the chat conversation. This replaces unstructured text communication, reducing ambiguity and improving efficiency. The design of these cards is derived from the `Message Types` documentation.
* **Action Layer (Customer Service & Post-Sales APIs)**: Agent actions on a message card (e.g., clicking "Approve Refund") are mapped directly to specific API calls. The `Send Message` API is used to deliver the cards, while the `Return/Refund/Cancel` APIs are used to execute the business logic.
* **State Management Layer (Webhooks & API Polling)**: The system relies primarily on Webhook events (e.g., `RETURN_STATUS_CHANGED`, `CANCELLATION_STATUS_CHANGED`) for real-time status synchronization. This is supplemented by a polling mechanism (e.g., `Search Returns` API) for data reconciliation and to handle any potential Webhook delivery failures.
* **Validation & Eligibility Layer**: Before presenting an action to an agent, the system uses eligibility APIs (e.g., `Get Aftersale Eligibility`) to ensure the requested action is valid for the current state of the order or return, preventing errors and providing a guided agent experience.

This design creates a closed-loop system where agents can confidently manage complex post-sales workflows without ever leaving their customer service dashboard.


## Post-Sales Process Overview
The diagrams below illustrate the three primary post-sales workflows that can be managed via message cards:

* **Cancel**: Occurs before an order is shipped. It is the simplest flow, typically requiring a single approval step.
* **Refund Only**: Used when a buyer does not need to return the item (e.g., the product was not received or is severely damaged). The core of this process is the seller's decision to approve or reject the refund.
* **Return & Refund**: The most complex flow, involving the physical return of goods. It includes multiple stages: seller approval, buyer shipment, seller receipt and inspection, and finally, the platform refund.


![Image](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/e7d2249422a1448ebd397407b93a1dd6~tplv-k9wyc2ijk0-image.image)
![Image](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/42ff652cb5c64ab7980e0fe5cf10f576~tplv-k9wyc2ijk0-image.image)
![Image](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/193dae825e6b4289831877e6e45cc712~tplv-k9wyc2ijk0-image.image)
Each step in these flows can be represented by a message card update or a new system message, keeping both buyer and seller informed.

![Image](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/a8f8b60b2da94e42b79b4605ebb49f0a~tplv-k9wyc2ijk0-image.image)

This sequence diagram details the interactions for a typical **Return & Refund** process initiated and managed via message cards:

1. **Card-based Initiation**: The agent sends a `RETURN_REFUND_CARD` to the buyer. The buyer fills it out and submits.
2. **API Action**: The ISV app receives the card submission and calls the `Create Return` API.
3. **Seller Decision via Card**: The agent receives a new card or an updated view showing the pending request. The agent clicks "Approve," triggering the `Approve Return` API call.
4. **Webhook-driven State Sync**: TikTok Shop platform processes the approval and sends a `RETURN_STATUS_CHANGED` Webhook. The ISV app consumes this event to update its internal state and refresh the UI (e.g., updating the card to show "Awaiting Buyer Shipment").
5. **Process Completion**: Subsequent steps, like the seller confirming receipt of the returned item, follow the same pattern of API calls and Webhook-driven updates until the final "Refund Completed" status is reached.

This sequence highlights the reactive nature of the integration, where the system responds to events and API calls to guide the workflow forward.
# Card Taxonomy for Post-Sales Actions
A clear and consistent card taxonomy is essential for building an intuitive agent experience. The following cards, derived from the official `Message Types` documentation, are fundamental for post-sales workflows.
| **Card Type** | **Purpose** | **Key** **`content` Fields** | **Key** **`data` Fields (for UI rendering)** |
| --- | --- | --- | --- |
| **RETURN_REFUND_CARD** | Initiate or display the status of a return or refund request. This is the primary card for post-sales actions. | `order_id`, `sku_id` | `product_name`, `product_image`, `paid_price`, `quantity`, `return_status`, `return_reason`, `refund_amount` |
| **ORDER_CARD** | Provide context about the original order related to the post-sales request. | `order_id` | `order_status`, `product_name`, `quantity`, `paid_price`, `order_link` |
| **LOGISTICS_CARD** | Display return shipping information, including tracking numbers and status updates. | `order_id`, `package_id` | `tracking_number`, `shipping_provider_name`, `tracking` (history), `delivery_option` |
| **PRODUCT_CARD** | Share alternative products or replacements with the buyer. | `product_id` | `product_name`, `product_image`, `product_highest_price`, `product_link` |
| **TEXT**, **IMAGE**, **VIDEO** | Used for supplementary communication, such as sending instructions, requesting more evidence from the buyer, or confirming actions. | `content` (text) or `url` (media) | N/A |
## Payload and Validation
When sending a card using the `POST /customer_service/202309/conversations/{conversation_id}/messages` endpoint, the `body` must be structured correctly.
**Example: Sending a** **`RETURN_REFUND_CARD`**
```JSON
{
  "type": "RETURN_REFUND_CARD",
  "content": "{\\"order_id\\":\\"580874485811283206\\",\\"sku_id\\":\\"7494560109732363423\\"}"
}
```

**Validation Rules:**

* The `content` field must be a JSON serialized string.
* For `RETURN_REFUND_CARD`, both `order_id` and `sku_id` are required to identify the specific item in the after-sales process.
* Before sending a `RETURN_REFUND_CARD`, it is best practice to first call the `GET /return_refund/.../aftersale_eligibility` endpoint to ensure the order/item is eligible for a return or refund. This prevents sending an action card that cannot be fulfilled.

# Action Mapping and Status Orchestration
## API Endpoint Mapping
The following table maps key agent actions within the post-sales workflow to their corresponding API endpoints.
| **Agent Action** | **HTTP Method & Endpoint** | **Key Parameters** | **Notes & Security** |
| --- | --- | --- | --- |
| **Check Eligibility** | `GET /return_refund/202512/orders/{order_id}/aftersale_eligibility` | `request_types` (e.g., REFUND, CANCEL) | Use this pre-emptively to only show valid action buttons to the agent. |
| **Approve Request** | `POST /return_refund/202309/returns/{return_id}/approve` | `decision` (e.g., APPROVE_RETURN, APPROVE_REFUND) | Requires `seller.return_refund.basic` scope. Use an `Idempotency-Key` to prevent duplicate approvals. |
| **Reject Request** | `POST /return_refund/202309/returns/{return_id}/reject` | `decision`, `reject_reason`, `comment` | The `reject_reason` should be chosen from a list retrieved via the `GET /return_refund/202309/reject_reasons` API. |
| **Confirm Goods Received** | `POST /return_refund/202309/returns/{return_id}/approve` | `decision` (APPROVE_RECEIVED_PACKAGE) | Triggers the final refund process by the platform. This action is irreversible. |
| **Cancel Order** | `POST /return_refund/202309/cancellations` | `order_id`, `cancel_reason` | For seller-initiated cancellations. Check eligibility first. Use `order_line_item_ids` for partial cancellations. |
| **Approve Cancellation** | `POST /return_refund/202309/cancellations/{cancel_id}/approve` | `cancel_id` | Approves a cancellation request initiated by the buyer. |
## State Machine and Card Updates (Return & Refund)
The status of a return dictates the available actions and how the message card should be displayed.
| Current Status | Allowed Agent Actions | Next Status (on Success) | Card Update Strategy |
| --- | --- | --- | --- |
| `RETURN_OR_REFUND_REQUEST_PENDING` | Approve Return, Approve Refund (No Return), Reject | `AWAITING_BUYER_SHIP`, `REQUEST_SUCCESS`, `REQUEST_REJECTED` | Update card with action buttons. After action, disable buttons and show "Processing...". On Webhook confirmation, update status text. |
| `AWAITING_BUYER_SHIP` | (Read-only for agent) | `BUYER_SHIPPED_ITEM` | Display status and return shipping address/label. Listen for Webhook. |
| `BUYER_SHIPPED_ITEM` | Confirm Goods Received, Reject Goods | `REQUEST_SUCCESS`, `RECEIVE_REJECTED` | Update card with new action buttons. On Webhook confirmation, update to "Refund Processing". |
| `REQUEST_SUCCESS` | (Read-only for agent) | `RETURN_OR_REFUND_REQUEST_COMPLETE` | Display status "Refund Processing". On final Webhook, update to "Refund Completed". |
| `REQUEST_REJECTED` | (Read-only for agent) | N/A | Display final status "Request Rejected" and the reason provided. |
| `RETURN_OR_REFUND_REQUEST_COMPLETE` | (Read-only for agent) | N/A | Display final status "Completed". |
**Webhook vs. Polling**: Always prioritize Webhook integration for real-time status updates. Use API polling (`Search Returns`, `Search Cancellations`) as a fallback mechanism to periodically reconcile statuses and recover from any missed events. A combination of both ensures a robust and responsive system.

# Implementation Guide and Test Cases
## Step-by-Step Integration Flow

1. **Authentication & Authorization**:
   * Guide merchants to authorize your application, ensuring you request the `seller.return_refund.basic` and `seller.customer_service` scopes.
   * Securely store the `access-token` and `shop_cipher` for each merchant.
2. **Webhook Subscription**:
   * In your app settings on the TikTok Shop Partner Center, subscribe to the `RETURN_STATUS_CHANGED` and `CANCELLATION_STATUS_CHANGED` events.
   * Implement a public endpoint in your backend to receive and validate these Webhook POST requests.
3. **Build the Card Sending Logic**:
   * Integrate with the `POST /customer_service/202309/conversations/{conversation_id}/messages` endpoint.
   * Create a service that constructs the JSON `content` string for each card type (e.g., `ORDER_CARD`, `RETURN_REFUND_CARD`).
4. **Develop the Action Handler**:
   * Create a backend service that maps incoming requests from your UI (e.g., an agent clicking "Approve") to the correct Post-Sales API endpoint (e.g., `Approve Return`).
   * This service should handle parameter construction, API signing, and error handling. Remember to implement `Idempotency-Key` for all write operations.
5. **Design the Conversation UI**:
   * Within your agent chat interface, create a mechanism to render the message cards based on the message `type` and `data` fields.
   * Actionable elements (buttons) on the card should trigger calls to your backend action handler.
6. **Implement State Synchronization**:
   * Your Webhook endpoint should parse incoming events and update your local database with the new status of the return or cancellation.
   * Use a real-time communication channel (e.g., WebSockets) to push these updates to the relevant agent's UI, ensuring the card and status information are always current.
7. **Logging and Auditing**:
   * Log every API call, its parameters, the response, and any associated `request_id`.
   * Log every incoming Webhook event. This is crucial for debugging and auditing the entire post-sales workflow.

## Sample Payloads
**Sending an Order Card:**
```JSON
// POST /customer_service/202309/conversations/{conv_id}/messages
{
  "type": "ORDER_CARD",
  "content": "{\\"order_id\\":\\"576473917261320779\\"}"
}
```

**Approving a Return Request:**
```JSON
// POST /return_refund/202309/returns/4035319218955782461/approve
{
  "decision": "APPROVE_RETURN",
  "buyer_keep_item": false
}
```

## End-to-End Test Cases
**Test Case 1: Full Refund (Item Not Received)**

* **Preconditions**: Order is `IN_TRANSIT`. Buyer contacts support.
* **Steps**:
   1. Agent sends an `ORDER_CARD` to confirm the order.
   1. Agent verifies the issue and decides to refund.
   1. Agent initiates a `REFUND` using the `Create Return` API.
   1. Agent immediately approves it using the `Approve Return` API with `decision: APPROVE_REFUND`.
* **Expected Result**: Return status moves to `REQUEST_SUCCESS`. A Webhook is received. The card in the chat updates to "Refund Processing".

**Test Case 2: Standard Return & Refund**

* **Preconditions**: Order is `DELIVERED`. Buyer wants to return an item.
* **Steps**:
   1. Agent sends a `RETURN_REFUND_CARD`. Buyer fills and submits.
   1. Agent clicks "Approve" on the card, calling `Approve Return` (`decision: APPROVE_RETURN`).
   1. (Simulate) Buyer ships the item. A `BUYER_SHIPPED_ITEM` Webhook arrives.
   1. Agent clicks "Confirm Receipt", calling `Approve Return` (`decision: APPROVE_RECEIVED_PACKAGE`).
* **Expected Result**: Status progresses from `PENDING` -> `AWAITING_BUYER_SHIP` -> `BUYER_SHIPPED_ITEM` -> `REQUEST_SUCCESS`. Each status change is reflected in the UI.


**Test Case 3: Reject Invalid Return Request**

* **Preconditions**: Order is `DELIVERED` for 30 days. Buyer requests a return for a non-quality reason.
* **Steps**:
   1. Agent checks eligibility and finds the return window is closed.
   1. Agent sends a `TEXT` message explaining the policy.
   1. If the buyer insists and creates a request, the agent clicks "Reject" on the card.
   1. Agent selects a reason (e.g., "Exceeded return window") and adds a comment.
* **Expected Result**: `Reject Return` API is called. Status moves to `REQUEST_REJECTED`. The card is updated to a final, non-actionable state.

**Test Case 4: Seller-initiated Partial Cancellation**

* **Preconditions**: Order is `AWAITING_SHIPMENT`. One item is out of stock.
* **Steps**:
   1. Agent informs the buyer via a `TEXT` message. Buyer agrees to cancel the item.
   1. Agent uses a UI feature that calls the `Cancel Order` API, specifying the `order_line_item_ids` of the out-of-stock item.
* **Expected Result**: A cancellation record is created. A `CANCELLATION_STATUS_CHANGED` Webhook is received. The `ORDER_CARD` in the chat is updated to show one item as "Cancelled".
