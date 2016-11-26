export default class ProjectConfig {
  constructor(projectJson) {
    // TODO: validate projectJson format here
    this._json = projectJson;

    this.id = projectJson.id;
    this.name = projectJson.name;

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

    this._loadEntities(projectJson);
    this._loadConnections(projectJson);
  }

  _loadEntities(projectJson) {
    const load = (output, collection, type, fn, extra = {}) => {
      (collection || []).forEach(item => {
        const obj = Object.assign({type, data: item}, extra);
        this.entities.set(item.id, obj);
        output.set(item.id, obj);
        if (fn) {
          fn(item);
        }
      });
      return output;
    };

    load(this.privateEndpoints, projectJson.privateEndpoints, 'privateEP');
    load(this.publicEndpoints, projectJson.publicEndpoints, 'publicEP');
    load(this.apis, projectJson.apis, 'api', api => {
      load(this.publicEndpoints, api.publicEndpoints, 'publicEP', null, {api});
    });
    load(this.dataSources, projectJson.dataSources, 'dataSource');
    load(this.gateways, projectJson.gateways, 'gateway', gateway => {
      load(this.pipelines, gateway.pipelines, 'pipeline', null, {gateway});
    });
    load(this.models, projectJson.privateModels, 'model');
  }

  _loadConnections(projectJson) {
    for (const conn of (projectJson.connections || [])) {
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

  findConnectedByTarget(targetId, type) {
    return (this.connections.byTarget.get(targetId) || [])
      .filter(conn => conn.from.type === type)
      .map(conn => conn.from.data);
  }

  findConnectedBySource(sourceId, type) {
    return (this.connections.bySource.get(sourceId) || [])
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
