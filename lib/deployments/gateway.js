const Deployment = require('./base');
const slug = require('slug');

slug.defaults.mode = 'rfc3986';

const GATEWAY_IMAGE = process.env.GATEWAY_IMAGE || '410240865662.dkr.ecr.us-west-2.amazonaws.com/expressgateway/express-gateway';
const GATEWAY_VERSION = process.env.GATEWAY_VERSION || 'metrics';
const ADMIN_CROSS_ORIGIN = process.env.ADMIN_CROSS_ORIGIN || '*';

module.exports = function load (producer, env, project, models, _, domain) {
  if (!project) return [];

  const deployments = [];
  for (const id of Object.keys(project.gateways)) {
    deployments.push(new GatewayDeployment(project, models, id, producer, env, domain));
  }

  return deployments;
};

class GatewayDeployment extends Deployment {
  constructor (project, models, id, producer, env, domain) {
    super();

    const gatewayJson = project.gateways[id].data;

    this.id = id;
    this.dnsPrefix = gatewayJson.dnsPrefix;
    this.producer = producer;
    this.env = env;
    this.name = gatewayJson.name;
    this.slug = `${slug(this.name)}-${this.producer}-${this.env}`;
    this.gatewayConfig = gatewayJson;
    this.adminHost = `admin-${this.slug}.${domain}`;
    this.models = Object.create(null);

    if (models && models.length) {
      models.forEach(model => {
        if (model.lunchbadgerId !== undefined) {
          this.models[model.lunchbadgerId] = model;
        }
      });
    }

    const apiEndpointKeys = Object.keys(project.apiEndpoints || {});
    this.gatewayConfig.apiEndpoints = {};

    apiEndpointKeys.forEach(key => {
      // eslint-disable-next-line
      let { id, name, host, paths } = project.apiEndpoints[key].data;
      if (host === '*') {
        host = `${this.slug}.${domain}`;
      }
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

    const modelKeys = Object.keys(this.models);
    modelKeys.forEach(id => {
      if (!this.gatewayConfig.serviceEndpoints.hasOwnProperty(id)) {
        this.gatewayConfig.serviceEndpoints[id] =
        {
          friendlyName: this.models[id].name,
          url: `http://workspace-${this.producer}-${this.env}.customer:3000`
        };
      }
    });

    if (!this.gatewayConfig.pipelines) {
      this.gatewayConfig.pipelines = Object.create(null);
    }

    if (Array.isArray(this.gatewayConfig.pipelines)) {
      // Convert array of pipelines to pipeline object.
      const pipelines = Object.create(null);

      this.gatewayConfig.pipelines.forEach(pipeline => {
        const id = pipeline.id;
        delete pipeline.id;

        pipeline.friendlyName = pipeline.name;
        delete pipeline.name;

        pipelines[id] = pipeline;
      });

      this.gatewayConfig.pipelines = pipelines;
    }

    const pipelineIDs = Object.keys(this.gatewayConfig.pipelines);
    pipelineIDs.forEach(id => {
      const pipeline = this.gatewayConfig.pipelines[id];
      const bySource = project.connections.bySource[id];

      if (bySource) {
        const apiEndpoints = bySource.map(connection => {
          return connection.to.data.id;
        });
        pipeline.apiEndpoints = apiEndpoints;
      }

      pipeline.policies = pipeline.policies || [];
      pipeline.policies.unshift({
        cAdvisor: [
          {
            condition: {
              name: 'always'
            },
            action: {}
          }
        ]
      });

      pipeline.policies = pipeline.policies.map(policy => {
        delete policy.id;

        const keys = Object.keys(policy);

        keys.forEach(key => {
          const pairs = policy[key] || [];
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

    this.gatewayConfig.policies.push('cAdvisor');

    delete this.gatewayConfig.dnsPrefix;
    delete this.gatewayConfig.itemOrder;

    this.gatewayConfig.http = {
      host: '*',
      port: 8080
    };

    this.gatewayConfig.admin = {
      hostname: '0.0.0.0',
      port: 9876
    };

    this.gatewayConfig.apiEndpoints['admin'] = {
      host: this.adminHost
    };

    this.gatewayConfig.serviceEndpoints['admin'] = {
      url: 'http://localhost:9876'
    };
    this.gatewayConfig.pipelines['admin'] = {
      apiEndpoints: [
        'admin'
      ],
      policies: [
        {
          cors: [
            {
              action: {
                credentials: true,
                origin: ADMIN_CROSS_ORIGIN
              }
            }
          ]
        },
        {
          proxy: [
            {
              action: {
                changeOrigin: true,
                serviceEndpoint: 'admin'
              }
            }
          ]
        }
      ]
    };
  }
  getInitContainersSpec () {
    return null;
  }

  getConfigFiles () {
    const redis = process.env.REDIS_EMULATE ? {emulate: true} : {
      host: process.env.REDIS_HOST || 'eg-identity-redis.default',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD
    };

    redis.namespace = `EG-${this.producer}-${this.env}-`;
    return {
      'gateway.config.yml': JSON.stringify(this.gatewayConfig, null, '  '),
      'system.config.yml': JSON.stringify({
        db: {
          redis
        },
        plugins: {
          cAdvisor: {
            package: '/usr/src/app/plg/index.js'
          }
        },
        crypto: {
          cipherKey: 'sensitiveKey',
          algorithm: 'aes256',
          saltRounds: 10
        },
        session: {
          secret: 'keyboard cat',
          resave: false,
          saveUninitialized: false
        },
        accessTokens: {
          timeToExpiry: 7200000
        },
        refreshTokens: {
          timeToExpiry: 7200000
        },
        authorizationCodes: {
          timeToExpiry: 7200000
        }
      }, null, 2)
    };
  };

  getVolumes (configMap) {
    return [{
      name: 'config',
      configMap: {name: configMap.metadata.name}
    }];
  }

  getContainerSpec () {
    return [{
      name: 'gateway',
      image: `${GATEWAY_IMAGE}:${GATEWAY_VERSION}`,
      imagePullPolicy: 'Always',
      readinessProbe: {
        tcpSocket: {
          port: 8080
        },
        initialDelaySeconds: 5,
        timeoutSeconds: 1,
        periodSeconds: 2,
        successThreshold: 2,
        failureThreshold: 3
      },
      env: [
        {
          name: 'LB_PRODUCER',
          value: this.producer
        },
        {
          name: 'EG_CONFIG_DIR',
          value: '/usr/src/app/lib/config'
        },
        {
          name: 'LOG_LEVEL',
          value: 'debug'
        }
      ],
      ports: [
        {
          name: 'gateway',
          containerPort: 8080
        },
        {
          name: 'admin',
          containerPort: 9876
        }
      ],
      volumeMounts: [{
        name: 'config',
        mountPath: '/usr/src/app/lib/config/system.config.yml',
        subPath: 'system.config.yml'
      }, {
        name: 'config',
        mountPath: '/usr/src/app/lib/config/gateway.config.yml',
        subPath: 'gateway.config.yml'
      }]
    }];
  }

  getServicePorts () {
    return [{
      name: 'gateway',
      port: 8080,
      targetPort: 8080,
      protocol: 'TCP'
    },
    {
      name: 'admin',
      port: 9876,
      targetPort: 9876,
      protocol: 'TCP'
    }];
  }

  getPartialLocator () {
    return {
      producer: this.producer,
      environment: this.env,
      instance: slug(this.name),
      app: 'gateway'
    };
  }

  getIngressRules (serviceName, domain) {
    return [{
      host: `${this.slug}.${domain}`,
      http: {
        paths: [{
          backend: {
            serviceName: serviceName,
            servicePort: 8080
          }
        }]
      }
    }, {
      host: `admin-${this.slug}.${domain}`,
      http: {
        paths: [{
          backend: {
            serviceName: serviceName,
            servicePort: 8080
          }
        }]
      }
    }];
  }

  getAnnotations () {
    return {
      'prometheus.io/scrape': 'true',
      'prometheus.io/port': '9876'
    };
  }
}
