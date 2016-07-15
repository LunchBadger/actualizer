'use strict';

let ConfigStoreClient = require('../lib/csclient');
let nock = require('nock');
let assert = require('chai').assert;

describe('ConfigStore client', function() {
  let client = new ConfigStoreClient('http://localhost:1234/api');

  afterEach(function() {
    nock.cleanAll();
  });

  it('invokes the correct method during getAllRepos()', async function() {
    let reposApi = nock('http://localhost:1234')
      .get('/api/repos')
      .reply(200, 'hello');
    let response = await client.getAllRepos();
    assert.equal(response, 'hello');
    assert(reposApi.isDone());
  });

  it('invokes the corrent method during getFile()', async function() {
    let reposApi = nock('http://localhost:1234')
      .get('/api/repos/my-repo/branches/my-branch/files/my-file')
      .reply(200, 'file-content');
    let response = await client.getFile('my-repo', 'my-branch', 'my-file');
    assert.equal(response, 'file-content');
    assert(reposApi.isDone());
  });

  it('returns empty list when server cannot be reached', async function() {
    // No nock here.
    let response = await client.getAllRepos();
    assert.deepEqual(response, []);
  });

  it('returns empty list when receiving an error', async function() {
    nock('http://localhost:1234')
      .get('/api/repos')
      .reply(404, 'Not Found');
    let response = await client.getAllRepos();
    assert.deepEqual(response, []);
  });
});
