# Actualizer

Core component of LunchBadger platform

It periodically checks configstore service and workspace pods to recreate pods for each user.

## Users (Producers)
Part 1 is to get list of users that needs to be recreated in the k8s cluster. 

Actualizer refers those users as Producers

## List of users
Every gitea user that begins with `customer-` is considered as LunchBadger producer.

*customer-test* will become *test* producer.

Actualizer gets the array of users by requesting configstore service 
locally `http://localhost:3002/producers` or in cluster as `http://configstore.default/producers` 


Configstore via git-api service makes call to gitea to get list of users and their repo.

## User repos.
In order to function properly each user must have 2 repos: `dev` and `functions`

the `dev` repo is used to store loopback project and lunchbadger.json file that represents state of environment. 
the `functions` repo is to store code for kubeless functions.

## Environment for user
If both repos are present actualizer creates 2 pods: `workspace` and `sls-api` for each user.

`workspace` pod during init phase via init container does `git clone dev` repo. 
Once cloned, if repo is empty it is initialized with default loopback 3 project 

`sls-api` pod during init phase does `git clone functions` repo

Once those pods are running EG (Express-Gateway) pods can be created. See below. 

## Workspace pod API.
Once `workspace` pod is running it exposes `Workspace API` based on this project `https://github.com/strongloop/loopback-workspace`
Also it has `Project API` that provide operations over lunchbadger.json file 
See https://github.com/LunchBadger/lunchbadger for details. 

The most important role of Project API is to provide information about user created Gateways
Workspace API is used to retrieve Information about Loopback models

Actualizer uses that data to create and configure Express-Gateway pods. 

Please refer to https://github.com/LunchBadger/actualizer/tree/master/lib/deployments for exact logic and resources that get created.

## sls-api pod
This pod exposes an API wrapper around https://github.com/serverless/serverless framework with kubeless plugin. 
It allows Create/Modify/Deploy etc. operations over kubeless functions

TODO: Deploy operations are currently controlled by UI, which is not correct. It needs to be refactored to put into actualizer or in some k8s CRD controller

refer to https://github.com/LunchBadger/serverless-api for more details.

# Environment (Future)
In current implementation every user is working in single environment - `dev`. The intention is to allow multiple env like test/prod etc. Those environments may have different deployment strategies, different env vars etc. 

# Multi project (Future)
As of now user can have only single project with code contained in dev+functions repos. Eventually this can be extended to allow users to have independent sets of models/functions/gateways under the same user account.

# Multi User (Future)
By default external calls to Workspace/Project/SLS APIs of another user are not limited. 
To enable collaboration protection need's to be defined in a way to check if UserA can access projects of UserB
Initial work based on gitea permission has been done. Please refer to https://github.com/LunchBadger/graphql-api 

# Scaling (Future)
Actualizer in current architecture is very limited and can handle <100 users. 
Future refactoring may split this code base as CRD controllers for resources like LB.Function, LB.Gateway, LB.Workspace etc.



