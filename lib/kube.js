const debug = require('debug')('actualizer:kube');

const _ = require('lodash');
const KubeClient = require('cisco-kube-client');

const { ConsistencyError, CommsError } = require('./errors');
const ENABLE_ROLLING_UPDATE = process.env.ENABLE_ROLLING_UPDATE || false;
debug('Rolling Update ENABLED ', ENABLE_ROLLING_UPDATE);
const PULL_SECRET = process.env.LB_PULL_SECRET;
const SLS_SERVICE_ACCOUNT_NAME = process.env.SLS_SERVICE_ACCOUNT_NAME || 'sls-api';
const KUBE_SETTINGS = {
  protocol: 'http',
  host: process.env.KUBE_HOST || 'localhost',
  port: process.env.KUBE_PORT || 8001,
  version: 'v1',
  beta: true,
  namespace: process.env.ACTUALIZER_TARGET_NAMESPACE || 'customer',
  logLevel: process.env.KUBE_CLIENT_LOG_LEVEL
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
  constructor (message) {
    super('Kubernetes', message);
  }
}

class Deployer {
  constructor (config) {
    this.kubeSettings = KUBE_SETTINGS;
    this.config = config;
    this._client = undefined;
  }

  async _withClient (fn) {
    if (!this._client) {
      this._client = await KubeClient(this.kubeSettings);

      // Have to define these two additional endpoints because they are not
      // part of the cisco-kube-client for some reason.
      this._client.createEndpoint('ingresses', {
        kind: 'Ingress',
        options: {
          version: 'extensions/v1beta1'
        }
      });
      this._client.createEndpoint('configMaps', {
        kind: 'ConfigMap'
      });
    }
    try {
      return await fn(this._client);
    } catch (err) {
      debug(err);
      if (err.statusCode || err.errno) {
        debug(err.statusCode + err.statusCode === 409);
        if (err.statusCode === 409) {
          debug('Check if k8s master servers are in sync');
        } else {
          throw new KubeCommsError('no or bad reply from server. ' +
          `status=${err.statusCode}/errno=${err.errno}; message=${JSON.stringify(err)}`);
        }
      } else if (err.name === 'SyntaxError') {
        throw new KubeCommsError('could not parse response from server. ' +
          err.message);
      } else {
        throw err;
      }
    }
  }

  async _getObjects (type, locator, annotations = {}) {
    const result = await this._withClient((client) => {
      return client[type].get({ labels: locator });
    });
    if (result.items === undefined) {
      throw new KubeCommsError(`received malformed object of type "${type}"`);
    }

    return result.items.filter(item => {
      return _.isMatch(item.metadata.annotations, annotations);
    });
  }

  async _getObject (type, locator, annotations) {
    const items = await this._getObjects(type, locator, annotations);

    if (items.length < 1) {
      return null;
    } else if (items.length > 1) {
      throw new ConsistencyError(locator.producer, locator.env,
        `too many "${type}" found (${locator})` +
        items);
    }
    return items[0];
  }

  async _ensureObject (kind, locator, annotations, req) {
    const clientProp = KUBE_RESOURCES[kind].clientProp;
    return this._withClient(async (client) => {
      let obj = await this._getObject(clientProp, locator, annotations);

      if (obj) {
        obj = Object.assign({
          kind: kind,
          apiVersion: KUBE_RESOURCES[kind].apiVersion
        }, obj);

        if (!_.isMatch(obj, req)) {
          debug(`Updating ${kind} "${req.metadata.name}"`);
          // debug(`Objects don't match:\nOriginal:\n${JSON.stringify(obj, null, 2)}\nNew:${JSON.stringify(req, null, 2)}`);
          req.metadata.resourceVersion = obj.metadata.resourceVersion;
          await client[clientProp].update(req.metadata.name, req);
        }
      } else {
        try {
          debug(`Creating ${kind} "${req.metadata.name}"`);
          await client[clientProp].create(req);
        } catch (err) {
          debug(`Failed to create ${kind}`, err);
        }
      }
    });
  }

  async checkWorkspace ({ producer, env }) {
    // app: workspace environment: dev producer: demo

    const locator = {
      app: 'workspace',
      producer,
      environment: env
    };
    const pods = await this._getObjects('pods', locator);
    // if there is any pod running with all statuses True workspace is ok
    return pods.some(pod => {
      return pod.status.phase === 'Running';
    });
  }

  async listRunningProducers ({env}) {
    const pods = await this._getObjects('pods', {environment: env});
    return [...new Set(pods.map(p => p.metadata.labels.producer))]; // unique producers
  }

  ensureConfigMap (locator, rev, req) {
    const annotations = {
      'config-revision': rev
    };
    return this._ensureObject('ConfigMap', locator, annotations, req);
  }
  ensureDeployment (locator, req) {
    debug(JSON.stringify(req));

    return this._ensureObject('Deployment', locator, {}, req);
  }

  ensureService (locator, req) {
    return this._ensureObject('Service', locator, {}, req);
  }

  ensureIngress (locator, req) {
    return this._ensureObject('Ingress', locator, {}, req);
  }

  // Ensure that the given app instance is running with the given
  // configuration. If an app instance does not exist, this will create one. If
  // one does exist, it will be updated with the given configuration.
  async upsertDeployment (locator, deploymentConfig, rev) {
    const configFiles = deploymentConfig.getConfigFiles();
    const configMapReq = configMapJson(locator, rev, configFiles);

    const containers = deploymentConfig.getContainerSpec();
    const volumes = deploymentConfig.getVolumes(configMapReq);
    const initContainers = deploymentConfig.getInitContainersSpec();
    const deploymentReq = deploymentJson(locator, containers, volumes, rev, initContainers);

    if (configMapReq) {
      await this.ensureConfigMap(locator, rev, configMapReq);
    }
    await this.ensureDeployment(locator, deploymentReq);

    const annotations = deploymentConfig.getAnnotations();
    const ports = deploymentConfig.getServicePorts();
    const ingressRules = deploymentConfig.getIngressRules(
      locatorToName(locator), this.config.customerDomain);

    if (Array.isArray(ports) && ports.length > 0) {
      const serviceReq = serviceJson(locator, ports, annotations);
      const ingressReq = ingressJson(locator, ingressRules);

      await this.ensureService(locator, serviceReq);
      await this.ensureIngress(locator, ingressReq);
    }
  }

  async updateEnvironment (producer, env, deployments, wantedRev) {
    const envLocator = {
      producer: producer,
      environment: env
    };

    const partialLocators = [];

    // First, create and update necessary deployments
    for (const deployment of deployments) {
      const partialLoc = deployment.getPartialLocator();
      partialLocators.push(partialLoc);

      const locator = Object.assign({}, envLocator, partialLoc);

      await this.upsertDeployment(locator, deployment, wantedRev);
    }

    // Now, remove existing unnecessary deployments
    await this.cleanUp(envLocator, partialLocators);
  }

  async _cleanUpObjects (kind, envLocator, partialLocators) {
    const clientProp = KUBE_RESOURCES[kind].clientProp;
    const objs = await this._getObjects(clientProp, envLocator);
    for (const obj of objs) {
      const shouldKeep = partialLocators.some(loc => {
        return _.isMatch(obj.metadata.labels, loc);
      });

      if (!shouldKeep) {
        debug(`Deleting ${kind} "${obj.metadata.name}"`);
        await this._withClient(client => {
          const opts = {
            body: { propagationPolicy: 'Foreground' }
          };
          return client[clientProp].delete(obj.metadata.name, opts);
        });
      }
    }
  }

  async cleanUp (envLocator, partialLocators) {
    await this._cleanUpObjects('ConfigMap', envLocator, partialLocators);
    await this._cleanUpObjects('Deployment', envLocator, partialLocators);
    await this._cleanUpObjects('Service', envLocator, partialLocators);
    await this._cleanUpObjects('Ingress', envLocator, partialLocators);
  }
}

function configMapJson (locator, rev, configFiles) {
  if (Object.keys(configFiles).length === 0) {
    return null;
  }

  const name = locatorToName(locator) + '-' + rev.substr(0, 10);

  return {
    kind: 'ConfigMap',
    apiVersion: KUBE_RESOURCES.ConfigMap.apiVersion,
    metadata: {
      labels: locator,
      namespace: KUBE_SETTINGS.namespace,
      name: name,
      annotations: {
        'config-revision': rev
      }
    },
    data: configFiles
  };
}

function deploymentJson (locator, containers, volumes, rev, initContainers) {
  const name = locatorToName(locator);
  const labels = Object.assign({}, locator);
  if (ENABLE_ROLLING_UPDATE) {
    labels.rev = rev;
  }
  const deployment = {
    apiVersion: KUBE_RESOURCES.Deployment.apiVersion,
    kind: 'Deployment',
    metadata: {
      name: name,
      labels: locator,
      namespace: KUBE_SETTINGS.namespace
    },
    spec: {
      replicas: 1,
      minReadySeconds: 60,
      strategy: {
        rollingUpdate: {
          maxSurge: 2,
          maxUnavailable: 0, // for now we have only one RS so having 1 can make deployment 100% unavailable
          revisionHistoryLimit: 2
        }
      },

      selector: {
        matchLabels: locator
      },

      template: {
        metadata: {
          labels
        },
        spec: {
          serviceAccountName: name.indexOf('sls') >= 0 ? SLS_SERVICE_ACCOUNT_NAME : 'default',
          containers: containers,
          initContainers,
          volumes: volumes
        }
      }
    }
  };
  if (PULL_SECRET) {
    deployment.spec.template.spec.imagePullSecrets = [
      {
        name: PULL_SECRET
      }
    ];
  }

  return deployment;
}

function serviceJson (locator, ports, annotations) {
  const name = locatorToName(locator);

  const ret = {
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

  if (annotations) {
    ret.metadata.annotations = annotations;
  }

  return ret;
}

function ingressJson (locator, rules) {
  const name = locatorToName(locator);

  return {
    apiVersion: 'extensions/v1beta1',
    kind: 'Ingress',
    metadata: {
      name: `${name}`,
      labels: locator,
      annotations: {
        'kubernetes.io/ingress.class': 'traefik',
        'traefik.frontend.rule.type': 'PathPrefixStrip'
      }
    },
    spec: {
      rules: rules
    }
  };
}

function locatorToName (locator) {
  let name = [
    locator.app,
    locator.producer,
    locator.environment
  ].join('-');

  if (locator.instance) {
    name = name + '-' + locator.instance;
  }

  return name;
}

module.exports = {
  Deployer,
  configMapJson
};
