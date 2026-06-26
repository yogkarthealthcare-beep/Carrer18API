const crypto = require('crypto');

// ─── CCAvenue AES-128 CBC Encryption ─────────────────────────────────────
const encrypt = (plainText, workingKey) => {
  const key = crypto.createHash('md5').update(workingKey).digest();
  const iv = Buffer.alloc(16, 0);
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
};

const decrypt = (encText, workingKey) => {
  const key = crypto.createHash('md5').update(workingKey).digest();
  const iv = Buffer.alloc(16, 0);
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  let decrypted = decipher.update(encText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

/**
 * Build CCAvenue redirect data
 * Returns encrypted request to POST to CCAvenue
 */
const createOrder = ({ amount, orderId, userId, email, phone, currency = 'INR' }) => {
  const params = [
    `merchant_id=${process.env.CCAVENUE_MERCHANT_ID}`,
    `order_id=${orderId}`,
    `currency=${currency}`,
    `amount=${amount.toFixed(2)}`,
    `redirect_url=${process.env.PAYMENT_CALLBACK_URL}?gateway=ccavenue`,
    `cancel_url=${process.env.PAYMENT_FAILURE_REDIRECT}`,
    `language=EN`,
    `billing_email=${email || ''}`,
    `billing_tel=${phone || ''}`,
    `billing_name=User_${userId}`,
  ].join('&');

  const encRequest = encrypt(params, process.env.CCAVENUE_WORKING_KEY);

  return {
    gateway: 'ccavenue',
    gateway_order_id: orderId,
    amount,
    enc_request: encRequest,
    access_code: process.env.CCAVENUE_ACCESS_CODE,
    ccavenue_url: `${process.env.CCAVENUE_BASE_URL}/transaction/transaction.do?command=initiateTransaction`,
  };
};

/**
 * Decrypt CCAvenue callback response
 */
const verifyPayment = (encResponse) => {
  try {
    const decrypted = decrypt(encResponse, process.env.CCAVENUE_WORKING_KEY);
    const result = {};
    decrypted.split('&').forEach(pair => {
      const [k, v] = pair.split('=');
      result[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });

    // order_status: 'Success', 'Failure', 'Aborted', 'Invalid', 'Timeout'
    return {
      success: result.order_status === 'Success',
      order_id: result.order_id,
      tracking_id: result.tracking_id,
      amount: result.amount,
      status: result.order_status,
      raw: result,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

module.exports = { createOrder, verifyPayment, encrypt, decrypt };
