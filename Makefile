# names
IMAGE_NAME=transcendence
CONTAINER_NAME=transcendence
PORT=8443
ROOT_DIR=/goinfre/$(USER)/transcendence

CERT_PATH=./certs/
CERT_PATH_FILES=$(addprefix $(CERT_PATH), /ca.pem /server.key /server.crt )

# Build image docker
build : $(CERT_PATH_FILES) .env
	docker build -t $(IMAGE_NAME) .

# Run run container
run:
	docker run -d --name $(CONTAINER_NAME) -p $(PORT):8443 $(IMAGE_NAME)

#build l'image and run
all: build run

stop:
	docker stop $(CONTAINER_NAME) || true

# delete container
rm:
	docker rm $(CONTAINER_NAME) || true

# Stop + rm
clean: stop rm

# Clean + rebuild
rebuild: clean build run

# create auto-signed SSL certificates
$(CERT_PATH_FILES) :
	./Makefile.utils/createcerts.sh "$(CERT_PATH)"

# create .env
.env :
	>.env echo "JWT_SECRET=$$(</dev/urandom tr -dc _A-Za-z0-9 | head -c30)"

# display container logs
logs:
	docker logs -f $(CONTAINER_NAME)

# Oopen shell in container
shell:
	docker exec -it $(CONTAINER_NAME) sh
compile:
	npx tsc -p tsconfig.front.json
	npx tsc -p tsconfig.back.json

sqlite:
	docker exec -it $(CONTAINER_NAME) sqlite3 -cmd ".headers on" -cmd ".mode column" /app/data/database.sqlite
