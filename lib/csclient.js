'use strict';

let request = require('request-promise');

class ConfigStoreClient {
  constructor(url) {
    this.url = url;
  }

  async _request(url) {
    let req = undefined;
    try {
      req = await request({
        url: url,
        json: true,
        simple: false,
        resolveWithFullResponse: true
      });
    } catch (err) {
      console.warn('Could not complete request. Error: ' + err.message);
      return [];
    }
    if (req.statusCode !== 200) {
      console.warn(`Got status ${req.statusCode} from server.`);
      return [];
    }
    return req.body;
  }

  async getAllRepos() {
    return await this._request(this.url + '/repos');
  };

  async getFile(repo, branch, fileName) {
    return await this._request(
      this.url + `/repos/${repo}/branches/${branch}/files/${fileName}`);
  }
}

module.exports = ConfigStoreClient;
