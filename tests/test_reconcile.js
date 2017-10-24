const assert = require('assert');
const sinon = require('sinon');

const ConfigStoreClient = require('../lib/csclient');
const {Deployer} = require('../lib/kube');
const {Actualizer} = require('../lib/main');
const loadGateways = require('../lib/deployments/gateway');

describe('Reconciler', function () {
  let configStore;
  let deployer;

  const fakeConfig = JSON.stringify({
    gateways: [{
      id: '1234'
    }]
  });

  beforeEach(function () {
    configStore = sinon.createStubInstance(ConfigStoreClient);
    deployer = sinon.createStubInstance(Deployer);
  });

  afterEach(function () {
    configStore = undefined;
    deployer = undefined;
  });

  it('reconciles each environment', async function () {
    configStore.getAllProducers.returns([{
      id: 'test-producer',
      envs: {
        'branch1': 'rev1',
        'branch2': 'rev2'
      }
    }]);
    configStore.getFile.returns(fakeConfig);

    let actualizer = new Actualizer(configStore, deployer, [loadGateways]);
    await actualizer.reconcile();

    // note (includes implicit "dev" environment)
    assert(deployer.updateEnvironment.calledThrice);
  });
});
