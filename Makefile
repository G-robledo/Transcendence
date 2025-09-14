# Nom de l'image et du conteneur
IMAGE_NAME=transcendence
CONTAINER_NAME=transcendence
PORT=8443
ROOT_DIR=/goinfre/$(USER)/transcendence

CERT_PATH=./certs/
CERT_PATH_FILES=$(addprefix $(CERT_PATH), /ca.pem /server.key /server.crt )

# Build l'image Docker
build : $(CERT_PATH_FILES) .env
	docker build -t $(IMAGE_NAME) .

# Run le conteneur
run:
	docker run -d --name $(CONTAINER_NAME) -p $(PORT):8443 $(IMAGE_NAME)

#build l'image et run le conteneur
all: build run

# Stop le conteneur
stop:
	docker stop $(CONTAINER_NAME) || true

# Supprime le conteneur
rm:
	docker rm $(CONTAINER_NAME) || true

# Stop + rm
clean: stop rm

# Clean + rebuild
rebuild: clean build run

# Crée le certificat SSL auto-signé
$(CERT_PATH_FILES) :
	./Makefile.utils/createcerts.sh "$(CERT_PATH)"

# Crée le fichier .env
.env :
	>.env echo "JWT_SECRET=$$(</dev/urandom tr -dc _A-Za-z0-9 | head -c30)"

# Affiche les logs du conteneur
logs:
	docker logs -f $(CONTAINER_NAME)

# Ouvre un shell dans le conteneur
shell:
	docker exec -it $(CONTAINER_NAME) sh
compile:
	npx tsc -p tsconfig.front.json
	npx tsc -p tsconfig.back.json

sqlite:
	docker exec -it $(CONTAINER_NAME) sqlite3 -cmd ".headers on" -cmd ".mode column" /app/data/database.sqlite
