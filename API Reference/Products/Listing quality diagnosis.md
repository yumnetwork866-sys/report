---
title: "Listing quality diagnosis"
document_id: 66eb8f5c6f2da702e96a49dd
document_path: listing-quality-diagnosis
is_api_doc: true
updated_at: 2025-10-16 18:03:58 UTC
source: https://partner.tiktokshop.com/docv2/page/listing-quality-diagnosis
---
High-quality product listings are essential for improving visibility and building customer trust. 
TikTok Shop provides APIs that diagnose product content and offer recommendations for optimization, covering areas such as text, image, and search engine optimization (SEO).

**For unlisted new products**
- [Check Product Listing API (v202309)](https://partner.tiktokshop.com/docv2/page/650a0ee8f1fd3102b91c6493): Use this API to diagnose new products in advance before listing.
<br>
**For existing products**
- [Product Information Issue Diagnosis API (v202405)](https://partner.tiktokshop.com/docv2/page/665048f380b6b302e73917d9): Use this API to diagnose live products that are already listed in the shop catalog.
<br>

**Note**: For developers servicing the US market, you can use the [Search Products API (v202312)](https://partner.tiktokshop.com/docv2/page/65854ffb8f559302d8a6acda?external_id=65854ffb8f559302d8a6acda) to first retrieve products that fall under a certain listing quality tier before running [Product Information Issue Diagnosis API (v202405)](https://partner.tiktokshop.com/docv2/page/665048f380b6b302e73917d9) to identify the recommendations. After which, you can use [Get Product API (v202309)](https://partner.tiktokshop.com/docv2/page/6509d85b4a0bb702c057fdda?external_id=6509d85b4a0bb702c057fdda) to retrieve a product's existing property values (including its listing quality tier) and pinpoint the ones that need to be edited.
# Diagnosis results and recommendations
The diagnosis is performed on the following product fields:
**-** **Title**: The product title (API property: `title`)
**-** **Description**: The product description (API property: `description`)
**-** **Attributes**: The product attributes (API property: `product_attributes` or `skus.sales_attributes`)
**-** **Size chart**: The size chart image (API property: `size_chart`)
**-** **Product images**: The product images displayed in the image gallery (API property: `main_images`)

Refer to the following region-based tables for the diagnosis results/codes returned in the APIs and the actionable recommendations to optimize your listings effectively.
**Note**: Codes marked as "**Retired**" indicate that they are no longer recommended and will not appear anymore.

# United States
In the US, product listings are evaluated based on a tiered system that includes listing quality tiers such as "POOR", FAIR", and "GOOD". Each diagnosis code corresponds to a specific recommendation and is assigned a quality tier, such as "FAIR" or "GOOD". Implementing the recommendations can help your listing progress through these tiers to achieve better quality and visibility. For example, a product will reach the "GOOD" tier once all "FAIR" and "GOOD" recommendations are addressed or implemented.
For more information about the listing quality tiers and criteria, refer to [Listing Quality Guidelines](https://seller-us.tiktok.com/university/essay?from=feature_guide&identity=1&knowledge_id=481891871868714&role=1).
| **Quality tier**  <!-- width:100px --> | **Category**  <!-- width:130px --> | **Diagnosis code (`diagnosis_results.code`）**<!-- width:440px --> | **Recommendations** |
| --- | --- | --- | --- |
| FAIR | Description | DESCRIPTION_CHARACTERS_LESS_THAN_80_CHARS | Provide a description of at least 80 characters and/or add images. |
| FAIR | Description | DESCRIPTION_INVALID | Avoid providing just a link. Describe the product in detail. |
| FAIR | Product images  | MAIN_IMG_DUPLICATE <br>  | Remove duplicate images. |
| FAIR | Product images  | MAIN_IMG_FIRST_IMG_LOW_QUALITY | First image: Image resolution must be at least 600*600px. |
| FAIR | Product images  | MAIN_IMG_FIRST_IMG_MISSING_PRODUCT_SUBSTANCE <br>  | First image: Use an image where the product is prominent and distinguishable. Avoid images with excessive zoom, images without photos of the actual product, or images where the product is too small. |
| FAIR | Product images | MAIN_IMG_FIRST_IMG_PRODUCT_SUBJECT_NOT_COMPLETE | First image: Use an image where the entire product is fully displayed and not cut off. |
| FAIR | Product images | MAIN_IMG_FIRST_IMG_TEXT_OVERLOAD | First image: Use an image that does not contain logos, watermarks, graphics, and text. |
| FAIR | Product images | MAIN_IMG_FIRSTIMG_LOW_QUALITY_BACKGROUND | First image: Use a plain, solid color background to highlight the product. |
| FAIR | Product images | MAIN_IMG_FIRSTIMG_WATERMARK | First image: Use an image that does not contain watermarks. |
| FAIR | Product images | **(New)** MAIN_IMG_FIRST_IMG_SPLICED_PICTURE | First image: Use full, standalone product images instead of collages. |
| FAIR | Product images | MAIN_IMG_INVALID | Use real images that showcase the products or its features. Avoid placeholder illustrations that are not related to the product itself. |
| FAIR | Product images | MAIN_IMG_LOW_QUALITY_SHOT | Ensure product images are in focus and not overstretched. |
| FAIR | Product images | MAIN_IMG_OBFUSCATION | Ensure images are not altered to hide any part of the product. |
| FAIR | Product images | **(Retired)** MAIN_IMG_SPLICED_PICTURE | Use full, standalone product images instead of collages. |
| FAIR | Product images | **(New)** MAIN_IMG_PROMOTION_IMAGE <br>  | Use an image that does not contain any marketing or promotion stickers, such as "free shipping" or "best sale". |
| FAIR | Title | TITLE_INCLUDE_ADVERTISE | Remove promotional phrases such as "Last unit", "50% discount", or "Limited time only". |
| FAIR | Title | TITLE_NOT_INCLUDE_PRODUCT_SUBJECT_WORDS | Include words that identify the product. For example, "Tshirt", "Smartphone", or "Sneakers". |
| FAIR | Title | TITLE_NOT_INCLUDE_VARIETY_WORDS | Remove any mention of stock availability and repetitive mentions of color, size, quantity, flavor, and similar product type. Examples of inappropriate phrases: "red/blue/green", "5 colors", "plus size, plus size set", "set of 4, set of 6", "sweatpants, lounge pants, workout pants", "low stock". |
| FAIR | Title | TITLE_REPETITIVE | Avoid repeating any word more than 4 times. |
| GOOD <br>  | Attributes | **(Retired)** ATTRIBUTE_MISSING_SHOPPING_GUIDE_ITEM | Provide additional attributes to aid customer decisions. |
| GOOD | Description | DESCRIPTION_HAVE_TOO_LONG_PARAGRAPH | Keep paragraphs under 400 characters. |
| GOOD | Description | DESCRIPTION_INCLUDE_INVALID_IMAGE | Remove any duplicate, mock-up, or placeholder images. |
| GOOD | Description | DESCRIPTION_INCLUDE_LESS_THAN_3_IMAGES | Include at least 3 images if you choose not to provide a textual description. |
| GOOD | Description | DESCRIPTION_NOT_PROPER_CAPITALIZATION | Use sentence case, avoid all caps. |
| GOOD | Description | PRD_NOT_INCLUDE_APPLICABLE_SCOPE | Specify the target user groups, such as the skin type (e.g. dry, normal, oily) for skincare products, or the age group for baby/pet supplies. |
| GOOD | Description | PRD_NOT_INCLUDE_CATALOG | Provide a table of contents for books or a track list for music. |
| GOOD | Description | PRD_NOT_INCLUDE_FRAGRANCE_NOTES | Add fragrance notes for the perfume, including details about the top, middle, and base notes. |
| GOOD | Description | PRD_NOT_INCLUDE_INGREDIENTS | Provide the primary ingredients in the product. |
| GOOD | Description | PRD_NOT_INCLUDE_INGREDIENTS_LIST | Provide the full list of product ingredients. |
| GOOD | Description | **(Retired)** PRD_NOT_INCLUDE_KEY_PARAMETER_LIST | Provide 4 or more key specifications for electronic products (e.g. screen resolution, battery capacity, processor type, RAM for smartphones). |
| GOOD | Description | PRD_NOT_INCLUDE_MATERIAL_DETAILS | Provide material information (e.g. Cotton blend: 80% cotton, 20% polyester). |
| GOOD | Description | PRD_NOT_INCLUDE_NUTRITION_FACT | Add nutrition facts. |
| GOOD | Description | **(Retired)** PRD_NOT_INCLUDE_PACKAGE_LIST | Provide the full list of items included in the package. |
| GOOD | Description | PRD_NOT_INCLUDE_PRD_BENEFITS | Add clear product benefits. For example, this product strengthens hair, repairs damage, and prevents breakage. |
| GOOD | Description | PRD_NOT_INCLUDE_SPECIFICATIONS | Provide product measurements such as the size, volume, or weight. |
| GOOD | Description | PRD_NOT_INCLUDE_MULTI_ANGLE_OR_DETAIL_DISPLAY | Add multi-angle or detailed images to fully display the products |
| GOOD | Product images | MAIN_IMG_FIRST_IMG_BACKGROUND_UNTIDY | First image: Use a plain, solid color background to highlight the product. |
| GOOD | Product images | MAIN_IMG_FIRST_IMG_BLACK_BORDER | First image: Remove the color borders. |
| GOOD | Product images | MAIN_IMG_FIRST_IMG_FAKE_MODEL | First image: Use real people or animals to showcase your product. |
| GOOD | Product images | MAIN_IMG_FIRST_IMG_NOT_CLEAR | First image: Use an in-focus and non-blurry image of the product. <br>  |
| GOOD | Product images | MAIN_IMG_FIRST_IMG_WHITE_BORDER | First image: Remove the color borders. |
| GOOD | Product images | MAIN_IMG_LESS_THAN_5_IMAGES | Assign 5 or more product images. |
| GOOD | Product images | MAIN_IMAGE_COUNT_NOT_MEET_STANDARD | Please upload more main images to ensure better product display. The required number of images varies by category(e.g., at least 1, 3, 4, or 5 images). Refer to the suggestions in the diagnostic results for details. |
| GOOD | Size chart | **(Retired)** SIZE_CHART_NOT_INCLUDE_STANDARDIZED_SIZE_INFO | Provide a complete size chart with all relevant measurements. <br>  |
| GOOD <br>  | Size chart | **(New)** SIZE_CHART_NOT_INCLUDE_SIZE_INFO <br>  | Provide at least 1 size variation (such as S, M, or L) and 1 size dimension (such as bust, waist, or hip) |
| GOOD | Title | **(Retired)** TITLE_LESS_THAN_25_CHARS | Use a product name with at least 25 characters. |

# Rest of World
For regions outside the US, product listings are evaluated based on key recommendations. The following table provides the list of diagnosis codes along with actionable recommendations to improve your product listing's overall quality and visibility.
| **Category** <br> <!-- width:130px --> | **Region** <br> <!-- width:130px --> | **Diagnosis result (`diagnosis_results.code`）** | **Recommendations** |
| --- | --- | --- | --- |
| Description | All except JP | DESC_LESS_THAN_FIVE_HUNDRED_CHARS | Extend the product description to at least 500 characters. |
| Description | JP | **(New)** DESC_LESS_THAN_FIFTY_CHARS | Extend the product description to at least 50 characters. |
| Description | All | DESC_NO_NEW_LINE | Add line breaks to the product description to enhance readability and structure. |
| Product images | All | MAIN_IMG_DUPLICATE | Remove duplicate images. |
| Product images | All | MAIN_IMG_FIRST_IMG_BACKGROUND_UNTIDY | First image: Use a plain, solid color background to highlight the product. |
| Product images | All | MAIN_IMG_FIRST_IMG_BLACK_BORDER | First image: Remove the color borders. |
| Product images | All | MAIN_IMG_FIRST_IMG_FAKE_MODEL | First image: Use real people or animals to showcase your product. |
| Product images | All | MAIN_IMG_FIRST_IMG_INCLUDE_NON_LOCAL_LANGUAGE | First image: Use local language only. |
| Product images | All | MAIN_IMG_FIRST_IMG_LOW_QUALITY | First image: Image resolution must be at least 600*600px. |
| Product images | All | MAIN_IMG_FIRST_IMG_MISSING_PRODUCT_SUBSTANCE | First image: Use an image where the product is prominent and distinguishable. Avoid images with excessive zoom, images without photos of the actual product, or images where the product is too small. |
| Product images | All | MAIN_IMG_FIRST_IMG_NOT_CLEAR | First image: Use an in-focus and non-blurry image of the product. |
| Product images | All | MAIN_IMG_FIRST_IMG_PRODUCT_SUBJECT_NOT_COMPLETE | First image: Use an image where the entire product is fully displayed and not cut off. |
| Product images | All | MAIN_IMG_FIRST_IMG_SPLICED_PICTURE | First image: Use a full, standalone image instead of a collage. |
| Product images | All | MAIN_IMG_FIRST_IMG_TEXT_OVERLOAD | First image: Use an image that does not contain logos, watermarks, graphics, and text. |
| Product images | All | MAIN_IMG_FIRST_IMG_WHITE_BORDER | First image: Remove the color borders. |
| Product images | All except JP | MAIN_IMG_NUMBER_LESS_THAN_FIVE | Assign 5 or more product images. |
| Title | All except JP | TITLE_LESS_THAN_40_CHARACTERS | Extend the title to at least 40 characters. |
| Title | JP | **(New)** TITLE_LESS_THAN_25_CHARACTERS | Extend the title to at least 25 characters. |
| Title | All | SEO_DIAGNOSTIC_ITEM | Add more SEO keywords. You can refer to the SEO keywords suggested in `suggestion.seo_words`. |
| Size chart | EU, JP, UK | **(New)** SIZE_CHART_NOT_INCLUDE_SIZE_INFO <br>  | Provide at least 1 size variation (such as S, M, or L) and 1 size dimension (such as bust, waist, or hip) |
