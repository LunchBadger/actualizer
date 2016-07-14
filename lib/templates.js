'use strict';

const GATEWAY_IMAGE = 'localhost:31000/gateway';
const GATEWAY_VERSION = '0.0.1';

module.exports.deployment = function(locator, configMapName) {
  let name = `${locator.app}-${locator.producer}-${locator.environment}`;

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
};

module.exports.configMap = function(locator, gatewayConf, rev) {
  let name = `gateway-${locator.producer}-${locator.environment}-` +
             `${rev.substr(0, 10)}`;

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
};

module.exports.gatewayConfig = function(number) {
  return {
    bindPort: 3000,
    bindHost: '0.0.0.0',
    rootPath: 'http://gateway.root',
    change: number,
    pipelines: [
      {
        policies: [],
        proxies: [{
          privateEndpoint: 'http://www.example.com',
          contextPath: '/'
        }]
      }
    ]
  };
};
