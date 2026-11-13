---
title: "Refund reasons"
document_id: 67e61e7b8ceb0d04a320061e
document_path: refund-reasons
is_api_doc: true
updated_at: 2026-02-19 02:12:15 UTC
source: https://partner.tiktokshop.com/docv2/page/refund-reasons
---
📌 Different order statuses require different reasons. Check the status on the left in the table to find the applicable reasons, and include the reason name as a request parameter when making the API call. If the cancel reason is not applicable for the order status, the API will return a '25001021 Reason not match order status' error.
# US market
## Buyer Initiates Refund Reason
| **Order status** | **Buyer available refund reason** | **Reason name** |
| --- | --- | --- |
| `AWAITING_COLLECTION` <br> `IN_TRANSIT` | Product wouldn't arrive on time | ecom_order_shipped_refund_reason_not_arrive_on_time |
| `DELIVERED` | Package wasn't received | ecom_order_delivered_refund_reason_not_received |
|  | Package received but missing item | ecom_order_delivered_refund_reason_missing_product |
|  | Damaged item or packaging | ecom_order_delivered_refund_reason_damaged |
|  | Defective item | ecom_order_delivered_refund_reason_defective |
|  | Missing or broken parts | ecom_order_delivered_refund_reason_missing_broken_parts |
|  | Item doesn't match description | ecom_order_delivered_refund_reason_not_match_description |
|  | Wrong item was sent | ecom_order_delivered_refund_reason_wrong_product_1 |
## Seller Reject Refund Request Reason
> ### **1st Review**

| **Seller available reject refund reason** | **Reason name** |
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

## Seller Initiates Refund Reason
| **Order Status** | **Seller available initiate refund reason** | **Reason name** |
| --- | --- | --- |
| `AWAITING_COLLECTION` <br> `IN_TRANSIT` | Package lost | seller_shipped_refund_package_lost |
|  | Package delivery failed | seller_shipped_refund_package_delivery_failed |
|  | Missed estimated delivery date | seller_shipped_refund_miss_estimated_delivery_date |
| `DELIVERED` | Missing product or accessories | ecom_order_delivered_refund_reason_missing_product_seller |
|  | Package wasn't received | ecom_order_delivered_refund_reason_not_received_seller |
|  | Product doesn't match description | ecom_order_delivered_refund_reason_not_match_description_seller |
|  | Package or product is damaged | ecom_order_delivered_refund_reason_damaged_seller |
|  | Wrong product was sent | ecom_order_delivered_refund_reason_wrong_product_seller |
|  | Missed estimated delivery date | ecom_order_delivered_refund_reason_missed_delivery_date_seller |
|  | Package lost | seller_shipped_refund_package_lost |
|  | Package delivery failed | seller_shipped_refund_package_delivery_failed |


---


# UK market
## Buyer Initiates Refund Reason
| **Order status** | **Buyer available refund reason** | **Reason name** |
| --- | --- | --- |
| AWAITING_COLLECTION <br> IN_TRANSIT | Package didn't arrive on time | buyer_refund_package_didn't_arrive_on_time |
| DELIVERED | No longer needed | ecom_order_delivered_refund_reason_no_need_uk |
|  | Package wasn't received | ecom_order_delivered_refund_reason_not_received_uk |
|  | Product doesn't match description | ecom_order_delivered_refund_reason_not_match_uk |
|  | Missing product or accessories | ecom_order_delivered_refund_reason_missing_product_uk |
|  | Package or product is damaged | ecom_order_delivered_refund_reason_damaged_uk |
|  | Product is defective or doesn't work | ecom_order_delivered_refund_reason_defective_uk |
|  | Wrong product was sent | ecom_order_delivered_refund_reason_wrong_product_uk |
|  | Missed estimated delivery date | ecom_order_delivered_refund_reason_missed_delivery_date_uk |
|  | Other | ecom_order_delivered_refund_reason_other_uk |
|  | Suspected Counterfeit | buyer_refund_suspected_counterfeit |
|  | Does not suit me | buyer_refund_does_not_suit_me |
|  | Multiple sizes ordered | buyer_refund_multiple_sizes_ordered |
|  | Quality or style not as expected | buyer_refund_quality_or_style_not_as_expected |
|  | Item is too big/long | buyer_refund_item_is_too_big/long |
|  | Item is too small/short | buyer_refund_item_is_too_small/short |
|  | Ordered incorrect size | buyer_refund_ordered_incorrect_size |
|  | Unauthorised purchase | buyer_refund_unauthorised_purchase |
|  | Product is expired/spoiled | buyer_refund_product_is_expired/spoiled |
|  | Product not frozen on arrival | buyer_refund_product_not_frozen_on_arrival |
## Seller Reject Refund Request Reason
| **Seller available reject refund reason** | **Reason name** |
| --- | --- |
| Buyer return reason is not valid | reverse_reject_request_reason_1_uk |
| Change of mind returns are not applicable | reverse_reject_request_reason_2_uk |
| Not eligible for return (e.g. used or broken) | reverse_reject_request_reason_3_uk |
| Product delivery is on schedule | reverse_reject_request_reason_4_uk |
| You have reached an agreement with the buyer | reverse_reject_request_reason_5_uk |
| Unable to change address | seller_reject_apply_unable_to_change_address |
| Buyer's responsibility for incorrect address | seller_reject_apply_buyer's_responsibility_for_incorrect_address |
| Item is correct | seller_reject_apply_item_is_correct |
| Products will be sent separately | seller_reject_apply_products_will_be_sent_separately |
| Reason is unclear or lack of evidence | seller_reject_apply_reason_is_unclear_or_lack_of_evidence |
| Product functions well/Buyer use in wrong way | seller_reject_apply_product_functions_well/buyer_use_in_wrong_way |
| Reason is unclear / lack of evidence | seller_reject_apply_reason_is_unclear_/_lack_of_evidence |
| Product is shipped and parcel cannot be recalled back from logistics. | seller_reject_apply_package_has_not_exceeded_estimated_delivery_time |
## Seller Initiates Refund Reason
| **Order Status** | **Seller available initiate refund reason** | **Reason name** |
| --- | --- | --- |
| AWAITING_COLLECTION <br> IN_TRANSIT | Package lost | seller_package_lost_uk |
|  | Product wouldn't arrive on time | ecom_order_shipped_refund_reason_not_arrive_on_time_seller_uk |
| DELIVERED | Missing product or accessories | ecom_order_delivered_refund_reason_missing_product_seller_uk |
|  | Package wasn't received | ecom_order_delivered_refund_reason_not_received_seller_uk |
|  | Product doesn't match description | ecom_order_delivered_refund_reason_not_match_description_seller_uk |
|  | Package or product is damaged | ecom_order_delivered_refund_reason_damaged_seller_uk |
|  | Wrong product was sent | ecom_order_delivered_refund_reason_wrong_product_seller_uk |
|  | Missed estimated delivery date | ecom_order_delivered_refund_reason_missed_delivery_date_seller_uk |
|  | Product is defective or doesn't work | ecom_order_delivered_refund_reason_defective_seller_uk |
|  | Suspected Counterfeit | buyer_refund_suspected_counterfeit_seller_uk |


---


# ID market
## Buyer Initiates Refund Reason
| **Order status** | **Buyer available refund reason** | **Reason name** |
| --- | --- | --- |
| AWAITING_COLLECTION <br> IN_TRANSIT | Product wouldn't arrive on time | ecom_order_shipped_refund_reason_not_arrive_on_time |
| DELIVERED | Package wasn't received | ecom_order_delivered_refund_reason_not_received |
|  | Product doesn't match description | ecom_order_delivered_refund_reason_not_match |
|  | Missing product or accessories | ecom_order_delivered_refund_reason_missing_product |
|  | Package or product is damaged | ecom_order_delivered_refund_reason_damaged |
|  | Product is defective or doesn't work | ecom_order_delivered_refund_reason_defective |
|  | Wrong product was sent | ecom_order_delivered_refund_reason_wrong_product |
|  | Missed estimated delivery date | ecom_order_delivered_refund_reason_missed_delivery_date |
|  | Other | ecom_order_delivered_refund_reason_other |
|  | Suspected Counterfeit | buyer_refund_suspected_counterfeit |
## Seller Reject Refund Request Reason
| **Seller available reject refund reason** | **Reason name** |
| --- | --- |
| Buyer return reason is not valid | reverse_reject_request_reason_1 |
| Change of mind returns are not applicable | reverse_reject_request_reason_2 |
| Not eligible for return (e.g. used or broken) | reverse_reject_request_reason_3 |
| Product delivery is on schedule | reverse_reject_request_reason_4 |
| You have reached an agreement with the buyer | reverse_reject_request_reason_5 |
| Unable to change address | seller_reject_apply_unable_to_change_address |
| Need to apply for refund&return | seller_reject_apply_need_to_apply_for_refund&return |
| Buyer's responsibility for incorrect address | seller_reject_apply_buyer's_responsibility_for_incorrect_address |
| Item is correct | seller_reject_apply_item_is_correct |
| Products will be sent separately | seller_reject_apply_products_will_be_sent_separately |
| Reason is unclear or lack of evidence | seller_reject_apply_reason_is_unclear_or_lack_of_evidence |
| Product functions well/Buyer use in wrong way | seller_reject_apply_product_functions_well/buyer_use_in_wrong_way |
| Reason is unclear / lack of evidence | seller_reject_apply_reason_is_unclear_/_lack_of_evidence |
| Product is shipped and parcel cannot be recalled back from logistics. | seller_reject_apply_package_has_not_exceeded_estimated_delivery_time |
## Seller Initiates Refund Reason
| **Order Status** | **Seller available initiate refund reason** | **Reason name** |
| --- | --- | --- |
| DELIVERED | Missing product or accessories | ecom_order_delivered_refund_reason_missing_product_seller |


---


# MY market
## Buyer Initiates Refund Reason
| **Order status** | **Buyer available refund reason** | **Reason name** |
| --- | --- | --- |
| AWAITING_COLLECTION <br> IN_TRANSIT | Product wouldn't arrive on time | ecom_order_shipped_refund_reason_not_arrive_on_time |
| DELIVERED | Package wasn't received | ecom_order_delivered_refund_reason_not_received |
|  | Product doesn't match description | ecom_order_delivered_refund_reason_not_match |
|  | Missing product or accessories | ecom_order_delivered_refund_reason_missing_product |
|  | Package or product is damaged | ecom_order_delivered_refund_reason_damaged |
|  | Product is defective or doesn't work | ecom_order_delivered_refund_reason_defective |
|  | Wrong product was sent | ecom_order_delivered_refund_reason_wrong_product |
|  | Missed estimated delivery date | ecom_order_delivered_refund_reason_missed_delivery_date |
|  | Suspected Counterfeit | buyer_refund_suspected_counterfeit |
## Seller Reject Refund Request Reason
| **Seller available reject refund reason** | **Reason name** |
| --- | --- |
| Buyer return reason is not valid | reverse_reject_request_reason_1 |
| Change of mind returns are not applicable | reverse_reject_request_reason_2 |
| Not eligible for return (e.g. used or broken) | reverse_reject_request_reason_3 |
| Product delivery is on schedule | reverse_reject_request_reason_4 |
| You have reached an agreement with the buyer | reverse_reject_request_reason_5 |
| Unable to change address | seller_reject_apply_unable_to_change_address |
| Need to apply for refund&return | seller_reject_apply_need_to_apply_for_refund&return |
| Buyer's responsibility for incorrect address | seller_reject_apply_buyer's_responsibility_for_incorrect_address |
| Item is correct | seller_reject_apply_item_is_correct |
| Products will be sent separately | seller_reject_apply_products_will_be_sent_separately |
| Reason is unclear or lack of evidence | seller_reject_apply_reason_is_unclear_or_lack_of_evidence |
| Product functions well/Buyer use in wrong way | seller_reject_apply_product_functions_well/buyer_use_in_wrong_way |
| Reason is unclear / lack of evidence | seller_reject_apply_reason_is_unclear_/_lack_of_evidence |
| Product is shipped and parcel cannot be recalled back from logistics. | seller_reject_apply_package_has_not_exceeded_estimated_delivery_time |
## Seller Initiates Refund Reason
Unsupported


---


# PH market
## Buyer Initiates Refund Reason
| **Order status** | **Buyer available refund reason** | **Reason name** |
| --- | --- | --- |
| AWAITING_COLLECTION <br> IN_TRANSIT | Product wouldn't arrive on time | ecom_order_shipped_refund_reason_not_arrive_on_time |
| DELIVERED | Package wasn't received | ecom_order_delivered_refund_reason_not_received |
|  | Product doesn't match description | ecom_order_delivered_refund_reason_not_match |
|  | Missing product or accessories | ecom_order_delivered_refund_reason_missing_product |
|  | Package or product is damaged | ecom_order_delivered_refund_reason_damaged |
|  | Product is defective or doesn't work | ecom_order_delivered_refund_reason_defective |
|  | Wrong product was sent | ecom_order_delivered_refund_reason_wrong_product |
|  | Missed estimated delivery date | ecom_order_delivered_refund_reason_missed_delivery_date |
|  | Suspected Counterfeit | buyer_refund_suspected_counterfeit |
## Seller Reject Refund Request Reason
| **Seller available reject refund reason** | **Reason name** |
| --- | --- |
| Buyer return reason is not valid | reverse_reject_request_reason_1 |
| Change of mind returns are not applicable | reverse_reject_request_reason_2 |
| Not eligible for return (e.g. used or broken) | reverse_reject_request_reason_3 |
| Product delivery is on schedule | reverse_reject_request_reason_4 |
| You have reached an agreement with the buyer | reverse_reject_request_reason_5 |
| Unable to change address | seller_reject_apply_unable_to_change_address |
| Need to apply for refund&return | seller_reject_apply_need_to_apply_for_refund&return |
| Buyer's responsibility for incorrect address | seller_reject_apply_buyer's_responsibility_for_incorrect_address |
| Item is correct | seller_reject_apply_item_is_correct |
| Products will be sent separately | seller_reject_apply_products_will_be_sent_separately |
| Reason is unclear or lack of evidence | seller_reject_apply_reason_is_unclear_or_lack_of_evidence |
| Product functions well/Buyer use in wrong way | seller_reject_apply_product_functions_well/buyer_use_in_wrong_way |
| Reason is unclear / lack of evidence | seller_reject_apply_reason_is_unclear_/_lack_of_evidence |
| Product is shipped and parcel cannot be recalled back from logistics. | seller_reject_apply_package_has_not_exceeded_estimated_delivery_time |
## Seller Initiates Refund Reason
Unsupported


---


# SG market
## Buyer Initiates Refund Reason
| **Order status** | **Buyer available refund reason** | **Reason name** |
| --- | --- | --- |
| AWAITING_COLLECTION <br> IN_TRANSIT | Product wouldn't arrive on time | ecom_order_shipped_refund_reason_not_arrive_on_time |
| DELIVERED | Package wasn't received | ecom_order_delivered_refund_reason_not_received |
|  | Product doesn't match description | ecom_order_delivered_refund_reason_not_match |
|  | Missing product or accessories | ecom_order_delivered_refund_reason_missing_product |
|  | Package or product is damaged | ecom_order_delivered_refund_reason_damaged |
|  | Product is defective or doesn't work | ecom_order_delivered_refund_reason_defective |
|  | Wrong product was sent | ecom_order_delivered_refund_reason_wrong_product |
|  | Missed estimated delivery date | ecom_order_delivered_refund_reason_missed_delivery_date |
|  | Suspected Counterfeit | buyer_refund_suspected_counterfeit |
## Seller Reject Refund Request Reason
| **Seller available reject refund reason** | **Reason name** |
| --- | --- |
| Buyer return reason is not valid | reverse_reject_request_reason_1 |
| Change of mind returns are not applicable | reverse_reject_request_reason_2 |
| Not eligible for return (e.g. used or broken) | reverse_reject_request_reason_3 |
| Product delivery is on schedule | reverse_reject_request_reason_4 |
| You have reached an agreement with the buyer | reverse_reject_request_reason_5 |
| Unable to change address | seller_reject_apply_unable_to_change_address |
| Need to apply for refund&return | seller_reject_apply_need_to_apply_for_refund&return |
| Buyer's responsibility for incorrect address | seller_reject_apply_buyer's_responsibility_for_incorrect_address |
| Item is correct | seller_reject_apply_item_is_correct |
| Products will be sent separately | seller_reject_apply_products_will_be_sent_separately |
| Reason is unclear or lack of evidence | seller_reject_apply_reason_is_unclear_or_lack_of_evidence |
| Product functions well/Buyer use in wrong way | seller_reject_apply_product_functions_well/buyer_use_in_wrong_way |
| Reason is unclear / lack of evidence | seller_reject_apply_reason_is_unclear_/_lack_of_evidence |
| Product is shipped and parcel cannot be recalled back from logistics. | seller_reject_apply_package_has_not_exceeded_estimated_delivery_time |
## Seller Initiates Refund Reason
Unsupported


---


# TH market
## Buyer Initiates Refund Reason
| **Order status** | **Buyer available refund reason** | **Reason name** |
| --- | --- | --- |
| AWAITING_COLLECTION <br> IN_TRANSIT | Product wouldn't arrive on time | ecom_order_shipped_refund_reason_not_arrive_on_time |
|  | Wrong delivery information | ecom_order_shipped_refund_wrong_delivery_info |
|  | Other | ecom_order_shipped_refund_other |
| DELIVERED | No longer needed | ecom_order_delivered_refund_reason_no_need |
|  | Package wasn't received | ecom_order_delivered_refund_reason_not_received |
|  | Product doesn't match description | ecom_order_delivered_refund_reason_not_match |
|  | Missing product or accessories | ecom_order_delivered_refund_reason_missing_product |
|  | Package or product is damaged | ecom_order_delivered_refund_reason_damaged |
|  | Product is defective or doesn't work | ecom_order_delivered_refund_reason_defective |
|  | Wrong product was sent | ecom_order_delivered_refund_reason_wrong_product |
|  | Missed estimated delivery date | ecom_order_delivered_refund_reason_missed_delivery_date |
|  | Suspected Counterfeit | buyer_refund_suspected_counterfeit |
|  | Other | ecom_order_delivered_refund_reason_other |
## Seller Reject Refund Request Reason
| **Seller available reject refund reason** | **Reason name** |
| --- | --- |
| Buyer return reason is not valid | reverse_reject_request_reason_1 |
| Not eligible for return (e.g. used or broken) | reverse_reject_request_reason_3 |
| Product delivery is on schedule | reverse_reject_request_reason_4 |
| You have reached an agreement with the buyer | reverse_reject_request_reason_5 |
| Unable to change address | seller_reject_apply_unable_to_change_address |
| Need to apply for refund&return | seller_reject_apply_need_to_apply_for_refund&return |
| Buyer's responsibility for incorrect address | seller_reject_apply_buyer's_responsibility_for_incorrect_address |
| Item is correct | seller_reject_apply_item_is_correct |
| Products will be sent separately | seller_reject_apply_products_will_be_sent_separately |
| Reason is unclear or lack of evidence | seller_reject_apply_reason_is_unclear_or_lack_of_evidence |
| Product functions well/Buyer use in wrong way | seller_reject_apply_product_functions_well/buyer_use_in_wrong_way |
| Reason is unclear / lack of evidence | seller_reject_apply_reason_is_unclear_/_lack_of_evidence |
| Product is shipped and parcel cannot be recalled back from logistics. | seller_reject_apply_package_has_not_exceeded_estimated_delivery_time |
## Seller Initiates Refund Reason
Unsupported


---


# VN market
## Buyer Initiates Refund Reason
| **Order status** | **Buyer available refund reason** | **Reason name** |
| --- | --- | --- |
| AWAITING_COLLECTION <br> IN_TRANSIT | Product wouldn't arrive on time | ecom_order_shipped_refund_reason_not_arrive_on_time |
| DELIVERED | Package wasn't received | ecom_order_delivered_refund_reason_not_received |
|  | Product doesn't match description | ecom_order_delivered_refund_reason_not_match |
|  | Missing product or accessories | ecom_order_delivered_refund_reason_missing_product |
|  | Package or product is damaged | ecom_order_delivered_refund_reason_damaged |
|  | Product is defective or doesn't work | ecom_order_delivered_refund_reason_defective |
|  | Wrong product was sent | ecom_order_delivered_refund_reason_wrong_product |
|  | Missed estimated delivery date | ecom_order_delivered_refund_reason_missed_delivery_date |
|  | Suspected Counterfeit | buyer_refund_suspected_counterfeit |
## Seller Reject Refund Request Reason
| **Seller available reject refund reason** | **Reason name** |
| --- | --- |
| Buyer return reason is not valid | reverse_reject_request_reason_1 |
| Change of mind returns are not applicable | reverse_reject_request_reason_2 |
| Not eligible for return (e.g. used or broken) | reverse_reject_request_reason_3 |
| Product delivery is on schedule | reverse_reject_request_reason_4 |
| You have reached an agreement with the buyer | reverse_reject_request_reason_5 |
| Unable to change address | seller_reject_apply_unable_to_change_address |
| Need to apply for refund&return | seller_reject_apply_need_to_apply_for_refund&return |
| Buyer's responsibility for incorrect address | seller_reject_apply_buyer's_responsibility_for_incorrect_address |
| Item is correct | seller_reject_apply_item_is_correct |
| Products will be sent separately | seller_reject_apply_products_will_be_sent_separately |
| Reason is unclear or lack of evidence | seller_reject_apply_reason_is_unclear_or_lack_of_evidence |
| Product functions well/Buyer use in wrong way | seller_reject_apply_product_functions_well/buyer_use_in_wrong_way |
| Reason is unclear / lack of evidence | seller_reject_apply_reason_is_unclear_/_lack_of_evidence |
| Product is shipped and parcel cannot be recalled back from logistics. | seller_reject_apply_package_has_not_exceeded_estimated_delivery_time |
## Seller Initiates Refund Reason
| **Order Status** | **Seller available initiate refund reason** | **Reason name** |
| --- | --- | --- |
| AWAITING_COLLECTION <br> IN_TRANSIT | Product wouldn't arrive on time | ecom_order_shipped_refund_reason_not_arrive_on_time_seller |
|  | Package lost | seller_package_lost |
| DELIVERED | Missing product or accessories | ecom_order_delivered_refund_reason_missing_product_seller |
|  | Package wasn't received | ecom_order_delivered_refund_reason_not_received_seller |
|  | Product doesn't match description | ecom_order_delivered_refund_reason_not_match_description_seller |
|  | Package or product is damaged | ecom_order_delivered_refund_reason_damaged_seller |
|  | Wrong product was sent | ecom_order_delivered_refund_reason_wrong_product_seller |
|  | Missed estimated delivery date | ecom_order_delivered_refund_reason_missed_delivery_date_seller |
|  | Product doesn't match description | ecom_order_delivered_refund_reason_not_match_seller |
|  | Product is defective or doesn't work | ecom_order_delivered_refund_reason_defective_seller |
|  | Suspected Counterfeit | buyer_refund_suspected_counterfeit_seller |


---


# MX market
## Buyer Initiates Refund Reason
| **Order status** | **Buyer available refund reason** | **Reason name** |
| --- | --- | --- |
| AWAITING_COLLECTION <br> IN_TRANSIT | Package wasn't received | ecom_order_delivered_refund_reason_not_received |
|  | Defective item | ecom_order_delivered_refund_reason_defective |
|  | Damaged item or packaging | ecom_order_delivered_refund_and_return_reason_damaged |
|  | Product is defective or doesn't work | ecom_order_delivered_refund_reason_defective |
## Seller Reject Refund Request Reason
| **Seller available reject refund reason** | **Reason name** |
| --- | --- |
| Reason is unclear / lack of evidence | seller_reject_apply_reason_is_unclear_or_lack_of_evidence |
| You have reached an agreement with the customer | reverse_reject_request_reason_5 |
| Reason is unclear / lack of evidence | seller_reject_apply_reason_is_unclear_or_lack_of_evidence |
| Product is in transit | seller_reject_apply_package_has_not_exceeded_estimated_delivery_time |
| The package has been successfully delivered to the shipping address that was provided. | seller_reject_apply_buyers_responsibility_for_incorrect_address |
| Need to apply for refund&return | seller_reject_apply_need_to_apply_for_refund&return |
## Seller Initiates Refund Reason
| **Order Status** | **Seller available initiate refund reason** | **Reason name** |
| --- | --- | --- |
| AWAITING_COLLECTION <br> IN_TRANSIT | Package lost | seller_package_lost |
|  | Missed estimated delivery date | seller_shipped_refund_miss_estimated_delivery_date |
|  | Package lost | seller_shipped_refund_package_lost |
|  | Package delivery failed | seller_shipped_refund_package_delivery_failed |
|  | Package lost | ecom_seller_order_delivered_refund_reason_return_proxy_app |
| DELIVERED | Missing products or accessories | ecom_order_delivered_refund_reason_missing_product_seller |
|  | Package or product is damaged | ecom_order_delivered_refund_reason_damaged_seller |
|  | Product doesn't match description | ecom_order_delivered_refund_reason_not_match_description_seller |
|  | Wrong product was sent | ecom_order_delivered_refund_reason_wrong_product_seller |
|  | Missed estimated delivery date | ecom_order_delivered_refund_reason_missed_delivery_date_seller |
|  | Package wasn't received | ecom_order_delivered_refund_reason_not_received_seller |
|  | Missed estimated delivery date | seller_shipped_refund_miss_estimated_delivery_date |
|  | Package lost | seller_shipped_refund_package_lost |
|  | Package delivery failed | seller_shipped_refund_package_delivery_failed |
|  | Package lost | ecom_seller_order_delivered_refund_reason_return_proxy_app |


---


# BR market
## Buyer Initiates Refund Reason
| **Order status** | **Buyer available refund reason** | **Reason name** |
| --- | --- | --- |
| AWAITING_COLLECTION <br> IN_TRANSIT | Package wasn't received | ecom_order_delivered_refund_reason_not_received |
|  | Defective item | ecom_order_delivered_refund_reason_defective |
|  | Damaged item or packaging | ecom_order_delivered_refund_and_return_reason_damaged |
|  | Product is defective or doesn't work | ecom_order_delivered_refund_reason_defective |
## Seller Reject Refund Request Reason
| **Seller available reject refund reason** | **Reason name** |
| --- | --- |
| Reason is unclear / lack of evidence | seller_reject_apply_reason_is_unclear_or_lack_of_evidence |
| You have reached an agreement with the customer | reverse_reject_request_reason_5 |
| Reason is unclear / lack of evidence | seller_reject_apply_reason_is_unclear_or_lack_of_evidence |
| Product is in transit | seller_reject_apply_package_has_not_exceeded_estimated_delivery_time |
| The package has been successfully delivered to the shipping address that was provided. | seller_reject_apply_buyers_responsibility_for_incorrect_address |
| Need to apply for refund&return | seller_reject_apply_need_to_apply_for_refund&return |
## Seller Initiates Refund Reason
| **Order Status** | **Seller available initiate refund reason** | **Reason name** |
| --- | --- | --- |
| AWAITING_COLLECTION <br> IN_TRANSIT | Package lost | seller_package_lost |
|  | Missed estimated delivery date | seller_shipped_refund_miss_estimated_delivery_date |
|  | Package lost | seller_shipped_refund_package_lost |
|  | Package delivery failed | seller_shipped_refund_package_delivery_failed |
|  | Package lost | ecom_seller_order_delivered_refund_reason_return_proxy_app |
| DELIVERED | Missing products or accessories | ecom_order_delivered_refund_reason_missing_product_seller |
|  | Package or product is damaged | ecom_order_delivered_refund_reason_damaged_seller |
|  | Product doesn't match description | ecom_order_delivered_refund_reason_not_match_description_seller |
|  | Wrong product was sent | ecom_order_delivered_refund_reason_wrong_product_seller |
|  | Missed estimated delivery date | ecom_order_delivered_refund_reason_missed_delivery_date_seller |
|  | Package wasn't received | ecom_order_delivered_refund_reason_not_received_seller |
|  | Missed estimated delivery date | seller_shipped_refund_miss_estimated_delivery_date |
|  | Package lost | seller_shipped_refund_package_lost |
|  | Package delivery failed | seller_shipped_refund_package_delivery_failed |
|  | Package lost | ecom_seller_order_delivered_refund_reason_return_proxy_app |



---


# EU market(s)
Currently, supported EU markets include: 

* Spain (ES)
* Ireland (IE)
* France (FR)
* Germany (DE)
* Italy (IT)

## Buyer Initiates Refund Reason
| **Order status** | **Buyer available refund reason** | **Reason name** |
| --- | --- | --- |
| AWAITING_COLLECTION <br> IN_TRANSIT <br> DELIVERED | No longer needed | ecom_order_delivered_refund_reason_no_need |
|  | Missed estimated delivery date | ecom_order_delivered_refund_reason_missed_delivery_date |
|  | Package wasn't received | ecom_order_delivered_refund_reason_not_received |
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


## Seller Reject Refund Request Reason
| **Seller available reject refund reason** | **Reason name** |
| --- | --- |
| Product delivery is on schedule | reverse_reject_request_reason_4_uk |
| Change of mind returns are not applicable | reverse_reject_request_reason_2_uk |
| Product delivery is on schedule | order_manage_list_action_respond_popup_reject_reason_delivered_uk |
| The package has been successfully delivered to the shipping address that was provided. | seller_reject_apply_buyer's_responsibility_for_incorrect_address |
| Product functions well/Incorrect usage by the customer | seller_reject_apply_product_functions_well/buyer_use_in_wrong_way |
| Parcel Delivered but Buyer did not receive, need more information | seller_reject_apply_reason_is_unclear_/_lack_of_evidence |
| Reason is unclear / lack of evidence | seller_reject_apply_reason_is_unclear_or_lack_of_evidence |
| Reached an agreement with the customer | order_manage_list_action_respond_popup_reject_reason_buyer_agree |
| You have reached an agreement with the customer | reverse_reject_request_reason_5 |
| Product is in transit | seller_reject_apply_package_has_not_exceeded_estimated_delivery_time |
| Your products were shipped by multiple packages. | seller_reject_apply_products_will_be_sent_separately |
| Product shipped. Tracking updates will be available soon. | seller_reject_apply_product_has_been_packed |

## Seller Initiates Refund Reason
| **Order Stauts** | **Seller available initiate refund reason** | **Reason name** |
| --- | --- | --- |
| AWAITING_COLLECTION <br> IN_TRANSIT | Package lost | seller_package_lost |
|  | Product wouldn't arrive on time | ecom_order_shipped_refund_reason_not_arrive_on_time_seller |
| DELIVERED <br>  | Missing products or accessories | ecom_order_delivered_refund_reason_missing_product_seller |
|  | Package wasn't received | ecom_order_delivered_refund_reason_not_received_seller |
|  | Product doesn't match description | ecom_order_delivered_refund_reason_not_match_description_seller |
|  | Package or product is damaged | ecom_order_delivered_refund_reason_damaged_seller |
|  | Wrong product was sent | ecom_order_delivered_refund_reason_wrong_product_seller |
|  | Missed estimated delivery date | ecom_order_delivered_refund_reason_missed_delivery_date_seller |
|  | Product is defective or doesn't work | ecom_order_delivered_refund_reason_defective_seller |
|  | Suspected Counterfeit | buyer_refund_suspected_counterfeit_seller |


---


# JP market
## Buyer Initiates Refund Reason
| **Order status** | **Buyer available refund reason** | **Reason name** |
| --- | --- | --- |
| AWAITING_COLLECTION <br> IN_TRANSIT <br> DELIVERED | No longer needed (Item must be returned in sealed/original condition). | ecom_order_delivered_refund_reason_no_need |
|  | Product didn't arrive on time. | ecom_order_shipped_refund_reason_not_arrive_on_time_JP |
|  | Didn't receive package. | ecom_order_delivered_refund_reason_not_received |
|  | Received package but some items are missing. | ecom_order_delivered_refund_reason_missing_product_JP |
|  | Received package but missing parts or accessories. | ecom_order_delivered_refund_and_return_reason_missing_parts_JP |
|  | Product doesn't match description. | ecom_order_delivered_refund_and_return_reason_not_match_description_JP |
|  | Package or product is damaged. | ecom_order_delivered_refund_reason_damaged |
|  | Product is defective or doesn't work. | ecom_order_delivered_refund_reason_defective |
|  | Wrong product sent. | ecom_order_delivered_refund_and_return_reason_wrong_product_JP |
|  | Missed estimated delivery date. | ecom_order_delivered_refund_and_return_reason_missed_delivery_date_JP |


## Seller Reject Refund Request Reason
| **Seller available reject refund reason** | **Reason name** |
| --- | --- |
| Reason is unclear / lack of evidence. | reverse_reject_refund_request_unclear_evidence_Test |
| Product shipped. Tracking updates will be available soon. | ecom_reverse_reject_cancel_reason_product_packed |
| The delivery attempt failed. | ecom_reverse_reject_refund_request_failed_delivery |
| Products were shipped in multiple packages. | ecom_reverse_reject_refund_request_package_delivery_multiple_boxes |
| Replacement has been shipped. | ecom_reverse_reject_refund_request_replacement_shipped |
| Reached an agreement with the customer. | ecom_reverse_reject_apply_buyer_agree_jp |
| Product delivery is on schedule. | seller_reject_apply_reason_delivered_jp |
| The package has been successfully delivered to the shipping address that was provided. | seller_reject_apply_buyers_responsibility_for_incorrect_address |
| Item is correct. | seller_reject_apply_item_is_correct |
| Product delivery is on schedule. | seller_reject_apply_package_has_not_exceeded_estimated_delivery_time |
| Product functions well/Incorrect usage by the customer. | seller_reject_apply_product_functions_well/buyer_use_in_wrong_way |
| Reason is unclear / lack of evidence. | seller_reject_apply_reason_is_unclear_or_lack_of_evidence |
| Unable to change address. | seller_reject_apply_unable_to_change_address |

## Seller Initiates Refund Reason
| **Seller available initiate refund reason** | **Reason name** |
| --- | --- |
| Missing products or accessories | ecom_order_delivered_refund_reason_missing_product_seller |
| General adjustment. | ecom_order_delivered_refund_reason_general_adjustment |
| Package wasn't received. | ecom_order_delivered_refund_reason_not_received_seller |
| Product doesn't match description. | ecom_order_delivered_refund_reason_not_match_description_seller |
| Package or product is damaged. | ecom_order_delivered_refund_reason_damaged_seller |
| Wrong product was sent. | ecom_order_delivered_refund_reason_wrong_product_seller |
| Missed estimated delivery date. | ecom_order_delivered_refund_reason_missed_delivery_date_seller |
| Package lost. | seller_package_lost |
| Package lost. | seller_shipped_refund_package_lost |
| Package delivery failed. | seller_shipped_refund_package_delivery_failed |
| Missed estimated delivery date. | seller_shipped_refund_miss_estimated_delivery_date |
| Package lost. | ecom_seller_order_delivered_refund_reason_return_proxy_app |
