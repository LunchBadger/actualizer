# Actualizer

The Actualizer is responsible for making sure that the intended configuration of what is deployed within LunchBadger is actually deployed within Kubernetes as its intended state.

The Actualizer works hand-in-hand with the Configstore by periodically checking for changes in the configuration metadata and deploying Kubernetes pods on behalf of all Users.

## Producers
Users of the LunchBadger system are referred to as Producers internally.

## Producer and Gitea User
All LunchBadger Producers have a corresponding Gitea user.  Gitea is used as the git based server that contains all the configuration metadata and the code repositories for each LunchBadger User.

The naming convention of the Gitea user is `customer-<producername>`

For example:
A LunchBadger User named `al` will have be the `al` producer registered within the Configstore  and have a corresponding Gitea user known as `customer-al`.

## User Repositories.
The User's project code is stored within git repositories hosted by Gitea.

In order to function properly each User must have 2 repositories within Gitea:
- `dev` - the LoopBack project with models and connectors
- `functions` - all Kubeless serverless functions

Important Note: The `dev` repo also contains the `lunchbadger.json` file which holds the User's current project and UI state.

# Actualizer Operational Flow
The Actualizer queries the Configstore for a list of all Producers.

Actualizer gets the array of Producers through the Configstore API endpoint for producers:
 - locally `http://localhost:3002/producers`
 - in the Kubernetes cluster as `http://configstore.default/producers`

When the Configstore receives this request.  It makes a service call via the `git-api` service to Gitea.  The `git-api` service is an API wrapper on top of Gitea's API that makes batch API calls to Gitea to streamline operations.

Gitea returns a list of Gitea users and their corresponding repositories.

## User Environment Initialization
If both repos are present the Actualizer creates 2 pods for each user:
- `workspace`
- `sls-api`

The `workspace` pod git clones the `dev` repo during iinitialization phase via an init container.

Once cloned, if repo is empty it is initialized with a starter [LoopBack 3][loopback-3] project

The `sls-api` pod clones the `functions` repo during initialization phase.

Once these pods are running, other pods like the Express Gateway(EG) pods can be created.

## Workspace Pod
Once `workspace` pod is running it exposes `Workspace API` based on the [LoopBack workspace API][loopback-workspace].
The Loopback workspace API is used to manipulate the LoopBack project's models and datasources.

The workspace pod also hosts the `LunchBadger Project API` that provide operations over `lunchbadger.json` file.

See the [lunchbadger api][lunchbadger-api].

One of the most important functions of the Project API is to provide information about User created Gateways

Please refer to the [deployments][deployments-folder]for exact logic and resources that get created.

## SLS-API Pod
The `sls-api` pod exposes an API wrapper around [Serverless framework][serverless-framework] that utilizes the Kubeless plugin to deploy serverless functions as pods.

TODO Note: Deploy operations are currently controlled by UI, which is not optimal. It needs to be refactored to put into the Actualizer or a Kubernetes CRD controller

For more information refer to the [serverless-api repo][sls-api-repo] for more details.

# Future Roadmap Items

## Multi Environment (Future)
In the current implementation every User is bound to a single environment - `dev`. The intention is to allow multiple environments like test, stage, prod etc. Those environments may have different deployment strategies, different env vars etc.

## Multi Project (Future)
As of now user can have only single project with code contained in the  `dev` and `functions` repos. Eventually this can be extended to allow users to have independent sets of models/functions/gateways under the same User account.

## Multi User (Future)
By default external calls to Workspace/Project/SLS APIs originating from another User utilizing their own identity is not possible.

To enable full collaboration, security needs to be defined in a way to check if User A can access projects of User B.

Gitea level access and collaboration is possible through a series of manual steps. If a user is manually added as a collaborator on the repository, the user can push changes via git as well.
Initial work based on gitea permission has been done. Please refer to [graphql repo][graphql-repo] for more information.

The LunchBadger Canvas supports colloboration and multiple Users, but each action performed through API calls is executed as the owner of the project.

## Scaling (Future)
Actualizer in current architecture is very limited and can handle <100 users.
Future refactoring may split this code base as CRD controllers for resources like LB.Function, LB.Gateway, LB.Workspace etc.

# Other Notes

## Auto Gateway (PoC)
The auto gateway feature enables an automated configuration and deployment of Express Gateway based on the models defined on the Canvas.

All public models are automatically connected to Autogenerated gateway. Access to this gateway is protected by key-auth.
Future efforts required to bring that part to production level.

## Disabling Producers
When you want to disable a LunchBadger user, the following procedure can be done.

To disable a useer:
- kubectl proxy to the Gitea pod
- load the Gitea UI interface
- sign in and goto site administration
- find the Gitea user that represents the Producer - `customer-<user>`
- find the user's `dev` repo
- locate the configuration metadata file - `lunchbadger.json`
- add `"\disabled\": true` anywhere within the JSON string
- workspace and gateway pods should be removed by the actualizer
- other Kubernetes artifacts will need to be removed related to functions: deployments (and pods), services, and ingress

# Actualizer pod environment variables
```yaml
      - env:
        - name: AUTOGATEWAY_ENABLE #to disable remove this variable
          value: "true"
        - name: DEBUG_GATEWAY_VERSION
          value: latest
        - name: GATEWAY_IMAGE
          value: expressgateway/express-gateway
        - name: GIT_API_URL
          value: http://git-api.default
        - name: REDIS_PASSWORD # All EG instances will be connected to in cluster redis database with this pass
          value: your_redis_password
        - name: DEBUG
          value: actualizer:*
        - name: CONFIGSTORE_URL
          value: http://configstore.default
        - name: LBWS_VERSION # workspace docker image version
          value: 0.2.6
        - name: LBSLS_VERSION # sls-api docker image version
          value: 0.2.0
        - name: GATEWAY_VERSION # EG docker image version
          value: latest
        - name: SLEEP_TIME # time to wait until next cycle of world refresh
          value: "6000"
        - name: WORKSPACE_API_URL_TEMPLATE  # url to access Workspace pod
          value: http://workspace-$PRODUCER-$ENV.customer:81/api
        - name: CUSTOMER_DOMAIN # Domain where all customer will have their APIs exposed
          value: staging.lunchbadger.io
        - name: ADMIN_CROSS_ORIGIN
        - name: LBSLS_DEBUG_VERSION # allows running special version of SLS for DEBUG_USERS
          value: 2.1.1
        - name: LB_DEBUG_USERS # List of users/producers that will have special version of SLS\Workspace deployed
          value: sk,zu,ko
        - name: LBWS_DEBUG_VERSION
          value: 0.2.9
        - name: SLS_API_URL_TEMPLATE # url to access sls-api
          value: http://sls-api-$PRODUCER-$ENV.customer
```
[loopback-3]: https://loopback.io/doc/en/lb3/
[graphql-repo]: https://github.com/LunchBadger/graphql-api
[loopback-workspace]: https://github.com/strongloop/loopback-workspace
[lunchbadger-api]: https://github.com/LunchBadger/lunchbadger
[deployments-folder]: https://github.com/strongloop/loopback-workspace
[serverless-framework]: https://github.com/serverless/serverless
[serverless-api]: https://github.com/LunchBadger/serverless-api
