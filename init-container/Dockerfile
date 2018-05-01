FROM alpine
RUN echo http://dl-5.alpinelinux.org/alpine/v3.7/main > /etc/apk/repositories; \
    echo http://dl-5.alpinelinux.org/alpine/v3.7/community >> /etc/apk/repositories

RUN apk update && apk add openssh && apk add curl && apk add git
# clear ~/.ssh
# generate known_host record 
# check if it was generated, if not exit with error. It means service is not ready or network issue
# id_rsa generation
# check if it was generated. (will fail if wolume not mounted etc.)
# register system key
# check curl error code and exit using it (>0 if curl had non 2xx code returned)
CMD rm -rf ~/.ssh/* && \
    ssh-keyscan -t rsa -H $GIT_HOST >> ~/.ssh/known_hosts \
    [ -s ~/.ssh/known_hosts ] || exit 1 \ 
    && cat ~/.ssh/known_hosts && ssh-keygen -f ~/.ssh/id_rsa -t rsa -N ""; \
    [ -s ~/.ssh/id_rsa ] || exit 1 \
    curl -X POST http://$GIT_API_HOST/users/customer/$PRODUCER/ssh -d '{"type":"$GIT_KEY_TYPE","publicKey":"'"$(cat ~/.ssh/id_rsa.pub)"'"}'  -H "Content-type: application/json"; \
    exit $? \
# $GIT_HOST - gitea url 
# $GIT_API_HOST git-api host
# $PRODUCER - username
# $GIT_KEY_TYPE - workspace or sls-api; used to dustinguish system ssh keys from user's