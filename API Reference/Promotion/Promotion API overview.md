---
title: "Promotion API overview"
document_id: 650da1ab55bc3202b76f8d21
document_path: promotion-api-overview
is_api_doc: true
updated_at: 2025-04-11 05:40:09 UTC
source: https://partner.tiktokshop.com/docv2/page/promotion-api-overview
---
TikTok Shop provides you with a variety of promotion activities with which you can create a rich shopping experience for TikTok users.
You can use Promotion APIs to create and manage three kinds of promotion activities on TikTok Shop: 

* Product Discount
* Flash Deal
* Coupon in the US / Voucher in other districts (You cannot use OpenAPI to create coupon activities.)

> Notes:

> * All three of the above activities are seller promotion activities which are 100% funded by the seller on TikTok Shop.
> * When a product is listed in both a flash deal promotion and a product discount promotion, only the flash deal price is effective. 
> * When a product is listed in both a flash deal and a TikTok campaign, the campaign price will always be effective.
> * Coupons are always applicable whether or not the product is listed in other promotion activities or a TikTik campaign.

### Product Discount
You can use the Product Discount activity to create discounts for your specific products. The prices after discount are shown with the original prices crossed out. Here's an example:
<div style="text-align: center"><img src="https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/40b6766f105c4916a78027cd85465bbe~tplv-k9wyc2ijk0-image.image" width="200px" /></div>


You can apply the activity on product detail pages, livestreams, and showcases. The visual effects are almost the same in these scenarios.
There are two discount types: 

* Fixed Price: Specify the final price after discount.
* Percentage Off: Specify the portion of the deduction amount to the original price.


### Flash Deal
You can use the Flash Deal activity to create discounts for your specific products. The products in a flash deal will be highlighted with a limited-time countdown. Here's an example:
<div style="text-align: center"><img src="https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/ed42ed826f6d41b6bf858aa24f0f5c57~tplv-k9wyc2ijk0-image.image" width="300px" /></div>

The deal price for each product needs to be equal to or lower than the price paid by customers in the last 30 days.
### Coupon / Seller Voucher
You can use coupon activities in the US, or seller voucher activities in other districts, in combination with other promotional activities. You can set this up in the Seller Center, and the visual effect of the coupon depends on your setting.
You cannot set this up using OpenAPI, but you can search for and get the details of the existing coupon activities.

## API List
You can create and manage your promotion activities in Seller Center and Seller App; you can also do that with Promotion APIs. Here's the list of Promotion APIs:

* To manage product discount or flash deal activities, refer to:
   * [Create Activity](650c33c155bc3202b762b507);
   * [Search Activities](650acfbaf1fd3102b9315a3a);
   * [Get Activities](650acd920fcef602bf36ee2b);
   * [Update Activity](650c584d82c3a602befa4ab8);
   * [Deactivate Activities](650acf9adefece02be7380cf).
* To update the products included in a product discount or a flash deal activity, refer to:
   * [Update Activity Product](650d32c42aaa3602b86ccb5c);
   * [Remove Activity Product](650acfd84a0bb702c072b4eb).
* To search and get the details of a coupon activity, refer to:
   * [Search Coupons](6699dcdf115ebe02f841e4cd);
   * [Get Coupons](6699dce0de15e502ed219e37).
