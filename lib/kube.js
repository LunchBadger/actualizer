'use strict';

let deep = require('deep-get-set');
let debug = require('debug')('actualizer:kube');
let KubeClient = require('cisco-kube-client');

let ConsistencyError = require('./errors').ConsistencyError;
let CommsError = require('./errors').CommsError;

const KUBE_SETTINGS = {
  protocol: 'http',
  host: 'localhost',
  port: 8001,
  version: 'v1',
  beta: true,
  namespace: 'customer'
};

class Deployer {
  constructor() {
    this.settings = KUBE_SETTINGS;
    this._client = undefined;
  }

  async _withClient(fn) {
    if (!this._client) {
      this._client = await KubeClient(this.settings);
    }

    try {
      return await fn(this._client);
    } catch (err) {
      if (err.statusCode || err.errno) {
        throw new CommsError(`No or bad reply from server: ${err.message}`);
      } else if (err.name === 'SyntaxError') {
        throw new CommsError('Could not parse response from server');
      }
      throw err;
    }
  }

  // Retrieve a Deployment object.
  async _getDeployment(locator) {
    let result = await this._withClient((client) => {
      return client.deployments.get({labels: locator});
    });
    if (result.items === undefined) {
      throw new CommsError('Received malformed DeploymentList');
    }
    if (result.items.length < 1) {
      return null;
    } else if (result.items.length > 1) {
      throw new ConsistencyError('Too many Deployments found ' +
                                 `(${locator})` + result.items);
    }
    return result.items[0];
  }

  // Find the Deployment associated with the given locator. Use that to look up
  // and return the ConfigMap associated with that Deployment.
  async _getConfigMap(locator) {
    let deployment = await this._getDeployment(locator);
    if (!deployment) {
      return null;
    }

    let volumes = (deep(deployment, 'spec.template.spec.volumes') || [])
                  .filter((vol) => vol.name === 'config');
    if (volumes.length != 1) {
      throw new ConsistencyError('Deployment has no config volume: ' +
                                 deployment);
    }

    let configMapName = deep(volumes[0], 'configMap.name');
    if (!configMapName) {
      throw new CommsError('Malformed ConfigMap:', volumes[0]);
    }

    let result = await this._withClient(async (client) => {
      try {
        return await client.configMaps.get(configMapName);
      } catch (err) {
        if (err.name === 'NotFoundError') {
          throw new ConsistencyError('Could not find ConfigMap for deployment');
        }
        throw err;
      }
    });
    return result;
  }

  // Return the config revision associated with the given locator, or null if
  // the app instance is not currently deployed.
  async getConfigRev(locator) {
    let configMap = await this._getConfigMap(locator);
    if (!configMap) {
      return null;
    }
    let revision = deep(configMap, 'metadata.annotations.config-revision');
    if (!revision) {
      throw new CommsError('Bad response from Kubernetes when fetching ' +
                           `ConfigMap (${locator})`);
    }
    return revision;
  }

  // Ensure that the given app instance is running with the given
  // configuration. If an app instance does not exist, this will create one. If
  // one does exist, it will be updated with the given configuration.
  updateDeployment(locator, deployment, rev, create) {
    return this._withClient(async (client) => {
      // Create a new config map. This will need to be cleaned up later. Watch
      // https://github.com/kubernetes/kubernetes/issues/22368 - will make pods
      // restart automatically when associated ConfigMap changes. In the mean
      // time, we have to do this manually.
      const configMapData = deployment.getConfigMapJson();
      const configMapReq = configMapJson(locator, rev, configMapData);
      const deploymentReq = deployment.getDeploymentJson(
        locator, configMapReq.metadata.name);

      debug('Creating ConfigMap');
      await client.configMaps.create(configMapReq);

      if (create) {
        debug('Creating Deployment');
        await client.deployments.create(deploymentReq);
      } else {
        debug('Updating Deployment');
        await client.deployments.update(deploymentReq.metadata.name,
                                       deploymentReq);
      }
    });
  }
}

function configMapJson(locator, rev, gatewayConf) {
  const name = `gateway-${locator.producer}-${locator.environment}-` +
               `${locator.instance}-${rev.substr(0, 10)}`;

  return {
    kind: 'ConfigMap',
    apiVersion: 'v1',
    metadata: {
      labels: locator,
      namespace: 'customer',
      name: name,
      annotations: {
        'config-revision': rev
      }
    },
    data: {
      'gateway.conf': JSON.stringify(gatewayConf)
    },
  };
}

module.exports = {
  Deployer
};
