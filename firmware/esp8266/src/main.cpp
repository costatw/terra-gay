#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecureBearSSL.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>
#include <time.h>
#if __has_include("config.h")
#include "config.h"
#else
#include "config.example.h"
#endif

const uint8_t PINO_TEMPERATURA = D2;
const uint8_t PINO_UMIDADE = A0;
// Preserve false ate verificar a tensao admissivel de A0 na sua placa.
const bool UMIDADE_CONECTADA = false;
const int VALOR_SECO = -1;
const int VALOR_UMIDO = -1;
const unsigned long INTERVALO_ENVIO = 30000;
OneWire barramento(PINO_TEMPERATURA);
DallasTemperature temperatura(&barramento);
unsigned long ultimoEnvio = 0;
bool configurado = false;

int lerUmidade() {
  long soma = 0;
  for (int i = 0; i < 10; i++) { soma += analogRead(PINO_UMIDADE); delay(10); }
  return soma / 10;
}

void enviarLeitura() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi desconectado. O envio sera tentado novamente no proximo ciclo.");
    return;
  }
  // A verificacao de validade do certificado TLS depende do horario correto.
  if (time(nullptr) < 1700000000) {
    Serial.println("Aguardando sincronizacao do horario para conectar por HTTPS.");
    return;
  }
  temperatura.requestTemperatures();
  float graus = temperatura.getTempCByIndex(0);
  JsonDocument dados;
  dados["device_id"] = DEVICE_ID;
  bool leituraValida = false;
  if (graus != DEVICE_DISCONNECTED_C && isfinite(graus) && graus >= -55 && graus <= 125) {
    dados["temperatura"] = graus;
    leituraValida = true;
    Serial.print("Temperatura: "); Serial.print(graus, 1); Serial.println(" C");
  } else {
    Serial.println("Temperatura: sensor nao encontrado. Confira D2, alimentacao, resistor e emendas.");
  }
  if (UMIDADE_CONECTADA) {
    int leitura = lerUmidade();
    Serial.print("Umidade - leitura bruta: "); Serial.println(leitura);
    if (VALOR_SECO >= 0 && VALOR_UMIDO >= 0 && VALOR_SECO != VALOR_UMIDO) {
      float percentual = 100.0f * (leitura - VALOR_SECO) / (VALOR_UMIDO - VALOR_SECO);
      dados["umidade"] = constrain(percentual, 0.0f, 100.0f);
      leituraValida = true;
    } else Serial.println("Umidade: falta calibrar seco e umido. Esse indicador nao sera enviado.");
  } else Serial.println("Leitura de umidade desativada.");
  if (!leituraValida) { Serial.println("Sem indicadores validos. Nenhum dado foi enviado."); return; }
  String payload;
  serializeJson(dados, payload);
  // Validacao do certificado e hostname ativa. Nunca usar setInsecure().
  BearSSL::X509List root(ROOT_CA);
  BearSSL::WiFiClientSecure client;
  client.setTrustAnchors(&root);
  HTTPClient http;
  http.setTimeout(10000);
  if (!http.begin(client, API_URL)) { Serial.println("Nao foi possivel preparar a conexao HTTPS."); return; }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-sensor-api-key", SENSOR_API_KEY);
  int status = http.POST(payload);
  if (status == 201) Serial.println("Leitura recebida pelo site.");
  else { Serial.print("Envio nao concluido. Codigo HTTP: "); Serial.println(status); }
  http.end();
}

void setup() {
  Serial.begin(115200);
  temperatura.begin();
  temperatura.setWaitForConversion(true);
  Serial.println("\nTerra Nova Mater - monitor Wi-Fi");
  configurado = !String(WIFI_SSID).startsWith("PREENCHA") &&
    String(API_URL).startsWith("https://") && String(API_URL).indexOf(".example") < 0 &&
    !String(SENSOR_API_KEY).startsWith("PREENCHA") && strlen(SENSOR_API_KEY) >= 24 &&
    String(ROOT_CA).indexOf("-----BEGIN CERTIFICATE-----") >= 0;
  if (!configurado) {
    Serial.println("Preencha include/config.h com a rede, dominio HTTPS, chave e certificado raiz antes de usar.");
    return;
  }
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.println("Conectando ao Wi-Fi. Nenhuma credencial sera impressa.");
}

void loop() {
  if (configurado && millis() - ultimoEnvio >= INTERVALO_ENVIO) {
    ultimoEnvio = millis();
    enviarLeitura();
  }
  delay(50);
}
