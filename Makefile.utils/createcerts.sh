#!/bin/sh
set -e

CERT_PATH="$1"
DOMAIN=transcendance.fr

echoo(){
	if [ -t 1 ]; then
		echo "\e[30;47;1m$*\e[0m";
	else \
		echo "$*";
	fi;
}

echoo "Creating SSL certificate files..."
mkdir -p $CERT_PATH
cd $CERT_PATH

echoo " -> Creating CA..."
# Create local CA
TMP_CA_KEY=$(mktemp)
openssl genrsa -out $TMP_CA_KEY 2048
openssl req -x509 -new -nodes -key $TMP_CA_KEY -sha256 -days 1825 -out ca.pem

echoo " -> Creating certificate for $DOMAIN..."
# Create certificate for $DOMAIN
openssl genrsa -out "server.key" 2048
TMP_CA_CSR=$(mktemp)
openssl req -new -key server.key -out $TMP_CA_CSR
TMP_EXT=$(mktemp)
>>$TMP_EXT echo "authorityKeyIdentifier=keyid,issuer"
>>$TMP_EXT echo "basicConstraints=CA:FALSE"
>>$TMP_EXT echo "keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment"
>>$TMP_EXT echo "subjectAltName = @alt_names"
>>$TMP_EXT echo ""
>>$TMP_EXT echo "[alt_names]"
>>$TMP_EXT echo "DNS.1 = $DOMAIN"
openssl x509 -req -in $TMP_CA_CSR -CA ca.pem -CAkey $TMP_CA_KEY \
-CAcreateserial -out server.crt -days 825 -sha256 -extfile $TMP_EXT

rm $TMP_CA_KEY $TMP_CA_CSR $TMP_EXT

echo
echo "====="
echo "to avoid \"this website was self-signed\" warnings,"
echo "install $CERT_PATH/ca.pem on whatever you need i guess"
echo "====="
echo

>/dev/null cd -
