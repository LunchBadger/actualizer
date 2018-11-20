FROM alpine
# using mirror for packages. main repo is not always available
# TODO: rm if main become stable
RUN echo http://dl-5.alpinelinux.org/alpine/v3.7/main > /etc/apk/repositories; \
    echo http://dl-5.alpinelinux.org/alpine/v3.7/community >> /etc/apk/repositories

RUN apk update && apk add openssh && apk add curl && apk add git

# // TODO move env var to LB_ space to avoid conflict with $USERNAME 

# run in fail on error mode set -e
CMD set -e; \  
    echo Starting init container; \
    echo git url: $GIT_HOST;  \
    echo git-api: $GIT_API_HOST; \
    echo username: $USERNAME; \
    echo system key type: $GIT_KEY_TYPE; \
    CUSTOMER_NAMESPACE=${CUSTOMER_NAMESPACE:-customer} \
    echo namespace: $CUSTOMER_NAMESPACE; \
    echo git repo url:  $GIT_REPO_URL; \
    echo "clear ~/.ssh"; \
    rm -rf ~/.ssh/* ; \
    echo "generate known_host record"; \
    ssh-keyscan -t rsa -H $GIT_HOST >> ~/.ssh/known_hosts;  \
    [ -s ~/.ssh/known_hosts ] || (echo "known_hosts was not generated. It typically means gitea k8s service is not ready (like DNS cache issue or not created yet) or network partitioning" && exit 1) ;\ 
    echo "id_rsa generation" ; \
    ssh-keygen -f ~/.ssh/id_rsa -t rsa -N ""; \
    echo register system key url:  http://$GIT_API_HOST/users/$CUSTOMER_NAMESPACE/$USERNAME/ssh  ; \
    curl -X POST http://$GIT_API_HOST/users/$CUSTOMER_NAMESPACE/$USERNAME/ssh -v -d '{"type":"'"$GIT_KEY_TYPE"'","publicKey":"'"$(cat ~/.ssh/id_rsa.pub)"'"}'  -H "Content-type: application/json" --fail; \
    echo "registering key done" ;\
    mkdir -p /usr/src/app/workspace; \
    rm -rf /usr/src/app/workspace/* ;\
    git clone --verbose $GIT_REPO_URL /usr/src/app/workspace; \
    ls -a /usr/src/app/workspace; \
    echo "git clone completed"
# $GIT_HOST - gitea url 
# $GIT_API_HOST git-api host
# $USERNAME - username
# $GIT_KEY_TYPE - workspace or sls-api; used to dustinguish system ssh keys from user's
# $GIT_REPO_URL - url to git clone from
# $CUSTOMER_NAMESPACE - namespace to use, defaults to customer