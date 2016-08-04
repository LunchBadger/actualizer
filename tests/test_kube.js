/* eslint-disable max-len */
'use strict';

let chai = require('chai');
let chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
let assert = chai.assert;
let nock = require('nock');

let CommsError = require('../lib/errors').CommsError;
let ConsistencyError = require('../lib/errors').ConsistencyError;
let Deployer = require('../lib/kube').Deployer;

describe('Kubernetes client', function() {
  let client = new Deployer();

  afterEach(function() {
    nock.cleanAll();
  });

  describe('updateDeployment()', function() {
    let fakeDeployment = {
      getDeploymentJson: function() {
        return {
          apiVersion: 'extensions/v1beta1',
          kind: 'Deployment',
          metadata: {
            name: 'fake-deployment',
            namespace: 'customer'
          },
          spec: {
            replicas: 1,
            template: {
              spec: {
                containers: [{
                  name: 'FakeApp',
                  image: 'fake-image:latest',
                  ports: [{containerPort: 3000}]
                }],
              }
            }
          }
        };
      },
      getConfigMapJson: function() {
        return 'new configuration';
      }
    };

    it('for new deployments, creates a new ConfigMap and Deployment',
      async function() {
        let createConfigApi = nock('http://localhost:8001')
          .post('/api/v1/namespaces/customer/configmaps')
          .reply(200, {});
        let createDeploymentApi = nock('http://localhost:8001')
          .post('/apis/extensions/v1beta1/namespaces/customer/deployments')
          .reply(200, {});

        await client.updateDeployment({
          app: 'gateway',
          producer: 'foo',
          environment: 'bar'
        }, fakeDeployment, 'rev0', true);

        assert(createConfigApi.isDone());
        assert(createDeploymentApi.isDone());
      });

    it('for existing deployments, creates a new ConfigMap ' +
       'and updates a Deployment',
      async function() {
        let createConfigApi = nock('http://localhost:8001')
          .post('/api/v1/namespaces/customer/configmaps')
          .reply(200, {});
        let updateDeploymentApi = nock('http://localhost:8001')
          .put('/apis/extensions/v1beta1/namespaces/customer/deployments/' +
               'fake-deployment')
          .reply(200, {});

        await client.updateDeployment({
          app: 'gateway',
          producer: 'foo',
          environment: 'bar'
        }, fakeDeployment, 'rev0', false);

        assert(createConfigApi.isDone());
        assert(updateDeploymentApi.isDone());
      });
  });

  describe('getConfigRev()', function() {
    it('raises CommsError on malformed response from Kube', async function() {
      nock('http://localhost:8001')
        .get('/apis/extensions/v1beta1/namespaces/customer/deployments')
        .query(true)
        .reply(200, 'not even json');
      await assert.isRejected(client.getConfigRev({
        app: 'gateway',
        producer: 'foo',
        environment: 'bar'
      }), CommsError);

      nock.cleanAll();

      nock('http://localhost:8001')
        .get('/apis/extensions/v1beta1/namespaces/customer/deployments')
        .query(true)
        .reply(200, '{"bad": "response"}');
      await assert.isRejected(client.getConfigRev({
        app: 'gateway',
        producer: 'foo',
        environment: 'bar'
      }), CommsError);
    });

    it('raises CommsError if Kube cannot be reached', async function() {
      // No nock here
      await assert.isRejected(client.getConfigRev({
        app: 'gateway',
        producer: 'foo',
        environment: 'bar'
      }), CommsError);
    });

    it('raises ConsistencyError on too many matching deployments',
      async function() {
        nock('http://localhost:8001')
          .get('/apis/extensions/v1beta1/namespaces/customer/deployments')
          .query(true)
          .reply(200, `
            {
              "kind": "DeploymentList",
              "apiVersion": "extensions/v1beta1",
              "metadata": {
                "selfLink": "/apis/extensions/v1beta1/namespaces/customer/deployments",
                "resourceVersion": "123"
              },
              "items": [{
                "metadata": {},
                "spec": {},
                "strategy": {}
              }, {
                "metadata": {},
                "spec": {},
                "strategy": {}
              }]
            }`);
        await assert.isRejected(client.getConfigRev({
          app: 'gateway',
          producer: 'foo',
          environment: 'bar'
        }), ConsistencyError);
      });

    it('raises ConsistencyError if Deployment has no ConfigMap',
      async function() {
        nock('http://localhost:8001')
          .get('/apis/extensions/v1beta1/namespaces/customer/deployments')
          .query(true)
          .reply(200, `
            {
              "kind": "DeploymentList",
              "apiVersion": "extensions/v1beta1",
              "metadata": {
                "selfLink": "/apis/extensions/v1beta1/namespaces/customer/deployments",
                "resourceVersion": "123"
              },
              "items": [{
                "metadata": {
                  "labels": {
                    "app": "gateway",
                    "producer": "foo",
                    "environment": "bar"
                  }
                },
                "spec": {
                  "template": {
                    "spec": {
                      "volumes": [],
                      "containers": []
                    }
                  }
                },
                "strategy": {}
              }]
            }`);
        await assert.isRejected(client.getConfigRev({
          app: 'gateway',
          producer: 'foo',
          environment: 'bar'
        }), ConsistencyError);
      });

    it('raises ConsistencyError if ConfigMap does not exist', async function() {
      nock('http://localhost:8001')
        .get('/apis/extensions/v1beta1/namespaces/customer/deployments')
        .query(true)
        .reply(200, `
          {
            "kind": "DeploymentList",
            "apiVersion": "extensions/v1beta1",
            "metadata": {
              "selfLink": "/apis/extensions/v1beta1/namespaces/customer/deployments",
              "resourceVersion": "123"
            },
            "items": [{
              "metadata": {
                "labels": {
                  "app": "gateway",
                  "producer": "foo",
                  "environment": "bar"
                }
              },
              "spec": {
                "template": {
                  "spec": {
                    "volumes": [{
                      "name": "config",
                      "configMap": {
                        "name": "test-config-map"
                      }
                    }],
                    "containers": []
                  }
                }
              },
              "strategy": {}
            }]
          }`);
      nock('http://localhost:8001')
        .get('/api/v1/namespaces/customer/configmaps/test-config-map')
        .query(true)
        .reply(404, 'Not Found');

      await assert.isRejected(client.getConfigRev({
        app: 'gateway',
        producer: 'foo',
        environment: 'bar'
      }), ConsistencyError);
    });
  });
});
