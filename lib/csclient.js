const request = require('request-promise');
const {CommsError} = require('./errors');
const debug = require('debug')('actualizer:configstore');
const NAMESPACE = 'customer';
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

  async getSSHSecret (producer) {
    let keys;
    try {
      let res = await request({
        url: `${this.gitApiUrl}/users/${NAMESPACE}/${producer.name}/ssh`,
        json: true,
        simple: false,
        resolveWithFullResponse: true
      });
      keys = res.body.keys;
      if (!keys) {
        debug(`no SSH keys found for ${producer.name}, registering new`);
        res = await request({
          url: `${this.gitApiUrl}/users/${NAMESPACE}/${producer.name}/ssh`,
          method: 'POST',
          json: true,
          simple: false,
          resolveWithFullResponse: true
        });

        keys = res.body.keys;
      }
    } catch (err) {
      console.log('err', err);
      return {};
    }
    return {
      publicKey: keys.PublicKey || keys.publicKey,
      privateKey: (keys.PrivateKey || keys.privateKey).replace('\\n', '\n')
    };
  }

  async getFile (producer, env, fileName) {
    return this._request(
      this.url + `/producers/${producer}/envs/${env}/files/${fileName}`, false);
  }
};
