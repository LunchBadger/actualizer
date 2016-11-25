import nock from 'nock';
import {assert} from 'chai';

import ConfigStoreClient from '../lib/csclient';
import {CommsError} from '../lib/errors';

describe('ConfigStore client', function() {
  let client = new ConfigStoreClient('http://localhost:1234/api');

  afterEach(function() {
    nock.cleanAll();
  });

  it('invokes the correct method during getAllProducers()', async function() {
    let reposApi = nock('http://localhost:1234')
      .get('/api/producers')
      .reply(200, 'hello');
    let response = await client.getAllProducers();
    assert.equal(response, 'hello');
    assert(reposApi.isDone());
  });

  it('invokes the corrent method during getFile()', async function() {
    let fileApi = nock('http://localhost:1234')
      .get('/api/producers/my-producer/envs/my-env/files/my-file')
      .reply(200, 'file-content');
    let response = await client.getFile('my-producer', 'my-env', 'my-file');
    assert.equal(response, 'file-content');
    assert(fileApi.isDone());
  });

  it('throws error when server cannot be reached', async function() {
    // No nock here.
    assert.isRejected(client.getAllProducers(), CommsError);
  });

  it('returns empty list when receiving an error', async function() {
    nock('http://localhost:1234')
      .get('/api/producers')
      .reply(404, 'Not Found');
    let response = await client.getAllProducers();
    assert.deepEqual(response, []);
  });
});
