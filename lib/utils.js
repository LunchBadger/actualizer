'use strict';

module.exports.sleep = function sleep(timeout) {
  return new Promise((resolve, _reject) => {
    setTimeout(resolve, timeout);
  });
};
