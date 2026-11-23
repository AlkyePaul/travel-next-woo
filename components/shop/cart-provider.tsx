"use client";

// Cart state backed by the WooCommerce Store API (through /api/cart).
//
// WooCommerce owns the cart: prices, stock, "sold individually", coupons and
// plugin rules are applied server-side, and this context only mirrors the
// result. The public API is unchanged from the old localStorage cart, so pages
// and components keep working as before.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocale } from "next-intl";

import type { Cart, CartItem, TourBookingRequest } from "@/lib/woocommerce.d";

/** Key used by the previous client-only cart; migrated once into WooCommerce. */
const LEGACY_STORAGE_KEY = "woo-cart";

const EMPTY_CART: Cart = {
  items: [],
  totals: { subtotal: "0.00", shipping: "0.00", tax: "0.00", total: "0.00", itemCount: 0 },
};

type CartAction =
  | { action: "add-item"; id: number; quantity: number }
  | { action: "add-booking"; booking: TourBookingRequest }
  | { action: "update-item"; key: string; quantity: number }
  | { action: "remove-item"; key: string }
  | { action: "apply-coupon"; code: string }
  | { action: "remove-coupon"; code: string }
  | { action: "clear" };

interface CartContextType {
  cart: Cart;
  isOpen: boolean;
  /** First load of the cart */
  isLoading: boolean;
  /** A cart change is being sent to WooCommerce */
  isUpdating: boolean;
  /** Last error returned by WooCommerce (already in the shop's language) */
  error: string | null;
  clearError: () => void;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
  /** Resolves to false when WooCommerce refused the item (see `error`) */
  addItem: (item: CartItem) => Promise<boolean>;
  /** Add a tour booking; WordPress validates and prices it (false + `error` if refused) */
  addBooking: (booking: TourBookingRequest) => Promise<boolean>;
  removeItem: (productId: number, variationId?: number) => Promise<boolean>;
  /** Remove one cart line (needed for tours: several bookings can share a product) */
  removeLine: (key: string) => Promise<boolean>;
  updateQuantity: (productId: number, quantity: number, variationId?: number) => Promise<boolean>;
  applyCoupon: (code: string) => Promise<boolean>;
  removeCoupon: (code: string) => Promise<boolean>;
  clearCart: () => Promise<boolean>;
  refresh: () => Promise<void>;
  getItemCount: () => number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

type CartResponse = { cart?: Cart; error?: { message: string; code?: string } };

export function CartProvider({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const [cart, setCart] = useState<Cart>(EMPTY_CART);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Cart changes run one at a time, in order, so responses can't overwrite each other
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const cartRef = useRef(cart);
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(task, task);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  const send = useCallback(
    (action: CartAction): Promise<boolean> =>
      enqueue(async () => {
        setPending((n) => n + 1);
        try {
          const response = await fetch("/api/cart", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...action, locale }),
          });
          const json: CartResponse = await response.json().catch(() => ({}));
          if (!response.ok || !json.cart) {
            setError(json.error?.message ?? "Cart error");
            return false;
          }
          setCart(json.cart);
          setError(null);
          return true;
        } catch {
          setError("Cart unavailable");
          return false;
        } finally {
          setPending((n) => n - 1);
        }
      }),
    [enqueue, locale]
  );

  const refresh = useCallback(
    () =>
      enqueue(async () => {
        try {
          const response = await fetch(`/api/cart?locale=${encodeURIComponent(locale)}`, {
            cache: "no-store",
          });
          const json: CartResponse = await response.json().catch(() => ({}));
          if (json.cart) setCart(json.cart);
        } catch {
          // Keep the last known cart
        }
      }),
    [enqueue, locale]
  );

  // Load the cart (and reload it when the language changes, for translated names)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (cancelled) return;

      // One-time migration of the old browser-only cart
      try {
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy) {
          localStorage.removeItem(LEGACY_STORAGE_KEY);
          const items: CartItem[] = JSON.parse(legacy);
          if (cartRef.current.items.length === 0) {
            for (const item of items) {
              await send({
                action: "add-item",
                id: item.variationId ?? item.productId,
                quantity: Math.max(1, item.quantity),
              });
            }
          }
        }
      } catch {
        // Unreadable legacy data: ignore it
      }
      if (!cancelled) setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, send]);

  const findKey = (productId: number, variationId?: number) =>
    cartRef.current.items.find(
      (item) =>
        (variationId ? item.variationId === variationId : item.productId === productId) &&
        item.key
    )?.key;

  const addItem = useCallback(
    async (item: CartItem) => {
      const ok = await send({
        action: "add-item",
        id: item.variationId ?? item.productId,
        quantity: item.soldIndividually ? 1 : Math.max(1, item.quantity),
      });
      if (ok) setIsOpen(true);
      return ok;
    },
    [send]
  );

  const addBooking = useCallback(
    async (booking: TourBookingRequest) => {
      const ok = await send({ action: "add-booking", booking });
      if (ok) setIsOpen(true);
      return ok;
    },
    [send]
  );

  const removeLine = useCallback((key: string) => send({ action: "remove-item", key }), [send]);

  const removeItem = useCallback(
    async (productId: number, variationId?: number) => {
      const key = findKey(productId, variationId);
      return key ? send({ action: "remove-item", key }) : false;
    },
    [send]
  );

  const updateQuantity = useCallback(
    async (productId: number, quantity: number, variationId?: number) => {
      const key = findKey(productId, variationId);
      if (!key) return false;
      return send({ action: "update-item", key, quantity: Math.max(0, quantity) });
    },
    [send]
  );

  const applyCoupon = useCallback((code: string) => send({ action: "apply-coupon", code }), [send]);
  const removeCoupon = useCallback((code: string) => send({ action: "remove-coupon", code }), [send]);
  const clearCart = useCallback(() => send({ action: "clear" }), [send]);

  const clearError = useCallback(() => setError(null), []);
  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);
  const toggleCart = useCallback(() => setIsOpen((prev) => !prev), []);
  const getItemCount = useCallback(() => cart.totals.itemCount, [cart.totals.itemCount]);

  return (
    <CartContext.Provider
      value={{
        cart,
        isOpen,
        isLoading,
        isUpdating: pending > 0,
        error,
        clearError,
        openCart,
        closeCart,
        toggleCart,
        addItem,
        addBooking,
        removeItem,
        removeLine,
        updateQuantity,
        applyCoupon,
        removeCoupon,
        clearCart,
        refresh,
        getItemCount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
