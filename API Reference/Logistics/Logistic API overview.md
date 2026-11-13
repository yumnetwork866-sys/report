---
title: "Logistic API overview"
document_id: 650b1e47defece02be7e755e
document_path: logistic-api-overview
is_api_doc: true
updated_at: 2025-04-10 11:52:14 UTC
source: https://partner.tiktokshop.com/docv2/page/logistic-api-overview
---
# Context
The Logistic API helps you obtain information about logistic resources including: 

* Get Warehouse List
* Get Subscribed Delivery Options
* Get Shipping Providers
* Get Global Warehouse List


When sellers create/publish products, they may need to:

* Get Warehouse List
* Get Global Warehouse List

For more detail, please refer to the ["Product API" overview](https://partner.tiktokshop.com/docv2/page/650b23eef1fd3102b93d2326).

When sellers fulfill orders, they may need to:

* Get Subscribed Delivery Options
* Get Shipping Providers

For more detail, please refer to the ["Fulfillment API" overview](https://partner.tiktokshop.com/docv2/page/650b2044f1fd3102b93c9178).
# Important Concepts
## Warehouse
Warehouses are setup by sellers when they create their TikTok Shop account. This is where packages will be sent out from once an order needs to be shipped.
One seller can have multiple global warehouses.
One seller can have multiple warehouses for one shop.
![Image](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/54149c6a76d3475b8f50e2dc02ff442a~tplv-k9wyc2ijk0-image.image)
When sellers want to create a global product, they need to clarify inventory based on global warehouses([Get Global Warehouse List API](https://partner.tiktokshop.com/docv2/page/650aa3f0defece02be6e5ffb?external_id=650aa3f0defece02be6e5ffb#Back%20To%20Top)).
When sellers want to publish a global product, they need to clarify inventory based on warehouses.([Get Warehouse List API](https://partner.tiktokshop.com/docv2/page/650aa418defece02be6e66b6))
## Delivery Option
A delivery option is a logistic solution which assists sellers to handover goods to customers.
A delivery option includes a set of shipping providers and shipping services.
Seller needs to fulfill order under delivery option requirement,  including shipping providers, shipping services, dimension, weight, etc.
A delivery option is chosen by the buyer, when the buyer places an order on TikTok.   Examples of delivery options include "Express shipping" for Seller Shipping, "Economy Shipping" for TikTok Shipping, etc.  
Please note that Express Shipping for Seller Shipping, and Express Shipping for TikTok Shipping are in fact two different delivery options.
### Shipping Type
Shipping type is how sellers can ship packages.  It's a property of delivery option.
TikTok supports multiple shipping types:

* Platform - Sellers connect with shipping providers through TikTok. 
* Seller - Sellers connect with shipping providers their own channels, then upload tracking numbers to TikTok for further tracking.

For different regions, TikTok provides different services for shipping , including purchasing labels, arranging shipments, etc.
## Shipping Service( for US )
A shipping service is a specific logistic service which is provided by one provider.
Different delivery options have different available shipping services.
Examples of shipping services include  "USPS Ground", "DHL eCommerce SM parcel".
## Shipping provider
Shipping providers are providers who provide shipping services. 
Different delivery options have different available shipping providers.
For orders which use "seller shipping" type delivery option, seller needs to update shipping provider and tracking number during fulfillment.
Examples of shipping providers include "USPS", "DHL eCommerce".
Important tips: "DHL" and "DHL eCommerce" are two providers.

The diagram below outlines the relationship between delivery option, shipping provider and shipping service.

![Image](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/dcefc31a473646bca211ab30380158e2~tplv-k9wyc2ijk0-image.image)

# Frequently Asked Questions

* What is the relationship between a seller and a shop?

One seller can run businesses in multiple regions.
For each region, one seller can have one TikTok shop.
![Image](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/46c96cf5ec98442894d42cf2814ecf94~tplv-k9wyc2ijk0-image.image)

* What is the relationship between a global warehouse and a warehouse?

When there is a global warehouse, for every region, there is a warehouse which actually refers to the global warehouse.

* What is the relationship between a warehouse and a deliveryOption?

One warehouse can subscribe multiple delivery options.
![Image](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/5574a789943f4a55b9bec9904dad5324~tplv-k9wyc2ijk0-image.image)

* What is the difference between different delivery options?

There are several pieces of fulfillment info in an order's Order Detail:

* Delivery option id
* Fulfillment type: means goods will be shipped from TikTok warehouse or seller warehouse 
      * FULFILLMENT_BY_TIKTOK
      * FULFILLMENT_BY_SELLER
* Ship type:   means package will purchase label through TikTok or through seller's own channel.
      * TikTok
      * Seller

For fulfillment type - FULFILLMENT_BY_TIKTOK, TikTok will automatically process the order on behalf of the seller. The seller does not need to manage the fulfillment process. 
For fulfillment type - FULFILLMENT_BY_SELLER, sellers need to use Fulfillment API to process order.
For more detail of fulfillment flows, please refer to [Fulfillment API overview](https://partner.tiktokshop.com/docv2/page/650b2044f1fd3102b93c9178).
