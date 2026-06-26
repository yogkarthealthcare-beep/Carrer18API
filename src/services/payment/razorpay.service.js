const Razorpay = require('razorpay');
const crypto = require('crypto');

const getRazorpayInstance = () => {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

/**
 * Create Razorpay order
 */
const createOrder = async ({ amount, currency = 'INR', orderId, notes = {} }) => {
  const razorpay = getRazorpayInstance();
  const order = await razorpay.orders.create({
    amount: Math.round(amount * 100), // paise
    currency,
    receipt: orderId,
    notes,
  });
  return {
    gateway: 'razorpay',
    gateway_order_id: order.id,
    amount: order.amount / 100,
    currency: order.currency,
    key_id: process.env.RAZORPAY_KEY_ID,
    receipt: order.receipt,
  };
};

/**
 * Verify Razorpay payment signature
 */
const verifyPayment = ({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) => {
  const body = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');
  return expectedSignature === razorpay_signature;
};

/**
 * Fetch payment details from Razorpay
 */
const fetchPayment = async (paymentId) => {
  const razorpay = getRazorpayInstance();
  return await razorpay.payments.fetch(paymentId);
};

module.exports = { createOrder, verifyPayment, fetchPayment };
