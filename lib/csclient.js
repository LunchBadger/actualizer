const request = require('request-promise');
const {CommsError} = require('./errors');
const CUSTOMER_NAMESPACE = process.env.CUSTOMER_NAMESPACE || 'customer';
class CSCommsError extends CommsError {
  constructor (message) {
    super('ConfigStore', message);
  }
}

module.exports = class ConfigStoreClient {
  constructor (url) {
    this.gitApiUrl = process.env.GIT_API_URL || 'http://localhost:8080';
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
      throw new CSCommsError('could not complete request. ' + url + ' ' + err.message);
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
      this.gitApiUrl + `/users/${CUSTOMER_NAMESPACE}/${producer}/repos/${env}/${fileName}`, true)
      .then(res => {
        if (!res || !res.data) {
          return '';
        }
        return Buffer.from(res.data, 'base64').toString('utf8');
      });
  }
};
