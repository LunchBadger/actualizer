'use strict';

const assert = require('assert');
const sinon = require('sinon');

const ConfigStoreClient = require('../lib/csclient');
const Deployer = require('../lib/kube').Deployer;
const reconcileProducers = require('../lib/main').reconcileProducers;

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

  it('reconciles each environment', async function() {
    configStore.getAllProducers.returns([{
      id: 'test-producer',
      envs: {
        'branch1': 'rev1',
        'branch2': 'rev2'
      }
    }]);
    configStore.getFile.returns(fakeConfig);

    await reconcileProducers(configStore, deployer);
    assert(deployer.updateEnvironment.calledTwice);
  });
});
