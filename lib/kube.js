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

class KubernetesWrapper {
  constructor() {
    this.settings = KUBE_SETTINGS;
    this._client = undefined;
  }

  async client() {
    if (!this._client) {
      this._client = await KubeClient(this.settings);
    }
    return this._client;
  }

  // Retrieve a Deployment object.
  async getDeployment(producer, environment) {
    let result = await (await this.client()).deployments.get({
      labels: {producer, environment, app: 'gateway'}
    });
    let found = result.items || [];
    if (found.length < 1) {
      return null;
    } else if (found.length > 1) {
      throw new ConsistencyError('Too many Deployments found ' +
                                 `(producer=${producer} ` +
                                 `environment=${environment})` + found);
    }
    return found[0];
  }

  // Find the Gateway Deployment associated with the given producer and
  // environment. Use that to look up abd return the ConfigMap associated with
  // that Deployment.
  async getGatewayConfigMap(producer, environment) {
    let deployment = await this.getDeployment(producer, environment);
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

    let result = await (await this.client()).configMaps.get(configMapName);
    return result;
  }

  // Return the Gateway config revision associated with the given producer and
  // environment, or null if a Gateway is not currently deployed.
  async getGatewayConfigRev(producer, environment) {
    let configMap = await this.getGatewayConfigMap(producer, environment);
    if (!configMap) {
      return null;
    }
    let revision = deep(configMap, 'metadata.annotations.config-revision');
    if (!revision) {
      throw new KubeError('Bad response from Kubernetes when fetching ' +
                          'ConfigMap' +
                          `(producer=${producer}, environment=${environment})`);
    }
    return revision;
  }

  // Ensure that the given producer and environment has a running Gateway
  // instance with the given configuration. If a Gateway instance does not
  // exist, this will create one. If one does exist, it will be update with the
  // given configuration.
  async setGatewayConfig(producer, environment, config, rev, create) {
    let client = await this.client();

    // Create a new config map. This will need to be cleaned up later. Watch
    // https://github.com/kubernetes/kubernetes/issues/22368 - will make pods
    // restart automatically when associated ConfigMap changes. In the mean
    // time, we have to do this manually.
    console.log('Creating ConfigMap');
    let configMapReq = templates.configMap(producer, environment, config, rev);
    await client.configMaps.create(configMapReq);

    // Create or update the Deployment
    let deploymentReq = templates.deployment(producer, environment,
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
  KubernetesWrapper,
  KubeError
};
