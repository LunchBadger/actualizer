/* eslint-disable max-len */
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
const assert = chai.assert;

const nock = require('nock');
const {Deployer, configMapJson} = require('../lib/kube');

describe('Kubernetes client', function () {
  let client = new Deployer({
    customerDomain: 'lunchbadger.io'
  });

  afterEach(function () {
    nock.cleanAll();
  });

  describe('upsertDeployment()', function () {
    let fakeDeployment = {
      getDeploymentJson: function (locator, configMapName) {
        return {
          apiVersion: 'extensions/v1beta1',
          kind: 'Deployment',
          metadata: {
            name: 'fake-deployment',
            namespace: 'customer',
            labels: locator
          },
          spec: {
            replicas: 1,
            template: {
              spec: {
                containers: [{
                  name: 'FakeApp',
                  image: 'fake-image:latest',
                  ports: [{containerPort: 3000}]
                }]
              }
            }
          },
          volumes: [{
            name: 'config',
            configMap: {name: configMapName}
          }]
        };
      },
      getConfigFiles: function () {
        return {
          'cofig.json': 'new configuration'
        };
      },
      getServicePorts: function () {
        return [];
      },
      getContainerSpec: function () {
        return {};
      },
      getVHost: function () {
        return 'fake-deployment.customer.lunchbadger.com';
      }
    };

    it('for new deployments, creates a new ConfigMap and Deployment',
      async function () {
        nock('http://localhost:8001')
          .get('/api/v1/namespaces/customer/configmaps')
          .query(true)
          .reply(200, {
            kind: 'ConfigMapList',
            apiVersion: 'v1',
            items: []
          });
        nock('http://localhost:8001')
          .get('/apis/extensions/v1beta1/namespaces/customer/deployments')
          .query(true)
          .reply(200, {
            kind: 'DeploymentList',
            apiVersion: 'extensions/v1beta1',
            items: []
          });

        let createConfigApi = nock('http://localhost:8001')
          .post('/api/v1/namespaces/customer/configmaps')
          .reply(200, {});
        let createDeploymentApi = nock('http://localhost:8001')
          .post('/apis/extensions/v1beta1/namespaces/customer/deployments')
          .reply(200, {});

        await client.upsertDeployment({
          app: 'gateway',
          producer: 'foo',
          environment: 'bar'
        }, fakeDeployment, 'rev0', true);

        assert(createConfigApi.isDone());
        assert(createDeploymentApi.isDone());
      });

    it('for existing deployments, creates a new ConfigMap ' +
       'and updates the Deployment', async function () {
      let locator = {
        app: 'gateway',
        producer: 'foo',
        environment: 'bar',
        instance: '2ead01e2-b690-4a33-9c70-c56e6c365924'
      };

      nock('http://localhost:8001')
        .get('/api/v1/namespaces/customer/configmaps')
        .query(true)
        .reply(200, {
          kind: 'ConfigMapList',
          apiVersion: 'v1',
          items: [configMapJson(locator, '123',
                                fakeDeployment.getDeploymentJson())]
        });
      nock('http://localhost:8001')
        .get('/apis/extensions/v1beta1/namespaces/customer/deployments')
        .query(true)
        .reply(200, {
          kind: 'DeploymentList',
          apiVersion: 'extensions/v1beta1',
          items: [fakeDeployment.getDeploymentJson()]
        });

      let createConfigApi = nock('http://localhost:8001')
        .post('/api/v1/namespaces/customer/configmaps')
        .reply(200, {});
      let updateDeploymentApi = nock('http://localhost:8001')
        .put('/apis/extensions/v1beta1/namespaces/customer/deployments/' +
             'gateway-foo-bar-2ead01e2-b690-4a33-9c70-c56e6c365924')
        .reply(200, {});

      await client.upsertDeployment(locator, fakeDeployment, 'rev0', false);

      assert.isTrue(createConfigApi.isDone(), 'ConfigMap not created');
      assert.isTrue(updateDeploymentApi.isDone(), 'Deployment not updated');
    });
  });
});
