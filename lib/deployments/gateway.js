import Deployment from './base';

const GATEWAY_IMAGE = 'localhost:31000/gateway';
const GATEWAY_VERSION = '0.0.2';

export default function load(_producer, env, project) {
  if (env === 'dev' || !project) {
    return [];
  }

  let deployments = [];
  for (const id of project.gateways.keys()) {
    deployments.push(new GatewayDeployment(project, id));
  }
  return deployments;
}

export class GatewayDeployment extends Deployment {
  constructor(project, id) {
    super();

    const gatewayJson = project.gateways.get(id).data;

    this.id = id;
    this.dnsPrefix = gatewayJson.dnsPrefix;

    let privateEndpoints = {};
    let pipelines = [];

    for (const pipeline of (gatewayJson.pipelines || [])) {
      const priEps = project.findConnectedByTarget(pipeline.id, 'privateEP');
      for (const ep of priEps) {
        privateEndpoints[ep.name] = {url: ep.url};
      }

      const pubEps = project.findConnectedBySource(pipeline.id, 'publicEP');
      const publicEndpoints = pubEps.map(ep => { return {path: ep.path}; });

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

    this.gatewayConfig = {
      bindHost: '0.0.0.0',
      privateEndpoints,
      pipelines
    };
  }

  getConfigFiles() {
    return {
      'gateway.conf': JSON.stringify(this.gatewayConfig, null, '  ')
    };
  };

  getContainerSpec() {
    return [{
      name: 'gateway',
      image: `${GATEWAY_IMAGE}:${GATEWAY_VERSION}`,
      ports: [{
        name: 'gateway',
        containerPort: 8080
      }],
      volumeMounts: [{
        mountPath: '/etc/lunchbadger',
        name: 'config'
      }]
    }];
  }

  getServicePorts() {
    return [{
      port: 80,
      targetPort: 'gateway',
      protocol: 'TCP'
    }];
  }

  getPartialLocator() {
    return {
      instance: this.id,
      app: 'gateway'
    };
  }

  getIngressRules(_domain) {
    // TODO
  }
}
