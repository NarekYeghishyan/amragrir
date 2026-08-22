# PROJECT_OVERVIEW.md

> Overview of Amragrir.am for the development team and Cursor AI.

---

## 1. Project name

**Amragrir.am** — a food pre-ordering and table-booking platform.

Tagline (from the design): *"Order now. Eat exactly when you arrive."*

Domain: `amragrir.am`. Launch market: **Armenia (Yerevan)**. Currency: **Armenian dram (֏ / AMD)**. Default language: **Armenian (hy)**; Russian (ru) and English (en) are also supported.

---

## 2. Purpose

Let the user **order food ahead** at a nearby restaurant and **arrive exactly when it is ready** — no waiting in line, no waiting for cooking. Additionally, **book a table** (dine-in) with a deposit that is credited toward the bill.

The restaurant kitchen times the preparation so the dish is fresh at the exact arrival time chosen by the user.

---

## 3. The problem it solves

1. **Queues and waiting.** At lunch, users lose time queuing and waiting for cooking. Amragrir removes the wait: the food is ready on arrival.
2. **Unpredictable timing.** Regular delivery gives no precise control over the moment of receipt. Here the user chooses the exact "Ready at" time.
3. **Table availability.** Arriving and finding no seat. Booking with a deposit solves this ahead of time.
4. **Freshness vs. speed.** Pre-made food goes cold; delivery takes long. The pre-order model synchronizes cooking with arrival.

---

## 4. Target audience

- **Urban office workers** (lunch break, limited time).
- **Students and young professionals** who value speed and mobile UX.
- **Couples and groups** planning a dinner with a table booking.
- **Restaurant regulars** using the referral program and rewards.

Geography — residents and visitors of Yerevan; the multilingual interface serves both local and tourist audiences.

---

## 5. Core features

| Feature | Description |
|---|---|
| Authentication | Login/register by phone number + SMS code (OTP). Guest entry. Social login (Apple/Google). |
| Search & catalog | List of nearby restaurants, search, cuisine categories, filters (sort, price, distance, rating, diet, service mode). |
| Restaurant page | Photo, rating, prep time, distance, status (open/closed), menu by tabs (Popular/Mains/Sides/Drinks). |
| Basket | Line items with quantity, subtotal, service fee, total. Tied to a single restaurant. |
| Pre-order | Choose mode: **Pickup** or **Dine-in** (table booking). For dine-in — date calendar, reservation time, guest count, deposit. Choose "Ready at" time. |
| Checkout | Order summary, ready-at time, service method, deposit (for dine-in), payment method selection. |
| Order tracking | Live countdown, ring progress, status steps, pickup code / QR. |
| Orders | Active order with a timer + history of past orders with a "Reorder" button. |
| Favorites | Saved branches — one address per heart, not the whole chain. |
| Profile | Profile, reward points, coupons, referral program, language, section links. |
| Referral | "Give 2%, get 2%" referral program (stacks up to 25%), personal code/link, statistics. |
| Settings | Dark theme, push notifications, promo emails, language, account, "About", log out. |
| Multilingual | hy / ru / en, switchable on the fly. |
| Theme | Light / dark. |

---

## 6. Difference from regular food delivery

| | Regular delivery (Wolt / Glovo) | **Amragrir.am** |
|---|---|---|
| Model | Courier brings food to the user | User comes to pick up / for the table |
| Core value | Delivery to your door | No on-site waiting |
| Readiness moment | "as soon as possible" | the user's exact arrival time |
| Tables | none | table booking with deposit |
| Logistics | needs a courier fleet | none — only kitchen sync |
| Cost to user | delivery + markup | only a service fee, no delivery |
| Freshness | food travels and cools | cooked to the moment of arrival |

Amragrir is **order-ahead / dine-in booking**, not delivery. The core mechanic is synchronizing prep time with the guest's arrival time.

---

## 7. Terminology

- **Pre-order** — a food order placed in advance for a specific time.
- **Pickup** — self-collect at the counter (express counter), released by pickup code: six digits the guest shows (as a number or a QR), which the counter checks before the order can be closed.
- **Dine-in** — table booking; accompanied by a deposit.
- **Table deposit** — table deposit; **fully credited** toward the final bill, not an extra charge.
- **Ready at** — the time by which the kitchen prepares the order.
- **Service fee** — the platform's service fee.
