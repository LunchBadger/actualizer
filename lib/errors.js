import util from 'util';

export function CustomError(message) {
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
};
util.inherits(CustomError, Error);

export class ConsistencyError extends CustomError {
  constructor(producer, env, message) {
    super(`Inconsistent state for ${producer}/${env}: ${message}`);
  }
};

export class CommsError extends CustomError {
  constructor(service, message) {
    super(`Error contacting ${service}: ${message}`);
  }
};
