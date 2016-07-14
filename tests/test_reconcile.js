'use strict';

const assert = require('assert');
const sinon = require('sinon');
const ConfigStoreClient = require('../lib/csclient');
const Deployer = require('../lib/kube').Deployer;
const reconcileRepos = require('../lib/main').reconcileRepos;

describe('Reconciler', function() {
  let configStore = undefined;
  let deployer = undefined;

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
    deployer.getConfigRev.returns('rev0');
    configStore.getFile.returns('{"some": "configuration"}');

    await reconcileRepos(configStore, deployer);

    assert(deployer.setConfig.calledTwice);
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
      assert(!deployer.setConfig.called);
    });

  it('sets configuration when revision does not match', async function() {
    configStore.getAllRepos.returns([{
      id: 'test-repo',
      branches: {
        'env/branch1': 'rev1'
      }
    }]);
    deployer.getConfigRev.returns('rev0');
    configStore.getFile.returns('{"some": "configuration"}');

    await reconcileRepos(configStore, deployer);

    assert(deployer.setConfig.calledWith(
      {producer: 'test-repo', environment: 'branch1', app: 'gateway'},
      '{"some": "configuration"}', 'rev1', false));
  });

  it('creates a deployment when the revision is null', async function() {
    configStore.getAllRepos.returns([{
      id: 'test-repo',
      branches: {
        'env/branch1': 'rev1'
      }
    }]);
    deployer.getConfigRev.returns(null);
    configStore.getFile.returns('{"some": "configuration"}');

    await reconcileRepos(configStore, deployer);

    assert(deployer.setConfig.calledWith(
      {producer: 'test-repo', environment: 'branch1', app: 'gateway'},
      '{"some": "configuration"}', 'rev1', true));
  });

  it('does nothing if the revision matches', async function() {
    configStore.getAllRepos.returns([{
      id: 'test-repo',
      branches: {
        'env/branch1': 'rev1'
      }
    }]);
    deployer.getConfigRev.returns('rev1');

    await reconcileRepos(configStore, deployer);

    assert(!deployer.setConfig.called);
  });
});
