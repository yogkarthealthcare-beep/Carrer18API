const crypto = require('crypto');

const PAYU_HASH_FIELDS = [
  'key',
  'txnid',
  'amount',
  'productinfo',
  'firstname',
  'email',
  'udf1',
  'udf2',
  'udf3',
  'udf4',
  'udf5',
  'udf6',
  'udf7',
  'udf8',
  'udf9',
  'udf10',
];

const getPayuBaseUrl = () => (
  process.env.PAYU_BASE_URL || 'https://test.payu.in/_payment'
);

const sha512 = (value) => crypto.createHash('sha512').update(value).digest('hex');

const requirePayuConfig = () => {
  if (!process.env.PAYU_KEY || !process.env.PAYU_SALT) {
    throw new Error('PAYU_KEY and PAYU_SALT are required');
  }
};

const buildPaymentHash = (params) => {
  const hashString = [
    ...PAYU_HASH_FIELDS.map((field) => params[field] || ''),
    process.env.PAYU_SALT,
  ].join('|');

  return sha512(hashString);
};

const buildResponseHash = (callbackData) => {
  const reverseFields = [
    process.env.PAYU_SALT,
    callbackData.status || '',
    callbackData.udf10 || '',
    callbackData.udf9 || '',
    callbackData.udf8 || '',
    callbackData.udf7 || '',
    callbackData.udf6 || '',
    callbackData.udf5 || '',
    callbackData.udf4 || '',
    callbackData.udf3 || '',
    callbackData.udf2 || '',
    callbackData.udf1 || '',
    callbackData.email || '',
    callbackData.firstname || '',
    callbackData.productinfo || '',
    callbackData.amount || '',
    callbackData.txnid || '',
    process.env.PAYU_KEY,
  ];

  const hashString = callbackData.additionalCharges
    ? [callbackData.additionalCharges, ...reverseFields].join('|')
    : reverseFields.join('|');

  return sha512(hashString);
};

const createOrder = ({ amount, orderId, userId, email, phone, name, description }) => {
  requirePayuConfig();

  const firstname = name || 'Careers18 User';
  const params = {
    key: process.env.PAYU_KEY,
    txnid: orderId,
    amount: amount.toFixed(2),
    productinfo: description || 'Careers18 Payment',
    firstname,
    email: email || process.env.PAYU_DEFAULT_EMAIL || 'no-reply@careers18.com',
    phone: phone || '',
    surl: `${process.env.PAYMENT_CALLBACK_URL}?gateway=payu`,
    furl: `${process.env.PAYMENT_CALLBACK_URL}?gateway=payu`,
    udf1: userId || '',
    udf2: orderId,
    udf3: '',
    udf4: '',
    udf5: '',
    udf6: '',
    udf7: '',
    udf8: '',
    udf9: '',
    udf10: '',
  };

  params.hash = buildPaymentHash(params);

  return {
    gateway: 'payu',
    gateway_order_id: orderId,
    amount,
    currency: 'INR',
    params,
    payu_url: getPayuBaseUrl(),
  };
};

const verifyPayment = (callbackData) => {
  requirePayuConfig();

  const expectedHash = buildResponseHash(callbackData);
  const receivedHash = callbackData.hash || '';
  const isHashValid = expectedHash === receivedHash;
  const status = callbackData.status || 'failed';

  return {
    success: isHashValid && status.toLowerCase() === 'success',
    order_id: callbackData.txnid,
    transaction_id: callbackData.mihpayid || callbackData.bank_ref_num,
    amount: callbackData.amount,
    status,
    hash_valid: isHashValid,
    raw: callbackData,
  };
};

module.exports = {
  createOrder,
  verifyPayment,
  buildPaymentHash,
  buildResponseHash,
};
