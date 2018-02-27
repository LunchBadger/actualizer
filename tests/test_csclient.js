const nock = require('nock');
const {assert} = require('chai');

const ConfigStoreClient = require('../lib/csclient');
const {CommsError} = require('../lib/errors');

describe('ConfigStore client', function () {
  const client = new ConfigStoreClient('http://localhost:1234/api');

  afterEach(function () {
    nock.cleanAll();
  });

  it('invokes the correct method during getAllProducers()', async function () {
    const reposApi = nock('http://localhost:1234')
      .get('/api/producers')
      .reply(200, 'hello');
    const response = await client.getAllProducers();
    assert.equal(response, 'hello');
    assert(reposApi.isDone());
  });

  it('invokes the corrent method during getFile()', async function () {
    const fileApi = nock('http://localhost:1234')
      .get('/api/producers/my-producer/envs/my-env/files/my-file')
      .reply(200, 'file-content');
    const response = await client.getFile('my-producer', 'my-env', 'my-file');
    assert.equal(response, 'file-content');
    assert(fileApi.isDone());
  });

  it('throws error when server cannot be reached', async function () {
    // No nock here.
    assert.isRejected(client.getAllProducers(), CommsError);
  });

  it('returns empty list when receiving an error', async function () {
    nock('http://localhost:1234')
      .get('/api/producers')
      .reply(404, 'Not Found');
    const response = await client.getAllProducers();
    assert.deepEqual(response, []);
  });
});