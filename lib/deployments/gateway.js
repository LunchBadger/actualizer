import Deployment from './base';

const GATEWAY_IMAGE = 'localhost:31000/gateway';
const GATEWAY_VERSION = '0.0.2';

export default function load(_producer, env, project) {
  /*if (env === 'dev' || !project) {
    return [];
  }*/

  if (!project) return [];

  //console.log(JSON.stringify(project.apiEndpoints, null, 2));
  //console.log(JSON.stringify(project.pipelines, null, 2));
  //console.log(JSON.stringify(project.serviceEndpoints, null, 2));
  //console.log(project.connections);
  let deployments = [];
  for (const id of Object.keys(project.gateways)) {
    deployments.push(new GatewayDeployment(project, id));
  }
  return deployments;
}

export class GatewayDeployment extends Deployment {
  constructor(project, id) {
    //console.log('in loader:', id);
    super();

    const gatewayJson = project.gateways[id].data;

    this.id = id;
    this.dnsPrefix = gatewayJson.dnsPrefix;

    this.gatewayConfig = gatewayJson;

    const apiEndpointKeys = Object.keys(project.apiEndpoints || {});
    this.gatewayConfig.apiEndpoints = {};

    apiEndpointKeys.forEach(key => {
      const { id, name, host, paths } = project.apiEndpoints[key].data;
      const obj = Object.assign({}, { host, paths });
      obj.friendlyName = name;

      this.gatewayConfig.apiEndpoints[id] = obj;
    });

    const serviceEndpointKeys = Object.keys(project.serviceEndpoints || {});
    this.gatewayConfig.serviceEndpoints = {};
    serviceEndpointKeys.forEach(key => {
      const { id, name, urls } = project.serviceEndpoints[key].data;

      const obj = Object.assign({}, { urls });
      obj.friendlyName = name;

      if (obj.urls.length === 1) {
        obj.url = obj.urls[0];
        delete obj.urls;
      }

      this.gatewayConfig.serviceEndpoints[id] = obj;
    });

    this.gatewayConfig.pipelines.forEach(pipeline => {
      pipeline.friendlyName = pipeline.name;
      pipeline.name = pipeline.id;
      delete pipeline.id;

      const byTarget = project.connections.byTarget[pipeline.name];
      const bySource = project.connections.bySource[pipeline.name];

      const proxyTo = byTarget[0].from.data.id;

      const apiEndpoints = bySource.map(connection => {
        return connection.to.data.id;
      });
      pipeline.apiEndpoints = apiEndpoints;

      pipeline.policies = pipeline.policies || [];
      const proxyPolicy = pipeline.policies.filter(policy => {
        return !!policy.proxy;
      });

      if (proxyPolicy.length > 0) {
        proxyPolicy[0].proxy[0].action.serviceEndpoint = proxyTo;
      } else {
        pipeline.policies.push({
          proxy: {
            action: {
              serviceEndpoint: proxyTo,
              changeOrigin: true
            }
          }
        });
      }

      pipeline.policies = pipeline.policies.map(policy => {
        delete policy.id;

        const keys = Object.keys(policy);

        keys.forEach(key => {
          const pairs = policy[key];
          pairs.forEach(pair => {
            if (pair.condition && Object.keys(pair.condition).length === 0) {
              delete pair.condition;
            }
          });
        });

        return policy;
      });
    });


    // FIXME: C'mon now...
    this.gatewayConfig.policies = this.gatewayConfig.policies.map(policy => {
      if (policy === 'rate-limiter') return 'rate-limit';
      if (policy === 'simple-logger') return 'log';
      return policy;
    });

    delete this.gatewayConfig.dnsPrefix;
    delete this.gatewayConfig.itemOrder;

    this.gatewayConfig.http = { host: '*', port: 3000 };
    this.gatewayConfig.admin = { port: 3001 };
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
      ports: [
        {
          name: 'gateway',
          containerPort: 3000
        },
        {
          name: 'admin',
          containerPort: 3001
        }
      ],
      volumeMounts: [{
        mountPath: '/etc/lunchbadger',
        name: 'config'
      }]
    }];
  }

  getServicePorts() {
    return [{
      name: 'gateway',
      port: 80,
      targetPort: 'gateway',
      protocol: 'TCP'
    },
    {
      name: 'admin',
      port: 8001,
      targetPort: 'admin',
      protocol: 'TCP'
    }];
  }

  getPartialLocator() {
    return {
      instance: this.id,
      app: 'gateway'
    };
  }

  getIngressRules(serviceName, domain) {
    return [{
      host: `gateway-${this.id}-${this.producer}-${this.env}.${domain}`,
      http: {
        paths: [{
          backend: {
            serviceName: serviceName,
            servicePort: 80
          }
        }]
      }
    }, {
      host: `admin-gateway-${this.id}-${this.producer}-${this.env}.${domain}`,
      http: {
        paths: [{
          backend: {
            serviceName: serviceName,
            servicePort: 8001
          }
        }]
      }
    }];
  }
}
