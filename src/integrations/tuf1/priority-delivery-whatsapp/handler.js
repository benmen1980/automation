module.exports = { async execute() { throw new Error('Delivery notifications must run through the independent priority-delivery-itc worker.'); } };
