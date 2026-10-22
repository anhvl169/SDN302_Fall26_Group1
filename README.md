# Fruit Fresh Commerce

Course project REST API built with Express, Mongoose, and MongoDB. Payment is a local simulation; this project does not connect to a payment provider or handle card details.

## Run locally

1. Install Node.js and MongoDB, then create a database (or use the existing MongoDB Atlas database).
2. Copy `.env.example` to `.env` and set `MONGODB_URI` and a private `JWT_SECRET`.
3. Run `npm install` once, then `npm run dev` while developing or `npm start` to run the server.
4. Open `http://localhost:9999`. `GET /health` reports server status.

The API uses the seeded collections in `fruit_fresh_commerce`. Register creates a CUSTOMER account. Shop owner accounts are granted only after an ADMIN approves a shop request. To bootstrap the first administrator for a coursework database, change a trusted seed user's `role` to `ADMIN` directly in MongoDB Compass.

## Authorization

Send `Authorization: Bearer <token>` for protected routes. Tokens are returned from `POST /auth/login` and expire after 12 hours. Public registration cannot select a role. Shop owners can manage their approved shops; staff capabilities are scoped to the shop assignment and staff role.

## Main endpoints

| Feature | Routes |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Users (ADMIN) | `GET /users`, `PATCH /users/:id` |
| Products | `GET /products?search=&shopId=&categoryId=`, `GET /products/:id`; authenticated `POST /products`, `PUT/PATCH/DELETE /products/:id` |
| Categories | `GET /categories?shopId=&status=&search=&page=&limit=`, `GET /categories/shop/:shopId`, `GET /categories/:id`; authenticated `POST/PUT/PATCH/DELETE /categories` routes |
| Shops | `GET /shops`, `GET /shops/:id`, authenticated `PATCH /shops/:id` |
| Shop registration | authenticated `POST /shop-requests`, `GET /shop-requests`; ADMIN `PATCH /shop-requests/:id/review` |
| Shop staff | authenticated `GET/POST /shops/:shopId/staff`, `DELETE /shops/:shopId/staff/:userId` |
| Cart (CUSTOMER) | `GET /cart`, `POST /cart/items`, `PATCH/DELETE /cart/items/:productId`, `DELETE /cart` |
| Orders | CUSTOMER `POST /orders/checkout`, authenticated `GET /orders`, `GET /orders/:id`, `PATCH /orders/:id/status` |
| Payment simulation | CUSTOMER `POST /orders/:id/pay-simulate` for orders created with `MOCK_ONLINE` |
| Inventory | authenticated `POST /products/:id/stock`, `GET /products/:id/stock-transactions` |
| Notifications | authenticated `GET /notifications`, `PATCH /notifications/:id/read` |

### Checkout example

```json
{
  "shippingAddress": "12 Nguyen Trai, Ha Noi",
  "paymentMethod": "COD"
}
```

Choose `MOCK_ONLINE` to create unpaid order(s) with the mock method, then call `/orders/:id/pay-simulate` to mark each order paid. A cart containing products from multiple shops creates one order per shop. Cancellation is allowed while an order is `PENDING`; inventory is returned to stock. Shop order flow is `PENDING → CONFIRMED → PREPARING → SHIPPING → DELIVERED`.

## Roles

- `CUSTOMER`: browse, cart, checkout, view/cancel own pending orders, submit a shop request.
- `SHOP_OWNER`: maintain approved shop details, products, categories, inventory, staff, and shop orders.
- `STAFF`: access is controlled by `INVENTORY_STAFF` or `ORDER_STAFF` assignment per shop.
- `ADMIN`: review shop requests, manage users, and access administrative order operations.
