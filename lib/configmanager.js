'use strict';

class Project {
  constructor(projectJSON) {
    this._json = projectJSON;

    this.id = projectJSON.id;
    this.name = projectJSON.name;

    this.entities = new Map();
    this.connections = {
      bySource: new Map(),
      byTarget: new Map()
    };

    this.publicEndpoints = new Map();
    this.privateEndpoints = new Map();
    this.gateways = new Map();
    this.pipelines = new Map();
    this.apis = new Map();
    this.models = new Map();
    this.dataSources = new Map();

    this._loadEntities(projectJSON);
    this._loadConnections(projectJSON);
  }

  _loadEntities(projectJSON) {
    const load = (output, collection, type, fn, extra = {}) => {
      collection.forEach(item => {
        const obj = Object.assign({type, data: item}, extra);
        this.entities.set(item.id, obj);
        output.set(item.id, obj);
        if (fn) {
          fn(item);
        }
      });
      return output;
    };

    load(this.privateEndpoints, projectJSON.privateEndpoints, 'privateEP');
    load(this.publicEndpoints, projectJSON.publicEndpoints, 'publicEP');
    load(this.apis, projectJSON.apis, 'api', api => {
      load(this.publicEndpoints, api.publicEndpoints, 'publicEP', null, {api});
    });
    load(this.dataSources, projectJSON.dataSources, 'dataSource');
    load(this.gateways, projectJSON.gateways, 'gateway', gateway => {
      load(this.pipelines, gateway.pipelines, 'pipeline', null, {gateway});
    });
    load(this.models, projectJSON.privateModels, 'model');
  }

  _loadConnections(projectJSON) {
    for (const conn of projectJSON.connections) {
      if (!this.entities.has(conn.fromId)) {
        console.warn('Cannot find', conn.fromId);
      }
      if (!this.entities.has(conn.toId)) {
        console.warn('Cannot find', conn.toId);
      }
      const connObj = {
        from: this.entities.get(conn.fromId),
        to: this.entities.get(conn.toId)
      };

      if (!this.connections.bySource.has(conn.fromId)) {
        this.connections.bySource.set(conn.fromId, []);
      }
      this.connections.bySource.get(conn.fromId).push(connObj);

      if (!this.connections.byTarget.has(conn.toId)) {
        this.connections.byTarget.set(conn.toId, []);
      }
      this.connections.byTarget.get(conn.toId).push(connObj);
    }
  }

  _parse() {
    let deployments = [];
    for (const id of this.gateways.keys()) {
      deployments.push(GatewayDeployment.fromProject(this, id));
    }
    // TODO: instantiate other deployments here
    return deployments;
  }

  findConnectedByTarget(targetId, type) {
    return this.connections.byTarget
      .get(targetId)
      .filter(conn => conn.from.type === type)
      .map(conn => conn.from.data);
  }

  findConnectedBySource(sourceId, type) {
    return this.connections.bySource
      .get(sourceId)
      .filter(conn => conn.to.type === type)
      .map(conn => conn.to.data);
  }

  getDeployments() {
    // TODO: finis this
    return this._parse();
  }
}

class Deployment {
  constructor(deploymentJSON, configMapJSON) {
    this.deploymentJSON = deploymentJSON;
    this.configMapJSON = configMapJSON;
  }
}

class GatewayDeployment extends Deployment {
  static fromProject(project, gatewayId) {
    const gatewayJson = project.gateways.get(gatewayId).data;

    // Private endpoints
    let privateEndpoints = {};
    for (const pipeline of gatewayJson.pipelines) {
      const eps = project.findConnectedByTarget(pipeline.id, 'privateEP');
      for (const ep of eps) {
        privateEndpoints[ep.name] = {url: ep.url};
      }
    }

    // Pipelines
    let pipelines = [];
    for (const pipeline of gatewayJson.pipelines) {
      const eps = project.findConnectedBySource(pipeline.id, 'publicEP');
      const publicEndpoints = eps.map(ep => { return {path: ep.url}; });

      let policies = [];
      for (const policy of pipeline.policies) {
        switch (policy.type) {
          case 'throttle':
            break;
          case 'proxy':
            break;
        }
      }

      pipelines.push({
        publicEndpoints,
        policies
      });
    }

    let gatewayConfig = {
      privateEndpoints,
      pipelines
    };

    console.log(JSON.stringify(gatewayConfig, null, '  '));
    return new this('', gatewayConfig);
  }
}

module.exports = Project;

// if (require.main === module) {
//   const fs = require('fs');
//   const projectJSON = JSON.parse(
//     fs.readFileSync('../../lunchbadger/lunchbadger/project.json'));

//   const project = new Project(projectJSON);
//   project.getDeployments();
// }
