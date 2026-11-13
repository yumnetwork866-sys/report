---
title: "Cancel reasons"
document_id: 67e61eee427345048595487d
document_path: cancel-reasons
is_api_doc: true
updated_at: 2026-11-06 00:33:25 UTC
source: https://partner.tiktokshop.com/docv2/page/cancel-reasons
---
📌 Different order statuses require different reasons. Check the status on the left in the table to find the applicable reasons, and include the reason name as a request parameter when making the API call. If the cancel reason is not applicable for the order status, the API will return a '25001021 Reason not match order status' error.
# US market
## Buyer Initiates Cancel Reason
The following reason is available for buyers when they initiate cancel request.
| **Order Status** | **Buyer available cancel reason** | **Reason name** |
| --- | --- | --- |
| UNPAID | Preferred payment method not available | ecom_order_unpaid_canceled_reason_payment_method_not_available |
|  | Ordered by mistake | ecom_order_unpaid_canceled_reason_created_by_mistakes |
|  | Better price available | ecom_order_unpaid_canceled_reason_better_price |
|  | No longer needed | ecom_order_unpaid_canceled_reason_no_longer_needed |
|  | Other | ecom_order_unpaid_canceled_reason_other |
|  | Forgot to apply coupons | ecom_order_to_ship_canceled_reason_forgot_to_apply_coupons |
| ON_HOLD and AWAITING_SHIPMENT <br>  | Need to change payment method | ecom_order_to_ship_canceled_reason_change_payment_method |
|  | Discount not as expected | ecom_order_to_ship_canceled_reason_discount_not_expected |
|  | Bought by mistake | ecom_order_to_ship_canceled_reason_created_by_mistakes |
|  | High shipping fee | ecom_order_to_ship_canceled_reason_high_delivery_costs |
|  | Better price available | ecom_order_to_ship_canceled_reason_better_price |
|  | Incorrect shipping address | ecom_order_to_ship_canceled_reason_wrong_delivery_info |
|  | Item wasn't shipped on time | ecom_order_to_ship_canceled_reason_not_shipped_on_time |
|  | No longer needed | ecom_order_to_ship_canceled_reason_no_longer_needed |
|  | Forgot to apply coupons | ecom_order_to_ship_canceled_reason_forgot_to_apply_coupons |


## Seller Reject Cancel Request Reason
The reason the seller can use to reject the buyer's cancel request
| **Seller available Reject Cancel reason** | **Reason name** |
| --- | --- |
| Invalid reason for cancellation | order_manage_list_action_respond_popup_reject_reason_invalid_cancellation_reason |
| Product delivery is on schedule | order_manage_list_action_respond_popup_reject_reason_delivered |
| Reached an agreement with the buyer | order_manage_list_action_respond_popup_reject_reason_buyer_agree |
| Product has been packed | seller_reject_apply_product_has_been_packed |

## Seller Initiates Cancel Reason
**Deprecated Reason Codes** beginning **Nov 6, 2026**
| **Order Status** | **Seller available initiate cancel reason** | **Reason name** |
| --- | --- | --- |
| UNPAID | Buyer requested cancellation | seller_cancel_unpaid_reason_buyer_requested_cancellation |
| ON_HOLD and AWAITING_SHIPMENT | Buyer requested cancellation | seller_cancel_paid_reason_buyer_requested_cancellation |
|  | Unable to deliver to buyer address | seller_cancel_paid_reason_address_not_deliver |

**The available reasons for seller initiating a cancellation**
| **Order Status** | **Seller available initiate cancel reason** | **Reason name** |
| --- | --- | --- |
| UNPAID <br>  | Out of stock | seller_cancel_unpaid_reason_out_of_stock |
|  | Pricing error | seller_cancel_unpaid_reason_wrong_price |
|  | Buyer did not pay on time | seller_cancel_unpaid_reason_buyer_hasnt_paid_within_time_allowed |
|  | Seller unable to fulfill order | seller_cancel_unpaid_reason_unable_to_fulfill_order |
| ON_HOLD and AWAITING_SHIPMENT <br>  | Out of stock | seller_cancel_reason_out_of_stock |
|  | Pricing error | seller_cancel_reason_wrong_price |
|  | Seller unable to fulfill order | seller_cancel_reason_unable_to_fulfill_order |
## SYSTEM Cancel Reason
| **Cancel reason** | **Reason name** |
| --- | --- |
| Buyer payment overdue | system_cancel_unpaid_time_out |
| Failed to pass risk review | system_cancel_anti_span_block |
| Inbound failed | system_cancel_cross_border_entry_warehouse_failed_reason2 |
| Order cancelled by system | package_cancel |
| Order cancelled by system | platform_cancel |
| Package rejected | returned_to_shipper_refused |
| Package delivery failed | returned_to_shipper_other |
| Package damaged | package_damagaed |
| Package lost | package_lost |
| Late delivery | threepl_breach |
| Package scrapped | package_scrap |
| Automatically cancelled due to collection time out | system_cancel_order_reason_shipping_timeout |
| This order has been automatically canceled as you didn't provide your delivery address. | system_cancel_add_address_overtime |
| Automatically cancelled due to untraceable tracking number | system_cancel_order_untracked |
| Order canceled by the system | ecom_cb_sc_out_return |
| Automatically canceled as not delivered within 30 days of estimated time of delivery | system_cancel_order_exceed_edt_not_arrive |
| Buyer hasn't paid | ecom_order_unpaid_canceled_reason_not_want_pay |

## Operator Cancel
| **Cancel reason** | **Reason name** |
| --- | --- |
| We have identified a risk involved with your order and cancelled your order for safety reasons to protect your transaction. | system_cancel_order_reason_potential_fraud |
| Order canceled by system. | system_cancel_order_reason_experience_related |
| Failed to pass risk review | operator_cancel_risk_control_block |
| As your product violates the platform's negative review policy, we canceled this transaction. We recommend you process the buyer's after-sales request.  | system_cancel_order_reason_nrr_related |



# UK market
## Buyer Initiates Cancel Reason
The following reason is available for buyers when they initiate cancel request.
| **Order Status** | **Buyer available cancel reason** | **Reason name** |
| --- | --- | --- |
| UNPAID <br>  | Desired payment method not available | ecom_order_unpaid_canceled_reason_payment_method_not_available_uk |
|  | Wrong delivery information | ecom_order_unpaid_canceled_reason_wrong_delivery_info_uk |
|  | Order created by mistake | ecom_order_unpaid_canceled_reason_created_by_mistakes_uk |
|  | Better price available | ecom_order_unpaid_canceled_reason_better_price_uk |
|  | No longer needed | ecom_order_unpaid_canceled_reason_no_longer_needed_uk |
|  | Other | ecom_order_unpaid_canceled_reason_other_uk |
|  | Discount not as expected | ecom_order_to_ship_canceled_reason_discount_not_expected_uk |
|  | High delivery costs | ecom_order_to_ship_canceled_reason_high_delivery_costs_uk |
| ON_HOLD and AWAITING_SHIPMENT <br>  | No longer needed | ecom_order_to_ship_canceled_reason_no_longer_needed_uk |
|  | Need to change payment method | ecom_order_to_ship_canceled_reason_change_payment_method_uk |
|  | Discount not as expected | ecom_order_to_ship_canceled_reason_discount_not_expected_uk |
|  | Order created by mistake | ecom_order_to_ship_canceled_reason_created_by_mistakes_uk |
|  | High delivery costs | ecom_order_to_ship_canceled_reason_high_delivery_costs_uk |
|  | Better price available | ecom_order_to_ship_canceled_reason_better_price_uk |
|  | Wrong delivery information | ecom_order_to_ship_canceled_reason_wrong_delivery_info_uk |
|  | Late shipment | buyer_cancel_late_shipment |
|  | Other | ecom_order_unpaid_canceled_reason_other_uk |


## Seller Reject Cancel Request Reason
The reason the seller can use to reject the buyer's cancel request
| **Seller available Reject Cancel reason** | **Reason name** |
| --- | --- |
| Invalid reason for cancellation | order_manage_list_action_respond_popup_reject_reason_invalid_cancellation_reason_uk |
| Product delivery is on schedule | order_manage_list_action_respond_popup_reject_reason_delivered_uk |
| Reached an agreement with the buyer | order_manage_list_action_respond_popup_reject_reason_buyer_agree_uk |
| Product has been packed | seller_reject_apply_product_has_been_packed |

## Seller Initiates Cancel Reason
The available reason of seller initiates cancel
| **Order Status** | **Seller available initiate cancel reason** | **Reason name** |
| --- | --- | --- |
| UNPAID | Out of stock | seller_cancel_unpaid_reason_out_of_stock_uk |
|  | Pricing error | seller_cancel_unpaid_reason_wrong_price_uk |
|  | Buyer did not pay on time | seller_cancel_unpaid_reason_buyer_hasnt_paid_within_time_allowed_uk |
|  | Seller unable to fulfill order | seller_cancel_unpaid_reason_unable_to_fulfill_order |
| ON_HOLD and AWAITING_SHIPMENT <br>  | Pricing error | seller_cancel_reason_wrong_price_uk |
|  | Unable to deliver to buyer address | seller_cancel_paid_reason_address_not_deliver_uk |
|  | Out of stock | seller_cancel_reason_out_of_stock_uk |
|  | Seller unable to fulfill order | seller_cancel_reason_unable_to_fulfill_order |

## SYSTEM Cancel Reason
| **Cancel reason** | **Reason name** |
| --- | --- |
| Buyer payment overdue | system_cancel_unpaid_time_out_uk |
| Failed to pass risk review | system_cancel_anti_span_block_uk |
| Inbound failed | system_cancel_cross_border_entry_warehouse_failed_reason2_uk |
| Order cancelled by system | package_cancel_uk |
| Order cancelled by system | platform_cancel_uk |
| Package rejected | returned_to_shipper_refused_uk |
| Package delivery failed | returned_to_shipper_other_uk |
| Package damaged | package_damagaed_uk |
| Package lost | package_lost_uk |
| Late delivery | threepl_breach_uk |
| Package scrapped | package_scrap_uk |
| Automatically cancelled due to collection time out | system_cancel_order_reason_shipping_timeout_uk |
| This order has been automatically canceled as you didn't provide your delivery address. | system_cancel_add_address_overtime |
| Automatically cancelled due to untraceable tracking number | system_cancel_order_untracked_uk |
| Order canceled by the system | ecom_cb_sc_out_return |
| Buyer hasn't paid | ecom_order_unpaid_canceled_reason_not_want_pay |

## Operator Cancel
| **Cancel reason** | **Reason name** |
| --- | --- |
| We have identified a risk involved with your order and cancelled your order for safety reasons to protect your transaction. | system_cancel_order_reason_potential_fraud |
| Order canceled by system. | system_cancel_order_reason_experience_related |
| Failed to pass risk review | operator_cancel_risk_control_block |
| As your product violates the platform's negative review policy, we canceled this transaction. We recommend you process the buyer's after-sales request.  | system_cancel_order_reason_nrr_related |



# ID market
## Buyer Initiates Cancel Reason
The following reason is available for buyers when they initiate cancel request.
| **Order Status** | **Buyer available cancel reason** | **Reason name** |
| --- | --- | --- |
| UNPAID <br>  | Desired payment method not available | ecom_order_unpaid_canceled_reason_payment_method_not_available |
|  | Need to input/change coupon code | buyer_cancel_need_to_input/change_coupon_code |
|  | Wrong item variation (color, size, etc.) | buyer_cancel_wrong_item_variation_(colour,_size,_etc.) |
|  | Wrong delivery information | ecom_order_unpaid_canceled_reason_wrong_delivery_info |
|  | Order created by mistake | ecom_order_unpaid_canceled_reason_created_by_mistakes |
|  | Better price available | ecom_order_unpaid_canceled_reason_better_price |
|  | No longer needed | ecom_order_unpaid_canceled_reason_no_longer_needed |
|  | Other | ecom_order_unpaid_canceled_reason_other |
| ON_HOLD and AWAITING_SHIPMENT <br>  | Need to change payment method | ecom_order_to_ship_canceled_reason_change_payment_method |
|  | Discount not as expected | ecom_order_to_ship_canceled_reason_discount_not_expected |
|  | Order created by mistake | ecom_order_to_ship_canceled_reason_created_by_mistakes |
|  | High delivery costs | ecom_order_to_ship_canceled_reason_high_delivery_costs |
|  | Better price available | ecom_order_to_ship_canceled_reason_better_price |
|  | Wrong delivery information | ecom_order_to_ship_canceled_reason_wrong_delivery_info |
|  | Product wasn't shipped on time | ecom_order_to_ship_canceled_reason_not_shipped_on_time |


## Seller Reject Cancel Request Reason
The reason the seller can use to reject the buyer's cancel request
| **Seller available Reject Cancel reason** | **Reason name** |
| --- | --- |
| Invalid reason for cancellation | order_manage_list_action_respond_popup_reject_reason_invalid_cancellation_reason |
| Product delivery is on schedule | order_manage_list_action_respond_popup_reject_reason_delivered |
| Reached an agreement with the buyer | order_manage_list_action_respond_popup_reject_reason_buyer_agree |
| Product has been packed | seller_reject_apply_product_has_been_packed |
| Order canceled by system | system_cancel_failed_due_to_tts |

## Seller Initiates Cancel Reason
The available reason of seller initiates cancel
| **Order Status** | **Seller available initiate cancel reason** | **Reason name** |
| --- | --- | --- |
| UNPAID | Out of stock | seller_cancel_unpaid_reason_out_of_stock |
|  | Pricing error | seller_cancel_unpaid_reason_wrong_price |
|  | Buyer did not pay on time | seller_cancel_unpaid_reason_buyer_hasnt_paid_within_time_allowed |
| ON_HOLD and AWAITING_SHIPMENT <br>  | Out of stock | seller_cancel_reason_out_of_stock |
|  | Pricing error | seller_cancel_reason_wrong_price |
|  | Unable to deliver to buyer address | seller_cancel_paid_reason_address_not_deliver |
## SYSTEM Cancel Reason
| **Cancel reason** | **Reason name** |
| --- | --- |
| Buyer payment overdue | system_cancel_unpaid_time_out |
| Failed to pass risk review | system_cancel_anti_span_block |
| Order cancelled by system | package_cancel |
| Order cancelled by system | platform_cancel |
| Package rejected | returned_to_shipper_refused |
| Package delivery failed | returned_to_shipper_other |
| Package damaged | package_damagaed |
| Package lost | package_lost |
| Late delivery | threepl_breach |
| Package scrapped | package_scrap |
| Automatically cancelled due to collection time out | system_cancel_order_reason_shipping_timeout |
| Automatically cancelled due to recharge time out | system_cancel_virtual_timeout |
| Top up failed | system_cancel_virtual_top_up_failed |
| Invalid phone number | system_cancel_virtual_phone_number_invalid |
| This order has been automatically canceled as you didn't provide your delivery address. | system_cancel_add_address_overtime |
| Order canceled by the system | ecom_cb_sc_out_return |
| Automatically cancelled due to untraceable tracking number | system_cancel_order_untracked |
| Buyer hasn't paid | ecom_order_unpaid_canceled_reason_not_want_pay |

## Operator Cancel
| **Cancel reason** | **Reason name** |
| --- | --- |
| We have identified a risk involved with your order and cancelled your order for safety reasons to protect your transaction. | system_cancel_order_reason_potential_fraud |
| Order canceled by system. | system_cancel_order_reason_experience_related |
| Failed to pass risk review | operator_cancel_risk_control_block |
| As your product violates the platform's negative review policy, we canceled this transaction. We recommend you process the buyer's after-sales request.  | system_cancel_order_reason_nrr_related |



# MY market
## Buyer Initiates Cancel Reason
The following reason is available for buyers when they initiate cancel request.
| **Order Status** | **Buyer available cancel reason** | **Reason name** |
| --- | --- | --- |
| UNPAID <br>  | Need to input/change coupon code | buyer_cancel_need_to_input/change_coupon_code |
|  | Wrong item variation (color, size, etc.) | buyer_cancel_wrong_item_variation_(colour,_size,_etc.) |
|  | Desired payment method not available | ecom_order_unpaid_canceled_reason_payment_method_not_available |
|  | Wrong delivery information | ecom_order_unpaid_canceled_reason_wrong_delivery_info |
|  | Order created by mistake | ecom_order_unpaid_canceled_reason_created_by_mistakes |
|  | Better price available | ecom_order_unpaid_canceled_reason_better_price |
|  | Other | ecom_order_unpaid_canceled_reason_other |
| ON_HOLD and AWAITING_SHIPMENT <br>  | Need to change payment method | ecom_order_to_ship_canceled_reason_change_payment_method |
|  | Discount not as expected | ecom_order_to_ship_canceled_reason_discount_not_expected |
|  | Order created by mistake | ecom_order_to_ship_canceled_reason_created_by_mistakes |
|  | High delivery costs | ecom_order_to_ship_canceled_reason_high_delivery_costs |
|  | Better price available | ecom_order_to_ship_canceled_reason_better_price |
|  | Wrong delivery information | ecom_order_to_ship_canceled_reason_wrong_delivery_info |
|  | Product wasn't shipped on time | ecom_order_to_ship_canceled_reason_not_shipped_on_time |


## Seller Reject Cancel Request Reason
| **Seller available Reject Cancel reason** | **Reason name** |
| --- | --- |
| Invalid reason for cancellation | order_manage_list_action_respond_popup_reject_reason_invalid_cancellation_reason |
| Product delivery is on schedule | order_manage_list_action_respond_popup_reject_reason_delivered |
| Reached an agreement with the buyer | order_manage_list_action_respond_popup_reject_reason_buyer_agree |
| Product has been packed | seller_reject_apply_product_has_been_packed |

## Seller Initiates Cancel Reason
The available reason of seller initiates cancel
| **Order Status** | **Seller available initiate cancel reason** | **Reason name** |
| --- | --- | --- |
| UNPAID | Out of stock | seller_cancel_unpaid_reason_out_of_stock |
|  | Pricing error | seller_cancel_unpaid_reason_wrong_price |
|  | Buyer did not pay on time | seller_cancel_unpaid_reason_buyer_hasnt_paid_within_time_allowed |
| ON_HOLD and AWAITING_SHIPMENT <br>  | Out of stock | seller_cancel_reason_out_of_stock |
|  | Pricing error | seller_cancel_reason_wrong_price |
|  | Unable to deliver to buyer address | seller_cancel_paid_reason_address_not_deliver |

## SYSTEM Cancel Reason
| **Seller available Reject Cancel reason** | **Reason name** |
| --- | --- |
| Buyer payment overdue | system_cancel_unpaid_time_out |
| Failed to pass risk review | system_cancel_anti_span_block |
| Order cancelled by system | package_cancel |
| Order cancelled by system | platform_cancel |
| Package rejected | returned_to_shipper_refused |
| Package delivery failed | returned_to_shipper_other |
| Package damaged | package_damagaed |
| Package lost | package_lost |
| Late delivery | threepl_breach |
| Package scrapped | package_scrap |
| Automatically cancelled due to collection time out | system_cancel_order_reason_shipping_timeout |
| Inbound failed | system_cancel_cross_border_entry_warehouse_failed_reason2 |
| This order has been automatically canceled as you didn't provide your delivery address. | system_cancel_add_address_overtime |
| Order canceled by the system | ecom_cb_sc_out_return |
| Automatically cancelled due to untraceable tracking number | system_cancel_order_untracked |
| Buyer hasn't paid | ecom_order_unpaid_canceled_reason_not_want_pay |

## Operator Cancel
| **Seller available Reject Cancel reason** | **Reason name** |
| --- | --- |
| We have identified a risk involved with your order and cancelled your order for safety reasons to protect your transaction. | system_cancel_order_reason_potential_fraud |
| Order canceled by system. | system_cancel_order_reason_experience_related |
| Failed to pass risk review | operator_cancel_risk_control_block |
| As your product violates the platform's negative review policy, we canceled this transaction. We recommend you process the buyer's after-sales request.  | system_cancel_order_reason_nrr_related |

# PH market
## Buyer Initiates Cancel Reason
The following reason is available for buyers when they initiate cancel request.
| **Order Status** | **Buyer available cancel reason** | **Reason name** |
| --- | --- | --- |
| UNPAID <br>  | Need to input/change coupon code | buyer_cancel_need_to_input/change_coupon_code |
|  | Wrong item variation (color, size, etc.) | buyer_cancel_wrong_item_variation_(colour,_size,_etc.) |
|  | Desired payment method not available | ecom_order_unpaid_canceled_reason_payment_method_not_available |
|  | Wrong delivery information | ecom_order_unpaid_canceled_reason_wrong_delivery_info |
|  | Order created by mistake | ecom_order_unpaid_canceled_reason_created_by_mistakes |
|  | Better price available | ecom_order_unpaid_canceled_reason_better_price |
|  | Other | ecom_order_unpaid_canceled_reason_other |
| ON_HOLD and AWAITING_SHIPMENT <br>  | Need to change payment method | ecom_order_to_ship_canceled_reason_change_payment_method |
|  | Discount not as expected | ecom_order_to_ship_canceled_reason_discount_not_expected |
|  | Order created by mistake | ecom_order_to_ship_canceled_reason_created_by_mistakes |
|  | High delivery costs | ecom_order_to_ship_canceled_reason_high_delivery_costs |
|  | Better price available | ecom_order_to_ship_canceled_reason_better_price |
|  | Wrong delivery information | ecom_order_to_ship_canceled_reason_wrong_delivery_info |
|  | Product wasn't shipped on time | ecom_order_to_ship_canceled_reason_not_shipped_on_time |


## Seller Reject Cancel Request Reason
The reason the seller can use to reject the buyer's cancel request
| **Seller available Reject Cancel reason** | **Reason name** |
| --- | --- |
| Invalid reason for cancellation | order_manage_list_action_respond_popup_reject_reason_invalid_cancellation_reason |
| Product delivery is on schedule | order_manage_list_action_respond_popup_reject_reason_delivered |
| Reached an agreement with the buyer | order_manage_list_action_respond_popup_reject_reason_buyer_agree |
| Product has been packed | seller_reject_apply_product_has_been_packed |

## Seller Initiates Cancel Reason
The available reason of seller initiates cancel
| **Order Status** | **Seller available initiate cancel reason** | **Reason name** |
| --- | --- | --- |
| UNPAID | Out of stock | seller_cancel_unpaid_reason_out_of_stock |
|  | Pricing error | seller_cancel_unpaid_reason_wrong_price |
|  | Buyer did not pay on time | seller_cancel_unpaid_reason_buyer_hasnt_paid_within_time_allowed |
|  | Buyer requested cancellation | seller_cancel_unpaid_reason_buyer_requested_cancellation |
| ON_HOLD and AWAITING_SHIPMENT <br>  | Out of stock | seller_cancel_reason_out_of_stock |
|  | Pricing error | seller_cancel_reason_wrong_price |
|  | Unable to deliver to buyer address | seller_cancel_paid_reason_address_not_deliver |
|  | Buyer requested cancellation | seller_cancel_paid_reason_buyer_requested_cancellation |
## SYSTEM Cancel Reason
| **Cancel reason** | **Reason name** |
| --- | --- |
| Buyer payment overdue | system_cancel_unpaid_time_out |
| Failed to pass risk review | system_cancel_anti_span_block |
| Order cancelled by system | package_cancel |
| Order cancelled by system | platform_cancel |
| Package rejected | returned_to_shipper_refused |
| Package delivery failed | returned_to_shipper_other |
| Package damaged | package_damagaed |
| Package lost | package_lost |
| Late delivery | threepl_breach |
| Package scrapped | package_scrap |
| Automatically cancelled due to collection time out | system_cancel_order_reason_shipping_timeout |
| Inbound failed | system_cancel_cross_border_entry_warehouse_failed_reason2 |
| This order has been automatically canceled as you didn't provide your delivery address. | system_cancel_add_address_overtime |
| Order canceled by the system | ecom_cb_sc_out_return |
| Automatically cancelled due to untraceable tracking number | system_cancel_order_untracked |
| Buyer hasn't paid | ecom_order_unpaid_canceled_reason_not_want_pay |

## Operator Cancel
| **Cancel reason** | **Reason name** |
| --- | --- |
| We have identified a risk involved with your order and cancelled your order for safety reasons to protect your transaction. | system_cancel_order_reason_potential_fraud |
| Order canceled by system. | system_cancel_order_reason_experience_related |
| Failed to pass risk review | operator_cancel_risk_control_block |
| As your product violates the platform's negative review policy, we canceled this transaction. We recommend you process the buyer's after-sales request.  | system_cancel_order_reason_nrr_related |

# SG market
## Buyer Initiates Cancel Reason
The following reason is available for buyers when they initiate cancel request.
| **Order Status** | **Buyer available cancel reason** | **Reason name** |
| --- | --- | --- |
| UNPAID <br>  | Need to input/change coupon code | buyer_cancel_need_to_input/change_coupon_code |
|  | Wrong item variation (color, size, etc.) | buyer_cancel_wrong_item_variation_(colour,_size,_etc.) |
|  | Desired payment method not available | ecom_order_unpaid_canceled_reason_payment_method_not_available |
|  | Wrong delivery information | ecom_order_unpaid_canceled_reason_wrong_delivery_info |
|  | Order created by mistake | ecom_order_unpaid_canceled_reason_created_by_mistakes |
|  | Better price available | ecom_order_unpaid_canceled_reason_better_price |
|  | Other | ecom_order_unpaid_canceled_reason_other |
| ON_HOLD and AWAITING_SHIPMENT <br>  | Need to change payment method | ecom_order_to_ship_canceled_reason_change_payment_method |
|  | Discount not as expected | ecom_order_to_ship_canceled_reason_discount_not_expected |
|  | Order created by mistake | ecom_order_to_ship_canceled_reason_created_by_mistakes |
|  | High delivery costs | ecom_order_to_ship_canceled_reason_high_delivery_costs |
|  | Better price available | ecom_order_to_ship_canceled_reason_better_price |
|  | Wrong delivery information | ecom_order_to_ship_canceled_reason_wrong_delivery_info |
|  | Product wasn't shipped on time | ecom_order_to_ship_canceled_reason_not_shipped_on_time |


## Seller Reject Cancel Request Reason
The reason the seller can use to reject the buyer's cancel request
| **Seller available Reject Cancel reason** | **Reason name** |
| --- | --- |
| Invalid reason for cancellation | order_manage_list_action_respond_popup_reject_reason_invalid_cancellation_reason |
| Product delivery is on schedule | order_manage_list_action_respond_popup_reject_reason_delivered |
| Reached an agreement with the buyer | order_manage_list_action_respond_popup_reject_reason_buyer_agree |
| Product has been packed | seller_reject_apply_product_has_been_packed |

## Seller Initiates Cancel Reason
The available reason of seller initiates cancel
| **Order Status** | **Seller available initiate cancel reason** | **Reason name** |
| --- | --- | --- |
| UNPAID | Out of stock | seller_cancel_unpaid_reason_out_of_stock |
|  | Pricing error | seller_cancel_unpaid_reason_wrong_price |
| ON_HOLD and AWAITING_SHIPMENT <br>  | Out of stock | seller_cancel_reason_out_of_stock |
|  | Pricing error | seller_cancel_reason_wrong_price |
|  | Unable to deliver to buyer address | seller_cancel_unable_to_deliver_to_buyer_address |

## SYSTEM Cancel Reason
| **Cancel reason** | **Reason name** |
| --- | --- |
| Buyer payment overdue | system_cancel_unpaid_time_out |
| Failed to pass risk review | system_cancel_anti_span_block |
| Order cancelled by system | package_cancel |
| Order cancelled by system | platform_cancel |
| Package rejected | returned_to_shipper_refused |
| Package delivery failed | returned_to_shipper_other |
| Package damaged | package_damagaed |
| Package lost | package_lost |
| Late delivery | threepl_breach |
| Package scrapped | package_scrap |
| Automatically cancelled due to collection time out | system_cancel_order_reason_shipping_timeout |
| Inbound failed | system_cancel_cross_border_entry_warehouse_failed_reason2 |
| This order has been automatically canceled as you didn't provide your delivery address. | system_cancel_add_address_overtime |
| Order canceled by the system | ecom_cb_sc_out_return |
| Automatically cancelled due to untraceable tracking number | system_cancel_order_untracked |
| Buyer hasn't paid | ecom_order_unpaid_canceled_reason_not_want_pay |

## Operator Cancel
| **Cancel reason** | **Reason name** |
| --- | --- |
| We have identified a risk involved with your order and cancelled your order for safety reasons to protect your transaction. | system_cancel_order_reason_potential_fraud |
| Order canceled by system. | system_cancel_order_reason_experience_related |
| Failed to pass risk review | operator_cancel_risk_control_block |
| As your product violates the platform's negative review policy, we canceled this transaction. We recommend you process the buyer's after-sales request.  | system_cancel_order_reason_nrr_related |

# TH market
## Buyer Initiates Cancel Reason
The following reason is available for buyers when they initiate cancel request.
| **Order Status** | **Buyer available cancel reason** | **Reason name** |
| --- | --- | --- |
| UNPAID <br>  | Wrong item variation (color, size, etc.) | buyer_cancel_wrong_item_variation_(colour,_size,_etc.) |
|  | Need to input/change coupon code | buyer_cancel_need_to_input/change_coupon_code |
|  | Desired payment method not available | ecom_order_unpaid_canceled_reason_payment_method_not_available |
|  | Wrong delivery information | ecom_order_unpaid_canceled_reason_wrong_delivery_info |
|  | Order created by mistake | ecom_order_unpaid_canceled_reason_created_by_mistakes |
|  | Better price available | ecom_order_unpaid_canceled_reason_better_price |
|  | No longer needed | ecom_order_unpaid_canceled_reason_no_longer_needed |
|  | Other | ecom_order_unpaid_canceled_reason_other |
| ON_HOLD and AWAITING_SHIPMENT <br>  | Need to change payment method | ecom_order_to_ship_canceled_reason_change_payment_method |
|  | Discount not as expected | ecom_order_to_ship_canceled_reason_discount_not_expected |
|  | Order created by mistake | ecom_order_to_ship_canceled_reason_created_by_mistakes |
|  | High delivery costs | ecom_order_to_ship_canceled_reason_high_delivery_costs |
|  | Better price available | ecom_order_to_ship_canceled_reason_better_price |
|  | Wrong delivery information | ecom_order_to_ship_canceled_reason_wrong_delivery_info |
|  | Product wasn't shipped on time | ecom_order_to_ship_canceled_reason_not_shipped_on_time |
|  | No longer needed | ecom_order_to_ship_canceled_reason_no_longer_needed |


## Seller Reject Cancel Request Reason
The reason the seller can use to reject the buyer's cancel request
| **Seller available Reject Cancel reason** | **Reason name** |
| --- | --- |
| Invalid reason for cancellation | order_manage_list_action_respond_popup_reject_reason_invalid_cancellation_reason |
| Product delivery is on schedule | order_manage_list_action_respond_popup_reject_reason_delivered |
| Reached an agreement with the buyer | order_manage_list_action_respond_popup_reject_reason_buyer_agree |
| Product has been packed | seller_reject_apply_product_has_been_packed |

## Seller Initiates Cancel Reason
The available reason of seller initiates cancel
| **Order Status** | **Seller available initiate cancel reason** | **Reason name** |
| --- | --- | --- |
| UNPAID | Out of stock | seller_cancel_unpaid_reason_out_of_stock |
|  | Pricing error | seller_cancel_unpaid_reason_wrong_price |
|  | Buyer did not pay on time | seller_cancel_unpaid_reason_buyer_hasnt_paid_within_time_allowed |
| ON_HOLD and AWAITING_SHIPMENT <br>  | Out of stock | seller_cancel_reason_out_of_stock |
|  | Pricing error | seller_cancel_reason_wrong_price |
|  | Unable to deliver to buyer address | seller_cancel_paid_reason_address_not_deliver |

## SYSTEM Cancel Reason
| **Cancel reason** | **Reason name** |
| --- | --- |
| Buyer payment overdue | system_cancel_unpaid_time_out |
| Failed to pass risk review | system_cancel_anti_span_block |
| Order cancelled by system | package_cancel |
| Order cancelled by system | platform_cancel |
| Package rejected | returned_to_shipper_refused |
| Package delivery failed | returned_to_shipper_other |
| Package damaged | package_damagaed |
| Package lost | package_lost |
| Late delivery | threepl_breach |
| Package scrapped | package_scrap |
| Automatically cancelled due to collection time out | system_cancel_order_reason_shipping_timeout |
| Inbound failed | system_cancel_cross_border_entry_warehouse_failed_reason2 |
| This order has been automatically canceled as you didn't provide your delivery address. | system_cancel_add_address_overtime |
| Order canceled by the system | ecom_cb_sc_out_return |
| Automatically cancelled due to untraceable tracking number | system_cancel_order_untracked |
| Buyer hasn't paid | ecom_order_unpaid_canceled_reason_not_want_pay |

## Operator Cancel
| **Cancel reason** | **Reason name** |
| --- | --- |
| We have identified a risk involved with your order and cancelled your order for safety reasons to protect your transaction. | system_cancel_order_reason_potential_fraud |
| Order canceled by system. | system_cancel_order_reason_experience_related |
| Failed to pass risk review | operator_cancel_risk_control_block |
| As your product violates the platform's negative review policy, we canceled this transaction. We recommend you process the buyer's after-sales request.  | system_cancel_order_reason_nrr_related |


# VN market
## Buyer Initiates Cancel Reason
The following reason is available for buyers when they initiate cancel request.
| **Order Status** | **Buyer available cancel reason** | **Reason name** |
| --- | --- | --- |
| UNPAID <br>  | Need to input/change coupon code | buyer_cancel_need_to_input/change_coupon_code |
|  | Wrong item variation (color, size, etc.) | buyer_cancel_wrong_item_variation_(colour,_size,_etc.) |
|  | Desired payment method not available | ecom_order_unpaid_canceled_reason_payment_method_not_available |
|  | Wrong delivery information | ecom_order_unpaid_canceled_reason_wrong_delivery_info |
|  | Order created by mistake | ecom_order_unpaid_canceled_reason_created_by_mistakes |
|  | Better price available | ecom_order_unpaid_canceled_reason_better_price |
|  | Other | ecom_order_unpaid_canceled_reason_other |
| ON_HOLD and AWAITING_SHIPMENT <br>  | Need to change payment method | ecom_order_to_ship_canceled_reason_change_payment_method |
|  | Discount not as expected | ecom_order_to_ship_canceled_reason_discount_not_expected |
|  | Order created by mistake | ecom_order_to_ship_canceled_reason_created_by_mistakes |
|  | High delivery costs | ecom_order_to_ship_canceled_reason_high_delivery_costs |
|  | Better price available | ecom_order_to_ship_canceled_reason_better_price |
|  | Wrong delivery information | ecom_order_to_ship_canceled_reason_wrong_delivery_info |
|  | Product wasn't shipped on time | ecom_order_to_ship_canceled_reason_not_shipped_on_time |


## Seller Reject Cancel Request Reason
The reason the seller can use to reject the buyer's cancel request
| **Seller available Reject Cancel reason** | **Reason name** |
| --- | --- |
| Invalid reason for cancellation | order_manage_list_action_respond_popup_reject_reason_invalid_cancellation_reason |
| Product delivery is on schedule | order_manage_list_action_respond_popup_reject_reason_delivered |
| Reached an agreement with the buyer | order_manage_list_action_respond_popup_reject_reason_buyer_agree |
| Product has been packed | seller_reject_apply_product_has_been_packed |

## Seller Initiates Cancel Reason
The available reason of seller initiates cancel
| **Order Status** | **Seller available initiate cancel reason** | **Reason name** |
| --- | --- | --- |
| UNPAID | Out of stock | seller_cancel_unpaid_reason_out_of_stock |
|  | Pricing error | seller_cancel_unpaid_reason_wrong_price |
|  | Buyer did not pay on time | seller_cancel_unpaid_reason_buyer_hasnt_paid_within_time_allowed |
| ON_HOLD and AWAITING_SHIPMENT <br>  | Out of stock | seller_cancel_reason_out_of_stock |
|  | Pricing error | seller_cancel_reason_wrong_price |
|  | Unable to deliver to buyer address | seller_cancel_paid_reason_address_not_deliver |

## SYSTEM Cancel Reason
| **Cancel reason** | **Reason name** |
| --- | --- |
| Buyer payment overdue | system_cancel_unpaid_time_out |
| Failed to pass risk review | system_cancel_anti_span_block |
| Order cancelled by system | package_cancel |
| Order cancelled by system | platform_cancel |
| Package rejected | returned_to_shipper_refused |
| Package delivery failed | returned_to_shipper_other |
| Package damaged | package_damagaed |
| Package lost | package_lost |
| Late delivery | threepl_breach |
| Package scrapped | package_scrap |
| Automatically cancelled due to collection time out | system_cancel_order_reason_shipping_timeout |
| Inbound failed | system_cancel_cross_border_entry_warehouse_failed_reason2 |
| This order has been automatically canceled as you didn't provide your delivery address. | system_cancel_add_address_overtime |
| Order canceled by the system | ecom_cb_sc_out_return |
| Automatically cancelled due to untraceable tracking number | system_cancel_order_untracked |
| Buyer hasn't paid | ecom_order_unpaid_canceled_reason_not_want_pay |

## Operator Cancel
| **Cancel reason** | **Reason name** |
| --- | --- |
| We have identified a risk involved with your order and cancelled your order for safety reasons to protect your transaction. | system_cancel_order_reason_potential_fraud |
| Order canceled by system. | system_cancel_order_reason_experience_related |
| Failed to pass risk review | operator_cancel_risk_control_block |
| As your product violates the platform's negative review policy, we canceled this transaction. We recommend you process the buyer's after-sales request.  | system_cancel_order_reason_nrr_related |

# MX Market
## Buyer Initiates Cancel Reason
The following reason is available for buyers when they initiate cancel request.
| **Order Status** | **Buyer available cancel reason** | **Reason name** |
| --- | --- | --- |
| UNPAID <br>  | No longer needed | ecom_order_to_ship_canceled_reason_no_longer_needed |
|  | Bought by mistake | ecom_order_to_ship_canceled_reason_created_by_mistakes |
|  | Forgot to apply coupons | ecom_order_to_ship_canceled_reason_forgot_to_apply_coupons |
|  | Incorrect shipping address | ecom_order_to_ship_canceled_reason_wrong_delivery_info |
|  | Better price available | ecom_order_to_ship_canceled_reason_better_price |
| ON_HOLD and AWAITING_SHIPMENT <br>  | No longer needed | ecom_order_to_ship_canceled_reason_no_longer_needed |
|  | Bought by mistake | ecom_order_to_ship_canceled_reason_created_by_mistakes |
|  | Forgot to apply coupons | ecom_order_to_ship_canceled_reason_forgot_to_apply_coupons |
|  | Incorrect shipping address | ecom_order_to_ship_canceled_reason_wrong_delivery_info |
|  | Item wasn't shipped on time | ecom_order_to_ship_canceled_reason_not_shipped_on_time |
|  | Better price available | ecom_order_to_ship_canceled_reason_better_price |


## Seller Reject Cancel Request Reason
The reason the seller can use to reject the buyer's cancel request
| **Seller available Reject Cancel reason** | **Reason name** |
| --- | --- |
| Product shipped. Tracking updates will be available soon. | seller_reject_apply_product_has_been_packed |
| You have reached an agreement with the customer | reverse_reject_request_reason_5 |
| Unable to change address | seller_reject_apply_unable_to_change_address |

## Seller Initiates Cancel Reason
The available reason of seller initiates cancel
| **Order Status** | **Seller available initiate cancel reason** | **Reason name** |
| --- | --- | --- |
| UNPAID | Out of stock | seller_cancel_unpaid_reason_out_of_stock |
|  | Pricing error | seller_cancel_unpaid_reason_wrong_price |
|  | Customer did not pay on time | seller_cancel_unpaid_reason_buyer_hasnt_paid_within_time_allowed |
|  | Customer requested cancellation | seller_cancel_unpaid_reason_buyer_requested_cancellation |
| ON_HOLD and AWAITING_SHIPMENT <br>  | Out of stock | seller_cancel_reason_out_of_stock |
|  | Customer requested cancellation | seller_cancel_paid_reason_buyer_requested_cancellation |
|  | Unable to deliver to customer address | seller_cancel_paid_reason_address_not_deliver |

## SYSTEM Cancel Reason
| **Cancel reason** | **Reason name** |
| --- | --- |
| Customer overdue to pay | system_cancel_unpaid_time_out |
| Failed to pass risk review | system_cancel_anti_span_block |
| Inbound failed | system_cancel_cross_border_entry_warehouse_failed_reason2 |
| Order cancelled by system | package_cancel |
| Order cancelled by system | platform_cancel |
| Package rejected | returned_to_shipper_refused |
| Package delivery failed | returned_to_shipper_other |
| Package damaged | package_damagaed |
| Package lost | package_lost |
| Late delivery | threepl_breach |
| Package scrapped | package_scrap |
| Automatically canceled due to collection time out | system_cancel_order_reason_shipping_timeout |
| This order has been automatically canceled as you didn't provide your delivery address. | system_cancel_add_address_overtime |
| Automatically canceled due to untraceable tracking number | system_cancel_order_untracked |
| Order canceled by the system | ecom_cb_sc_out_return |
| Automatically canceled as not delivered within 30 days of estimated time of delivery | system_cancel_order_exceed_edt_not_arrive |
| Customer hasn't paid | ecom_order_unpaid_canceled_reason_not_want_pay |
| This order was canceled automatically as the customer's payment method could not be charged. | system_cancel_payment_capture_failed |
| This order was canceled automatically due to payment risk control interception. | system_cancel_payment_risk_review_failed |
| This order was canceled automatically due to inventory shortage. | system_cancel_create_valid_order_failed |

## Operator Cancel
| **Cancel reason** | **Reason name** |
| --- | --- |
| We have identified a risk involved with your order and canceled your order for safety reasons to protect your transaction. | system_cancel_order_reason_potential_fraud |
| During our regular review, the order you placed was found to have potential issues that may result in an experience that doesn't meet our standards. To ensure you have a great shopping experience, we have proactively issued a full refund. | system_cancel_order_reason_experience_related |
| Failed to pass risk review | operator_cancel_risk_control_block |
| As your product violates the platform's negative review policy, we canceled this transaction. We recommend you process the customer's after-sales request.  | system_cancel_order_reason_nrr_related |

# BR Market
## Buyer Initiates Cancel Reason
The following reason is available for buyers when they initiate cancel request.
| **Order Status** | **Buyer available cancel reason** | **Reason name** |
| --- | --- | --- |
| UNPAID <br>  | No longer needed | ecom_order_to_ship_canceled_reason_no_longer_needed |
|  | Bought by mistake | ecom_order_to_ship_canceled_reason_created_by_mistakes |
|  | Forgot to apply coupons | ecom_order_to_ship_canceled_reason_forgot_to_apply_coupons |
|  | Incorrect shipping address | ecom_order_to_ship_canceled_reason_wrong_delivery_info |
|  | Better price available | ecom_order_to_ship_canceled_reason_better_price |
| ON_HOLD and AWAITING_SHIPMENT <br>  | No longer needed | ecom_order_to_ship_canceled_reason_no_longer_needed |
|  | Bought by mistake | ecom_order_to_ship_canceled_reason_created_by_mistakes |
|  | Forgot to apply coupons | ecom_order_to_ship_canceled_reason_forgot_to_apply_coupons |
|  | Incorrect shipping address | ecom_order_to_ship_canceled_reason_wrong_delivery_info |
|  | Item wasn't shipped on time | ecom_order_to_ship_canceled_reason_not_shipped_on_time |
|  | Better price available | ecom_order_to_ship_canceled_reason_better_price |


## Seller Reject Cancel Request Reason
The reason the seller can use to reject the buyer's cancel request
| **Seller available Reject Cancel reason** | **Reason name** |
| --- | --- |
| Product shipped. Tracking updates will be available soon. | seller_reject_apply_product_has_been_packed |
| You have reached an agreement with the customer | reverse_reject_request_reason_5 |
| Unable to change address | seller_reject_apply_unable_to_change_address |

## Seller Initiates Cancel Reason
The available reason of seller initiates cancel
| **Order Status** | **Seller available initiate cancel reason** | **Reason name** |
| --- | --- | --- |
| UNPAID | Out of stock | seller_cancel_unpaid_reason_out_of_stock |
|  | Pricing error | seller_cancel_unpaid_reason_wrong_price |
|  | Customer did not pay on time | seller_cancel_unpaid_reason_buyer_hasnt_paid_within_time_allowed |
|  | Customer requested cancellation | seller_cancel_unpaid_reason_buyer_requested_cancellation |
| ON_HOLD and AWAITING_SHIPMENT <br>  | Out of stock | seller_cancel_reason_out_of_stock |
|  | Customer requested cancellation | seller_cancel_paid_reason_buyer_requested_cancellation |
|  | Unable to deliver to customer address | seller_cancel_paid_reason_address_not_deliver |

## SYSTEM Cancel Reason
| **Cancel reason** | **Reason name** |
| --- | --- |
| Customer overdue to pay | system_cancel_unpaid_time_out |
| Failed to pass risk review | system_cancel_anti_span_block |
| Inbound failed | system_cancel_cross_border_entry_warehouse_failed_reason2 |
| Order cancelled by system | package_cancel |
| Order cancelled by system | platform_cancel |
| Package rejected | returned_to_shipper_refused |
| Package delivery failed | returned_to_shipper_other |
| Package damaged | package_damagaed |
| Package lost | package_lost |
| Late delivery | threepl_breach |
| Package scrapped | package_scrap |
| Automatically canceled due to collection time out | system_cancel_order_reason_shipping_timeout |
| This order has been automatically canceled as you didn't provide your delivery address. | system_cancel_add_address_overtime |
| Automatically canceled due to untraceable tracking number | system_cancel_order_untracked |
| Order canceled by the system | ecom_cb_sc_out_return |
| Automatically canceled as not delivered within 30 days of estimated time of delivery | system_cancel_order_exceed_edt_not_arrive |
| Customer hasn't paid | ecom_order_unpaid_canceled_reason_not_want_pay |
| This order was canceled automatically as the customer's payment method could not be charged. | system_cancel_payment_capture_failed |
| This order was canceled automatically due to payment risk control interception. | system_cancel_payment_risk_review_failed |
| This order was canceled automatically due to inventory shortage. | system_cancel_create_valid_order_failed |

## Operator Cancel
| **Cancel reason** | **Reason name** |
| --- | --- |
| We have identified a risk involved with your order and canceled your order for safety reasons to protect your transaction. | system_cancel_order_reason_potential_fraud |
| During our regular review, the order you placed was found to have potential issues that may result in an experience that doesn't meet our standards. To ensure you have a great shopping experience, we have proactively issued a full refund. | system_cancel_order_reason_experience_related |
| Failed to pass risk review | operator_cancel_risk_control_block |
| As your product violates the platform's negative review policy, we canceled this transaction. We recommend you process the customer's after-sales request.  | system_cancel_order_reason_nrr_related |

# ES/IE/FR/DE/IT Market
## Buyer Initiates Cancel Reason
The following reason is available for buyers when they initiate cancel request.
| **Order Status** | **Buyer available cancel reason** | **Reason name** |
| --- | --- | --- |
| UNPAID <br>  | High delivery costs | ecom_order_to_ship_canceled_reason_high_delivery_costs |
|  | Discount not as expected | ecom_order_to_ship_canceled_reason_discount_not_expected |
|  | Seller is not responsive to my inquiries / seller requests to cancel | ecom_order_unpaid_canceled_reason_other |
|  | No longer needed | ecom_order_unpaid_canceled_reason_no_longer_needed |
| ON_HOLD and AWAITING_SHIPMENT <br>  | No reason | ecom_order_delivered_refund_reason_none |
|  | Late shipment | buyer_cancel_late_shipment |
|  | Wrong delivery information | ecom_order_to_ship_canceled_reason_wrong_delivery_info |
|  | Better price available | ecom_order_to_ship_canceled_reason_better_price |
|  | High delivery costs | ecom_order_to_ship_canceled_reason_high_delivery_costs |
|  | Discount not as expected | ecom_order_to_ship_canceled_reason_discount_not_expected |
|  | Order created by mistake | ecom_order_to_ship_canceled_reason_created_by_mistakes |
|  | Seller is not responsive to my inquiries / seller requests to cancel | ecom_order_unpaid_canceled_reason_other |
|  | Need to change payment method | ecom_order_to_ship_canceled_reason_change_payment_method |
|  | No longer needed | ecom_order_unpaid_canceled_reason_no_longer_needed |

## Seller Initiates Cancel Reason
The available reason of seller initiates cancel
| **Order Status** | **Seller available initiate cancel reason** | **Reason name** |
| --- | --- | --- |
| UNPAID | Out of stock | seller_cancel_unpaid_reason_out_of_stock |
|  | Pricing error | seller_cancel_unpaid_reason_wrong_price |
|  | Customer did not pay on time | seller_cancel_unpaid_reason_buyer_hasnt_paid_within_time_allowed |
|  | Customer requested cancellation | seller_cancel_unpaid_reason_buyer_requested_cancellation |
|  | Seller unable to fulfill order | seller_cancel_unpaid_reason_unable_to_fulfill_order |
| ON_HOLD and AWAITING_SHIPMENT <br>  | Out of stock | seller_cancel_reason_out_of_stock |
|  | Pricing error | seller_cancel_reason_wrong_price |
|  | Unable to deliver to customer address | seller_cancel_paid_reason_address_not_deliver |
|  | Customer requested cancellation | seller_cancel_paid_reason_buyer_requested_cancellation |
|  | Seller unable to fulfill order | seller_cancel_reason_unable_to_fulfill_order |

## SYSTEM Cancel Reason
| **Cancel reason** | **Reason name** |
| --- | --- |
| Customer overdue to pay | system_cancel_unpaid_time_out |
| Failed to pass risk review | system_cancel_anti_span_block |
| Inbound failed | system_cancel_cross_border_entry_warehouse_failed_reason2 |
| Order cancelled by system | package_cancel |
| Order cancelled by system | platform_cancel |
| Package rejected | returned_to_shipper_refused |
| Package delivery failed | returned_to_shipper_other |
| Package damaged | package_damagaed |
| Package lost | package_lost |
| Late delivery | threepl_breach |
| Package scrapped | package_scrap |
| Automatically canceled due to collection time out | system_cancel_order_reason_shipping_timeout |
| This order has been automatically canceled as you didn't provide your delivery address. | system_cancel_add_address_overtime |
| Automatically canceled due to untraceable tracking number | system_cancel_order_untracked |
| Order canceled by the system | ecom_cb_sc_out_return |
| Customer hasn't paid | ecom_order_unpaid_canceled_reason_not_want_pay |
| Automatically canceled as not delivered within 30 days of estimated time of delivery | system_cancel_order_exceed_edt_not_arrive |

## Operator Cancel
| **Cancel reason** | **Reason name** |
| --- | --- |
| Failed to pass risk review | operator_cancel_risk_control_block |
| We have identified a risk involved with your order and canceled your order for safety reasons to protect your transaction. | system_cancel_order_reason_potential_fraud |
| During our regular review, the order you placed was found to have potential issues that may result in an experience that doesn't meet our standards. To ensure you have a great shopping experience, we have proactively issued a full refund. | system_cancel_order_reason_experience_related |
| As your product violates the platform's negative review policy, we canceled this transaction. We recommend you process the customer's after-sales request.  | system_cancel_order_reason_nrr_related |

# JP market
## Buyer Initiates Cancel Reason
| **Order status** | **Buyer available Return reason** | **Reason name** |
| --- | --- | --- |
| AWAITING_COLLECTION <br> IN_TRANSIT <br> DELIVERED <br>  | Order created by mistake | ecom_order_unpaid_canceled_reason_created_by_mistakes |
|  | Need to change payment method | ecom_order_unpaid_canceled_reason_payment_method_not_available_S |
|  | Need to use coupon | buyer_cancel_need_to_input/change_coupon_code |
|  | Need to change color or size | buyer_cancel_wrong_item_variation_(colour,_size,_etc.) |
|  | Need to change shipping address | ecom_order_unpaid_canceled_reason_wrong_delivery_info |
|  | Found better price | ecom_order_unpaid_canceled_reason_better_price |
|  | No longer need item | ecom_order_unpaid_canceled_reason_no_longer_needed |
|  | Seller not responsive | ecom_order_to_ship_canceled_reason_seller_no_response |
|  | Seller requested to cancel order | ecom_order_unpaid_canceled_reason_seller_ask_cancel |


## Seller Initiates Cancel Reason
| **Order Status** | **Seller available initiate Return reason** | **Reason name** |
| --- | --- | --- |
| UNPAID | Pricing error | seller_cancel_unpaid_reason_wrong_price |
|  | Out of stock | seller_cancel_unpaid_reason_out_of_stock |
|  | Customer requested cancellation | seller_cancel_unpaid_reason_buyer_requested_cancellation |
|  | Customer did not pay on time | seller_cancel_unpaid_reason_buyer_hasnt_paid_within_time_allowed |
|  | Seller unable to fulfill order | seller_cancel_unpaid_reason_unable_to_fulfill_order |
| ON_HOLD and AWAITING_SHIPMENT <br>  | Pricing error | seller_cancel_reason_wrong_price |
|  | Out of stock | seller_cancel_reason_out_of_stock |
|  | Customer requested cancellation | seller_cancel_paid_reason_buyer_requested_cancellation |
|  | Unable to deliver to customer address | seller_cancel_paid_reason_address_not_deliver |
|  | Order with high chance of cancellation / refund  | seller_cancel_order_reason_potential_fraud |
|  | Seller unable to fulfill order | seller_cancel_reason_unable_to_fulfill_order |

## SYSTEM Cancel Reason
| **Cancel reason** | **Reason name** |
| --- | --- |
| Customer overdue to pay | system_cancel_unpaid_time_out |
| Failed to pass risk review | system_cancel_anti_span_block |
| Inbound failed | system_cancel_cross_border_entry_warehouse_failed_reason2 |
| Order cancelled by system | package_cancel |
| Order cancelled by system | platform_cancel |
| Package rejected | returned_to_shipper_refused |
| Package delivery failed | returned_to_shipper_other |
| Package damaged | package_damagaed |
| Package lost | package_lost |
| Late delivery | threepl_breach |
| Package scrapped | package_scrap |
| Automatically canceled due to collection time out | system_cancel_order_reason_shipping_timeout |
| This order has been automatically canceled as you didn't provide your delivery address. | system_cancel_add_address_overtime |
| Automatically canceled due to untraceable tracking number | system_cancel_order_untracked |
| Order canceled by the system | ecom_cb_sc_out_return |
| This order was automatically canceled because it wasn't delivered within the estimated delivery time. | system_cancel_order_exceed_edt_not_arrive |
| Customer hasn't paid | ecom_order_unpaid_canceled_reason_not_want_pay |
| This order was canceled automatically as the customer's payment method could not be charged. | system_cancel_payment_capture_failed |
| This order was canceled automatically due to payment risk control interception. | system_cancel_payment_risk_review_failed |
| This order was canceled automatically due to inventory shortage. | system_cancel_create_valid_order_failed |
| Certificate not uploaded | system_cancel_order_reason_coa_upload_more_than_24hrs |
| Unable to verify certificate | system_cancel_order_reason_coa_2nd_upload_rejected |
| Unable to authenticate | system_cancel_order_reason_coa_rejected_fraud |
| Verification timed out | system_cancel_order_reason_coa_moderation_more_than_12hrs |
| The packaging or shipping failed to meet standards due to incorrect labeling, postage issues, third-party fulfillment problems, or weight discrepancies. | system_cancel_unpaid_postage |
| Package delivery failed | early_refund_returned_to_shipper |

## Operator Cancel
| **Cancel reason** | **Reason name** |
| --- | --- |
| We have identified a risk involved with your order and canceled your order for safety reasons to protect your transaction. | system_cancel_order_reason_potential_fraud |
| During our regular review, the order you placed was found to have potential issues that may result in an experience that doesn't meet our standards. To ensure you have a great shopping experience, we have proactively issued a full refund. | system_cancel_order_reason_experience_related |
| Failed to pass risk review | operator_cancel_risk_control_block |
| As your product violates the platform's negative review policy, we canceled this transaction. We recommend you process the customer's after-sales request.  | system_cancel_order_reason_nrr_related |
