-- Synthetic retail warehouse for the lab. Fully deterministic: rows are derived
-- from generate_series arithmetic, no random(). No real or personal data.
CREATE DATABASE retail_demo;
\connect retail_demo

CREATE SCHEMA raw;
CREATE SCHEMA analytics;

CREATE TABLE raw.customers (
    customer_id integer PRIMARY KEY,
    full_name   text NOT NULL,
    email       text,              -- synthetic contact address (tagged PII in DataHub)
    country     text NOT NULL,
    signup_date date NOT NULL
);

CREATE TABLE raw.products (
    product_id  integer PRIMARY KEY,
    sku         text NOT NULL UNIQUE,
    category    text NOT NULL,
    unit_price  numeric(10, 2) NOT NULL
);

CREATE TABLE raw.orders (
    order_id    integer PRIMARY KEY,
    customer_id integer REFERENCES raw.customers (customer_id),
    product_id  integer NOT NULL REFERENCES raw.products (product_id),
    quantity    integer NOT NULL,
    order_date  date NOT NULL,
    status      text NOT NULL
);

CREATE TABLE analytics.daily_revenue (
    revenue_date  date NOT NULL,
    category      text NOT NULL,
    orders_count  integer NOT NULL,
    gross_revenue numeric(12, 2) NOT NULL,
    PRIMARY KEY (revenue_date, category)
);

INSERT INTO raw.customers
SELECT i,
       'Customer ' || i,
       -- every 10th customer has no email: exercises the quality check
       CASE WHEN i % 10 = 0 THEN NULL ELSE 'customer' || i || '@example.test' END,
       (ARRAY['DE', 'IN', 'US', 'GB', 'FR'])[1 + i % 5],
       DATE '2026-01-01' + (i * 3)
FROM generate_series(1, 50) AS i;

INSERT INTO raw.products
SELECT i,
       'SKU-' || lpad(i::text, 4, '0'),
       (ARRAY['books', 'electronics', 'grocery', 'home'])[1 + i % 4],
       (5 + (i * 7) % 95)::numeric(10, 2)
FROM generate_series(1, 20) AS i;

INSERT INTO raw.orders
SELECT i,
       1 + (i * 13) % 50,
       1 + (i * 7) % 20,
       1 + i % 4,
       DATE '2026-10-01' + (i % 26),
       CASE WHEN i % 17 = 0 THEN 'cancelled' ELSE 'completed' END
FROM generate_series(1, 2000) AS i;
