---
title: "UK & EU: Purchase shipping labels from TikTok"
document_id: 68c05c31d1e63d0498de5a62
document_path: i83mvdfg
is_api_doc: true
updated_at: 2025-10-08 17:30:39 UTC
source: https://partner.tiktokshop.com/docv2/page/i83mvdfg
---
# Overview
This document outlines the 4PL operational workflow within the TikTok Shop (TTS) ecosystem for the **UK** and **EU** markets. It covers key API integrations, platform logic, and the full order lifecycle: from order creation to parcel dispatch.

**TikTok Shipping**—also known as "platform shipping" or "shipped via platform"—allows sellers to purchase shipping labels directly through TikTok Shop. Sellers can either schedule a pickup with a TikTok Shop carrier, or drop off parcels at designated carrier locations.

Please see the flow below:
![Image](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/0ef6ee015538413e85cd5046a00ece0e~tplv-k9wyc2ijk0-image.image)

---


## Key considerations for 4PL flows:
– Shipping options are configured in Seller Center - these do not get surfaced at the ISV level
– The carrier is assigned during order creation by TTS
– Package dimensions and weight are already known to TTS via product upload.

No need to call `Get Eligible Shipping Service` or `Create Package`.

**Required API Flow:**

1. [Get Order Detail](https://partner.tiktokshop.com/docv2/page/get-order-detail-202507)
   **→** Returns package ID.
2. [Ship Package](https://partner.tiktokshop.com/docv2/page/ship-package-202309)
   **→** Use the package ID to call this API. 
      – Set to **TikTok Shipping**
      – Pickup time fields are optional.



3. [Get Package Shipping Document](https://partner.tiktokshop.com/docv2/page/get-package-shipping-document-202309)
   **→** Retrieve the label.


---


**For ISVs creating new products:**
If sellers need to verify the warehouse delivery configuration *before* uploading a product, they can call **Get Warehouse Delivery Options**. This allows them to retrieve the relevant shipping settings in advance, ensuring that the product is uploaded with the correct delivery configuration.
## API Endpoint Documentation 
Please review the Fulfillment APIs. Provided is a list of useful ones in this scenario:
| **Endpoint** | **Description** |
| --- | --- |
| [Get Order Detail](https://partner.tiktokshop.com/docv2/page/650aa8ccc16ffe02b8f167a0?external_id=650aa8ccc16ffe02b8f167a0) | Returns a list of orders created or updated during the timeframe indicated by the specified parameters. You can also apply a range of filtering criteria to narrow the list of orders returned, such as order status, delivery option type, and buyer user ID. |
| [Fulfilment API Overview ](https://partner.tiktokshop.com/docv2/page/650b2044f1fd3102b93c9178) | The Fulfillment API allows sellers to fulfill TikTok Shop orders. |
| [Ship Package](https://partner.tiktokshop.com/docv2/page/650aa4f1defece02be6e7cb1?external_id=650aa4f1defece02be6e7cb1) <br>  | Use this API to ship a package. Two shipping options are available: **TikTok Shipping** and **Seller Shipping**. For **4PL orders**, this must be set to **'TikTok Shipping'**.  <br>  <br> Shipping options are configured in **Seller Center** and saved as part of the **warehouse delivery settings**. These settings determine which shipping method is used.  <br>  <br> While the API accepts a shipping method parameter, it cannot override what's already configured — it simply reflects the warehouse’s setup. So although it looks like you can choose via the API, **you** **cannot**.  <br>  <br> ERPs should always pass **'TikTok Shipping'** for 4PL orders and should not attempt to change the shipping option using the API. |
| [Get Warehouse Delivery Options](https://partner.tiktokshop.com/docv2/page/get-warehouse-delivery-options-202309) <br>  | Use this API to retrieve the **shipping configuration** assigned to a warehouse — specifically, whether it's set up for **TikTok Shipping** or **Seller Shipping**.  <br>  <br> These settings are managed in **Seller Center** and cannot be changed via API. However, ERPs can use this API to check the current delivery setup **before uploading a product**, so that the product’s shipping settings align with the warehouse configuration.  <br>  <br> This ensures that new product uploads reflect the correct shipping method and prevents mismatches or shipping errors later in the order flow. |
| [Get Package Shipping Document ](https://partner.tiktokshop.com/docv2/page/650aa5fac16ffe02b8f112ca?external_id=650aa5fac16ffe02b8f112ca) | For orders shipped by TikTok Shop, this API retrieves the URL of shipping documents (shipping label and packing slip) for a package specified by the package ID. This API is only applicable to "TikTok Shipping" orders. To obtain the shipping documents URL via this API, first call "Ship Package" to ship the corresponding package. |
| [Get Tracking](https://partner.tiktokshop.com/docv2/page/650aa630c16ffe02b8f11803?external_id=650aa630c16ffe02b8f11803) | This API can use the order number to obtain the corresponding logistics tracking information. |
# Switching from 3PL to 4PL
| **Steps** | **Instructions** |
| --- | --- |
| Step 1 | Ensure your warehouse address is correct by clicking on your Profile (top right) > My Account > Account Settings > [Warehouse settings](https://seller-uk.tiktok.com/profile/account-setting/warehouse). |
| Step 2 | Go to **Seller Center** > Orders > [Shipping Settings](https://seller-uk.tiktok.com/logistics/delivery). Select **Shipped via Platform** and set it as **preferred logistics option**. |
| Step 3 | Go to the [Fulfillment Setting](https://seller-uk.tiktok.com/order/fulfill-policy) page, select Collection method settings, and select Drop-off or Pick-up as your parcel handover method. |
| Step 4 | Follow our [step-by-step guide on how to print labels and dispatch your orders](https://seller-uk.tiktok.com/university/essay?knowledge_id=3148241730815745&default_language=en-GB&identity=1). |
## Notes
Platform shipping, with access to exclusive shipping subsidies only available for eligible orders fulfilled or shipped by the platform. 
Courier options for the **UK**:
| **Courier** | **Dropoff** | **Pickup** | **Cost to Seller** | **Notes** |
| --- | --- | --- | --- | --- |
| Evri (Default) | ✅ | ✅ | Included (no additional cost) | Default Option |
| Amazon (CBT) | ❌ | ✅ | Included (no additional cost) | Seller Must Apply |
| DPD <br>  | ❌ | ✅ | £0.99 per parcel (excl. VAT) payable by seller | Seller Must Opt in |

Courier options for the **EU**:
| **Country** | **LSP** | **Dropoff** | **Pickup** | **Cost to Seller** | **Notes** |
| --- | --- | --- | --- | --- | --- |
| ES <br>  | Correos | ✅ (default) | ✅ | Included (no additional cost) | Default dropoff |
|  | GLS | ❌ | ✅ | Included (no additional cost) | Default pickup |
|  | SEUR | ❌ | ✅ | Included (no additional cost) | Managed by platform |
|  | CTT | ❌ | ✅ | Included (no additional cost) | Managed by platform |
| IT | BRT | ✅ (default) | ✅ | Included (no additional cost) | Default |
|  | GLS | ❌ | ✅ | Included (no additional cost) | Managed by platform |
| FR | Colis Prive | ✅ | ✅ | Included (no additional cost) | Managed by platform |
|  | GLS | ❌ | ✅ | Included (no additional cost) | Managed by platform |
|  | Inpost | ✅ | ✅ | Included (no additional cost) | Default |
|  | Cainiao | ❌ | ✅ | Included (no additional cost) | Managed by platform |
| DE | GLS | ❌ | ✅ | Included (no additional cost) |  |
|  | Hermes | ❌ | ✅ | Included (no additional cost) |  |
|  | DPD | ❌ | ✅ | Included (no additional cost) |  |

## **How this works:**
### Order Creation
– Orders are created within the TikTok Shop platform (TTS).
– This triggers downstream fulfillment processes.
### Order Retrieval via API
– The [Get Order Detail API](https://partner.tiktokshop.com/docv2/page/650aa8ccc16ffe02b8f167a0?external_id=650aa8ccc16ffe02b8f167a0#Back%20To%20Top) is called by the seller or their middleware platform.
– This API response includes the **Package ID** generated by TTS.
– The Package ID is used for subsequent shipping-related API calls.
### Warehouse Handling
– The seller receives the order details, prepares the parcel, and packages the item(s).
– Package information is not editable via API and must align with product attributes uploaded to TTS (e.g., weight and dimensions).

---


# **Shipping configurations:**
Shipping configurations are managed entirely through **Seller Center**. This includes:
– Shipping service setup (e.g., carrier selection)
– Pricing tiers
– Weight and dimension buckets

**Note**: These settings are account-level and not configurable via API.
– Once items are packed, sellers must retrieve shipping documentation (labels, invoices) from TTS.
– Shipping labels are automatically generated based on item weight and dimensions stored in the TTS catalogue.

---


## **API Solution Overview:**
### Retrieve Order Information
– Seller calls the [Get Order Detail](https://partner.tiktokshop.com/docv2/page/650aa8ccc16ffe02b8f167a0?external_id=650aa8ccc16ffe02b8f167a0#Back%20To%20Top) API to obtain details of the order. This includes package ID—an identifier created within TTS for the prepared parcel.
### Confirm Parcel is Ready for Dispatch
– Seller prepares the parcel(s) and calls [Ship Package](https://partner.tiktokshop.com/docv2/page/650aa4f1defece02be6e7cb1?external_id=650aa4f1defece02be6e7cb1) API. The previously fetched package ID is used for this call.
### **Retrieve Shipping Documents**
[Get Package Shipping Documents](https://partner.tiktokshop.com/docv2/page/650aa5fac16ffe02b8f112ca?external_id=650aa5fac16ffe02b8f112ca) API:
– Used to download the shipping label and associated documents 
### **Final Shipment Handling**
– Seller dispatches the item.
– Pickup scheduling (if required) is confirmed via Lark with the assigned 4PL.
– Seller packages and ships items. Pickup timeslots are confirmed via Lark

---


# Key Notes
– The entire flow is designed to operate with minimal manual intervention, provided the seller has configured their shipping parameters correctly in Seller Center.
– TikTok Shop does not currently support dynamic label generation via external weight data—accuracy of item dimensions at upload is critical.
– Pickup windows and logistics exceptions are managed directly through operational coordination on Lark.

---
