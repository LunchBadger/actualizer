const request = require('request-promise');
const {CommsError} = require('./errors');

class CSCommsError extends CommsError {
  constructor (message) {
    super('ConfigStore', message);
  }
}

module.exports = class ConfigStoreClient {
  constructor (url) {
    this.url = url;
  }

  async _request (url, json = true) {
    let req;
    try {
      req = await request({
        url: url,
        json: json,
        simple: false,
        resolveWithFullResponse: true
      });
    } catch (err) {
      throw new CSCommsError('could not complete request. ' + err.message);
    }
    if (req.statusCode === 404) {
      return null;
    } else if (req.statusCode !== 200) {
      throw new CSCommsError(`got status ${req.statusCode}`);
    }
    return req.body;
  }

  async getAllProducers () {
    return (await this._request(this.url + '/producers') || []);
  };

  async getFile (producer, env, fileName) {
    return this._request(
      this.url + `/producers/${producer}/envs/${env}/files/${fileName}`, false);
  }
};
