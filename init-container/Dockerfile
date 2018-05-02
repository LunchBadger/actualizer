FROM alpine
# using mirror for packages. main repo is not always available
# TODO: rm if main become stable
RUN echo http://dl-5.alpinelinux.org/alpine/v3.7/main > /etc/apk/repositories; \
    echo http://dl-5.alpinelinux.org/alpine/v3.7/community >> /etc/apk/repositories

RUN apk update && apk add openssh && apk add curl && apk add git

CMD echo Staritng init container; \
    echo git url: $GIT_HOST;  \
    echo git-api: $GIT_API_HOST; \ 
    echo username: $USERNAME; \
    echo system key type: $GIT_KEY_TYPE; \
    CUSTOMER_NAMESPACE=${CUSTOMER_NAMESPACE:-customer} \
    echo namespace: $CUSTOMER_NAMESPACE; \
    echo "clear ~/.ssh"; \
    rm -rf ~/.ssh/* ; \
    echo "generate known_host record"; \
    ssh-keyscan -t rsa -H $GIT_HOST >> ~/.ssh/known_hosts;  \
    [ -s ~/.ssh/known_hosts ] || (echo "known_hosts was not generated. It means service is not ready or network issue" && exit 1) ;\ 
    echo "id_rsa generation" ; \
    ssh-keygen -f ~/.ssh/id_rsa -t rsa -N ""; \
    echo "register system key url"  ; \
    curl -X POST http://$GIT_API_HOST/users/customer/$USERNAME/ssh -v -d '{"type":"'"$GIT_KEY_TYPE"'","publicKey":"'"$(cat ~/.ssh/id_rsa.pub)"'"}'  -H "Content-type: application/json"; \
    exit $? 
# check curl error code and exit using it (>0 if curl had non 2xx code returned)


# $GIT_HOST - gitea url 
# $GIT_API_HOST git-api host
# $USERNAME - username
# $GIT_KEY_TYPE - workspace or sls-api; used to dustinguish system ssh keys from user's