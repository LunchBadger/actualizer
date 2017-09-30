const hasOwnProperty = Object.prototype.hasOwnProperty;

export default class ProjectConfig {
  constructor(producer, env, projectJson) {
    this._producer = producer;
    this._env = env;

    // TODO: validate projectJson format here
    this._json = projectJson;

    this.id = projectJson.id;
    this.name = projectJson.name;

    this.entities = Object.create(null);
    this.connections = {
      bySource: Object.create(null),
      byTarget: Object.create(null)
    };

    this.apiEndpoints = Object.create(null);
    this.serviceEndpoints = Object.create(null);
    this.gateways = Object.create(null);
    this.pipelines = Object.create(null);
    this.apis = Object.create(null);
    this.models = Object.create(null);
    this.dataSources = Object.create(null);

    projectJson = JSON.parse(projectJson.models.Project[`${this._producer}-${this._env}`]);

    this._loadEntities(projectJson);
    this._loadConnections(projectJson);
  }

  _loadEntities(projectJson) {
    const load = (output, collection, type, fn, extra = {}) => {
      (collection || []).forEach(item => {
        const obj = Object.assign({type, data: item}, extra);
        this.entities[item.id] = obj;
        output[item.id] = obj;
        if (fn) {
          fn(item);
        }
      });
      return output;
    };

    load(this.serviceEndpoints, projectJson.serviceEndpoints, 'serviceEndpoint');
    load(this.apiEndpoints, projectJson.apiEndpoints, 'apiEndpoint');
    load(this.apis, projectJson.apis, 'api', api => {
      load(this.apiEndpoints, api.apiEndpoints, 'apiEndpoint', null, {api});
    });
    load(this.dataSources, projectJson.dataSources, 'dataSource');
    load(this.gateways, projectJson.gateways, 'gateway', gateway => {
      load(this.pipelines, gateway.pipelines, 'pipeline', null, {gateway});
    });
    load(this.models, projectJson.privateModels, 'model');
  }

  _loadConnections(projectJson) {
    (projectJson.connections || []).forEach(conn => {
      if (!hasOwnProperty.call(this.entities, conn.fromId)) {
        //console.warn('Cannot find', conn.fromId);
      }
      if (!hasOwnProperty.call(this.entities, conn.toId)) {
        //console.warn('Cannot find', conn.toId);
      }
      const connObj = {
        fromId: conn.fromId,
        from: this.entities[conn.fromId],
        toId: conn.toId,
        to: this.entities[conn.toId]
      };

      if (!hasOwnProperty.call(this.connections.bySource, conn.fromId)) {
        this.connections.bySource[conn.fromId] = [];
      }
      this.connections.bySource[conn.fromId].push(connObj);

      if (!hasOwnProperty.call(this.connections.byTarget, conn.toId)) {
        this.connections.byTarget[conn.toId] = [];
      }
      this.connections.byTarget[conn.toId].push(connObj);
    });
  }

  findConnectedByTarget(targetId, type) {
    return (this.connections.byTarget[targetId] || [])
      .filter(conn => conn.from.type === type)
      .map(conn => conn.from.data);
  }

  findConnectedBySource(sourceId, type) {
    return (this.connections.bySource[sourceId] || [])
      .filter(conn => conn.to.type === type)
      .map(conn => conn.to.data);
  }
}

// if (require.main === module) {
//   const fs = require('fs');
//   const projectJson = JSON.parse(
//     fs.readFileSync('../../lunchbadger/lunchbadger/project.json'));

//   const project = new Project(projectJson);
//   project.getDeployments();
// }
