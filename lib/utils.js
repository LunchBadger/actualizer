module.exports = function sleep(timeout) {
  return new Promise((resolve, _reject) => {
    setTimeout(resolve, timeout);
  });
};
