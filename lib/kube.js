'use strict';

let base32 = require('base32');
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

class KubeCommsError extends CommsError {
  constructor(message) {
    super('Kubernetes', message);
  }
}

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
        throw new KubeCommsError(`no or bad reply from server. ${err.message}`);
      } else if (err.name === 'SyntaxError') {
        throw new KubeCommsError('could not parse response from server. ' +
                                 err.message);
      }
      throw err;
    }
  }

  async _getObjects(type, locator, annotations = {}) {
    let result = await this._withClient((client) => {
      return client[type].get({labels: locator});
    });
    if (result.items === undefined) {
      throw new KubeCommsError(`received malformed object of type "${type}"`);
    }

    return result.items.filter(item => {
      return _.isMatch(item.metadata.annotations, annotations);
    });
  }

  async _getObject(type, locator, annotations) {
    let items = await this._getObjects(type, locator, annotations);

    if (items.length < 1) {
      return null;
    } else if (items.length > 1) {
      throw new ConsistencyError(locator.producer, locator.env,
                                 `too many "${type}" found (${locator})` +
                                 items);
    }
    return items[0];
  }

  async _ensureObject(kind, locator, annotations, req) {
    let clientProp = KUBE_RESOURCES[kind].clientProp;
    return await this._withClient(async (client) => {
      let obj = await this._getObject(clientProp, locator, annotations);
      if (obj) {
        obj = Object.assign({
          kind: kind,
          apiVersion: KUBE_RESOURCES[kind].apiVersion
        }, obj);

        if (!_.isMatch(obj, req)) {
          debug(`Updating ${kind} "${req.metadata.name}"`);
          req.metadata.resourceVersion = obj.metadata.resourceVersion;
          await client[clientProp].update(req.metadata.name, req);
        }
      } else {
        debug(`Creating ${kind} "${req.metadata.name}"`);
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

  ensureService(locator, req) {
    return this._ensureObject('Service', locator, {}, req);
  }

  ensureIngress(locator, req) {
    return this._ensureObject('Ingress', locator, {}, req);
  }

  // Ensure that the given app instance is running with the given
  // configuration. If an app instance does not exist, this will create one. If
  // one does exist, it will be updated with the given configuration.
  async upsertDeployment(locator, deploymentConfig, rev) {
    const configFiles = deploymentConfig.getConfigFiles();
    const configMapReq = configMapJson(locator, rev, configFiles);

    const containers = deploymentConfig.getContainerSpec();
    const deploymentReq = deploymentJson(locator, containers,
                                         configMapReq.metadata.name);

    await this.ensureConfigMap(locator, rev, configMapReq);
    await this.ensureDeployment(locator, deploymentReq);

    const ports = deploymentConfig.getServicePorts();
    if (Array.isArray(ports) && ports.length > 0) {
      const serviceReq = serviceJson(locator, ports);
      const ingressReqs = ingressJson(locator, ports);

      await this.ensureService(locator, serviceReq);
      for (const ingressReq of ingressReqs) {
        await this.ensureIngress(locator, ingressReq,
          {port: ingressReq.metadata.annotations.port});
      }
    }
  }

  async updateEnvironment(producer, env, deployments, wantedRev) {
    const envLocator = {
      producer: producer,
      environment: env,
    };

    let partialLocators = [];

    // First, create and update necessary deployments
    for (const deployment of deployments) {
      const partialLoc = deployment.getPartialLocator();
      partialLocators.push(partialLoc);

      let locator = Object.assign({}, envLocator, partialLoc);

      await this.upsertDeployment(locator, deployment, wantedRev);
    }

    // Now, remove existing unnecessary deployments
    await this.cleanUp(envLocator, partialLocators);
  }

  async _cleanUpObjects(kind, envLocator, partialLocators) {
    const clientProp = KUBE_RESOURCES[kind].clientProp;
    const objs = await this._getObjects(clientProp, envLocator);
    for (const obj of objs) {
      const shouldKeep = partialLocators.some(loc => {
        return _.isMatch(obj.metadata.labels, loc);
      });

      if (!shouldKeep) {
        debug(`Deleting ${kind} "${obj.metadata.name}"`);
        await this._withClient(client => {
          return client[clientProp].delete(obj.metadata.name);
        });
      }
    }
  }

  async cleanUp(envLocator, partialLocators) {
    await this._cleanUpObjects('ConfigMap', envLocator, partialLocators);
    await this._cleanUpObjects('Deployment', envLocator, partialLocators);
    await this._cleanUpObjects('Service', envLocator, partialLocators);
    await this._cleanUpObjects('Ingress', envLocator, partialLocators);
  }
}

function configMapJson(locator, rev, configFiles) {
  const name = [
    locator.app,
    locator.producer,
    locator.environment,
    locator.instance,
    rev.substr(0, 10)
  ].join('-');

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
    data: configFiles
  };
}

function deploymentJson(locator, containers, configMapName) {
  let name = [
    locator.app,
    locator.producer,
    locator.environment,
    locator.instance
  ].join('-');

  return {
    apiVersion: KUBE_RESOURCES.Deployment.apiVersion,
    kind: 'Deployment',
    metadata: {
      name: name,
      labels: locator,
      namespace: 'customer',
    },
    spec: {
      replicas: 1,
      revisionHistoryLimit: 1,
      template: {
        metadata: {
          labels: locator
        },
        spec: {
          containers: containers,
          volumes: [{
            name: 'config',
            configMap: {name: configMapName}
          }]
        }
      }
    }
  };
}

function serviceJson(locator, ports) {
  // Assume instance ID is a UUID. We have to do this in order to shorten
  // the service name down to 24 characters. This is the maximum until the
  // following change is released: This is really bad and probably
  // significantly increases chances of collisions.
  // https://github.com/kubernetes/kubernetes/pull/29523
  //
  // Must start with a letter (not a number), must be all lower-case letters
  // and numbers, must not be longer than 24 characters
  const name = 's' + locator.instance.replace(/-/g, '').substr(0, 23);

  return {
    apiVersion: KUBE_RESOURCES.Service.apiVersion,
    kind: 'Service',
    metadata: {
      name: name,
      labels: locator
    },
    spec: {
      ports: ports,
      selector: locator
    }
  };
}

function ingressJson(locator, ports) {
  const nameNoDash = locator.instance.replace(/-/g, '');
  // Matching the service name, see note above
  const name = nameNoDash.substr(0, 24);
  const serviceName = 's' + name.substr(0, 23);
  const dns = base32.encode(Buffer.from(nameNoDash, 'hex'));

  return ports.map(portSpec => {
    return {
      apiVersion: 'extensions/v1beta1',
      kind: 'Ingress',
      metadata: {
        name: `${name}-${portSpec.port}`,
        labels: locator,
        annotations: {
          port: portSpec.port.toString()
        }
      },
      spec: {
        rules: [{
          host: `${dns}-${portSpec.port}.customer.lunchbadger.com`,
          http: {
            paths: [{
              backend: {
                serviceName: serviceName,
                servicePort: portSpec.port
              }
            }]
          }
        }]
      }
    };
  });
}

module.exports = {
  Deployer,
  configMapJson
};
