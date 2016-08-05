'use strict';

let debug = require('debug')('actualizer:kube');
let KubeClient = require('cisco-kube-client');
let _ = require('lodash');

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

const KUBE_RESOURCES = {
  ConfigMap: {
    apiVersion: 'v1',
    clientProp: 'configMaps'
  },
  Deployment: {
    apiVersion: 'extensions/v1beta1',
    clientProp: 'deployments'
  },
  Ingress: {
    apiVersion: 'extensions/v1beta1',
    clientProp: 'ingresses'
  },
  Service: {
    apiVersion: 'v1',
    clientProp: 'services'
  }
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
        console.log(err);
        throw new CommsError(`No or bad reply from server: ${err}`);
      } else if (err.name === 'SyntaxError') {
        throw new CommsError('Could not parse response from server');
      }
      throw err;
    }
  }

  async _getObject(type, locator, annotations) {
    let result = await this._withClient((client) => {
      return client[type].get({labels: locator});
    });
    if (result.items === undefined) {
      throw new CommsError(`Received malformed object of type "${type}"`);
    }

    let items = result.items.filter(item => {
      return _.isMatch(item.metadata.annotations, annotations);
    });
    if (items.length < 1) {
      return null;
    } else if (items.length > 1) {
      throw new ConsistencyError(`Too many "${type}" found (${locator})` +
                                 items);
    }
    return items[0];
  }

  _ensureObject(kind, locator, annotations, req) {
    let clientProp = KUBE_RESOURCES[kind].clientProp;
    return this._withClient(async (client) => {
      let obj = await this._getObject(clientProp, locator, annotations);
      if (obj) {
        obj = Object.assign({
          kind: kind,
          apiVersion: KUBE_RESOURCES[kind].apiVersion
        }, obj);

        if (!_.isMatch(obj, req)) {
          debug(`Updating ${kind}`);
          await client[clientProp].update(req.metadata.name, req);
        }
      } else {
        debug(`Creating ${kind}`);
        await client[clientProp].create(req);
      }
    });
  }

  ensureConfigMap(locator, rev, req) {
    let annotations = {
      'config-revision': rev
    };
    return this._ensureObject('ConfigMap', locator, annotations, req);
  }

  ensureDeployment(locator, req) {
    return this._ensureObject('Deployment', locator, {}, req);
  }

  // Ensure that the given app instance is running with the given
  // configuration. If an app instance does not exist, this will create one. If
  // one does exist, it will be updated with the given configuration.
  async upsertDeployment(locator, deploymentConfig, rev) {
    const configMapData = deploymentConfig.getConfigMapJson();
    const configMapReq = configMapJson(locator, rev, configMapData);
    const deploymentReq = deploymentConfig.getDeploymentJson(
      locator, configMapReq.metadata.name);

    await this.ensureConfigMap(locator, rev, configMapReq);
    await this.ensureDeployment(locator, deploymentReq);
  }
}

function configMapJson(locator, rev, gatewayConf) {
  const name = `gateway-${locator.producer}-${locator.environment}-` +
               `${locator.instance}-${rev.substr(0, 10)}`;

  return {
    kind: 'ConfigMap',
    apiVersion: KUBE_RESOURCES.ConfigMap.apiVersion,
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
  Deployer,
  configMapJson
};
