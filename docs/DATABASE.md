# DATABASE.md

> Proposed DB schema (**PostgreSQL**). Identifier type — `UUID` (pk default `gen_random_uuid()`). Money — stored as **AMD integer** (`integer`, dram has no minor unit). Timestamps — `timestamptz`. All tables have `created_at`, `updated_at`.

The schema is derived from the design; missing entities are proposed as architectural recommendations.

---

## ER — relationships (overview)

```
users 1─* orders                users 1─* reservations
users 1─* favorites             users 1─* reviews
users 1─* notifications         users 1─1 referrals (own code)
restaurants 1─* branches        branches 1─* tables
branches 1─* menu_items         categories 1─* menu_items
orders 1─* order_items          orders 1─1 payments
orders 1─0..1 reservations      reservations 1─0..1 tables
restaurants 1─* reviews         menu_items *─* dietary_tags
```

---

## 1. users

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| phone | varchar(20) UNIQUE NULL | primary login identifier; **nullable** — a guest account exists before any phone is known, and the column is filled on OTP verification (guest → customer upgrade) |
| phone_verified | boolean DEFAULT false | verified via OTP |
| name | varchar(120) | full name |
| email | varchar(160) UNIQUE NULL | optional |
| avatar_url | text NULL | |
| language | varchar(2) DEFAULT 'hy' | hy / ru / en |
| dark_mode | boolean DEFAULT false | |
| notif_push | boolean DEFAULT true | |
| notif_promo | boolean DEFAULT false | |
| reward_points | integer DEFAULT 0 | |
| role | enum(`customer`,`owner`,`staff`,`admin`) DEFAULT 'customer' | see ROLES |
| referred_by | uuid FK→users.id NULL | who invited |
| is_guest | boolean DEFAULT false | guest account |
| created_at / updated_at | timestamptz | |

---

## 2. restaurants

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| slug | varchar UNIQUE | e.g. `sunny` |
| name | varchar(160) NOT NULL | |
| cuisine | varchar(120) | localizable (i18n table) |
| price_level | smallint | 1..4 ($..$$$$) |
| rating_avg | numeric(2,1) DEFAULT 0 | cached average |
| reviews_count | integer DEFAULT 0 | |
| owner_id | uuid FK→users.id | owner |
| reservations_enabled | boolean DEFAULT false | enable/disable booking |
| services | text[] | {pickup, dinein, reserve} |
| cover_url | text NULL | |
| created_at / updated_at | timestamptz | |

---

## 3. restaurant_branches

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| restaurant_id | uuid FK→restaurants.id | |
| name | varchar(160) | e.g. "Northern Ave" |
| address | text | |
| city | varchar(80) DEFAULT 'Yerevan' | |
| lat / lng | numeric(9,6) | geolocation |
| phone | varchar(20) | |
| open_hours | jsonb | schedule by day |
| is_open | boolean DEFAULT true | current status |
| avg_prep_min | smallint | average prep time |
| created_at / updated_at | timestamptz | |

---

## 4. tables

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| branch_id | uuid FK→restaurant_branches.id | |
| table_no | varchar(10) | e.g. "12" |
| seats | smallint | capacity |
| zone | varchar(40) NULL | hall/terrace |
| is_active | boolean DEFAULT true | |

---

## 5. categories

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| key | varchar(40) UNIQUE | pizza, sushi, healthy… |
| icon | varchar(8) | emoji/icon |
| sort_order | smallint | |
| name_i18n | jsonb | {hy,ru,en} |

---

## 6. menu_items

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| branch_id | uuid FK→restaurant_branches.id | |
| category_id | uuid FK→categories.id | |
| menu_tab | enum(`popular`,`mains`,`sides`,`drinks`) | tab on the page |
| name_i18n | jsonb | {hy,ru,en} |
| desc_i18n | jsonb | {hy,ru,en} |
| price_amd | integer NOT NULL | price in dram |
| calories_kcal | integer NULL | |
| prep_min | smallint | prep time |
| photo_url | text NULL | |
| dietary_tags | text[] | {vegetarian,vegan,halal,gluten_free} |
| is_available | boolean DEFAULT true | |
| created_at / updated_at | timestamptz | |

---

## 7. orders

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| code | varchar(12) UNIQUE | pickup code |
| user_id | uuid FK→users.id | |
| branch_id | uuid FK→restaurant_branches.id | |
| service_mode | enum(`pickup`,`dine_in`) | |
| status | enum(`created`,`paid`,`confirmed`,`preparing`,`almost_ready`,`ready`,`completed`,`cancelled`) | |
| subtotal_amd | integer | |
| service_fee_amd | integer | |
| deposit_amd | integer DEFAULT 0 | for dine_in |
| total_amd | integer | |
| ready_at | timestamptz | target ready time |
| reservation_id | uuid FK→reservations.id NULL | if dine_in |
| notes | text NULL | |
| created_at / updated_at | timestamptz | |

---

## 8. order_items

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| order_id | uuid FK→orders.id ON DELETE CASCADE | |
| menu_item_id | uuid FK→menu_items.id | |
| name_snapshot | varchar(160) | name at order time |
| unit_price_amd | integer | price at order time |
| qty | smallint NOT NULL | |
| line_total_amd | integer | qty × unit_price |

---

## 9. reservations

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users.id | |
| branch_id | uuid FK→restaurant_branches.id | |
| table_id | uuid FK→tables.id NULL | assigned table |
| reserved_for | timestamptz | booking date+time |
| guests | smallint NOT NULL | guest count |
| deposit_amd | integer | deposit |
| deposit_credited | boolean DEFAULT false | credited to bill |
| status | enum(`pending`,`confirmed`,`seated`,`completed`,`cancelled`,`no_show`) | |
| created_at / updated_at | timestamptz | |

---

## 10. payments

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| order_id | uuid FK→orders.id | |
| method | enum(`apple_pay`,`google_pay`,`card`,`cash`) | |
| amount_amd | integer | |
| status | enum(`pending`,`authorized`,`captured`,`refunded`,`failed`,`cancelled`) | |
| provider_ref | varchar(120) NULL | provider transaction id |
| created_at / updated_at | timestamptz | |

---

## 11. reviews

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users.id | |
| restaurant_id | uuid FK→restaurants.id | |
| order_id | uuid FK→orders.id NULL | |
| rating | smallint CHECK (1..5) | |
| comment | text NULL | |
| created_at | timestamptz | |

---

## 12. notifications

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users.id | |
| type | enum(`order`,`reservation`,`promo`,`referral`,`system`) | |
| title | varchar(160) | |
| body | text | |
| payload | jsonb NULL | deep-link data |
| is_read | boolean DEFAULT false | |
| created_at | timestamptz | |

---

## 13. favorites

| Field | Type |
|---|---|
| id | uuid PK |
| user_id | uuid FK→users.id |
| restaurant_id | uuid FK→restaurants.id |
| created_at | timestamptz |
| UNIQUE(user_id, restaurant_id) | |

---

## 14. referrals

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users.id UNIQUE | code owner |
| code | varchar(16) UNIQUE | e.g. ARAM5 |
| invited_count | integer DEFAULT 0 | |
| discount_earned_pct | integer DEFAULT 0 | accrued, max 25 |
| created_at | timestamptz | |

---

## 15. coupons

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users.id | |
| code | varchar(20) | |
| discount_pct | smallint NULL | |
| discount_amd | integer NULL | |
| source | enum(`referral`,`reward`,`promo`) | |
| valid_until | timestamptz NULL | |
| used_at | timestamptz NULL | |

---

## Indexes (recommended)

- `restaurant_branches(lat, lng)` — geo search (or PostGIS `geography`).
- `menu_items(branch_id, menu_tab)`, `menu_items(category_id)`.
- `orders(user_id, status)`, `orders(branch_id, status)`, `orders(code)`.
- `reservations(branch_id, reserved_for)`, `reservations(user_id)`.
- `favorites(user_id)`, `notifications(user_id, is_read)`.
- OTP/session uniqueness — in Redis, not in PG.
