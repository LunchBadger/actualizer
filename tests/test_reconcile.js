'use strict';

const assert = require('assert');
const sinon = require('sinon');

const ConfigStoreClient = require('../lib/csclient');
const Deployer = require('../lib/kube').Deployer;
const reconcileRepos = require('../lib/main').reconcileRepos;

describe('Reconciler', function() {
  let configStore = undefined;
  let deployer = undefined;

  const fakeConfig = JSON.stringify({
    gateways: [{
      id: '1234'
    }],
  });

  beforeEach(function()  {
    configStore = sinon.createStubInstance(ConfigStoreClient);
    deployer = sinon.createStubInstance(Deployer);
  });

  afterEach(function() {
    configStore = undefined;
    deployer = undefined;
  });

  it('reconciles each branch that starts with "env/"', async function() {
    configStore.getAllRepos.returns([{
      id: 'test-repo',
      branches: {
        'env/branch1': 'rev1',
        'env/branch2': 'rev2'
      }
    }]);
    configStore.getFile.returns(fakeConfig);

    await reconcileRepos(configStore, deployer);
    assert(deployer.upsertDeployment.calledTwice);
  });

  it('does not affect branches that do not start with "env/"',
    async function() {
      configStore.getAllRepos.returns([{
        id: 'test-repo',
        branches: {
          'branch1': 'rev1',
          'foo/branch2': 'rev2'
        }
      }]);

      await reconcileRepos(configStore, deployer);
      assert(!deployer.upsertDeployment.called);
    });
});
