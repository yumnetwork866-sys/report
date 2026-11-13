---
title: "Return reasons"
document_id: 67e61d87fcf2dd04c982ef1d
document_path: return-reasons
is_api_doc: true
updated_at: 2026-05-08 03:35:36 UTC
source: https://partner.tiktokshop.com/docv2/page/return-reasons
---
# US market
## Buyer Initiates Return Reason
| **Order status** | **Buyer available Return reason** | **Reason name** |
| --- | --- | --- |
| `AWAITING_COLLECTION` <br> `IN_TRANSIT` | No longer needed | ecom_order_delivered_refund_and_return_reason_no_need |
| `DELIVERED` | No longer needed | ecom_order_delivered_refund_and_return_reason_no_need |
|  | Item doesn't fit (some categories) | buyer_return_and_refund_item_doesn't_fit |
|  | Item doesn't match description | ecom_order_delivered_refund_and_return_reason_not_match_description |
|  | Missing or broken parts (Missing parts) | ecom_order_delivered_refund_and_return_reason_missing_product |
|  | Damaged item or packaging | ecom_order_delivered_refund_and_return_reason_damaged |
|  | Defective item | ecom_order_delivered_refund_and_return_reason_defective |
|  | Wrong item was sent | ecom_order_delivered_refund_and_return_reason_wrong_product |
|  | Item arrived too late | buyer_return_and_refund_item_arrived_too_late |
|  | Fabric, material or style not as expected | buyer_return_and_refund_fabric,_material_or_style_not_as_expected |
|  | Item is too big | ecom_order_delivered_refund_and_return_reason_item_too_big |
|  | Item is too small | ecom_order_delivered_refund_and_return_reason_item_too_small |
## Seller Reject Return Request Reason
### **1st Review**
| **Seller available reject return reason** | **Reason name** |
| --- | --- |
| Product delivery is on schedule | reverse_reject_request_reason_4 |
| Item is correct | reverse_reject_refund_request_correct_item |
| Products were shipped in multiple packages  | reverse_reject_refund_request_package_delivery_multiple_boxes |
| Reason is unclear / lack of evidence | reverse_reject_refund_request_unclear_evidence |
| Product functions well/Incorrect usage by the customer | reverse_reject_refund_request_product_function_well |
| Product is in transit | reverse_reject_refund_request_package_delivery_timing |
| Replacement has been shipped | reverse_reject_refund_request_no_reason_shipped_replacement |
| The delivery attempt failed  | reverse_reject_refund_request_no_reason_failed_delivery_attempt |
| The package has been successfully delivered to the shipping address that was provided. | reverse_reject_refund_request_incorrect_address |
| Not eligible for return (e.g. used or broken) | reverse_reject_request_reason_3 |

### **2nd Review**
| **Seller available reject return reason** | **Reason name** |
| --- | --- |
| The product returned is not the product that was sent | reverse_reject_return_parcel_reason_1 |
| Missing products and/or product parts | reverse_reject_return_parcel_reason_3 |
| I haven't received the package | reverse_reject_return_parcel_reason_4 |
| Product is damaged or used | reverse_reject_return_parcel_reason_5 |
## Seller Initiates Return Reason
| **Order Status** | **Seller available initiate Return reason** | **Reason name** |
| --- | --- | --- |
| `DELIVERED` | No longer needed | seller_ecom_delivered_return_refund_reason1 |


---


# UK market
## Buyer Initiates Return Reason
| **Order status** | **Buyer available Return reason** | **Reason name** |
| --- | --- | --- |
| AWAITING_COLLECTION <br> IN_TRANSIT | No longer needed | ecom_order_delivered_refund_and_return_reason_no_need_uk |
| DELIVERED | Product doesn't match description | ecom_order_delivered_refund_and_return_reason_not_match_description_uk |
|  | Missing product or accessories | ecom_order_delivered_refund_and_return_reason_missing_product_uk |
|  | Package or product is damaged | ecom_order_delivered_refund_and_return_reason_damaged_uk |
|  | Product is defective or doesn't work | ecom_order_delivered_refund_and_return_reason_defective_uk |
|  | Wrong product was sent | ecom_order_delivered_refund_and_return_reason_wrong_product_uk |
|  | Other | ecom_order_delivered_refund_and_return_reason_other_uk |
|  | Suspected Counterfeit | buyer_return_and_refund_suspected_counterfeit |
|  | Does not suit me | buyer_return_and_refund_does_not_suit_me |
|  | Item is too big/long | buyer_return_and_refund_item_is_too_big/long |
|  | Item is too small/short | buyer_return_and_refund_item_is_too_small/short |
|  | Multiple sizes ordered | buyer_return_and_refund_multiple_sizes_ordered |
|  | Quality or style not as expected | buyer_return_and_refund_quality_or_style_not_as_expected |
|  | Ordered incorrect size | buyer_return_and_refund_ordered_incorrect_size |
|  | Unauthorised purchase | buyer_return_and_refund_unauthorised_purchase |
|  | Product is expired/spoiled | buyer_return_and_refund_product_is_expired/spoiled |
|  | Product not frozen on arrival | buyer_return_and_refund_product_not_frozen_on_arrival |
## Seller Reject Return Request Reason
Seller rejects return request
| **Seller available reject return reason** | **Reason name** |
| --- | --- |
| Buyer return reason is not valid | reverse_reject_request_reason_1_uk |
| Change of mind returns are not applicable | reverse_reject_request_reason_2_uk |
| Not eligible for return (e.g. used or broken) | reverse_reject_request_reason_3_uk |
| Product delivery is on schedule | reverse_reject_request_reason_4_uk |
| You have reached an agreement with the buyer | reverse_reject_request_reason_5_uk |
| Item is correct | seller_reject_apply_item_is_correct |
| Products will be sent separately | seller_reject_apply_products_will_be_sent_separately |
| Reason is unclear or lack of evidence | seller_reject_apply_reason_is_unclear_or_lack_of_evidence |
| Product functions well/Buyer use in wrong way | seller_reject_apply_product_functions_well/buyer_use_in_wrong_way |
| Product is shipped and parcel cannot be recalled back from logistics. | seller_reject_apply_package_has_not_exceeded_estimated_delivery_time |
Seller rejects receive package
| **Seller available reject return reason** | **Reason name** |
| --- | --- |
| The product returned is not the product that was sent | reverse_reject_return_parcel_reason_1_uk |
| Not eligible for return (e.g. used or broken) | reverse_reject_return_parcel_reason_2_uk |
| Missing products and/or product parts | reverse_reject_return_parcel_reason_3_uk |
| I haven't received the package | reverse_reject_return_parcel_reason_4_uk |
| Product is damaged or used | reverse_reject_return_parcel_reason_5_uk |
| You have reached an agreement with the buyer | seller_reject_apply_you_have_reached_an_agreement_with_the_buyer |
## Seller Initiates Return Reason
| **Order Status** | **Seller available initiate Return reason** | **Reason name** |
| --- | --- | --- |
| DELIVERED | No longer needed | seller_ecom_delivered_return_refund_reason1_uk |
|  | Product doesn't match description | ecom_order_delivered_refund_and_return_reason_not_match_description_seller_uk |
|  | Missing product or accessories | ecom_order_delivered_refund_and_return_reason_missing_product_seller_uk |
|  | Package or product is damaged | ecom_order_delivered_refund_and_return_reason_damaged_seller_uk |
|  | Product is defective or doesn't work | ecom_order_delivered_refund_and_return_reason_defective_seller_uk |
|  | Wrong product was sent | ecom_order_delivered_refund_and_return_reason_wrong_product_seller_uk |
|  | Suspected Counterfeit | buyer_return_and_refund_suspected_counterfeit_seller_uk |


---


# ID market
## Buyer Initiates Return Reason
| **Order status** | **Buyer available Return reason** | **Reason name** |
| --- | --- | --- |
| AWAITING_COLLECTION <br> IN_TRANSIT <br> DELIVERED | Product doesn't match description | ecom_order_delivered_refund_and_return_reason_not_match_description |
|  | Package or product is damaged | ecom_order_delivered_refund_and_return_reason_damaged |
|  | Product is defective or doesn't work | ecom_order_delivered_refund_and_return_reason_defective |
|  | Wrong product was sent | ecom_order_delivered_refund_and_return_reason_wrong_product |
|  | Missed estimated delivery date | ecom_order_delivered_refund_and_return_reason_missed_delivery |
|  | Suspected Counterfeit | buyer_return_and_refund_suspected_counterfeit |
## Seller Reject Return Request Reason
Seller rejects return request
| **Seller available reject return reason** | **Reason name** |
| --- | --- |
| Buyer return reason is not valid | reverse_reject_request_reason_1 |
| Change of mind returns are not applicable | reverse_reject_request_reason_2 |
| Not eligible for return (e.g. used or broken) | reverse_reject_request_reason_3 |
| Product delivery is on schedule | reverse_reject_request_reason_4 |
| You have reached an agreement with the buyer | reverse_reject_request_reason_5 |
| Item is correct | seller_reject_apply_item_is_correct |
| Products will be sent separately | seller_reject_apply_products_will_be_sent_separately |
| Reason is unclear or lack of evidence | seller_reject_apply_reason_is_unclear_or_lack_of_evidence |
| Product functions well/Buyer use in wrong way | seller_reject_apply_product_functions_well/buyer_use_in_wrong_way |
| Product is shipped and parcel cannot be recalled back from logistics. | seller_reject_apply_package_has_not_exceeded_estimated_delivery_time |
Seller rejects receive package
| **Seller available reject return reason** | **Reason name** |
| --- | --- |
| The product returned is not the product that was sent | reverse_reject_return_parcel_reason_1 |
| Not eligible for return (e.g. used or broken) | reverse_reject_return_parcel_reason_2 |
| Missing products and/or product parts | reverse_reject_return_parcel_reason_3 |
| I haven't received the package | reverse_reject_return_parcel_reason_4 |
| Product is damaged or used | reverse_reject_return_parcel_reason_5 |
| You have reached an agreement with the buyer | seller_reject_apply_you_have_reached_an_agreement_with_the_buyer |
## Seller Initiates Return Reason
| **Order Status** | **Seller available initiate Return reason** | **Reason name** |
| --- | --- | --- |
| DELIVERED | Wrong product was sent | ecom_order_delivered_refund_and_return_reason_wrong_product_seller |


---


# MY market
## Buyer Initiates Return Reason
| **Order status** | **Buyer available Return reason** | **Reason name** |
| --- | --- | --- |
| AWAITING_COLLECTION <br> IN_TRANSIT <br> DELIVERED | Product doesn't match description | ecom_order_delivered_refund_and_return_reason_not_match_description |
|  | Package or product is damaged | ecom_order_delivered_refund_and_return_reason_damaged |
|  | Product is defective or doesn't work | ecom_order_delivered_refund_and_return_reason_defective |
|  | Wrong product was sent | ecom_order_delivered_refund_and_return_reason_wrong_product |
|  | Missed estimated delivery date | ecom_order_delivered_refund_and_return_reason_missed_delivery |
|  | Suspected Counterfeit | buyer_return_and_refund_suspected_counterfeit |
## Seller Reject Return Request Reason
Seller rejects return request
| **Seller available reject return reason** | **Reason name** |
| --- | --- |
| Buyer return reason is not valid | reverse_reject_request_reason_1 |
| Change of mind returns are not applicable | reverse_reject_request_reason_2 |
| Not eligible for return (e.g. used or broken) | reverse_reject_request_reason_3 |
| Product delivery is on schedule | reverse_reject_request_reason_4 |
| You have reached an agreement with the buyer | reverse_reject_request_reason_5 |
| Item is correct | seller_reject_apply_item_is_correct |
| Products will be sent separately | seller_reject_apply_products_will_be_sent_separately |
| Reason is unclear or lack of evidence | seller_reject_apply_reason_is_unclear_or_lack_of_evidence |
| Product functions well/Buyer use in wrong way | seller_reject_apply_product_functions_well/buyer_use_in_wrong_way |
| Product is shipped and parcel cannot be recalled back from logistics. | seller_reject_apply_package_has_not_exceeded_estimated_delivery_time |
Seller rejects receive package
| **Seller available reject return reason** | **Reason name** |
| --- | --- |
| The product returned is not the product that was sent | reverse_reject_return_parcel_reason_1 |
| Not eligible for return (e.g. used or broken) | reverse_reject_return_parcel_reason_2 |
| Missing products and/or product parts | reverse_reject_return_parcel_reason_3 |
| I haven't received the package | reverse_reject_return_parcel_reason_4 |
| Product is damaged or used | reverse_reject_return_parcel_reason_5 |
| You have reached an agreement with the buyer | seller_reject_apply_you_have_reached_an_agreement_with_the_buyer |
## Seller Initiates Return Reason
Unsupported


---


# PH market
## Buyer Initiates Return Reason
| **Order status** | **Buyer available Return reason** | **Reason name** |
| --- | --- | --- |
| AWAITING_COLLECTION <br> IN_TRANSIT <br> DELIVERED | Product doesn't match description | ecom_order_delivered_refund_and_return_reason_not_match_description |
|  | Package or product is damaged | ecom_order_delivered_refund_and_return_reason_damaged |
|  | Product is defective or doesn't work | ecom_order_delivered_refund_and_return_reason_defective |
|  | Wrong product was sent | ecom_order_delivered_refund_and_return_reason_wrong_product |
|  | Missed estimated delivery date | ecom_order_delivered_refund_and_return_reason_missed_delivery |
|  | Suspected Counterfeit | buyer_return_and_refund_suspected_counterfeit |
## Seller Reject Return Request Reason
Seller rejects return request
| **Seller available reject return reason** | **Reason name** |
| --- | --- |
| Buyer return reason is not valid | reverse_reject_request_reason_1 |
| Change of mind returns are not applicable | reverse_reject_request_reason_2 |
| Not eligible for return (e.g. used or broken) | reverse_reject_request_reason_3 |
| Product delivery is on schedule | reverse_reject_request_reason_4 |
| You have reached an agreement with the buyer | reverse_reject_request_reason_5 |
| Item is correct | seller_reject_apply_item_is_correct |
| Products will be sent separately | seller_reject_apply_products_will_be_sent_separately |
| Reason is unclear or lack of evidence | seller_reject_apply_reason_is_unclear_or_lack_of_evidence |
| Product functions well/Buyer use in wrong way | seller_reject_apply_product_functions_well/buyer_use_in_wrong_way |
| Product is shipped and parcel cannot be recalled back from logistics. | seller_reject_apply_package_has_not_exceeded_estimated_delivery_time |
Seller rejects receive package
| **Seller available reject return reason** | **Reason name** |
| --- | --- |
| The product returned is not the product that was sent | reverse_reject_return_parcel_reason_1 |
| Not eligible for return (e.g. used or broken) | reverse_reject_return_parcel_reason_2 |
| Missing products and/or product parts | reverse_reject_return_parcel_reason_3 |
| I haven't received the package | reverse_reject_return_parcel_reason_4 |
| Product is damaged or used | reverse_reject_return_parcel_reason_5 |
| You have reached an agreement with the buyer | seller_reject_apply_you_have_reached_an_agreement_with_the_buyer |
## Seller Initiates Return Reason
Unsupported


---


# SG market
## Buyer Initiates Return Reason
| **Order status** | **Buyer available Return reason** | **Reason name** |
| --- | --- | --- |
| AWAITING_COLLECTION <br> IN_TRANSIT <br> DELIVERED | Product doesn't match description | ecom_order_delivered_refund_and_return_reason_not_match_description |
|  | Package or product is damaged | ecom_order_delivered_refund_and_return_reason_damaged |
|  | Product is defective or doesn't work | ecom_order_delivered_refund_and_return_reason_defective |
|  | Wrong product was sent | ecom_order_delivered_refund_and_return_reason_wrong_product |
|  | Missed estimated delivery date | ecom_order_delivered_refund_and_return_reason_missed_delivery |
|  | Suspected Counterfeit | buyer_return_and_refund_suspected_counterfeit |
## Seller Reject Return Request Reason
Seller rejects return request
| **Seller available reject return reason** | **Reason name** |
| --- | --- |
| Buyer return reason is not valid | reverse_reject_request_reason_1 |
| Change of mind returns are not applicable | reverse_reject_request_reason_2 |
| Not eligible for return (e.g. used or broken) | reverse_reject_request_reason_3 |
| Product delivery is on schedule | reverse_reject_request_reason_4 |
| You have reached an agreement with the buyer | reverse_reject_request_reason_5 |
| Item is correct | seller_reject_apply_item_is_correct |
| Products will be sent separately | seller_reject_apply_products_will_be_sent_separately |
| Reason is unclear or lack of evidence | seller_reject_apply_reason_is_unclear_or_lack_of_evidence |
| Product functions well/Buyer use in wrong way | seller_reject_apply_product_functions_well/buyer_use_in_wrong_way |
| Product is shipped and parcel cannot be recalled back from logistics. | seller_reject_apply_package_has_not_exceeded_estimated_delivery_time |
Seller rejects receive package
| **Seller available reject return reason** | **Reason name** |
| --- | --- |
| The product returned is not the product that was sent | reverse_reject_return_parcel_reason_1 |
| Not eligible for return (e.g. used or broken) | reverse_reject_return_parcel_reason_2 |
| Missing products and/or product parts | reverse_reject_return_parcel_reason_3 |
| I haven't received the package | reverse_reject_return_parcel_reason_4 |
| Product is damaged or used | reverse_reject_return_parcel_reason_5 |
| You have reached an agreement with the buyer | seller_reject_apply_you_have_reached_an_agreement_with_the_buyer |
## Seller Initiates Return Reason
Unsupported


---


# TH market
## Buyer Initiates Return Reason
| **Order status** | **Buyer available Return reason** | **Reason name** |
| --- | --- | --- |
| AWAITING_COLLECTION <br> IN_TRANSIT <br> DELIVERED | No longer needed | ecom_order_delivered_refund_and_return_reason_no_need |
|  | Product doesn't match description | ecom_order_delivered_refund_and_return_reason_not_match_description |
|  | Package or product is damaged | ecom_order_delivered_refund_and_return_reason_damaged |
|  | Product is defective or doesn't work | ecom_order_delivered_refund_and_return_reason_defective |
|  | Wrong product was sent | ecom_order_delivered_refund_and_return_reason_wrong_product |
|  | Missed estimated delivery date | ecom_order_delivered_refund_and_return_reason_missed_delivery |
|  | Suspected Counterfeit | buyer_return_and_refund_suspected_counterfeit |
## Seller Reject Return Request Reason
Seller rejects return request
| **Seller available reject return reason** | **Reason name** |
| --- | --- |
| Buyer return reason is not valid | reverse_reject_request_reason_1 |
| Not eligible for return (e.g. used or broken) | reverse_reject_request_reason_3 |
| Product delivery is on schedule | reverse_reject_request_reason_4 |
| You have reached an agreement with the buyer | reverse_reject_request_reason_5 |
| Item is correct | seller_reject_apply_item_is_correct |
| Products will be sent separately | seller_reject_apply_products_will_be_sent_separately |
| Reason is unclear or lack of evidence | seller_reject_apply_reason_is_unclear_or_lack_of_evidence |
| Product functions well/Buyer use in wrong way | seller_reject_apply_product_functions_well/buyer_use_in_wrong_way |
| Product is shipped and parcel cannot be recalled back from logistics. | seller_reject_apply_package_has_not_exceeded_estimated_delivery_time |
Seller rejects receive package
| **Seller available reject return reason** | **Reason name** |
| --- | --- |
| The product returned is not the product that was sent | reverse_reject_return_parcel_reason_1 |
| Not eligible for return (e.g. used or broken) | reverse_reject_return_parcel_reason_2 |
| Missing products and/or product parts | reverse_reject_return_parcel_reason_3 |
| I haven't received the package | reverse_reject_return_parcel_reason_4 |
| Product is damaged or used | reverse_reject_return_parcel_reason_5 |
| You have reached an agreement with the buyer | seller_reject_apply_you_have_reached_an_agreement_with_the_buyer |
## Seller Initiates Return Reason
Unsupported


---


# VN market
## Buyer Initiates Return Reason
| **Order status** | **Buyer available Return reason** | **Reason name** |
| --- | --- | --- |
| AWAITING_COLLECTION <br> IN_TRANSIT <br> DELIVERED | Product doesn't match description | ecom_order_delivered_refund_and_return_reason_not_match_description |
|  | Package or product is damaged | ecom_order_delivered_refund_and_return_reason_damaged |
|  | Product is defective or doesn't work | ecom_order_delivered_refund_and_return_reason_defective |
|  | Wrong product was sent | ecom_order_delivered_refund_and_return_reason_wrong_product |
|  | Missed estimated delivery date | ecom_order_delivered_refund_and_return_reason_missed_delivery |
|  | Suspected Counterfeit | buyer_return_and_refund_suspected_counterfeit |
## Seller Reject Return Request Reason
Seller rejects return request
| **Seller available reject return reason** | **Reason name** |
| --- | --- |
| Buyer return reason is not valid | reverse_reject_request_reason_1 |
| Change of mind returns are not applicable | reverse_reject_request_reason_2 |
| Not eligible for return (e.g. used or broken) | reverse_reject_request_reason_3 |
| Product delivery is on schedule | reverse_reject_request_reason_4 |
| You have reached an agreement with the buyer | reverse_reject_request_reason_5 |
| Item is correct | seller_reject_apply_item_is_correct |
| Products will be sent separately | seller_reject_apply_products_will_be_sent_separately |
| Reason is unclear or lack of evidence | seller_reject_apply_reason_is_unclear_or_lack_of_evidence |
| Product functions well/Buyer use in wrong way | seller_reject_apply_product_functions_well/buyer_use_in_wrong_way |
| Product is shipped and parcel cannot be recalled back from logistics. | seller_reject_apply_package_has_not_exceeded_estimated_delivery_time |
Seller rejects receive package
| **Seller available reject return reason** | **Reason name** |
| --- | --- |
| The product returned is not the product that was sent | reverse_reject_return_parcel_reason_1 |
| Not eligible for return (e.g. used or broken) | reverse_reject_return_parcel_reason_2 |
| Missing products and/or product parts | reverse_reject_return_parcel_reason_3 |
| I haven't received the package | reverse_reject_return_parcel_reason_4 |
| Product is damaged or used | reverse_reject_return_parcel_reason_5 |
| You have reached an agreement with the buyer | seller_reject_apply_you_have_reached_an_agreement_with_the_buyer |
## Seller Initiates Return Reason
| **Order Status** | **Seller available initiate Return reason** | **Reason name** |
| --- | --- | --- |
| DELIVERED | No longer needed | seller_ecom_delivered_return_refund_reason1 |
|  | Product doesn't match description | ecom_order_delivered_refund_and_return_reason_not_match_description_seller |
|  | Missing product or accessories | ecom_order_delivered_refund_and_return_reason_missing_product_seller |
|  | Package or product is damaged | ecom_order_delivered_refund_and_return_reason_damaged_seller |
|  | Product is defective or doesn't work | ecom_order_delivered_refund_and_return_reason_defective_seller |
|  | Wrong product was sent | ecom_order_delivered_refund_and_return_reason_wrong_product_seller |
|  | Suspected Counterfeit | buyer_return_and_refund_suspected_counterfeit_seller |


---


# MX market
## Buyer Initiates Return Reason
| **Order status** | **Buyer available Return reason** | **Reason name** |
| --- | --- | --- |
| AWAITING_COLLECTION <br> IN_TRANSIT <br> DELIVERED | Item doesn't fit | buyer_return_and_refund_item_doesn't_fit |
|  | No longer needed | ecom_order_delivered_refund_and_return_reason_no_need |
|  | Defective item | ecom_order_delivered_refund_reason_defective |
|  | Item arrived too late | buyer_return_and_refund_item_arrived_too_late |
|  | Wrong item was sent | ecom_order_delivered_refund_reason_wrong_product |
|  | Fabric, material or style not as expected | buyer_return_and_refund_fabric,_material_or_style_not_as_expected |
|  | Color or pattern not as expected | buyer_return_and_refund_color_or_pattern_not_as_expected |
|  | Damaged item or packaging | ecom_order_delivered_refund_and_return_reason_damaged |
|  | Item doesn't match description | ecom_order_delivered_refund_and_return_reason_not_match_description |
## Seller Reject Return Request Reason
Seller rejects return request
| **Seller available reject return reason** | **Reason name** |
| --- | --- |
| Product functions well/Incorrect usage by the customer | seller_reject_apply_product_functions_well/buyer_use_in_wrong_way |
| Reason is unclear / lack of evidence | seller_reject_apply_reason_is_unclear_or_lack_of_evidence |
| Item is correct | seller_reject_apply_item_is_correct |
| You have reached an agreement with the customer | reverse_reject_request_reason_5 |
| Product is in transit | seller_reject_apply_package_has_not_exceeded_estimated_delivery_time |
| Your products were shipped by multiple packages. | seller_reject_apply_products_will_be_sent_separately |
| Need to apply for refund&return | seller_reject_apply_need_to_apply_for_refund&return |
Seller rejects receive package
| **Seller available reject return reason** | **Reason name** |
| --- | --- |
| The product returned is not the product that was sent | reverse_reject_return_parcel_reason_1 |
| Not eligible for return (e.g. used or broken) | reverse_reject_return_parcel_reason_2 |
| Missing products and/or product parts | reverse_reject_return_parcel_reason_3 |
| I haven't received the package | reverse_reject_return_parcel_reason_4 |
| Product is damaged or used | reverse_reject_return_parcel_reason_5 |
| You have reached an agreement with the customer | seller_reject_apply_you_have_reached_an_agreement_with_the_buyer |
## Seller Initiates Return Reason
| **Order Status** | **Seller available initiate Return reason** | **Reason name** |
| --- | --- | --- |
| DELIVERED | No longer needed | seller_ecom_delivered_return_refund_reason1 |
|  | Late delivery (Item arrived too late) | seller_return_late_delivery |
|  | Missing items or parts | seller_return_missing_item |
|  | Damaged item or packaging | seller_return_damaged_item |
|  | Defective item | seller_return_defective_item |
|  | Wrong item was sent | seller_return_wrong_item_was_sent |


---


# BR market
## Buyer Initiates Return Reason
| **Order status** | **Buyer available Return reason** | **Reason name** |
| --- | --- | --- |
| AWAITING_COLLECTION <br> IN_TRANSIT <br> DELIVERED | Item doesn't fit | buyer_return_and_refund_item_doesn't_fit |
|  | No longer needed | ecom_order_delivered_refund_and_return_reason_no_need |
|  | Defective item | ecom_order_delivered_refund_reason_defective |
|  | Item arrived too late | buyer_return_and_refund_item_arrived_too_late |
|  | Wrong item was sent | ecom_order_delivered_refund_reason_wrong_product |
|  | Fabric, material or style not as expected | buyer_return_and_refund_fabric,_material_or_style_not_as_expected |
|  | Color or pattern not as expected | buyer_return_and_refund_color_or_pattern_not_as_expected |
|  | Damaged item or packaging | ecom_order_delivered_refund_and_return_reason_damaged |
|  | Item doesn't match description | ecom_order_delivered_refund_and_return_reason_not_match_description |
|  | Package received but missing item | ecom_order_delivered_refund_and_return_reason_missing_product |
## Seller Reject Return Request Reason
Seller rejects return request
| **Seller available reject return reason** | **Reason name** |
| --- | --- |
| Product functions well/Incorrect usage by the customer | seller_reject_apply_product_functions_well/buyer_use_in_wrong_way |
| Reason is unclear / lack of evidence | seller_reject_apply_reason_is_unclear_or_lack_of_evidence |
| Item is correct | seller_reject_apply_item_is_correct |
| You have reached an agreement with the customer | reverse_reject_request_reason_5 |
| Product is in transit | seller_reject_apply_package_has_not_exceeded_estimated_delivery_time |
| Your products were shipped by multiple packages. | seller_reject_apply_products_will_be_sent_separately |
| Need to apply for refund&return | seller_reject_apply_need_to_apply_for_refund&return |
Seller rejects receive package
| **Seller available reject return reason** | **Reason name** |
| --- | --- |
| The product returned is not the product that was sent | reverse_reject_return_parcel_reason_1 |
| Not eligible for return (e.g. used or broken) | reverse_reject_return_parcel_reason_2 |
| Missing products and/or product parts | reverse_reject_return_parcel_reason_3 |
| I haven't received the package | reverse_reject_return_parcel_reason_4 |
| Product is damaged or used | reverse_reject_return_parcel_reason_5 |
| You have reached an agreement with the customer | seller_reject_apply_you_have_reached_an_agreement_with_the_buyer |
## Seller Initiates Return Reason
| **Order Status** | **Seller available initiate Return reason** | **Reason name** |
| --- | --- | --- |
| DELIVERED | No longer needed | seller_ecom_delivered_return_refund_reason1 |
|  | Late delivery (Item arrived too late) | seller_return_late_delivery |
|  | Missing items or parts | seller_return_missing_item |
|  | Damaged item or packaging | seller_return_damaged_item |
|  | Defective item | seller_return_defective_item |
|  | Wrong item was sent | seller_return_wrong_item_was_sent |


---


# EU market(s)
Currently, supported EU markets include: 

* Spain (ES)
* Ireland (IE)
* France (FR)
* Germany (DE)
* Italy (IT)

## Buyer Initiates Return Reason
| **Order status** | **Buyer available Return reason** | **Reason name** |
| --- | --- | --- |
| AWAITING_COLLECTION <br> IN_TRANSIT <br> DELIVERED <br>  | No longer needed | ecom_order_delivered_refund_reason_no_need |
|  | No longer needed | ecom_order_delivered_refund_and_return_reason_no_need |
|  | Missed estimated delivery date | ecom_order_delivered_refund_reason_missed_delivery_date |
|  | Other | ecom_order_delivered_refund_and_return_reason_other |
|  | Wrong product was sent | ecom_order_delivered_refund_and_return_reason_wrong_product |
|  | Product is defective or doesn't work | ecom_order_delivered_refund_and_return_reason_defective |
|  | Package or product is damaged | ecom_order_delivered_refund_and_return_reason_damaged |
|  | Missing product or accessories | ecom_order_delivered_refund_and_return_reason_missing_product |
|  | Product doesn't match description | ecom_order_delivered_refund_and_return_reason_not_match_description |
|  | Does not suit me | buyer_return_and_refund_does_not_suit_me |
|  | Item is too big/long | buyer_return_and_refund_item_is_too_big/long |
|  | Item is too small/short | buyer_return_and_refund_item_is_too_small/short |
|  | Multiple sizes ordered | buyer_return_and_refund_multiple_sizes_ordered |
|  | Quality or style not as expected | buyer_return_and_refund_quality_or_style_not_as_expected |
|  | Unauthorized purchase | buyer_return_and_refund_unauthorised_purchase |
|  | Product is expired/spoiled | buyer_return_and_refund_product_is_expired/spoiled |
|  | Product not frozen on arrival | buyer_return_and_refund_product_not_frozen_on_arrival |
|  | Ordered incorrect size | buyer_return_and_refund_ordered_incorrect_size |

## Seller Reject Return Request Reason
Seller rejects return request
| **Seller available reject return reason** | **Reason name** |
| --- | --- |
| Product delivery is on schedule | reverse_reject_request_reason_4_uk |
| Change of mind returns are not applicable | reverse_reject_request_reason_2_uk |
| Not eligible for return (e.g. used or broken) | reverse_reject_request_reason_3_uk |
| Product delivery is on schedule | order_manage_list_action_respond_popup_reject_reason_delivered_uk |
| Customer return reason is not valid | reverse_reject_request_reason_1_uk |
| Product functions well/Incorrect usage by the customer | seller_reject_apply_product_functions_well/buyer_use_in_wrong_way |
| Reason is unclear / lack of evidence | seller_reject_apply_reason_is_unclear_or_lack_of_evidence |
| Reached an agreement with the customer | order_manage_list_action_respond_popup_reject_reason_buyer_agree |
| You have reached an agreement with the customer | reverse_reject_request_reason_5 |
| Your products were shipped by multiple packages. | seller_reject_apply_products_will_be_sent_separately |
Seller rejects receive package
| **Seller available reject return reason** | **Reason name** |
| --- | --- |
| You have reached an agreement with the customer | seller_reject_apply_you_have_reached_an_agreement_with_the_buyer |
| The product returned is not the product that was sent | reverse_reject_return_parcel_reason_1 |
| Not eligible for return (e.g. used or broken) | reverse_reject_return_parcel_reason_2 |
| Missing products and/or product parts | reverse_reject_return_parcel_reason_3 |
| I haven't received the package | reverse_reject_return_parcel_reason_4 |
| Product is damaged or used | reverse_reject_return_parcel_reason_5 |

## Seller Initiates Return Reason
| **Order Stauts** | **Seller available initiate Return reason** | **Reason name** |
| --- | --- | --- |
| DELIVERED | No longer needed | seller_ecom_delivered_return_refund_reason1 |
|  | Product doesn't match description | ecom_order_delivered_refund_and_return_reason_not_match_description_seller |
|  | Missing product or accessories | ecom_order_delivered_refund_and_return_reason_missing_product_seller |
|  | Package or product is damaged | ecom_order_delivered_refund_and_return_reason_damaged_seller |
|  | Product is defective or doesn't work | ecom_order_delivered_refund_and_return_reason_defective_seller |
|  | Wrong product was sent | ecom_order_delivered_refund_and_return_reason_wrong_product_seller |
|  | Suspected Counterfeit | buyer_return_and_refund_suspected_counterfeit_seller |


---


# JP market
## Buyer Initiates Return Reason
| **Order status** | **Buyer available Return reason** | **Reason name** |
| --- | --- | --- |
| AWAITING_COLLECTION <br> IN_TRANSIT <br> DELIVERED <br>  | No longer needed (Item must be returned in sealed/original condition). | ecom_order_delivered_refund_reason_no_need |
|  | Received package but missing parts or accessories. | ecom_order_delivered_refund_and_return_reason_missing_parts_JP |
|  | Product doesn't match description. | ecom_order_delivered_refund_and_return_reason_not_match_description_JP |
|  | Package or product is damaged. | ecom_order_delivered_refund_reason_damaged |
|  | Product is defective or doesn't work. | ecom_order_delivered_refund_reason_defective |
|  | Wrong product sent. | ecom_order_delivered_refund_and_return_reason_wrong_product_JP |
|  | Missed estimated delivery date. | ecom_order_delivered_refund_and_return_reason_missed_delivery_date_JP |
## Seller Reject Return Request Reason
Seller rejects return request.
| **Seller available reject return reason** | **Reason name** |
| --- | --- |
| reverse_reject_refund_request_unclear_evidence_Test | Reason is unclear / lack of evidence. |
| ecom_reverse_reject_cancel_reason_product_packed | Product shipped. Tracking updates will be available soon. |
| ecom_reverse_reject_refund_request_failed_delivery | The delivery attempt failed. |
| ecom_reverse_reject_refund_request_package_delivery_multiple_boxes | Products were shipped in multiple packages. |
| ecom_reverse_reject_refund_request_replacement_shipped | Replacement has been shipped. |
| ecom_reverse_reject_apply_buyer_agree_jp | Reached an agreement with the customer. |
| seller_reject_apply_reason_delivered_jp | Product delivery is on schedule. |
| seller_reject_apply_buyers_responsibility_for_incorrect_address | The package has been successfully delivered to the shipping address that was provided. |
| seller_reject_apply_item_is_correct | Item is correct. |
| seller_reject_apply_package_has_not_exceeded_estimated_delivery_time | Product delivery is on schedule. |
| seller_reject_apply_product_functions_well/buyer_use_in_wrong_way | Product functions well / Incorrect usage by the customer. |
| seller_reject_apply_reason_is_unclear_or_lack_of_evidence | Reason is unclear / lack of evidence. |
| seller_reject_apply_unable_to_change_address | Unable to change address. |
Seller rejects receive package.
| **Seller available reject return reason** | **Reason name** |
| --- | --- |
| The product returned is not the product that was sent. | reverse_reject_return_parcel_reason_1 |
| Missing products and/or product parts. | reverse_reject_return_parcel_reason_3 |
| I haven't received the package. | reverse_reject_return_parcel_reason_4 |
| Product is damaged or used. | reverse_reject_return_parcel_reason_5 |
