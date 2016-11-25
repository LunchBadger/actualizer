import assert from 'assert';
import sinon from 'sinon';

import ConfigStoreClient from '../lib/csclient';
import {Deployer} from '../lib/kube';
import {reconcileProducers} from '../lib/main';

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
