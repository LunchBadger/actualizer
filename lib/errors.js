'use strict';

let util = require('util');

function CustomError(message) {
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
};
util.inherits(CustomError, Error);

class ConsistencyError extends CustomError {};
class CommsError extends CustomError {};

module.exports = {
  CustomError,
  ConsistencyError,
  CommsError
};
