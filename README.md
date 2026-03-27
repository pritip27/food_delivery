# Spice Route Food Delivery

A small Node.js food ordering app with a static frontend, MongoDB storage, user checkout flow, and an admin dashboard for managing menu items and order status.

## Features

- Storefront with live cart updates
- User registration and login
- Admin login for order management
- Card payment validation during checkout
- Order history for signed-in users
- Menu creation and deletion from the admin dashboard
- MongoDB persistence for users, menu items, and orders

## Tech Stack

- Node.js built-in `http` server
- Vanilla HTML, CSS, and JavaScript
- MongoDB for application data

## Getting Started

1. Install Node.js 18 or newer.
2. Open the project folder:

```powershell
cd "C:\Users\Priti P\OneDrive\Documents\New project\food_delivery"
```

3. Create your environment file:

```powershell
Copy-Item .env.example .env
```

4. Make sure MongoDB is running locally, or update `.env` with your MongoDB Atlas connection string.

5. Install dependencies:

```powershell
npm install
```

6. Start the app:

```powershell
npm start
```

7. Open [http://127.0.0.1:3000](http://127.0.0.1:3000) in your browser.

For local development with automatic restarts on Node.js 18+:

```powershell
npm run dev
```

To run on a different host or port:

```powershell
$env:HOST="0.0.0.0"
$env:PORT="4000"
npm start
```

To use MongoDB Atlas instead of local MongoDB:

```powershell
$env:MONGODB_URI="mongodb+srv://<username>:<password>@<cluster-url>/"
$env:MONGODB_DB_NAME="spice_route"
npm start
```

## Demo Accounts

- User: `user@spiceroute.com` / `user123`
- Admin: `admin@spiceroute.com` / `admin123`

You can also create a new user account from `register.html`.

## Pages

- `/` or `index.html`: storefront and checkout
- `/login.html`: user or admin login
- `/register.html`: user registration
- `/orders.html`: logged-in user order history
- `/admin.html`: admin dashboard

## API Endpoints

- `GET /api/menu`
- `POST /api/menu` (admin only)
- `DELETE /api/menu/:id` (admin only)
- `POST /api/register`
- `POST /api/login`
- `GET /api/session`
- `POST /api/logout`
- `GET /api/orders`
- `POST /api/orders` (user only)
- `PATCH /api/orders/:id/status` (admin only)

## Data Seeding

- `menu.json`: initial menu seed for a fresh database
- `users.json`: initial demo-account seed for a fresh database
- `orders.json`: initial order seed for a fresh database

## Notes

- Sessions are stored in browser `localStorage` and validated against the server on page load.
- Passwords are stored using PBKDF2 hashing.
- Card details are validated for format and only the last four digits are saved with each order.
- Run `npm run check` for a quick JavaScript syntax check across the app files.
- The server seeds MongoDB collections from the JSON files only when the corresponding collection is empty.
