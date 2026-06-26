const crypto = require('crypto');
const axios = require('axios');

/**
 * FreeCash / Generic Wallet Payment Service
 * Adjust API endpoints per actual FreeCash documentation
 */

const generateSignature = (params, secret) => {
  const sortedStr = Object.keys(params).sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHmac('sha256', secret).update(sortedStr).digest('hex');
};

/**
 * Create FreeCash payment order
 */
const createOrder = async ({ amount, orderId, userId, currency = 'INR' }) => {
  const params = {
    merchant_id: process.env.FREECASH_API_KEY,
    order_id: orderId,
    amount: amount.toFixed(2),
    currency,
    user_id: userId,
    callback_url: process.env.PAYMENT_CALLBACK_URL + '?gateway=freecash',
    success_url: process.env.PAYMENT_SUCCESS_REDIRECT,
    failure_url: process.env.PAYMENT_FAILURE_REDIRECT,
    timestamp: Date.now(),
  };

  params.signature = generateSignature(params, process.env.FREECASH_SECRET);

  // In production: call FreeCash API to create session
  // const response = await axios.post('https://api.freecash.com/v1/payment/create', params);
  // return { gateway: 'freecash', payment_url: response.data.payment_url, ...params };

  // Placeholder response structure
  return {
    gateway: 'freecash',
    gateway_order_id: orderId,
    amount,
    currency,
    params,
    payment_url: `https://freecash.com/pay?order=${orderId}&sig=${params.signature}`,
  };
};

/**
 * Verify FreeCash webhook callback
 */
const verifyPayment = (callbackData) => {
  const { signature, ...rest } = callbackData;
  const expectedSig = generateSignature(rest, process.env.FREECASH_SECRET);
  return {
    success: expectedSig === signature && callbackData.status === 'SUCCESS',
    order_id: callbackData.order_id,
    transaction_id: callbackData.transaction_id,
    amount: callbackData.amount,
    status: callbackData.status,
  };
};

module.exports = { createOrder, verifyPayment };
