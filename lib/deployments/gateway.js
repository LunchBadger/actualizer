'use strict';

const Deployment = require('./base');

const GATEWAY_IMAGE = 'localhost:31000/gateway';
const GATEWAY_VERSION = '0.0.2';

class GatewayDeployment extends Deployment {
  constructor(project, id) {
    super();
    this.id = id;

    const gatewayJson = project.gateways.get(id).data;

    let privateEndpoints = {};
    let pipelines = [];

    for (const pipeline of (gatewayJson.pipelines || [])) {
      const priEps = project.findConnectedByTarget(pipeline.id, 'privateEP');
      for (const ep of priEps) {
        privateEndpoints[ep.name] = {url: ep.url};
      }

      const pubEps = project.findConnectedBySource(pipeline.id, 'publicEP');
      const publicEndpoints = pubEps.map(ep => { return {path: ep.url}; });

      let processors = [];
      for (const policy of pipeline.policies) {
        switch (policy.type) {
          case 'throttle':
            break;
          case 'proxy':
            break;
        }
      }

      // TODO: this is a placeholder until we are able to properly edit proxy
      // policy in UI
      if (priEps.length > 0) {
        processors.push({
          condition: ['always'],
          action: 'proxy',
          params: {
            privateEndpoint: priEps[0].name
          }
        });
      }

      pipelines.push({
        publicEndpoints,
        processors
      });
    }

    let gatewayConfig = {
      privateEndpoints,
      pipelines
    };

    this.getConfigMapJson = () => gatewayConfig;
  }

  getDeploymentJson(locator, configMapName) {
    let name = [
      locator.app,
      locator.producer,
      locator.environment,
      locator.instance
    ].join('-');

    return {
      apiVersion: 'extensions/v1beta1',
      kind: 'Deployment',
      metadata: {
        name: name,
        labels: locator,
        namespace: 'customer',
      },
      spec: {
        replicas: 1,
        template: {
          metadata: {
            labels: locator
          },
          spec: {
            containers: [{
              name: locator.app,
              image: `${GATEWAY_IMAGE}:${GATEWAY_VERSION}`,
              ports: [{containerPort: 3000}],
              volumeMounts: [{
                mountPath: '/etc/lunchbadger',
                name: 'config'
              }]
            }],
            volumes: [{
              name: 'config',
              configMap: {name: configMapName}
            }]
          }
        }
      }
    };
  }

  getPartialLocator() {
    return {
      instance: this.id,
      app: 'gateway'
    };
  }
}

module.exports = GatewayDeployment;
