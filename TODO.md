# RBAC Implementation Plan

## Phase 1: Database Schema
- [ ] Add `users` unified auth table
- [ ] Add `buyers` profile table
- [ ] Add `password_hash` and `role` to `transporters`
- [ ] Add `user_id` FK to `farmers`, `admins`, `transporters`

## Phase 2: Unified Auth Controller
- [ ] Create `authController.js` with unified register/login
- [ ] JWT payload: `{userId, email, role}`

## Phase 3: Fix Middleware
- [ ] Clean up `authmiddleware.js` - consistent JWT decoding
- [ ] Keep `roleMiddleware.js` as-is (already good)

## Phase 4: Fix Route Security
- [ ] `/api/subsidy/my-vouchers` - add role check
- [ ] `/api/subsidy/redeem` - add role check
- [ ] `/api/market/buyer-orders` - add auth + role check
- [ ] `/api/market/place-order` - add auth + role check
- [ ] `/api/transporters/update-delivery` - allow transporter role
- [ ] `/api/admin/*` - add auth middleware to all admin routes
- [ ] Add transporter login route
- [ ] Add buyer registration/login routes

## Phase 5: Frontend Role Protection
- [ ] Add buyer dashboard page
- [ ] Add transporter dashboard page
- [ ] Add admin dashboard page
- [ ] Update AppRoutes with role-based routing
- [ ] Update authService for unified login
- [ ] Update Navbar for role-based navigation

## Phase 6: RBAC Tests
- [ ] Farmer accessing farmer route: SUCCESS
- [ ] Farmer accessing admin route: FAIL 403
- [ ] Buyer accessing transport route: FAIL 403
- [ ] Admin accessing everything: SUCCESS