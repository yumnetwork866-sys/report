---
title: "Fulfillment API overview"
document_id: 650b2044f1fd3102b93c9178
document_path: fulfillment-api-overview
is_api_doc: true
updated_at: 2026-08-26 09:13:55 UTC
source: https://partner.tiktokshop.com/docv2/page/fulfillment-api-overview
---
# Context
The Fulfillment API allows sellers to fulfill TikTok Shop orders.
TikTok Shop offers two types of fulfillment types:

1. Fulfilled by TikTok (FULFILLMENT_BY_TIKTOK): TikTok will automatically process the order on behalf of the seller. The seller does not need to manage the fulfillment process.
2. Fulfilled by Seller (FULFILLMENT_BY_SELLER): Under this Fulfillment Type, there are two shipping types:

a) TikTok shipping (TIKTOK): Sometimes also referred to as "platform shipping" or "shipped via platform." With this shipping type, the seller purchases shipping labels through TikTok Shop, and schedules a pick-up from a TikTok Shop carrier, or drops off parcels at the TikTok Shop carriers' drop-off locations. The seller can obtain the shipping type from [Get Order Detail](https://partner.tiktokshop.com/docv2/page/650aa8ccc16ffe02b8f167a0) or [Get Order List](https://partner.tiktokshop.com/docv2/page/650aa8094a0bb702c06df242).
b) Seller shipping (SELLER): Sometimes also referred to as "shipped via seller." The seller manages shipping through their own channel(s). With this shipping type, the sellers call the Fulfillment API to provide shipping details back to TikTok Shop. The seller can obtain shipping type from [Get Order Detail](https://partner.tiktokshop.com/docv2/page/650aa8ccc16ffe02b8f167a0) or [Get Order List](https://partner.tiktokshop.com/docv2/page/650aa8094a0bb702c06df242).
The Fulfillment API also offers both split-package and consolidated-package (sometimes also referred to as combined package) shipment options to support more flexible shipping needs. The seller can obtain fulfillment type from [Get Order Detail](https://partner.tiktokshop.com/docv2/page/650aa8ccc16ffe02b8f167a0) or [Get Order List](https://partner.tiktokshop.com/docv2/page/650aa8094a0bb702c06df242).
# API Overview
## TikTok shipping
With platform shipping, depending on the specific market, the seller may arrange shipment by either purchasing shipping labels from TikTok, or scheduling parcel handover with TikTok carriers.
### Purchase shipping (US ,UK, EMEA and JP）

![Image](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/ee9e1ae6578e47028d0c0606aaff3883~tplv-k9wyc2ijk0-image.image)


### Schedule shipping (SEA and LATAM）

![Image](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/5a146a17252244d89f7343fb26b44e8d~tplv-k9wyc2ijk0-image.image)


**Purchase shipping from TikTok (US ,UK, EMEA and JP)**
The seller can purchase labels from TikTok based on the dimensions and weight of the package, as required.

1. Use the [Get Eligible Shipping Service](https://partner.tiktokshop.com/docv2/page/650aa6b2bace3e02b75dda4e?external_id=650aa6b2bace3e02b75dda4e) API to retrieve available shipping service(US and JP);
2. Use the [Create Package](https://partner.tiktokshop.com/docv2/page/650aa132bace3e02b75d40d8?external_id=650aa132bace3e02b75d40d8) API to purchase shipping services, and create the shipping label.
3. Use the [Get Package Shipping Document](https://partner.tiktokshop.com/docv2/page/650aa5fac16ffe02b8f112ca?external_id=650aa5fac16ffe02b8f112ca) API to retrieve the shipping label.

**Note:**
Before calling the [Create Package](https://partner.tiktokshop.com/docv2/page/650aa132bace3e02b75d40d8?external_id=650aa132bace3e02b75d40d8#Back%20To%20Top) API, please ensure that the order has not been canceled and there is no cancellation request pending the seller's approval.

1. Within the remorse period (1 hour after order payment), the buyer may cancel the order without requiring the seller's approval.
2. After the remorse period, the buyer may request the order to be canceled, pending the seller's approval.

Please ensure that after calling the [Create Package](https://partner.tiktokshop.com/docv2/page/650aa132bace3e02b75d40d8?external_id=650aa132bace3e02b75d40d8#Back%20To%20Top) API to successfully complete the label purchase, then use the [Get Package Shipping Document](https://partner.tiktokshop.com/docv2/page/650aa5fac16ffe02b8f112ca?external_id=650aa5fac16ffe02b8f112ca) API to obtain the shipping label.
The UK market can also use [Ship Package](https://partner.tiktokshop.com/docv2/page/650aa4f1defece02be6e7cb1?external_id=650aa4f1defece02be6e7cb1) API when parcel dimensions are not available

**Schedule shipping from TikTok (SEA,** **LATAM)**
The seller may schedule the package handover time and method with the shipping provider.

1. Use the [Ship Package](https://partner.tiktokshop.com/docv2/page/650aa4f1defece02be6e7cb1?external_id=650aa4f1defece02be6e7cb1) API to schedule the package handover time and method.
2. Use the [Get Package Shipping Document](https://partner.tiktokshop.com/docv2/page/650aa5fac16ffe02b8f112ca?external_id=650aa5fac16ffe02b8f112ca) API to get the shipping label.

**Note:**
Before calling the [Ship Package](https://partner.tiktokshop.com/docv2/page/650aa4f1defece02be6e7cb1) API to ship the package, please ensure that the order has not been canceled or there is a cancellation request pending for response.

1. Within the remorse period (1 hour after order payment), the buyer may cancel the order without requiring the seller's approval.
2. After the remorse period, the buyer may request the order to be cancelled, pending the seller's approval.
3. Specific to the **BR** market, the seller must upload an invoice document prior to shipping. Please use the [POST Upload Invoice](https://partner.tiktokshop.com/docv2/page/67b542559a140004b343984f?external_id=67b542559a140004b343984f#Back%20To%20Top) endpoint.After obtaining the information of successful invoice upload through webhook [invoice status change], you can ship the package.

Please ensure that after calling the [Ship Package](https://partner.tiktokshop.com/docv2/page/650aa4f1defece02be6e7cb1) API to schedule shipment successfully, then use the [Get Package Shipping Document](https://partner.tiktokshop.com/docv2/page/650aa5fac16ffe02b8f112ca?external_id=650aa5fac16ffe02b8f112ca) API to obtain the shipping label.

## Seller shipping
With seller shipping, the seller arranges the shipment directly with shipping carriers, and uploads the shipment tracking number to notify TikTok that the package has been shipped.

![Image](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/4a56b2fa1505407488165cc0a6e74301~tplv-k9wyc2ijk0-image.image)



**Flow for the US and EMEA markets:**

1. The seller ships the package and obtains the shipment tracking number from the shipping carrier.
2. Use the [Get Shipping Providers](https://partner.tiktokshop.com/docv2/page/650aa48d4a0bb702c06d85cd?external_id=650aa48d4a0bb702c06d85cd) endpoint to retrieve the shipping service provider IDs supported by TikTok Shop via delivery_option_id (sellers can get the delivery_option_id in Get Order Detail API / Get Order List API).
3. Use the [Mark Package As Shipped](https://partner.tiktokshop.com/docv2/page/6503c95456e2bb0289ee4e81?external_id=6503c95456e2bb0289ee4e81) endpoint to upload the shipment tracking number and shipping provider ID.

**Flow for the SEA and LATAM markets:**

1. The seller ships the package and obtains the shipment tracking number from the shipping carrier.
2. Use the [Get Shipping Providers](https://partner.tiktokshop.com/docv2/page/650aa48d4a0bb702c06d85cd?external_id=650aa48d4a0bb702c06d85cd) endpoint to retrieve the shipping service provider IDs supported by TikTok Shop via delivery_option_id (sellers can get the delivery_option_id in Get Order Detail API / Get Order List API).
3. Use the [Ship Package](https://partner.tiktokshop.com/docv2/page/650aa4f1defece02be6e7cb1) endpoint to upload the shipment tracking number and shipping provider ID.

**Note:**
Before calling the [Mark Package As Shipped](https://partner.tiktokshop.com/docv2/page/6503c95456e2bb0289ee4e81?external_id=6503c95456e2bb0289ee4e81)/[Ship Package](https://partner.tiktokshop.com/docv2/page/650aa4f1defece02be6e7cb1) API to ship the package, please ensure that the order has not been canceled or there is a cancellation request pending for response.

1. Within the remorse period (1 hour after order payment), the buyer may cancel the order without requiring the seller's approval.
2. After the remorse period, the buyer may request the order to be cancelled, pending the seller's approval.

To ensure the buyers' shopping and service experience, TikTok measures the shipping service level using shipment tracking information based on the tracking number. When TikTok fails to validate the tracking number, or the shipment handling time exceeds TikTok's service level agreement, TikTok may cancel the order and refund the buyer. To prevent the order from being canceled by TikTok, please verify the shipping provider is supported by TikTok.
## Split order fulfillment

![Image](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/3f8d829ae6814f53ab0580a551a5fe80~tplv-k9wyc2ijk0-image.image)

## Consolidated order fulfillment
### Pre-shipping consolidation (SEA and LATAM)

1. Call [Search Combinable Packages](https://partner.tiktokshop.com/docv2/page/650aa481bace3e02b75d9e32?external_id=650aa481bace3e02b75d9e32) API to get the order, which can be consolidated order.
2. Call [Combine Package](https://partner.tiktokshop.com/docv2/page/650aa99adefece02be6f07c9?external_id=650aa99adefece02be6f07c9) API to confirm the order consolidated.
3. (optional): If you would like to remove the order, which has already been consolidated. Please use [Uncombine Packages](https://partner.tiktokshop.com/docv2/page/650aa960f1fd3102b92ceb0e?external_id=650aa960f1fd3102b92ceb0e) API to remove the specific order.
4. Call [Ship Package](https://partner.tiktokshop.com/docv2/page/650aa4f1defece02be6e7cb1) API to Ship the package.

### In-shipping consolidation

1. The seller consolidates orders, and ships the packages using their existing shipping process.
2. For 4PL orders（US ,UK and JP）：Call the Create Packages API to consolidate when they are shipping.
3. For 3PL orders（US ,EMEA and JP）：Call the [Mark Package As Shipped](https://partner.tiktokshop.com/docv2/page/6503c95456e2bb0289ee4e81?external_id=6503c95456e2bb0289ee4e81) API to upload the tracking number for each order that has been consolidated.

# TikTok Shop marketplace policies
## Split order fulfillment policy

For SEA market, an order cannot be split below the order line level (also referred to as the SKU level). For instance, if the buyer purchases two pairs of jeans and one shirt, both pairs of jeans must be shipped in the same package, while the shirt can be split into a separate package.

For US, EMEA,LATAM,and JP，No restriction. All items in the order can be split into different packages arbitrarily.
## Consolidate order fulfillment policy


1. All orders using the same tracking number for shipment must have the same recipient's name and shipping address.
2. A single tracking number can be used to ship a maximum of 20 orders for consolidated shipment.


## Tracking number verification policy
If the seller uses seller shipping mode, TikTok will verify the tracking number.

1. The shipping service provider used by merchants must be supported by TikTok. Please use the [Get Shipping Providers](https://partner.tiktokshop.com/docv2/page/650aa48d4a0bb702c06d85cd?external_id=650aa48d4a0bb702c06d85cd) API to retrieve the available shipping providers.
2. TikTok will verify if the tracking number matches the selected shipping service provider. If the tracking number is not verified by the chosen shipping provider, an error will be returned.

# Frequently asked questions

1. Can I use shipping service providers outside of the platform's list?
   * No. It will make TikTok unable to obtain shipment tracking information. If TikTok cannot obtain the shipment tracking information within the time specified in cancel_sla_time, the order may be canceled by TikTok.
2. Do I need to handle shipping operations for orders with 'FULFILL_BY_TIKTOK'?
   * No. TikTok will fulfill the order.
3. Can I obtain shipping labels from TikTok at any time?
   * No. A shipping label is only available after shipping has been arranged for a package, and before the package is handed over to the carrier.
4. If I have already handed over the package to the shipping service provider, but the order status on the platform has not progressed to 'IN_TRANSIT', what should I do?
   * First, you need to confirm that the shipping service provider you are using is supported by the platform. If it is confirmed to be supported, please get in touch with the shipping service provider to ensure that the package has been scanned into their system. If you have already tracked the tracking information on the official logistics website but the platform still does not show any tracking details, please contact TikTok for assistance.
