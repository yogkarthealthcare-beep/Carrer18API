const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { sendSuccess, sendError } = require('../utils/response');
const { authenticate } = require('../middleware/auth.middleware');
const { sendPaymentConfirmationEmail } = require('../services/email.service');

const razorpayService = require('../services/payment/razorpay.service');
const paytmService = require('../services/payment/paytm.service');
const ccavenueService = require('../services/payment/ccavenue.service');
const freecashService = require('../services/payment/freecash.service');
const payuService = require('../services/payment/payu.service');

// ─── Plans config ─────────────────────────────────────────────────────────
const PLANS = {
  basic:      { name: 'Basic',      amount: 999,   credits: 10, job_limit: 5 },
  standard:   { name: 'Standard',   amount: 2499,  credits: 30, job_limit: 15 },
  premium:    { name: 'Premium',    amount: 4999,  credits: 100, job_limit: 50 },
  enterprise: { name: 'Enterprise', amount: 9999,  credits: 300, job_limit: 200 },
};

// ─── GET /api/v1/payments/plans ───────────────────────────────────────────
router.get('/plans', (req, res) => {
  return sendSuccess(res, PLANS, 'Available plans');
});

// ─── POST /api/v1/payments/initiate ──────────────────────────────────────
// Requires auth — creates DB order + returns gateway-specific data
router.post('/initiate', authenticate, async (req, res, next) => {
  try {
    const { gateway, plan_id, credits } = req.body;

    const supportedGateways = ['razorpay', 'paytm', 'ccavenue', 'freecash', 'payu'];
    if (!supportedGateways.includes(gateway)) {
      return sendError(res, `Gateway must be one of: ${supportedGateways.join(', ')}`, 400);
    }

    let amount, description, orderType;

    if (plan_id) {
      const plan = PLANS[plan_id];
      if (!plan) return sendError(res, 'Invalid plan', 400);
      amount = plan.amount;
      description = `${plan.name} Plan - Careers18`;
      orderType = 'subscription';
    } else if (credits) {
      amount = parseInt(credits) * 10; // ₹10 per credit
      description = `${credits} Credits - Careers18`;
      orderType = 'credits';
    } else {
      return sendError(res, 'Provide plan_id or credits', 400);
    }

    // Create order in DB
    const orderId = `C18-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;
    await db.query(
      `INSERT INTO payment_orders (id, user_id, order_id, gateway, amount, currency,
         status, plan_id, credits, description, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'INR', 'pending', $5, $6, $7, NOW(), NOW())`,
      [req.user.id, orderId, gateway, amount, plan_id || null, credits || null, description]
    );

    // Get user info for payment forms
    const userResult = await db.query(
      `SELECT u.email, p.first_name, p.last_name, p.phone
       FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    const user = userResult.rows[0] || {};

    // ─── Gateway-specific order creation ─────────────────────────────────
    let gatewayData;

    if (gateway === 'razorpay') {
      gatewayData = await razorpayService.createOrder({
        amount,
        orderId,
        notes: { user_id: req.user.id, plan: plan_id, email: user.email },
      });

    } else if (gateway === 'paytm') {
      gatewayData = await paytmService.createOrder({
        amount,
        orderId,
        userId: req.user.id,
        email: user.email,
        phone: user.phone,
      });

    } else if (gateway === 'ccavenue') {
      gatewayData = ccavenueService.createOrder({
        amount,
        orderId,
        userId: req.user.id,
        email: user.email,
        phone: user.phone,
      });

    } else if (gateway === 'freecash') {
      gatewayData = await freecashService.createOrder({
        amount,
        orderId,
        userId: req.user.id,
      });

    } else if (gateway === 'payu') {
      gatewayData = payuService.createOrder({
        amount,
        orderId,
        userId: req.user.id,
        email: user.email,
        phone: user.phone,
        name: [user.first_name, user.last_name].filter(Boolean).join(' '),
        description,
      });
    }

    if (gatewayData?.gateway_order_id) {
      await db.query(
        `UPDATE payment_orders SET gateway_order_id = $1, updated_at = NOW() WHERE order_id = $2`,
        [gatewayData.gateway_order_id, orderId]
      );
    }

    return sendSuccess(res, {
      order_id: orderId,
      amount,
      description,
      ...gatewayData,
    }, 'Payment order created');

  } catch (err) {
    next(err);
  }
});

// ─── POST /api/v1/payments/callback ──────────────────────────────────────
// SINGLE CALLBACK URL for ALL gateways
// gateway identified via ?gateway=razorpay | paytm | ccavenue | freecash | payu
router.post('/callback', async (req, res, next) => {
  try {
    const gateway = req.query.gateway || req.body.gateway;
    const body = req.body;

    let orderId, isSuccess, gatewayTxnId, gatewayStatus;

    // ─── Parse by gateway ─────────────────────────────────────────────────
    if (gateway === 'razorpay') {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
      isSuccess = razorpayService.verifyPayment({ razorpay_order_id, razorpay_payment_id, razorpay_signature });
      // Get our orderId from the receipt stored during order creation
      const gw = await db.query(
        `SELECT order_id FROM payment_orders WHERE gateway_order_id = $1 OR order_id = $2`,
        [razorpay_order_id, razorpay_order_id]
      );
      orderId = gw.rows[0]?.order_id || razorpay_order_id;
      gatewayTxnId = razorpay_payment_id;
      gatewayStatus = isSuccess ? 'SUCCESS' : 'FAILED';

    } else if (gateway === 'paytm') {
      isSuccess = paytmService.verifyPayment(body) && body.STATUS === 'TXN_SUCCESS';
      orderId = body.ORDERID;
      gatewayTxnId = body.TXNID;
      gatewayStatus = body.STATUS;

    } else if (gateway === 'ccavenue') {
      const result = ccavenueService.verifyPayment(body.encResp);
      isSuccess = result.success;
      orderId = result.order_id;
      gatewayTxnId = result.tracking_id;
      gatewayStatus = result.status;

    } else if (gateway === 'freecash') {
      const result = freecashService.verifyPayment(body);
      isSuccess = result.success;
      orderId = result.order_id;
      gatewayTxnId = result.transaction_id;
      gatewayStatus = result.status;

    } else if (gateway === 'payu') {
      const result = payuService.verifyPayment(body);
      isSuccess = result.success;
      orderId = result.order_id;
      gatewayTxnId = result.transaction_id;
      gatewayStatus = result.status;

    } else {
      return sendError(res, 'Unknown gateway', 400);
    }

    // ─── Fetch our order ──────────────────────────────────────────────────
    const orderResult = await db.query(
      `SELECT * FROM payment_orders WHERE order_id = $1`, [orderId]
    );

    if (orderResult.rows.length === 0) {
      return sendError(res, 'Order not found', 404);
    }

    const order = orderResult.rows[0];

    // Idempotency: already processed?
    if (order.status === 'success') {
      return res.redirect(process.env.PAYMENT_SUCCESS_REDIRECT + `?order=${orderId}&already=true`);
    }

    if (!isSuccess) {
      await db.query(
        `UPDATE payment_orders SET status = 'failed', gateway_txn_id = $1,
         gateway_status = $2, updated_at = NOW() WHERE order_id = $3`,
        [gatewayTxnId, gatewayStatus, orderId]
      );
      return res.redirect(process.env.PAYMENT_FAILURE_REDIRECT + `?order=${orderId}&gateway=${gateway}`);
    }

    // ─── Payment success — activate plan / add credits ────────────────────
    await db.query(
      `UPDATE payment_orders SET status = 'success', gateway_txn_id = $1,
       gateway_status = $2, updated_at = NOW() WHERE order_id = $3`,
      [gatewayTxnId, gatewayStatus, orderId]
    );

    if (order.plan_id && PLANS[order.plan_id]) {
      const plan = PLANS[order.plan_id];
      // Activate subscription
      await db.query(
        `INSERT INTO user_subscriptions (id, user_id, plan_id, order_id, status,
           credits_allocated, job_limit, started_at, expires_at, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'active', $4, $5,
                 NOW(), NOW() + INTERVAL '30 days', NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           plan_id = EXCLUDED.plan_id, order_id = EXCLUDED.order_id,
           status = 'active', credits_allocated = EXCLUDED.credits_allocated,
           job_limit = EXCLUDED.job_limit, started_at = NOW(),
           expires_at = NOW() + INTERVAL '30 days'`,
        [order.user_id, order.plan_id, orderId, plan.credits, plan.job_limit]
      );

      // Add credits to wallet
      await db.query(
        `INSERT INTO credit_wallets (id, user_id, balance, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           balance = credit_wallets.balance + $2, updated_at = NOW()`,
        [order.user_id, plan.credits]
      );

    } else if (order.credits) {
      // Top up credits
      await db.query(
        `INSERT INTO credit_wallets (id, user_id, balance, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           balance = credit_wallets.balance + $2, updated_at = NOW()`,
        [order.user_id, order.credits]
      );
    }

    // Send confirmation email
    const userResult = await db.query(
      `SELECT u.email, p.first_name FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.id = $1`,
      [order.user_id]
    );
    const user = userResult.rows[0];

    await sendPaymentConfirmationEmail({
      to: user?.email,
      name: user?.first_name,
      amount: order.amount,
      orderId,
      plan: order.plan_id ? PLANS[order.plan_id]?.name : `${order.credits} Credits`,
      gateway,
    });

    return res.redirect(process.env.PAYMENT_SUCCESS_REDIRECT + `?order=${orderId}&gateway=${gateway}`);

  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/payments/verify/:orderId ────────────────────────────────
// Frontend can poll this to confirm payment status
router.get('/verify/:orderId', authenticate, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT order_id, gateway, amount, status, plan_id, credits,
              gateway_txn_id, created_at, updated_at
       FROM payment_orders WHERE order_id = $1 AND user_id = $2`,
      [req.params.orderId, req.user.id]
    );

    if (result.rows.length === 0) {
      return sendError(res, 'Order not found', 404);
    }

    return sendSuccess(res, result.rows[0]);
  } catch (err) { next(err); }
});

// ─── GET /api/v1/payments/history ────────────────────────────────────────
router.get('/history', authenticate, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT order_id, gateway, amount, currency, status, plan_id, credits,
              description, gateway_txn_id, created_at
       FROM payment_orders WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    return sendSuccess(res, result.rows);
  } catch (err) { next(err); }
});

// ─── GET /api/v1/payments/wallet ─────────────────────────────────────────
router.get('/wallet', authenticate, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT balance FROM credit_wallets WHERE user_id = $1`, [req.user.id]
    );
    return sendSuccess(res, { balance: parseInt(result.rows[0]?.balance || 0) });
  } catch (err) { next(err); }
});

// ─── GET /api/v1/payments/subscription ───────────────────────────────────
router.get('/subscription', authenticate, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT us.*, po.gateway, po.order_id AS payment_order_id
       FROM user_subscriptions us
       LEFT JOIN payment_orders po ON po.order_id = us.order_id
       WHERE us.user_id = $1 AND us.status = 'active' AND us.expires_at > NOW()`,
      [req.user.id]
    );
    return sendSuccess(res, result.rows[0] || null, result.rows.length ? 'Active subscription' : 'No active subscription');
  } catch (err) { next(err); }
});

module.exports = router;
