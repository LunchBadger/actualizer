const Deployment = require('./base');

// eslint-disable-next-line max-len
const LBWS_IMAGE = 'lunchbadger/workspace';
const GIT_INIT_IMAGE = 'lunchbadger/git-init';
const GIT_INIT_VERSION = process.env.GIT_INIT_VERSION || 'latest';
const LBWS_VERSION = process.env.LBWS_VERSION || 'latest';
const LBWS_DEBUG_VERSION = process.env.LBWS_DEBUG_VERSION || LBWS_VERSION;
const CUSTOMER_NAMESPACE = process.env.CUSTOMER_NAMESPACE || 'customer';
const GIT_API_HOST = process.env.GIT_API_HOST || 'git-api.default';
const GIT_REPO_HOST = process.env.GIT_REPO_HOST || 'git.gitea';
const usersInDebugMode = process.env.LB_DEBUG_USERS ? process.env.LB_DEBUG_USERS.split(',') : [];
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
    }, {
      name: 'workspace-volume',
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
        value: GIT_REPO_HOST
      }, {
        name: 'GIT_API_HOST',
        value: GIT_API_HOST
      }, {
        name: 'USERNAME',
        value: this.producer
      }, {
        name: 'GIT_KEY_TYPE',
        value: 'workspace'
      }, {
        name: 'CUSTOMER_NAMESPACE',
        value: CUSTOMER_NAMESPACE
      }, {
        name: 'GIT_REPO_URL',
        value: `git@${GIT_REPO_HOST}:customer-${this.producer}/dev.git`
      }],
      volumeMounts: [
        {
          mountPath: '/root/.ssh',
          name: 'ssh-volume'
        }, {
          mountPath: '/usr/src/app/workspace',
          name: 'workspace-volume'
        }
      ]
    }];
  }

  getContainerSpec () {
    const volumeMounts = [{
      name: 'ssh-volume',
      readOnly: true,
      mountPath: '/root/.ssh'
    }, {
      mountPath: '/usr/src/app/workspace',
      name: 'workspace-volume'
    }];

    if (process.env.TRITON_OBJECT_STORE_ENABLED === 'true') {
      volumeMounts.push({
        name: 'triton-ssh-volume',
        readOnly: true,
        mountPath: '/root/.triton_ssh'
      });
    }

    const wsVersion = usersInDebugMode.indexOf(this.producer) === -1 ? LBWS_VERSION : LBWS_DEBUG_VERSION;
    return [{
      name: 'lunchbadger-workspace',
      image: `${LBWS_IMAGE}:${wsVersion}`,
      imagePullPolicy: 'Always',
      readinessProbe: {
        httpGet: {
          path: '/',
          port: 4231,
          scheme: 'HTTP'
        },
        initialDelaySeconds: 15,
        timeoutSeconds: 10,
        periodSeconds: 10,
        successThreshold: 2,
        failureThreshold: 3
      },
      env: [{
        name: 'GIT_URL',
        value: `git@${GIT_REPO_HOST}:customer-${this.producer}/dev.git`
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
        }, {
          path: '/explorer',
          backend: {
            serviceName: serviceName,
            servicePort: 3000
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
