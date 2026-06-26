const https = require('https');
const crypto = require('crypto');
const axios = require('axios');

/**
 * Generate Paytm checksum hash
 */
const generateChecksum = (params, merchantKey) => {
  const sortedKeys = Object.keys(params).sort();
  const str = sortedKeys.map(k => (params[k] === null || params[k] === undefined ? 'null' : params[k])).join('|');
  const saltedStr = str + '|' + merchantKey;
  return crypto.createHash('sha256').update(saltedStr).digest('hex') + 'Z';
};

/**
 * Verify Paytm checksum
 */
const verifyChecksum = (params, merchantKey, receivedChecksum) => {
  const paramsWithoutChecksum = { ...params };
  delete paramsWithoutChecksum.CHECKSUMHASH;
  const generated = generateChecksum(paramsWithoutChecksum, merchantKey);
  return generated === receivedChecksum;
};

/**
 * Create Paytm payment order — returns HTML form data to redirect user
 */
const createOrder = async ({ amount, orderId, userId, email, phone }) => {
  const params = {
    MID: process.env.PAYTM_MID,
    WEBSITE: process.env.PAYTM_WEBSITE,
    CHANNEL_ID: process.env.PAYTM_CHANNEL_ID,
    INDUSTRY_TYPE_ID: process.env.PAYTM_INDUSTRY_TYPE,
    ORDER_ID: orderId,
    CUST_ID: userId,
    TXN_AMOUNT: amount.toFixed(2),
    CALLBACK_URL: process.env.PAYMENT_CALLBACK_URL + '?gateway=paytm',
    EMAIL: email || '',
    MOBILE_NO: phone || '',
  };

  const checksum = generateChecksum(params, process.env.PAYTM_MERCHANT_KEY);
  params.CHECKSUMHASH = checksum;

  return {
    gateway: 'paytm',
    gateway_order_id: orderId,
    amount,
    params, // Frontend will POST these params to Paytm URL
    paytm_url: `${process.env.PAYTM_BASE_URL}/theia/processTransaction`,
  };
};

/**
 * Verify Paytm callback
 */
const verifyPayment = (callbackParams) => {
  const { CHECKSUMHASH, ...rest } = callbackParams;
  return verifyChecksum(rest, process.env.PAYTM_MERCHANT_KEY, CHECKSUMHASH);
};

/**
 * Verify transaction status via Paytm API
 */
const fetchPaymentStatus = async (orderId) => {
  const params = {
    MID: process.env.PAYTM_MID,
    ORDERID: orderId,
  };
  const checksum = generateChecksum(params, process.env.PAYTM_MERCHANT_KEY);

  const response = await axios.post(
    `${process.env.PAYTM_BASE_URL}/order/status`,
    { ...params, CHECKSUMHASH: checksum },
    { headers: { 'Content-Type': 'application/json' } }
  );

  return response.data;
};

module.exports = { createOrder, verifyPayment, fetchPaymentStatus };
