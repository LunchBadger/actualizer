const Deployment = require('./base');

// eslint-disable-next-line max-len
const LBWS_IMAGE = '410240865662.dkr.ecr.us-west-2.amazonaws.com/lunchbadger-workspace';
const GIT_INIT_IMAGE = '410240865662.dkr.ecr.us-west-2.amazonaws.com/git-init';
const GIT_INIT_VERSION = process.env.GIT_INIT_VERSION || 'latest';
const LBWS_VERSION = process.env.LBWS_VERSION || 'latest';

module.exports = async function load (producer, env) {
  if (env !== 'dev') {
    return [];
  }

  return [new WorkspaceDeployment(producer, env)];
};

class WorkspaceDeployment extends Deployment {
  constructor (producer, env) {
    super();
    this.producer = producer;
    this.env = env;
  }

  getConfigFiles () {
    return {};
  }

  getServicePorts () {
    return [{
      port: 80,
      name: 'project-api',
      targetPort: 'project-api',
      protocol: 'TCP'
    }, {
      port: 81,
      name: 'workspace-api',
      targetPort: 'workspace-api',
      protocol: 'TCP'
    }, {
      port: 3000,
      name: 'workspace',
      targetPort: 'workspace',
      protocol: 'TCP'
    }];
  }

  getVolumes () {
    const volumes = [{
      name: 'ssh-volume',
      emptyDir: {}
    }];

    if (process.env.TRITON_OBJECT_STORE_ENABLED === 'true') {
      volumes.push({
        name: 'triton-ssh-volume',
        secret: {
          secretName: 'triton-keypair'
        }
      });
    }

    return volumes;
  }

  getInitContainersSpec () {
    return [{
      name: 'init-ws',
      image: `${GIT_INIT_IMAGE}:${GIT_INIT_VERSION}`,
      env: [{
        name: 'GIT_HOST',
        value: 'git.gitea'
      }, {
        name: 'GIT_API_HOST',
        value: 'git-api.default'
      }, {
        name: 'USERNAME',
        value: this.producer
      }, {
        name: 'GIT_KEY_TYPE',
        value: 'workspace'
      }],
      volumeMounts: [
        {
          mountPath: '/root/.ssh',
          name: 'ssh-volume'
        }
      ]
    }];
  }

  getContainerSpec () {
    const volumeMounts = [{
      name: 'ssh-volume',
      readOnly: true,
      mountPath: '/root/.ssh'
    }];

    if (process.env.TRITON_OBJECT_STORE_ENABLED === 'true') {
      volumeMounts.push({
        name: 'triton-ssh-volume',
        readOnly: true,
        mountPath: '/root/.triton_ssh'
      });
    }

    return [{
      name: 'lunchbadger-workspace',
      image: `${LBWS_IMAGE}:${LBWS_VERSION}`,
      imagePullPolicy: 'Always',
      readinessProbe: {
        httpGet: {
          path: '/',
          port: 4231,
          scheme: 'HTTP'
        },
        initialDelaySeconds: 15,
        timeoutSeconds: 1,
        periodSeconds: 3,
        successThreshold: 3,
        failureThreshold: 3
      },
      env: [{
        name: 'GIT_URL',
        value: `git@git.gitea:customer-${this.producer}/dev.git`
      }, {
        name: 'LB_ENV',
        value: this.env
      }, {
        name: 'LB_PRODUCER',
        value: this.producer
      }, {
        name: 'WATCH_URL',
        value: `http://configstore.default/change-stream/${this.producer}`
      }, {
        name: 'DEBUG',
        value: 'lunchbadger-workspace:*'
      }],
      ports: [{
        name: 'project-api',
        containerPort: 4230
      }, {
        name: 'workspace-api',
        containerPort: 4231
      }, {
        name: 'workspace',
        containerPort: 3000
      }],
      volumeMounts
    }];
  }

  getIngressRules (serviceName, domain) {
    return [{
      host: `${this.producer}-${this.env}.${domain}`,
      http: {
        paths: [{
          backend: {
            serviceName: serviceName,
            servicePort: 3000
          }
        }]
      }
    }, {
      host: `internal-${this.producer}-${this.env}.${domain}`,
      http: {
        paths: [{
          path: '/project-api',
          backend: {
            serviceName: serviceName,
            servicePort: 80
          }
        }, {
          path: '/workspace-api',
          backend: {
            serviceName: serviceName,
            servicePort: 81
          }
        }]
      }
    }];
  }

  getPartialLocator () {
    return {
      app: 'workspace'
    };
  }

  getAnnotations () {
    return null;
  }
};
