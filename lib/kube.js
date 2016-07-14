'use strict';

let templates = require('./templates');
let deep = require('deep-get-set');
let KubeClient = require('cisco-kube-client');
let ConsistencyError = require('./errors').ConsistencyError;
let CustomError = require('./errors').CustomError;

class KubeError extends CustomError {}

const KUBE_SETTINGS = {
  protocol: 'http',
  host: 'localhost',
  port: 8001,
  version: 'v1',
  beta: true,
  namespace: 'default'
};

class Deployer {
  constructor() {
    this.settings = KUBE_SETTINGS;
    this._client = undefined;
  }

  async _getClient() {
    if (!this._client) {
      this._client = await KubeClient(this.settings);
    }
    return this._client;
  }

  // Retrieve a Deployment object.
  async _getDeployment(locator) {
    let result = await (await this._getClient()).deployments.get({
      labels: locator
    });
    let found = result.items || [];
    if (found.length < 1) {
      return null;
    } else if (found.length > 1) {
      throw new ConsistencyError('Too many Deployments found ' +
                                 `(${locator})` + found);
    }
    return found[0];
  }

  // Find the Deployment associated with the given locator. Use that to look up
  // abd return the ConfigMap associated with that Deployment.
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
      throw new ConsistencyError('Malformed ConfigMap:', volumes[0]);
    }

    let result = await (await this._getClient()).configMaps.get(configMapName);
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
      throw new KubeError('Bad response from Kubernetes when fetching ' +
                          `ConfigMap (${locator})`);
    }
    return revision;
  }

  // Ensure that the given app instance is running with the given
  // configuration. If an app instance does not exist, this will create one. If
  // one does exist, it will be updated with the given configuration.
  async setConfig(locator, config, rev, create) {
    let client = await this._getClient();

    // Create a new config map. This will need to be cleaned up later. Watch
    // https://github.com/kubernetes/kubernetes/issues/22368 - will make pods
    // restart automatically when associated ConfigMap changes. In the mean
    // time, we have to do this manually.
    console.log('Creating ConfigMap');
    let configMapReq = templates.configMap(locator, config, rev);
    await client.configMaps.create(configMapReq);

    // Create or update the Deployment
    let deploymentReq = templates.deployment(locator,
                                             configMapReq.metadata.name);
    if (create) {
      console.log('Creating Deployment');
      await client.deployments.create(deploymentReq);
    } else {
      console.log('Updating Deployment');
      await client.deployments.update(deploymentReq.metadata.name,
                                      deploymentReq);
    }
  }
}

module.exports = {
  Deployer,
  KubeError
};
