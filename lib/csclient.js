'use strict';

let request = require('request-promise');

class ConfigStoreClient {
  constructor(url) {
    this.url = url;
  }

  async getAllRepos() {
    let req = undefined;
    try {
      req = await request({
        url: this.url + '/repos',
        json: true,
        simple: false,
        resolveWithFullResponse: true
      });
    } catch (err) {
      console.warn('Could not retrieve repo information. Error: ' +
                   err.message);
      return [];
    }
    if (req.statusCode !== 200) {
      console.warn('Could not retrieve repo information. ' +
                   `Got status ${req.statusCode}`);
      return [];
    }
    return req.body;
  };

  async getFile(repo, branch, fileName) {
    let req = undefined;
    let url = this.url + `/repos/${repo}/branches/${branch}/files/${fileName}`;
    req = await request({
      url: url,
      json: true,
      simple: false,
      resolveWithFullResponse: true
    });
    return req.body;
  }
}

module.exports = ConfigStoreClient;
