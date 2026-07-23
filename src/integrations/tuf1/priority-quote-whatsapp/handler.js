module.exports = {
  async execute() {
    const error = new Error(
      'Priority order to ITC must run through its independent priority-order-itc worker.'
    );
    error.retryable = false;
    throw error;
  },
};
