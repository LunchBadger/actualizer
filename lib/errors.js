'use strict';

let util = require('util');

function CustomError(message) {
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
};
util.inherits(CustomError, Error);

class ConsistencyError extends CustomError {
  constructor(producer, env, message) {
    super(`Inconsistent state for ${producer}/${env}: ${message}`);
  }
};

class CommsError extends CustomError {
  constructor(service, message) {
    super(`Error contacting ${service}: ${message}`);
  }
};

module.exports = {
  CustomError,
  ConsistencyError,
  CommsError
};
