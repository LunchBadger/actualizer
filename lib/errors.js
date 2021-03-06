const util = require('util');

const CustomError = module.exports = function CustomError (message) {
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
};
util.inherits(CustomError, Error);

module.exports.ConsistencyError = class ConsistencyError extends CustomError {
  constructor (producer, env, message) {
    super(`Inconsistent state for ${producer}/${env}: ${message}`);
  }
};

module.exports.CommsError = class CommsError extends CustomError {
  constructor (service, message) {
    super(`Error contacting ${service}: ${message}`);
  }
};
