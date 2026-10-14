#pragma once
// Copie este arquivo para config.h. config.h e ignorado pelo Git.
// Nunca publique sua senha Wi-Fi ou a chave de acesso do sensor.
const char* WIFI_SSID = "PREENCHA_SUA_REDE";
const char* WIFI_PASSWORD = "PREENCHA_SUA_SENHA";
const char* API_URL = "https://seu-dominio.example/functions/receiveSensorData";
const char* SENSOR_API_KEY = "PREENCHA_A_CHAVE_PRIVADA_DO_SERVIDOR";
const char* DEVICE_ID = "prototype-01";

// Copie para este campo o certificado PEM da autoridade raiz que assina
// o certificado HTTPS do seu dominio. Nao use o certificado de outro site.
// Exemplo de raiz confiavel: ISRG Root X1 (Let's Encrypt), fornecida em certs/.
const char ROOT_CA[] PROGMEM = R"CERT(
COLE_AQUI_O_CERTIFICADO_PEM_DA_RAIZ_DO_SEU_DOMINIO
)CERT";
