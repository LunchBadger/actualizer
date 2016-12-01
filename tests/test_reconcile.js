import assert from 'assert';
import sinon from 'sinon';

import ConfigStoreClient from '../lib/csclient';
import {Deployer} from '../lib/kube';
import {Actualizer} from '../lib/main';
import loadGateways from '../lib/deployments/gateway';

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

    let actualizer = new Actualizer(configStore, deployer, [loadGateways]);
    await actualizer.reconcile();

    // note (includes implicit "dev" environment)
    assert(deployer.updateEnvironment.calledThrice);
  });
});
