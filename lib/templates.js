'use strict';

const GATEWAY_IMAGE = 'localhost:31000/gateway';
const GATEWAY_VERSION = '0.0.1';

module.exports.deployment = function(producer, environment, configMapName) {
  let labels = {
    app: 'gateway',
    producer,
    environment
  };
  let name = `gateway-${producer}-${environment}`;

  return {
    apiVersion: 'extensions/v1beta1',
    kind: 'Deployment',
    metadata: {
      name: name,
      labels: labels
    },
    spec: {
      replicas: 1,
      template: {
        metadata: {
          labels: labels
        },
        spec: {
          containers: [{
            name: 'gateway',
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

module.exports.configMap = function(producer, environment, gatewayConf, rev) {
  let labels = {
    app: 'gateway',
    producer,
    environment
  };
  let name = `gateway-${producer}-${environment}-${rev.substr(0, 10)}`;

  return {
    kind: 'ConfigMap',
    apiVersion: 'v1',
    metadata: {
      labels: labels,
      namespace: 'default',
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
