// WooCommerce REST API Type Definitions
// Based on WooCommerce REST API v3

// Product Image
export interface ProductImage {
  id: number;
  date_created: string;
  date_created_gmt: string;
  date_modified: string;
  date_modified_gmt: string;
  src: string;
  name: string;
  alt: string;
}

// Product Category
export interface ProductCategory {
  id: number;
  name: string;
  slug: string;
  parent: number;
  description: string;
  display: "default" | "products" | "subcategories" | "both";
  image: ProductImage | null;
  menu_order: number;
  count: number;
}

// Product Tag
export interface ProductTag {
  id: number;
  name: string;
  slug: string;
  description: string;
  count: number;
}

// Product Attribute
export interface ProductAttribute {
  id: number;
  name: string;
  slug: string;
  position: number;
  visible: boolean;
  variation: boolean;
  options: string[];
}

// Product Default Attribute (for variable products)
export interface ProductDefaultAttribute {
  id: number;
  name: string;
  option: string;
}

// Product Dimensions
export interface ProductDimensions {
  length: string;
  width: string;
  height: string;
}

// Product Download
export interface ProductDownload {
  id: string;
  name: string;
  file: string;
}

// Product Meta Data
export interface ProductMetaData {
  id: number;
  key: string;
  value: string | number | boolean | object;
}

// Product
export interface Product {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  date_created: string;
  date_created_gmt: string;
  date_modified: string;
  date_modified_gmt: string;
  type: "simple" | "grouped" | "external" | "variable" | "tour";
  status: "draft" | "pending" | "private" | "publish";
  featured: boolean;
  catalog_visibility: "visible" | "catalog" | "search" | "hidden";
  description: string;
  short_description: string;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  date_on_sale_from: string | null;
  date_on_sale_from_gmt: string | null;
  date_on_sale_to: string | null;
  date_on_sale_to_gmt: string | null;
  on_sale: boolean;
  purchasable: boolean;
  total_sales: number;
  virtual: boolean;
  downloadable: boolean;
  downloads: ProductDownload[];
  download_limit: number;
  download_expiry: number;
  external_url: string;
  button_text: string;
  tax_status: "taxable" | "shipping" | "none";
  tax_class: string;
  manage_stock: boolean;
  stock_quantity: number | null;
  stock_status: "instock" | "outofstock" | "onbackorder";
  backorders: "no" | "notify" | "yes";
  backorders_allowed: boolean;
  backordered: boolean;
  low_stock_amount: number | null;
  sold_individually: boolean;
  weight: string;
  dimensions: ProductDimensions;
  shipping_required: boolean;
  shipping_taxable: boolean;
  shipping_class: string;
  shipping_class_id: number;
  reviews_allowed: boolean;
  average_rating: string;
  rating_count: number;
  upsell_ids: number[];
  cross_sell_ids: number[];
  parent_id: number;
  purchase_note: string;
  categories: ProductCategory[];
  tags: ProductTag[];
  images: ProductImage[];
  attributes: ProductAttribute[];
  default_attributes: ProductDefaultAttribute[];
  variations: number[];
  grouped_products: number[];
  menu_order: number;
  price_html: string;
  related_ids: number[];
  meta_data: ProductMetaData[];
  /** Translations from the Next i18n WordPress plugin, keyed by locale (absent if the plugin is off) */
  i18n?: ContentTranslations;
  /** Tour data from the Next Tours WordPress plugin (null for other product types) */
  tour?: Tour | null;
}

/** One locale's translation, as exposed by the Next i18n plugin (HTML already rendered). */
export interface ContentTranslation {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  /** The Italian source changed after this translation was made */
  outdated: boolean;
}

export type ContentTranslations = Partial<Record<string, ContentTranslation>>;

// Product Variation
export interface ProductVariation {
  id: number;
  date_created: string;
  date_created_gmt: string;
  date_modified: string;
  date_modified_gmt: string;
  description: string;
  permalink: string;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  date_on_sale_from: string | null;
  date_on_sale_from_gmt: string | null;
  date_on_sale_to: string | null;
  date_on_sale_to_gmt: string | null;
  on_sale: boolean;
  status: "draft" | "pending" | "private" | "publish";
  purchasable: boolean;
  virtual: boolean;
  downloadable: boolean;
  downloads: ProductDownload[];
  download_limit: number;
  download_expiry: number;
  tax_status: "taxable" | "shipping" | "none";
  tax_class: string;
  manage_stock: boolean | "parent";
  stock_quantity: number | null;
  stock_status: "instock" | "outofstock" | "onbackorder";
  backorders: "no" | "notify" | "yes";
  backorders_allowed: boolean;
  backordered: boolean;
  low_stock_amount: number | null;
  weight: string;
  dimensions: ProductDimensions;
  shipping_class: string;
  shipping_class_id: number;
  image: ProductImage | null;
  attributes: ProductDefaultAttribute[];
  menu_order: number;
  meta_data: ProductMetaData[];
}

// Product Review
export interface ProductReview {
  id: number;
  date_created: string;
  date_created_gmt: string;
  product_id: number;
  product_name: string;
  product_permalink: string;
  status: "approved" | "hold" | "spam" | "unspam" | "trash" | "untrash";
  reviewer: string;
  reviewer_email: string;
  review: string;
  rating: number;
  verified: boolean;
  reviewer_avatar_urls: Record<string, string>;
}

// Cart Types (Client-side)
export interface CartItem {
  /** Store API cart item key (set once the item is in the WooCommerce cart) */
  key?: string;
  productId: number;
  variationId?: number;
  quantity: number;
  /** Limits enforced by WooCommerce (stock, sold individually, plugins) */
  quantityLimits?: { min: number; max: number; step: number; editable: boolean };
  name: string;
  /** Product slug in the current locale, for links */
  slug?: string;
  /** Unit price, decimal string ("100.00") */
  price: string;
  /** Line total after discounts, decimal string */
  lineTotal?: string;
  image?: string;
  attributes?: ProductDefaultAttribute[];
  /** WooCommerce "Sold individually": at most 1 per cart line */
  soldIndividually?: boolean;
  /** Tour booking carried by this line (date, participants, extras) */
  booking?: CartBooking;
}

export interface CartTotals {
  subtotal: string;
  discount?: string;
  shipping: string;
  tax: string;
  total: string;
  itemCount: number;
  /** ISO currency code from WooCommerce ("EUR") */
  currency?: string;
}

export interface Cart {
  items: CartItem[];
  totals: CartTotals;
  coupons?: { code: string; discount: string }[];
  /** Problems WooCommerce found in the cart (out of stock, etc.) */
  errors?: { code: string; message: string }[];
  needsPayment?: boolean;
  needsShipping?: boolean;
}

// Order Types
export interface OrderBilling {
  first_name: string;
  last_name: string;
  company: string;
  address_1: string;
  address_2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  email: string;
  phone: string;
}

export interface OrderShipping {
  first_name: string;
  last_name: string;
  company: string;
  address_1: string;
  address_2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  phone: string;
}

export interface OrderLineItem {
  id: number;
  name: string;
  product_id: number;
  variation_id: number;
  quantity: number;
  tax_class: string;
  subtotal: string;
  subtotal_tax: string;
  total: string;
  total_tax: string;
  taxes: Array<{ id: number; total: string; subtotal: string }>;
  meta_data: ProductMetaData[];
  sku: string;
  price: number;
  image: ProductImage;
  parent_name: string | null;
}

export interface OrderTaxLine {
  id: number;
  rate_code: string;
  rate_id: number;
  label: string;
  compound: boolean;
  tax_total: string;
  shipping_tax_total: string;
  rate_percent: number;
  meta_data: ProductMetaData[];
}

export interface OrderShippingLine {
  id: number;
  method_title: string;
  method_id: string;
  instance_id: string;
  total: string;
  total_tax: string;
  taxes: Array<{ id: number; total: string }>;
  meta_data: ProductMetaData[];
}

export interface OrderFeeLine {
  id: number;
  name: string;
  tax_class: string;
  tax_status: "taxable" | "none";
  amount: string;
  total: string;
  total_tax: string;
  taxes: Array<{ id: number; total: string; subtotal: string }>;
  meta_data: ProductMetaData[];
}

export interface OrderCouponLine {
  id: number;
  code: string;
  discount: string;
  discount_tax: string;
  meta_data: ProductMetaData[];
}

export interface OrderRefund {
  id: number;
  reason: string;
  total: string;
}

export type OrderStatus =
  | "pending"
  | "processing"
  | "on-hold"
  | "completed"
  | "cancelled"
  | "refunded"
  | "failed"
  | "trash"
  /** Next Tours: booking request waiting for manual confirmation (no payment yet) */
  | "tour-request";

export interface Order {
  id: number;
  parent_id: number;
  status: OrderStatus;
  currency: string;
  version: string;
  prices_include_tax: boolean;
  date_created: string;
  date_created_gmt: string;
  date_modified: string;
  date_modified_gmt: string;
  discount_total: string;
  discount_tax: string;
  shipping_total: string;
  shipping_tax: string;
  cart_tax: string;
  total: string;
  total_tax: string;
  customer_id: number;
  order_key: string;
  billing: OrderBilling;
  shipping: OrderShipping;
  payment_method: string;
  payment_method_title: string;
  transaction_id: string;
  customer_ip_address: string;
  customer_user_agent: string;
  created_via: string;
  customer_note: string;
  date_completed: string | null;
  date_completed_gmt: string | null;
  date_paid: string | null;
  date_paid_gmt: string | null;
  cart_hash: string;
  number: string;
  meta_data: ProductMetaData[];
  line_items: OrderLineItem[];
  tax_lines: OrderTaxLine[];
  shipping_lines: OrderShippingLine[];
  fee_lines: OrderFeeLine[];
  coupon_lines: OrderCouponLine[];
  refunds: OrderRefund[];
  payment_url: string;
  is_editable: boolean;
  needs_payment: boolean;
  needs_processing: boolean;
  date_created_gmt_raw: string;
  date_modified_gmt_raw: string;
  currency_symbol: string;
}

// Customer Types
export interface CustomerBilling {
  first_name: string;
  last_name: string;
  company: string;
  address_1: string;
  address_2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  email: string;
  phone: string;
}

export interface CustomerShipping {
  first_name: string;
  last_name: string;
  company: string;
  address_1: string;
  address_2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  phone: string;
}

export interface Customer {
  id: number;
  date_created: string;
  date_created_gmt: string;
  date_modified: string;
  date_modified_gmt: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  username: string;
  billing: CustomerBilling;
  shipping: CustomerShipping;
  is_paying_customer: boolean;
  avatar_url: string;
  meta_data: ProductMetaData[];
}

// Coupon Types
export interface Coupon {
  id: number;
  code: string;
  amount: string;
  date_created: string;
  date_created_gmt: string;
  date_modified: string;
  date_modified_gmt: string;
  discount_type: "percent" | "fixed_cart" | "fixed_product";
  description: string;
  date_expires: string | null;
  date_expires_gmt: string | null;
  usage_count: number;
  individual_use: boolean;
  product_ids: number[];
  excluded_product_ids: number[];
  usage_limit: number | null;
  usage_limit_per_user: number | null;
  limit_usage_to_x_items: number | null;
  free_shipping: boolean;
  product_categories: number[];
  excluded_product_categories: number[];
  exclude_sale_items: boolean;
  minimum_amount: string;
  maximum_amount: string;
  email_restrictions: string[];
  used_by: string[];
  meta_data: ProductMetaData[];
}

// Shipping Zone Types
export interface ShippingZone {
  id: number;
  name: string;
  order: number;
}

export interface ShippingMethod {
  id: number;
  instance_id: number;
  title: string;
  order: number;
  enabled: boolean;
  method_id: string;
  method_title: string;
  method_description: string;
  settings: Record<string, {
    id: string;
    label: string;
    description: string;
    type: string;
    value: string;
    default: string;
    tip: string;
    placeholder: string;
  }>;
}

// Payment Gateway Types
export interface PaymentGateway {
  id: string;
  title: string;
  description: string;
  order: number;
  enabled: boolean;
  method_title: string;
  method_description: string;
  method_supports: string[];
  settings: Record<string, {
    id: string;
    label: string;
    description: string;
    type: string;
    value: string;
    default: string;
    tip: string;
    placeholder: string;
  }>;
}

// Tax Rate Types
export interface TaxRate {
  id: number;
  country: string;
  state: string;
  postcode: string;
  city: string;
  postcodes: string[];
  cities: string[];
  rate: string;
  name: string;
  priority: number;
  compound: boolean;
  shipping: boolean;
  order: number;
  class: string;
}

// Settings Types
export interface SettingOption {
  id: string;
  label: string;
  description: string;
  type: string;
  default: string;
  options?: Record<string, string>;
  tip?: string;
  value: string;
}

export interface SettingGroup {
  id: string;
  label: string;
  description: string;
  parent_id: string;
  sub_groups: string[];
}

// API Response Types
export interface WooCommerceError {
  code: string;
  message: string;
  data: {
    status: number;
  };
}

// Create Order Input
export interface CreateOrderInput {
  payment_method?: string;
  payment_method_title?: string;
  set_paid?: boolean;
  billing?: Partial<OrderBilling>;
  shipping?: Partial<OrderShipping>;
  line_items: Array<{
    product_id: number;
    variation_id?: number;
    quantity: number;
    /** Tour lines carry `_next_tour_request` (JSON booking request, re-validated by WordPress) */
    meta_data?: Array<{ key: string; value: string }>;
  }>;
  shipping_lines?: Array<{
    method_id: string;
    method_title: string;
    total: string;
  }>;
  coupon_lines?: Array<{
    code: string;
  }>;
  customer_id?: number;
  customer_note?: string;
  meta_data?: ProductMetaData[];
}

// ============================================================================
// Tours (Next Tours WordPress plugin)
// ============================================================================

export type TourKind = "experience" | "day_tour" | "multi_day";
export type TourPricingModel =
  | "per_person"
  | "person_types"
  | "group_tiers"
  | "private_group"
  | "per_unit"
  | "quote";
export type TourMeal = "breakfast" | "lunch" | "dinner";
export type TourExtraPer = "booking" | "person" | "day" | "unit";

export interface TourItineraryStop {
  title: string;
  /** HTML */
  description: string;
  meals: TourMeal[];
  accommodation: string;
}

export interface TourPersonType {
  /** Standard keys (adult, child, infant, youth, senior, student) are translated by the storefront */
  key: string;
  label: string;
  price: string;
  min_age: number;
  max_age: number;
  min: number;
  max: number;
  /** false = doesn't take a seat (e.g. infants) */
  counts_capacity: boolean;
}

export interface TourExtra {
  key: string;
  label: string;
  price: string;
  per: TourExtraPer;
  required: boolean;
}

/** One locale's translation of the tour texts (untranslated entries already fall back to Italian). */
export interface TourTranslation {
  highlights: string[];
  included: string[];
  not_included: string[];
  what_to_bring: string[];
  languages: string[];
  itinerary: { title: string; description: string; accommodation: string }[];
  important_info: string;
  cancellation_policy: string;
  meeting_point_notes: string;
  person_types: Record<string, string>;
  extras: Record<string, string>;
  unit_label: string;
  outdated: boolean;
}

export interface Tour {
  kind: TourKind;
  duration: { value: number; unit: "minutes" | "hours" | "days" };
  nights: number;
  /** Length in days (1 for anything shorter than a day) */
  days: number;
  difficulty: "" | "easy" | "moderate" | "challenging";
  min_age: number;
  group_size: { min: number; max: number };
  languages: string[];
  meeting_point: { address: string; notes: string; lat: string; lng: string };
  end_point: { address: string };
  highlights: string[];
  itinerary: TourItineraryStop[];
  included: string[];
  not_included: string[];
  what_to_bring: string[];
  important_info: string;
  cancellation_policy: string;
  booking: {
    fixed_departures: boolean;
    open_dates: boolean;
    /** Product-level default; single departures can override it */
    confirmation: "instant" | "on_request";
    cutoff_hours: number;
    booking_window_days: number;
    min_per_booking: number;
    /** 0 = no limit */
    max_per_booking: number;
    next_departure: { date: string; time: string } | null;
  };
  pricing: {
    model: TourPricingModel;
    /** Lowest advertised price ("" = on request) */
    from_price: string;
    currency: string;
    price: string;
    person_types: TourPersonType[];
    tiers: { min: number; max: number; price: string }[];
    group: { price: string; included: number; extra_price: string; max_people: number };
    unit: { label: string; price: string; capacity: number; max_units: number };
    extras: TourExtra[];
  };
  i18n?: Partial<Record<string, TourTranslation>>;
}

export interface TourDeparture {
  id: string;
  date: string;
  time: string;
  end_date: string;
  capacity: number | null;
  /** null = unlimited */
  remaining: number | null;
  status: "open" | "closed";
  bookable: boolean;
  on_request: boolean;
  guaranteed: boolean;
  /** Percentage applied to the base price */
  price_adjustment: number;
  note: string;
}

export interface TourDateSlot {
  /** "" = all day */
  time: string;
  capacity: number | null;
  remaining: number | null;
  bookable: boolean;
}

export interface TourOpenDate {
  date: string;
  end_date: string;
  on_request: boolean;
  price_adjustment: number;
  slots: TourDateSlot[];
}

export interface TourAvailability {
  product_id: number;
  fixed_departures: boolean;
  open_dates: boolean;
  from: string;
  to: string;
  departures: TourDeparture[];
  dates: TourOpenDate[];
}

/** What the storefront sends to price / book a tour. */
export interface TourBookingRequest {
  product_id: number;
  mode: "departure" | "date" | "";
  departure_id?: string;
  date?: string;
  time?: string;
  /** { adult: 2, child: 1 } for person types, { people: 3 } otherwise */
  participants: Record<string, number>;
  units?: number;
  extras: string[];
}

export interface TourQuoteError {
  code: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface TourQuote {
  /** Complete and bookable (a date is chosen and everything checks out) */
  valid: boolean;
  errors: TourQuoteError[];
  currency: string;
  model: TourPricingModel;
  on_request: boolean;
  price_on_request: boolean;
  people: number;
  seats: number;
  units: number;
  participants: { key: string; label: string; count: number }[];
  extras: { key: string; label: string; qty: number; price: string; total: string; required: boolean }[];
  lines: { type: "base" | "adjustment" | "extra"; label: string; qty: number; unit_price: string; total: string }[];
  subtotal: string;
  adjustment: string;
  extras_total: string;
  total: string;
}

/** Booking stored on a cart line (from the Store API extension). */
export interface CartBooking {
  mode: "departure" | "date";
  departureId: string;
  date: string;
  time: string;
  endDate: string;
  onRequest: boolean;
  model: TourPricingModel;
  people: number;
  units: number;
  participants: { key: string; label: string; count: number }[];
  extras: { key: string; label: string; qty: number }[];
  total: string;
  /** The request it was priced from, sent again with the order */
  request: TourBookingRequest;
}
